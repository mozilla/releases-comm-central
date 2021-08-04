/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["fetchConfigFromExchange", "getAddonsList"];

var { AccountCreationUtils } = ChromeUtils.import(
  "resource:///modules/accountcreation/AccountCreationUtils.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AccountConfig: "resource:///modules/accountcreation/AccountConfig.jsm",
  FetchHTTP: "resource:///modules/accountcreation/FetchHTTP.jsm",
  GuessConfig: "resource:///modules/accountcreation/GuessConfig.jsm",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.jsm",
  Services: "resource://gre/modules/Services.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
});

var {
  Abortable,
  assert,
  ddump,
  deepCopy,
  Exception,
  gAccountSetupLogger,
  getStringBundle,
  PriorityOrderAbortable,
  SuccessiveAbortable,
  TimeoutAbortable,
} = AccountCreationUtils;

/**
 * Tries to get a configuration from an MS Exchange server
 * using Microsoft AutoDiscover protocol.
 *
 * Disclaimers:
 * - To support domain hosters, we cannot use SSL. That means we
 *   rely on insecure DNS and http, which means the results may be
 *   forged when under attack. The same is true for guessConfig(), though.
 *
 * @param {string} domain - The domain part of the user's email address
 * @param {string} emailAddress - The user's email address
 * @param {string} username - (Optional) The user's login name.
 *         If null, email address will be used.
 * @param {string} password - The user's password for that email address
 * @param {Function(domain, okCallback, cancelCallback)} confirmCallback - A
 *        callback that will be called to confirm redirection to another domain.
 * @param {Function(config {AccountConfig})} successCallback - A callback that
 *         will be called when we could retrieve a configuration.
 *         The AccountConfig object will be passed in as first parameter.
 * @param {Function(ex)} errorCallback - A callback that
 *         will be called when we could not retrieve a configuration,
 *         for whatever reason. This is expected (e.g. when there's no config
 *         for this domain at this location),
 *         so do not unconditionally show this to the user.
 *         The first parameter will be an exception object or error string.
 */
