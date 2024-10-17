/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountCreationUtils } from "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  AccountConfig: "resource:///modules/accountcreation/AccountConfig.sys.mjs",
  FetchHTTP: "resource:///modules/accountcreation/FetchHTTP.sys.mjs",
  GuessConfig: "resource:///modules/accountcreation/GuessConfig.sys.mjs",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
});

const {
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
 * Initiates a fetch of the given URL, using either OAuth2 or Basic
 * authentication.
 *
 * OAuth2 will be tried first, before falling back onto Basic auth if either:
 *  - we do not have an OAuth2 configuration for this provider, or
 *  - we failed to get an OAuth2 access token to use in the fetch (e.g., because
 *    the user cancelled the interactive login process).
 *
 * A deep copy of `callArgs` is always done before modifying it, so it can be
 * reused between calls.
 *
 * @param {ParallelCall} call - The abortable call to register the FetchHTTP
 *                              object with.
 * @param {string} url - The URL to fetch.
 * @param {string} username - The username to use for Basic auth and OAuth2.
 * @param {string} password - The password to use for Basic auth.
 * @param {object} callArgs - The arguments to use when creating the new
 *                            FetchHTTP object. This object is not expected to
 *                            include any authentication parameters or headers.
 */
function startFetchWithAuth(call, url, username, password, callArgs) {
  // Creates a new FetchHTTP object with the given arguments, registers it with
  // the abortable call, and initiates the fetch.
  function setUpAndStart(args) {
    const fetchHttp = new lazy.FetchHTTP(
      url,
      args,
      call.successCallback(),
      call.errorCallback()
    );
    call.setAbortable(fetchHttp);
    fetchHttp.start();
  }

  // Start a fetch with Basic auth using the credentials provided by the
  // consumer.
  function fetchWithBasicAuth() {
    const args = deepCopy(callArgs);
    args.username = username;
    args.password = password;

    setUpAndStart(args);
  }

  const oauth2Module = Cc["@mozilla.org/mail/oauth2-module;1"].createInstance(
    Ci.msgIOAuth2Module
  );

  // Initialize an OAuth2 module and determine whether we support a provider
  // associated with the provided domain.
  const uri = Services.io.newURI(url);
  const isOAuth2Available = oauth2Module.initFromHostname(uri.host, username);
  if (isOAuth2Available) {
    oauth2Module.getAccessToken({
      onSuccess: token => {
        gAccountSetupLogger.debug(
          "Exchange Autodiscover: Successfully retrieved an OAuth2 token"
        );

        // Adapt the call args so we auth via OAuth2. We need to clone the args
        // in case we need to fall back to Basic auth in order to avoid any
        // potential side effects.
        const args = deepCopy(callArgs);
        args.headers.Authorization = `Bearer ${token}`;

        setUpAndStart(args);
      },
      onFailure: () => {
        gAccountSetupLogger.warn(
          "Exchange Autodiscover: Could not retrieve an OAuth2 token; falling back to Basic auth"
        );
        fetchWithBasicAuth();
      },
    });
  } else {
    // If we can't do OAuth2 for this domain, fall back to Basic auth.
    fetchWithBasicAuth();
  }
}

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
export function fetchConfigFromExchange(
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
  const url1 =
    "https://autodiscover." +
    lazy.Sanitizer.hostname(domain) +
    "/autodiscover/autodiscover.xml";
  const url2 =
    "https://" +
    lazy.Sanitizer.hostname(domain) +
    "/autodiscover/autodiscover.xml";
  const url3 =
    "http://autodiscover." +
    lazy.Sanitizer.hostname(domain) +
    "/autodiscover/autodiscover.xml";
  const body = `<?xml version="1.0" encoding="utf-8"?>
    <Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">
      <Request>
        <EMailAddress>${emailAddress}</EMailAddress>
        <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>
      </Request>
    </Autodiscover>`;
  const callArgs = {
    uploadBody: body,
    post: true,
    headers: {
      // outlook.com needs this exact string, with space and lower case "utf".
      // Compare bug 1454325 comment 15.
      "Content-Type": "text/xml; charset=utf-8",
    },
    allowAuthPrompt: false,
  };
  const successive = new SuccessiveAbortable();
  const priority = new PriorityOrderAbortable(function (xml, call) {
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

  const authUsername = username || emailAddress;

  const call1 = priority.addCall();
  call1.foundMsg = "url1";
  startFetchWithAuth(call1, url1, authUsername, password, callArgs);

  const call2 = priority.addCall();
  call2.foundMsg = "url2";
  startFetchWithAuth(call2, url2, authUsername, password, callArgs);

  const call3 = priority.addCall();
  call3.foundMsg = "url3";
  const call3ErrorCallback = call3.errorCallback();
  // url3 is HTTP (not HTTPS), so don't authenticate. Even MS spec demands so.
  const fetch3 = new lazy.FetchHTTP(
    url3,
    callArgs,
    call3.successCallback(),
    ex => {
      gAccountSetupLogger.debug("HTTP request failed with: " + ex);
      // url3 is an HTTP URL that will redirect to the real one, usually a
      // HTTPS URL of the hoster. XMLHttpRequest unfortunately loses the call
      // parameters, drops the auth, drops the body, and turns POST into GET,
      // which cause the call to fail. For AutoDiscover mechanism to work,
      // we need to repeat the call with the correct parameters again.
      const redirectURL = fetch3._request.responseURL;
      if (!redirectURL.startsWith("https:")) {
        call3ErrorCallback(ex);
        return;
      }
      const redirectURI = Services.io.newURI(redirectURL);
      const redirectDomain = Services.eTLD.getBaseDomain(redirectURI);
      const originalDomain = Services.eTLD.getBaseDomainFromHost(domain);

      function fetchRedirect() {
        // Note: We need the call to be added here so `priority` does not
        // believe it has exhausted all of its calls when we move into further
        // async layers.
        const fetchCall = priority.addCall();
        // Now that we're on an HTTPS URL, try again with authentication.
        startFetchWithAuth(
          fetchCall,
          redirectURL,
          authUsername,
          password,
          callArgs
        );
      }

      const kSafeDomains = ["office365.com", "outlook.com"];
      if (
        redirectDomain != originalDomain &&
        !kSafeDomains.includes(redirectDomain)
      ) {
        // Given that we received the redirect URL from an insecure HTTP call,
        // we ask the user whether he trusts the redirect domain.
        gAccountSetupLogger.info(
          "AutoDiscover HTTP redirected to other domain"
        );
        const dialogSuccessive = new SuccessiveAbortable();
        // Because the dialog implements Abortable, the dialog will cancel and
        // close automatically, if a slow higher priority call returns late.
        const dialogCall = priority.addCall();
        dialogCall.setAbortable(dialogSuccessive);
        call3ErrorCallback(new Exception("Redirected"));
        dialogSuccessive.current = new TimeoutAbortable(
          lazy.setTimeout(() => {
            dialogSuccessive.current = confirmCallback(
              redirectDomain,
              () => {
                // User agreed.
                fetchRedirect();
                // Remove the dialog from the call stack.
                dialogCall.errorCallback()(new Exception("Proceed to fetch"));
              },
              e => {
                // User rejected, or action cancelled otherwise.
                dialogCall.errorCallback()(e);
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
    }
  );
  fetch3.start();
  call3.setAbortable(fetch3);

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
    const redirectEmailAddress = lazy.Sanitizer.emailAddress(
      autoDiscoverXML.Autodiscover.Response.Account.RedirectAddr
    );
    const domain = redirectEmailAddress.split("@").pop();
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

  const config = readAutoDiscoverXML(autoDiscoverXML, username);
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
    const stringBundle = getStringBundle(
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

  var config = new lazy.AccountConfig();
  config.source = lazy.AccountConfig.kSourceExchange;
  config.incoming.username = username || "%EMAILADDRESS%";
  config.incoming.socketType = Ci.nsMsgSocketType.SSL; // only https supported
  config.incoming.port = 443;
  config.incoming.auth = Ci.nsMsgAuthMethod.passwordCleartext;
  config.incoming.authAlternatives = [Ci.nsMsgAuthMethod.OAuth2];
  config.outgoing.addThisServer = false;
  config.outgoing.useGlobalPreferredServer = true;

  for (const protocolX of array_or_undef(xml.$Protocol)) {
    try {
      const type = lazy.Sanitizer.enum(
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
          config.incoming.owaURL = lazy.Sanitizer.url(urlsX.OWAUrl.value);
          if (
            !config.incoming.ewsURL &&
            "Protocol" in urlsX &&
            "ASUrl" in urlsX.Protocol
          ) {
            config.incoming.ewsURL = lazy.Sanitizer.url(urlsX.Protocol.ASUrl);
          }
          config.incoming.type = "exchange";
          const parsedURL = new URL(config.incoming.owaURL);
          config.incoming.hostname = lazy.Sanitizer.hostname(
            parsedURL.hostname
          );
          if (parsedURL.port) {
            config.incoming.port = lazy.Sanitizer.integer(parsedURL.port);
          }
        }
      } else if (type == "EXHTTP" || type == "EXCH") {
        config.incoming.ewsURL = lazy.Sanitizer.url(protocolX.EwsUrl);
        if (!config.incoming.ewsURL) {
          config.incoming.ewsURL = lazy.Sanitizer.url(protocolX.ASUrl);
        }
        config.incoming.type = "exchange";
        const parsedURL = new URL(config.incoming.ewsURL);
        config.incoming.hostname = lazy.Sanitizer.hostname(parsedURL.hostname);
        if (parsedURL.port) {
          config.incoming.port = lazy.Sanitizer.integer(parsedURL.port);
        }
      } else if (type == "POP3" || type == "IMAP" || type == "SMTP") {
        let server;
        if (type == "SMTP") {
          server = config.createNewOutgoing();
        } else {
          server = config.createNewIncoming();
        }

        server.type = lazy.Sanitizer.translate(type, {
          POP3: "pop3",
          IMAP: "imap",
          SMTP: "smtp",
        });
        server.hostname = lazy.Sanitizer.hostname(protocolX.Server);
        server.port = lazy.Sanitizer.integer(protocolX.Port);

        // SSL: https://msdn.microsoft.com/en-us/library/ee160260(v=exchg.80).aspx
        // Encryption: https://msdn.microsoft.com/en-us/library/ee625072(v=exchg.80).aspx
        if (
          ("SSL" in protocolX && protocolX.SSL.toLowerCase() == "off") || // "On" or "Off"
          ("Encryption" in protocolX &&
            protocolX.Encryption.toLowerCase() == "none") // "None", "SSL", "TLS", "Auto"
        ) {
          server.socketType = Ci.nsMsgSocketType.plain;
        } else {
          // SSL is too unspecific. Do they mean STARTTLS or normal TLS?
          // For now, assume normal TLS, unless it's a standard plain port.
          switch (server.port) {
            case 143: // IMAP standard
            case 110: // POP3 standard
            case 25: // SMTP standard
            case 587: // SMTP standard
              server.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;
              break;
            case 993: // IMAP SSL
            case 995: // POP3 SSL
            case 465: // SMTP SSL
            default:
              // if non-standard port, assume normal TLS, not STARTTLS
              server.socketType = Ci.nsMsgSocketType.SSL;
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
          server.username = lazy.Sanitizer.nonemptystring(protocolX.LoginName);
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
      console.error(e);
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
 *
 * @param {AccountConfig} config
 * @param {Function(config {AccountConfig})} successCallback
 * @returns {Abortable}
 */
export function getAddonsList(config, successCallback, errorCallback) {
  const incoming = [config.incoming, ...config.incomingAlternatives].find(
    alt => alt.type == "exchange"
  );
  if (!incoming) {
    successCallback();
    return new Abortable();
  }
  const url = Services.prefs.getCharPref("mailnews.auto_config.addons_url");
  if (!url) {
    errorCallback(new Exception("no URL for addons list configured"));
    return new Abortable();
  }
  const fetchHttp = new lazy.FetchHTTP(
    url,
    { allowCache: true, timeout: 10000 },
    function (json) {
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
  fetchHttp.start();
  return fetchHttp;
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
  const addons = [];
  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }
  const xulLocale = Services.locale.requestedLocale;
  const locale = xulLocale ? xulLocale.substring(0, 5) : "default";
  for (const addonJSON of ensureArray(json)) {
    try {
      const addon = {
        id: addonJSON.id,
        minVersion: addonJSON.minVersion,
        xpiURL: lazy.Sanitizer.url(addonJSON.xpiURL),
        websiteURL: lazy.Sanitizer.url(addonJSON.websiteURL),
        icon32: addonJSON.icon32 ? lazy.Sanitizer.url(addonJSON.icon32) : null,
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
      for (const typeJSON of ensureArray(addonJSON.accountTypes)) {
        try {
          addon.supportedTypes.push({
            generalType: lazy.Sanitizer.alphanumdash(typeJSON.generalType),
            protocolType: lazy.Sanitizer.alphanumdash(typeJSON.protocolType),
            addonAccountType: lazy.Sanitizer.alphanumdash(
              typeJSON.addonAccountType
            ),
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
  const alts = [config.incoming, ...config.incomingAlternatives];
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
  const config2 = new lazy.AccountConfig();
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

  lazy.GuessConfig.guessConfig(
    domain,
    function (type, hostname) {
      gAccountSetupLogger.info(
        `Probing exchange server ${hostname} for ${type} protocol support.`
      );
    },
    function (probedConfig) {
      // Probing succeeded: found open protocols, yay!
      successCallback(probedConfig);
    },
    function () {
      // Probing didn't find any open protocols.
      // Let's use the exchange (only) config that was listed then.
      config.subSource += "-guess";
      successCallback(config);
    },
    config2,
    "both"
  );
}
