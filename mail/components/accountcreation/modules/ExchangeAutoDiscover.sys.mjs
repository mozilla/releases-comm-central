/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountCreationUtils } from "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs";
import { OAuth2Module } from "resource:///modules/OAuth2Module.sys.mjs";
import { DNS } from "resource:///modules/DNS.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  AccountConfig: "resource:///modules/accountcreation/AccountConfig.sys.mjs",
  FetchHTTP: "resource:///modules/accountcreation/FetchHTTP.sys.mjs",
  GuessConfig: "resource:///modules/accountcreation/GuessConfig.sys.mjs",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
  OAuth2Providers: "resource:///modules/OAuth2Providers.sys.mjs",
});

const {
  Abortable,
  assert,
  ddump,
  deepCopy,
  Exception,
  gAccountSetupLogger,
  getStringBundle,
  OAuthAbortable,
  PriorityOrderAbortable,
  PromiseAbortable,
  SuccessiveAbortable,
  TimeoutAbortable,
  UserCancelledException,
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
 *   object with.
 * @param {string} url - The URL to fetch.
 * @param {string} username - The username to use for Basic auth and OAuth2.
 * @param {string} password - The password to use for Basic auth.
 * @param {object} callArgs - The arguments to use when creating the new
 *   FetchHTTP object. This object is not expected to include any authentication
 *   parameters or headers.
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

  const oauth2Module = new OAuth2Module();

  // Initialize an OAuth2 module and determine whether we support a provider
  // associated with the provided domain.
  const uri = Services.io.newURI(url);
  call.setAbortable(new OAuthAbortable(oauth2Module));
  let isOAuth2Available = oauth2Module.initFromHostname(
    uri.host,
    username,
    // We pretend to be an IMAP server so we don't try to request unnecessary
    // scopes such as the EWS one (which would happen if we used "exchange" or
    // "ews" here). AutoDiscover seems to offer the same configuration
    // regardless of the scope(s) requested, and some organisations will usually
    // restrict the use of scopes like the EWS ones to a small allow-list of
    // clients for security reasons.
    "imap"
  );
  // Using the actual exchange type for the check so we only get positive
  // feedback if the provider is expected to support exchange in the first
  // place.
  isOAuth2Available &&= lazy.OAuth2Providers.getHostnameDetails(
    uri.host,
    "exchange"
  );
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
        if (call.callerAbortable.cancelled) {
          call.errorCallback()(new UserCancelledException("OAuth cancelled"));
          return;
        }

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
 * Attempts to fetch a configuration from a URL that came from an
 * unauthenticated and potentially unsafe source (e.g. a redirect from a plain
 * HTTP request, or an SRV DNS lookup).
 *
 * If the URL's "base" domain (i.e. its first and second level domains) is not
 * the same as the one from the user's email address, and is not a domain owned
 * by Microsoft that's commonly used for Autodiscover (such as "outlook.com" or
 * "office365.com"), the user is prompted with a modal asking them whether they
 * wish to continue and send an authenticated request to the new URL, or to
 * cancel.
 *
 * @param {PriorityOrderAbortable} priority - The `PriorityOrderAbortable` to
 *   use for creating new calls.
 * @param {string} newURL - The new URL to fetch if deemed safe.
 * @param {string} srcDomain - The domain part of the user's address.
 * @param {string} username - The username to use for authentication.
 * @param {string} password - The password to use for authentication.
 * @param {object} httpArgs - The arguments to pass to FetchHTTP.
 * @param {Function} confirmCallback - A function that prompts the user to
 *   confirm (or cancel) if the domain on which the new request would be sent is
 *   deemed potentially unsafe.
 * @param {Function} errorCallback - A function that handles any error that
 *   might occur throughout the process.
 */