function fetchConfigFromExchange(
  domain,
  emailAddress,
  username,
  password,
  confirmCallback,
  successCallback,
  errorCallback
) {
  assert(typeof successCallback == "function");
  assert(typeof errorCallback == "function");
  if (
    !Services.prefs.getBoolPref(
      "mailnews.auto_config.fetchFromExchange.enabled",
      true
    )
  ) {
    errorCallback("Exchange AutoDiscover disabled per user preference");
    return new Abortable();
  }

  // <https://technet.microsoft.com/en-us/library/bb124251(v=exchg.160).aspx#Autodiscover%20services%20in%20Outlook>
  // <https://docs.microsoft.com/en-us/previous-versions/office/developer/exchange-server-interoperability-guidance/hh352638(v%3Dexchg.140)>, search for "The Autodiscover service uses one of these four methods"
  let url1 =
    "https://autodiscover." +
    Sanitizer.hostname(domain) +
    "/autodiscover/autodiscover.xml";
  let url2 =
    "https://" + Sanitizer.hostname(domain) + "/autodiscover/autodiscover.xml";
  let url3 =
    "http://autodiscover." +
    Sanitizer.hostname(domain) +
    "/autodiscover/autodiscover.xml";
  let body = `<?xml version="1.0" encoding="utf-8"?>
    <Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">
      <Request>
        <EMailAddress>${emailAddress}</EMailAddress>
        <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>
      </Request>
    </Autodiscover>`;
  let callArgs = {
    uploadBody: body,
    post: true,
    headers: {
      // outlook.com needs this exact string, with space and lower case "utf".
      // Compare bug 1454325 comment 15.
      "Content-Type": "text/xml; charset=utf-8",
    },
    username: username || emailAddress,
    password,
    allowAuthPrompt: false,
  };
  let call;
  let fetch;
  let fetch3;

  let successive = new SuccessiveAbortable();
  let priority = new PriorityOrderAbortable(function(xml, call) {
    // success
    readAutoDiscoverResponse(
      xml,
      successive,
      emailAddress,
      username,
      password,
      confirmCallback,
      config => {
        config.subSource = `exchange-from-${call.foundMsg}`;
        return detectStandardProtocols(config, domain, successCallback);
      },
      errorCallback
    );
  }, errorCallback); // all failed

  call = priority.addCall();
  call.foundMsg = "url1";
  fetch = new FetchHTTP(
    url1,
    callArgs,
    call.successCallback(),
    call.errorCallback()
  );
  fetch.start();
  call.setAbortable(fetch);

  call = priority.addCall();
  call.foundMsg = "url2";
  fetch = new FetchHTTP(
    url2,
    callArgs,
    call.successCallback(),
    call.errorCallback()
  );
  fetch.start();
  call.setAbortable(fetch);

  call = priority.addCall();
  call.foundMsg = "url3";
  let call3ErrorCallback = call.errorCallback();
  // url3 is HTTP (not HTTPS), so suppress password. Even MS spec demands so.
  let call3Args = deepCopy(callArgs);
  delete call3Args.username;
  delete call3Args.password;
  fetch3 = new FetchHTTP(url3, call3Args, call.successCallback(), ex => {
    // url3 is an HTTP URL that will redirect to the real one, usually a
    // HTTPS URL of the hoster. XMLHttpRequest unfortunately loses the call
    // parameters, drops the auth, drops the body, and turns POST into GET,
    // which cause the call to fail. For AutoDiscover mechanism to work,
    // we need to repeat the call with the correct parameters again.
    let redirectURL = fetch3._request.responseURL;
    if (!redirectURL.startsWith("https:")) {
      call3ErrorCallback(ex);
      return;
    }
    let redirectURI = Services.io.newURI(redirectURL);
    let redirectDomain = Services.eTLD.getBaseDomain(redirectURI);
    let originalDomain = Services.eTLD.getBaseDomainFromHost(domain);

    function fetchRedirect() {
      let fetchCall = priority.addCall();
      let fetch = new FetchHTTP(
        redirectURL,
        callArgs, // now with auth
        fetchCall.successCallback(),
        fetchCall.errorCallback()
      );
      fetchCall.setAbortable(fetch);
      fetch.start();
    }

    const kSafeDomains = ["office365.com", "outlook.com"];
    if (
      redirectDomain != originalDomain &&
      !kSafeDomains.includes(redirectDomain)
    ) {
      // Given that we received the redirect URL from an insecure HTTP call,
      // we ask the user whether he trusts the redirect domain.
      gAccountSetupLogger.info("AutoDiscover HTTP redirected to other domain");
      let dialogSuccessive = new SuccessiveAbortable();
      // Because the dialog implements Abortable, the dialog will cancel and
      // close automatically, if a slow higher priority call returns late.
      let dialogCall = priority.addCall();
      dialogCall.setAbortable(dialogSuccessive);
      call3ErrorCallback(new Exception("Redirected"));
      dialogSuccessive.current = new TimeoutAbortable(
        setTimeout(() => {
          dialogSuccessive.current = confirmCallback(
            redirectDomain,
            () => {
              // User agreed.
              fetchRedirect();
              // Remove the dialog from the call stack.
              dialogCall.errorCallback()(new Exception("Proceed to fetch"));
            },
            ex => {
              // User rejected, or action cancelled otherwise.
              dialogCall.errorCallback()(ex);
            }
          );
          // Account for a slow server response.
          // This will prevent showing the warning message when not necessary.
          // The timeout is just for optics. The Abortable ensures that it works.
        }, 2000)
      );
    } else {
      fetchRedirect();
      call3ErrorCallback(new Exception("Redirected"));
    }
  });
  fetch3.start();
  call.setAbortable(fetch3);

  successive.current = priority;
  return successive;
}

var gLoopCounter = 0;

/**
 * @param {JXON} xml - The Exchange server AutoDiscover response
 * @param {Function(config {AccountConfig})} successCallback - @see accountConfig.js
 */
function readAutoDiscoverResponse(
  autoDiscoverXML,
  successive,
  emailAddress,
  username,
  password,
  confirmCallback,
  successCallback,
  errorCallback
) {
  assert(successive instanceof SuccessiveAbortable);
  assert(typeof successCallback == "function");
  assert(typeof errorCallback == "function");

  // redirect to other email address
  if (
    "Account" in autoDiscoverXML.Autodiscover.Response &&
    "RedirectAddr" in autoDiscoverXML.Autodiscover.Response.Account
  ) {
    // <https://docs.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxdscli/49083e77-8dc2-4010-85c6-f40e090f3b17>
    let redirectEmailAddress = Sanitizer.emailAddress(
      autoDiscoverXML.Autodiscover.Response.Account.RedirectAddr
    );
    let domain = redirectEmailAddress.split("@").pop();
    if (++gLoopCounter > 2) {
      throw new Error("Too many redirects in XML response; domain=" + domain);
    }
    successive.current = fetchConfigFromExchange(
      domain,
      redirectEmailAddress,
      // Per spec, need to authenticate with the original email address,
      // not the redirected address (if not already overridden).
      username || emailAddress,
      password,
      confirmCallback,
      successCallback,
      errorCallback
    );
    return;
  }

  let config = readAutoDiscoverXML(autoDiscoverXML, username);
  if (config.isComplete()) {
    successCallback(config);
  } else {
    errorCallback(new Exception("No valid configs found in AutoDiscover XML"));
  }
}

/* eslint-disable complexity */
/**
 * @param {JXON} xml - The Exchange server AutoDiscover response
 * @param {string} username - (Optional) The user's login name
 *     If null, email address placeholder will be used.
 * @returns {AccountConfig} - @see accountConfig.js
 *
 * @see <https://www.msxfaq.de/exchange/autodiscover/autodiscover_xml.htm>
 */
function readAutoDiscoverXML(autoDiscoverXML, username) {
  if (
    typeof autoDiscoverXML != "object" ||
    !("Autodiscover" in autoDiscoverXML) ||
    !("Response" in autoDiscoverXML.Autodiscover) ||
    !("Account" in autoDiscoverXML.Autodiscover.Response) ||
    !("Protocol" in autoDiscoverXML.Autodiscover.Response.Account)
  ) {
    let stringBundle = getStringBundle(
      "chrome://messenger/locale/accountCreationModel.properties"
    );
    throw new Exception(
      stringBundle.GetStringFromName("no_autodiscover.error")
    );
  }
  var xml = autoDiscoverXML.Autodiscover.Response.Account;

  function array_or_undef(value) {
    return value === undefined ? [] : value;
  }

  var config = new AccountConfig();
  config.source = AccountConfig.kSourceExchange;
  config.incoming.username = username || "%EMAILADDRESS%";
  config.incoming.socketType = 2; // only https supported
  config.incoming.port = 443;
  config.incoming.auth = Ci.nsMsgAuthMethod.passwordCleartext;
  config.incoming.authAlternatives = [Ci.nsMsgAuthMethod.OAuth2];
  config.outgoing.addThisServer = false;
  config.outgoing.useGlobalPreferredServer = true;

  for (let protocolX of array_or_undef(xml.$Protocol)) {
    try {
      let type = Sanitizer.enum(
        protocolX.Type,
        ["WEB", "EXHTTP", "EXCH", "EXPR", "POP3", "IMAP", "SMTP"],
        "unknown"
      );
      if (type == "WEB") {
        let urlsX;
        if ("External" in protocolX) {
          urlsX = protocolX.External;
        } else if ("Internal" in protocolX) {
          urlsX = protocolX.Internal;
        }
        if (urlsX) {
          config.incoming.owaURL = Sanitizer.url(urlsX.OWAUrl.value);
          if (
            !config.incoming.ewsURL &&
            "Protocol" in urlsX &&
            "ASUrl" in urlsX.Protocol
          ) {
            config.incoming.ewsURL = Sanitizer.url(urlsX.Protocol.ASUrl);
          }
          config.incoming.type = "exchange";
          let parsedURL = new URL(config.incoming.owaURL);
          config.incoming.hostname = Sanitizer.hostname(parsedURL.hostname);
          if (parsedURL.port) {
            config.incoming.port = Sanitizer.integer(parsedURL.port);
          }
        }
      } else if (type == "EXHTTP" || type == "EXCH") {
        config.incoming.ewsURL = Sanitizer.url(protocolX.EwsUrl);
        if (!config.incoming.ewsURL) {
          config.incoming.ewsURL = Sanitizer.url(protocolX.ASUrl);
        }
        config.incoming.type = "exchange";
        let parsedURL = new URL(config.incoming.ewsURL);
        config.incoming.hostname = Sanitizer.hostname(parsedURL.hostname);
        if (parsedURL.port) {
          config.incoming.port = Sanitizer.integer(parsedURL.port);
        }
      } else if (type == "POP3" || type == "IMAP" || type == "SMTP") {
        let server;
        if (type == "SMTP") {
          server = config.createNewOutgoing();
        } else {
          server = config.createNewIncoming();
        }

        server.type = Sanitizer.translate(type, {
          POP3: "pop3",
          IMAP: "imap",
          SMTP: "smtp",
        });
        server.hostname = Sanitizer.hostname(protocolX.Server);
        server.port = Sanitizer.integer(protocolX.Port);
        server.socketType = 1; // plain
        if (
          "SSL" in protocolX &&
          protocolX.SSL.toLowerCase() == "on" // "On" or "Off"
        ) {
          // SSL is too unspecific. Do they mean STARTTLS or normal TLS?
          // For now, assume normal TLS, unless it's a standard plain port.
          switch (server.port) {
            case 143: // IMAP standard
            case 110: // POP3 standard
            case 25: // SMTP standard
            case 587: // SMTP standard
              server.socketType = 3; // STARTTLS
              break;
            case 993: // IMAP SSL
            case 995: // POP3 SSL
            case 465: // SMTP SSL
            default:
              // if non-standard port, assume normal TLS, not STARTTLS
              server.socketType = 2; // normal TLS
              break;
          }
        }
        server.auth = Ci.nsMsgAuthMethod.passwordCleartext;
        if (
          "SPA" in protocolX &&
          protocolX.SPA.toLowerCase() == "on" // "On" or "Off"
        ) {
          // Secure Password Authentication = NTLM or GSSAPI/Kerberos
          server.auth = Ci.nsMsgAuthMethod.secure;
        }
        if ("LoginName" in protocolX) {
          server.username = Sanitizer.nonemptystring(protocolX.LoginName);
        } else {
          server.username = username || "%EMAILADDRESS%";
        }

        if (type == "SMTP") {
          if (!config.outgoing.hostname) {
            config.outgoing = server;
          } else {
            config.outgoingAlternatives.push(server);
          }
        } else if (!config.incoming.hostname) {
          // eslint-disable-line no-lonely-if
          config.incoming = server;
        } else {
          config.incomingAlternatives.push(server);
        }
      }

      // else unknown or unsupported protocol
    } catch (e) {
      Cu.reportError(e);
    }
  }

  // OAuth2 settings, so that createInBackend() doesn't bail out
  if (config.incoming.owaURL || config.incoming.ewsURL) {
    config.incoming.oauthSettings = {
      issuer: config.incoming.hostname,
      scope: config.incoming.owaURL || config.incoming.ewsURL,
    };
    config.outgoing.oauthSettings = {
      issuer: config.incoming.hostname,
      scope: config.incoming.owaURL || config.incoming.ewsURL,
    };
  }

  return config;
}
/* eslint-enable complexity */