function fetchFromPotentiallyUnsafeAddress(
  priority,
  newURL,
  srcDomain,
  username,
  password,
  httpArgs,
  confirmCallback,
  errorCallback
) {
  const newURI = Services.io.newURI(newURL);
  const newDomain = Services.eTLD.getBaseDomain(newURI);
  const originalDomain = Services.eTLD.getBaseDomainFromHost(srcDomain);

  function fetchNewURL() {
    // Note: We need the call to be added here so `priority` does not
    // believe it has exhausted all of its calls when we move into further
    // async layers.
    const fetchCall = priority.addCall();
    // Now that we're on an HTTPS URL, try again with authentication.
    startFetchWithAuth(fetchCall, newURL, username, password, httpArgs);
  }

  const kSafeDomains = ["office365.com", "outlook.com"];
  if (newDomain != originalDomain && !kSafeDomains.includes(newDomain)) {
    // Given that we received the redirect URL from an insecure HTTP call,
    // we ask the user whether he trusts the redirect domain.
    gAccountSetupLogger.info(
      `Trying new domain for Autodiscover from HTTP redirect or SRV lookup: ${newDomain}`
    );
    const dialogSuccessive = new SuccessiveAbortable();
    // Because the dialog implements Abortable, the dialog will cancel and
    // close automatically, if a slow higher priority call returns late.
    const dialogCall = priority.addCall();
    dialogCall.setAbortable(dialogSuccessive);
    errorCallback(new Exception("Redirected"));
    dialogSuccessive.current = new TimeoutAbortable(
      lazy.setTimeout(() => {
        dialogSuccessive.current = confirmCallback(
          newDomain,
          () => {
            // User agreed.
            fetchNewURL();
            // Remove the dialog from the call stack.
            dialogCall.errorCallback()(new Exception("Proceed to fetch"));
          },
          e => {
            // User rejected, or action cancelled otherwise.
            dialogCall.errorCallback()(e);
          },
          newURI.scheme
        );
        // Account for a slow server response.
        // This will prevent showing the warning message when not necessary.
        // The timeout is just for optics. The Abortable ensures that it works.
      }, 2000)
    );
  } else {
    fetchNewURL();
    errorCallback(new Exception("Redirected"));
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
 * @param {?string} username - (Optional) The user's login name.
 *   If null, email address will be used.
 * @param {string} password - The user's password for that email address
 * @param {function(string,Function,Function):void} confirmCallback - A callback
 *   Function(domain, okCallback, cancelCallback) that will be called to confirm
 *   redirection to another domain.
 * @param {function(AccountConfig):void} successCallback - A callback function
 *   {Function(config {AccountConfig})} that
 *   will be called when we could retrieve a configuration.
 *   The AccountConfig object will be passed in as first parameter.
 * @param {function(Error):void} errorCallback - A callback that
 *   will be called when we could not retrieve a configuration,
 *   for whatever reason. This is expected (e.g. when there's no config
 *   for this domain at this location),
 *   so do not unconditionally show this to the user.
 *   The first parameter will be an exception object or error string.
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

      fetchFromPotentiallyUnsafeAddress(
        priority,
        redirectURL,
        domain,
        authUsername,
        password,
        callArgs,
        confirmCallback,
        call3ErrorCallback
      );
    }
  );
  fetch3.start();
  call3.setAbortable(fetch3);

  // On top of the HTTP(S) calls we perform, we also want to see if there's at
  // least one SRV record for Autodiscover on the domain. If there is, we'll
  // treat the URL we derive from it the same way we treat the URLs we get from
  // HTTP redirects (i.e. using `fetchFromPotentiallyUnsafeAddress`), since they
  // both come from insecure, unauthenticated sources.
  const call4 = priority.addCall();
  call4.foundMsg = "srv";
  const call4ErrorCallback = call4.errorCallback();
  const srvAbortable = new PromiseAbortable(
    DNS.srv(`_autodiscover._tcp.${domain}`),
    records => {
      // Sort the records by weight. RFC 2782 says hosts with higher weight
      // should be given a higher probability of being selected.
      const hostname = records.sort((a, b) => a.weight - b.weight)[0]?.host;

      // It's not clear how likely it is that the lookup succeeds but does not
      // provide any answer. It's unlikely to happen, but this is here just to
      // be safe.
      if (!hostname) {
        call4ErrorCallback(
          new Error(`no SRV record for _autodiscover._tcp.${domain}`)
        );
      }

      // Build the full URL for autodiscover using the hostname with the highest
      // priority.
      const autodiscoverURL = `https://${lazy.Sanitizer.hostname(hostname)}/autodiscover/autodiscover.xml`;

      fetchFromPotentiallyUnsafeAddress(
        priority,
        autodiscoverURL,
        domain,
        authUsername,
        password,
        callArgs,
        confirmCallback,
        call4ErrorCallback
      );
    },
    call4ErrorCallback
  );
  call4.setAbortable(srvAbortable);

  successive.current = priority;
  return successive;
}

var gLoopCounter = 0;

/**
 * @param {object} autoDiscoverXML - The Exchange server AutoDiscover response, as JXON.
 * @param {Abortable} successive
 * @param {string} emailAddress - Email address.
 * @param {string} username - Username.
 * @param {string} password - Password.
 * @param {function(string,Function,Function):void} confirmCallback - A callback
 *   Function(domain, okCallback, cancelCallback) that will be called to confirm
 *   redirection to another domain.
 * @param {function(AccountConfig):void} successCallback - @see accountConfig.js
 * @param {function(Error):void} errorCallback - @see accountConfig.js
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
  if (autoDiscoverXML?.Autodiscover?.Response?.Account?.RedirectAddr) {
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

  let success = false;
  let config;
  try {
    config = readAutoDiscoverXML(autoDiscoverXML, username);
    success = config.isComplete();
  } catch (error) {
    gAccountSetupLogger.log(error);
  }
  if (success) {
    successCallback(config);
  } else {
    errorCallback(new Exception("No valid configs found in AutoDiscover XML"));
  }
}

/**
 * @param {object} autoDiscoverXML - The Exchange server AutoDiscover response,
 *  as JXON.
 * @param {?string} username - (Optional) The user's login name
 *   If null, email address placeholder will be used.
 * @returns {AccountConfig} - @see accountConfig.js
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
  config.incoming.authAlternatives = [
    Ci.nsMsgAuthMethod.OAuth2,
    Ci.nsMsgAuthMethod.NTLM,
  ];
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
            !config.incoming.exchangeURL &&
            "Protocol" in urlsX &&
            "ASUrl" in urlsX.Protocol
          ) {
            config.incoming.exchangeURL = lazy.Sanitizer.url(
              urlsX.Protocol.ASUrl
            );
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
        config.incoming.exchangeURL = lazy.Sanitizer.url(protocolX.EwsUrl);
        if (!config.incoming.exchangeURL) {
          config.incoming.exchangeURL = lazy.Sanitizer.url(protocolX.ASUrl);
        }
        config.incoming.type = "exchange";
        const parsedURL = new URL(config.incoming.exchangeURL);
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

  return config;
}

/**
 * Ask server which addons can handle this config.
 *
 * @param {AccountConfig} config
 * @param {function(AccountConfig):void} successCallback
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
            (incoming.exchangeURL && type.protocolType == "ews") ||
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
 * @returns {AddonInfo[]} - @see AccountConfig.addons
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

  function ensureJsonArray(value) {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {}
    }
    return Array.isArray(value) ? value : [];
  }

  const xulLocale = Services.locale.requestedLocale;
  const locale = xulLocale ? xulLocale.substring(0, 5) : "default";
  for (const addonJSON of ensureJsonArray(json)) {
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
      for (const typeJSON of ensureJsonArray(addonJSON.accountTypes)) {
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
 * @param {function(AccountConfig):void} successCallback - A callback that
 *   will be called when we found an appropriate configuration.
 *   The AccountConfig object will be passed in as first parameter.
 */
function detectStandardProtocols(config, domain, successCallback) {
  gAccountSetupLogger.info("Exchange Autodiscover gave some results.");
  const alts = [config.incoming, ...config.incomingAlternatives];
  if (alts.find(alt => alt.type == "imap" || alt.type == "pop3")) {
    // Autodiscover found an exchange server with advertised IMAP and/or
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