/**
 * Ask server which addons can handle this config.
 * @param {AccountConfig} config
 * @param {Function(config {AccountConfig})} successCallback
 * @returns {Abortable}
 */
function getAddonsList(config, successCallback, errorCallback) {
  let incoming = [config.incoming, ...config.incomingAlternatives].find(
    alt => alt.type == "exchange"
  );
  if (!incoming) {
    successCallback();
    return new Abortable();
  }
  let url = Services.prefs.getCharPref("mailnews.auto_config.addons_url");
  if (!url) {
    errorCallback(new Exception("no URL for addons list configured"));
    return new Abortable();
  }
  let fetch = new FetchHTTP(
    url,
    { allowCache: true, timeout: 10000 },
    function(json) {
      let addons = readAddonsJSON(json);
      addons = addons.filter(addon => {
        // Find types matching the current config.
        // Pick the first in the list as the preferred one and
        // tell the UI to use that one.
        addon.useType = addon.supportedTypes.find(
          type =>
            (incoming.owaURL && type.protocolType == "owa") ||
            (incoming.ewsURL && type.protocolType == "ews") ||
            (incoming.easURL && type.protocolType == "eas")
        );
        return !!addon.useType;
      });
      if (addons.length == 0) {
        errorCallback(
          new Exception(
            "Config found, but no addons known to handle the config"
          )
        );
        return;
      }
      config.addons = addons;
      successCallback(config);
    },
    errorCallback
  );
  fetch.start();
  return fetch;
}

/**
 * This reads the addons list JSON and makes security validations,
 * e.g. that the URLs are not chrome: URLs, which could lead to exploits.
 * It also chooses the right language etc..
 *
 * @param {JSON} json - the addons.json file contents
 * @returns {Array of AddonInfo} - @see AccountConfig.addons
 *
 * accountTypes are listed in order of decreasing preference.
 * Languages are 2-letter codes. If a language is not available,
 * the first name or description will be used.
 *
 * Parse e.g.
[
  {
    "id": "owl@beonex.com",
    "name": {
      "en": "Owl",
      "de": "Eule"
    },
    "description": {
      "en": "Owl is a paid third-party addon that allows you to access your email account on Exchange servers. See the website for prices.",
      "de": "Eule ist eine Erweiterung von einem Drittanbieter, die Ihnen erlaubt, Exchange-Server zu benutzen. Sie ist kostenpflichtig. Die Preise finden Sie auf der Website."
    },
    "minVersion": "0.2",
    "xpiURL": "http://www.beonex.com/owl/latest.xpi",
    "websiteURL": "http://www.beonex.com/owl/",
    "icon32": "http://www.beonex.com/owl/owl-32.png",
    "accountTypes": [
      {
        "generalType": "exchange",
        "protocolType": "owa",
        "addonAccountType": "owl-owa"
      },
      {
        "generalType": "exchange",
        "protocolType": "eas",
        "addonAccountType": "owl-eas"
      }
    ]
  }
]
 */
function readAddonsJSON(json) {
  let addons = [];
  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }
  let xulLocale = Services.locale.requestedLocale;
  let locale = xulLocale ? xulLocale.substring(0, 5) : "default";
  for (let addonJSON of ensureArray(json)) {
    try {
      let addon = {
        id: addonJSON.id,
        minVersion: addonJSON.minVersion,
        xpiURL: Sanitizer.url(addonJSON.xpiURL),
        websiteURL: Sanitizer.url(addonJSON.websiteURL),
        icon32: addonJSON.icon32 ? Sanitizer.url(addonJSON.icon32) : null,
        supportedTypes: [],
      };
      assert(
        new URL(addon.xpiURL).protocol == "https:",
        "XPI download URL needs to be https"
      );
      addon.name =
        locale in addonJSON.name ? addonJSON.name[locale] : addonJSON.name[0];
      addon.description =
        locale in addonJSON.description
          ? addonJSON.description[locale]
          : addonJSON.description[0];
      for (let typeJSON of ensureArray(addonJSON.accountTypes)) {
        try {
          addon.supportedTypes.push({
            generalType: Sanitizer.alphanumdash(typeJSON.generalType),
            protocolType: Sanitizer.alphanumdash(typeJSON.protocolType),
            addonAccountType: Sanitizer.alphanumdash(typeJSON.addonAccountType),
          });
        } catch (e) {
          ddump(e);
        }
      }
      addons.push(addon);
    } catch (e) {
      ddump(e);
    }
  }
  return addons;
}

/**
 * Probe a found Exchange server for IMAP/POP3 and SMTP support.
 *
 * @param {AccountConfig} config - The initial detected Exchange configuration.
 * @param {string} domain - The domain part of the user's email address
 * @param {Function(config {AccountConfig})} successCallback - A callback that
 *   will be called when we found an appropriate configuration.
 *   The AccountConfig object will be passed in as first parameter.
 */
function detectStandardProtocols(config, domain, successCallback) {
  gAccountSetupLogger.info("Exchange Autodiscover gave some results.");
  let alts = [config.incoming, ...config.incomingAlternatives];
  if (alts.find(alt => alt.type == "imap" || alt.type == "pop3")) {
    // Autodiscover found an exchange server with advertized IMAP and/or
    // POP3 support. We're done then.
    config.preferStandardProtocols();
    successCallback(config);
    return;
  }

  // Autodiscover is known not to advertise all that it supports. Let's see
  // if there really isn't any IMAP/POP3 support by probing the Exchange
  // server. Use the server hostname already found.
  let config2 = new AccountConfig();
  config2.incoming.hostname = config.incoming.hostname;
  config2.incoming.username = config.incoming.username || "%EMAILADDRESS%";
  // For Exchange 2013+ Kerberos/GSSAPI and NTLM options do not work by
  // default at least for Linux users, even if support is detected.
  config2.incoming.auth = Ci.nsMsgAuthMethod.passwordCleartext;

  config2.outgoing.hostname = config.incoming.hostname;
  config2.outgoing.username = config.incoming.username || "%EMAILADDRESS%";

  config2.incomingAlternatives = config.incomingAlternatives;
  config2.incomingAlternatives.push(config.incoming); // type=exchange

  config2.outgoingAlternatives = config.outgoingAlternatives;
  if (config.outgoing.hostname) {
    config2.outgoingAlternatives.push(config.outgoing);
  }

  GuessConfig.guessConfig(
    domain,
    function(type, hostname, port, ssl, done, config) {
      gAccountSetupLogger.info(
        `Probing exchange server ${hostname} for ${type} protocol support.`
      );
    },
    function(probedConfig) {
      // Probing succeeded: found open protocols, yay!
      successCallback(probedConfig);
    },
    function(e, probedConfig) {
      // Probing didn't find any open protocols.
      // Let's use the exchange (only) config that was listed then.
      config.subSource += "-guess";
      successCallback(config);
    },
    config2,
    "both"
  );
}
