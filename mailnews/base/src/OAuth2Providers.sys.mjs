/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Details of supported OAuth2 Providers.
 */
// When we add a Google mail account, ask for address book and calendar scopes
// as well. Then we can add an address book or calendar without asking again.
//
// Don't ask for all the scopes when adding an address book or calendar
// independently of the mail set-up process. If a mail account already exists,
// we already have a token, and if it doesn't the user is likely to be setting
// up an address book/calendar without wanting mail.
const GOOGLE_SCOPES = {
  imap: "https://mail.google.com/",
  pop3: "https://mail.google.com/",
  smtp: "https://mail.google.com/",
  carddav: "https://www.googleapis.com/auth/carddav",
  caldav: "https://www.googleapis.com/auth/calendar",
};
const FASTMAIL_SCOPES = {
  imap: "https://www.fastmail.com/dev/protocol-imap",
  pop3: "https://www.fastmail.com/dev/protocol-pop",
  smtp: "https://www.fastmail.com/dev/protocol-smtp",
  carddav: "https://www.fastmail.com/dev/protocol-carddav",
  caldav: "https://www.fastmail.com/dev/protocol-caldav",
};
const COMCAST_SCOPES = "https://email.comcast.net/ profile openid";
const MICROSOFT_SCOPES = {
  imap: "https://outlook.office.com/IMAP.AccessAsUser.All",
  pop3: "https://outlook.office.com/POP.AccessAsUser.All",
  smtp: "https://outlook.office.com/SMTP.Send",
  extra: "offline_access",
};
const EWS_SCOPES = {
  ews: "https://outlook.office.com/EWS.AccessAsUser.All",
  // "exchange" is used in the account setup, then the config is copied to "ews".
  exchange: "https://outlook.office.com/EWS.AccessAsUser.All",
  extra: "offline_access",
};

const GRAPH_SCOPES = {
  exchange: "https://graph.microsoft.com/User.Read",
  graph: "https://graph.microsoft.com/User.Read",
};

const TBPRO_SCOPES = "openid profile email offline_access";

/**
 * Map of hostnames to [issuer, scope].
 */
var kHostnames = new Map([
  // imap.googlemail.com, pop.googlemail.com, smtp.googlemail.com
  ["googlemail.com", ["accounts.google.com", GOOGLE_SCOPES]],
  // imap.gmail.com, pop.gmail.com, smtp.gmail.com, smtp-relay.gmail.com
  ["gmail.com", ["accounts.google.com", GOOGLE_SCOPES]],
  ["www.googleapis.com", ["accounts.google.com", GOOGLE_SCOPES.carddav]],
  [
    "apidata.googleusercontent.com",
    ["accounts.google.com", GOOGLE_SCOPES.caldav],
  ],

  ["imap.mail.ru", ["o2.mail.ru", "mail.imap"]],
  ["smtp.mail.ru", ["o2.mail.ru", "mail.imap"]],

  ["imap.yandex.com", ["oauth.yandex.com", "mail:imap_full"]],
  ["smtp.yandex.com", ["oauth.yandex.com", "mail:smtp"]],

  ["yahoo.com", ["login.yahoo.com", "mail-w"]],
  ["att.net", ["login.yahoo.com", "mail-w"]],

  ["imap.aol.com", ["login.aol.com", "mail-w"]],
  ["pop.aol.com", ["login.aol.com", "mail-w"]],
  ["smtp.aol.com", ["login.aol.com", "mail-w"]],

  // outlook.office365.com, smtp.office365.com
  ["office365.com", ["login.microsoftonline.com", MICROSOFT_SCOPES]],
  // autodiscover-s.outlook.com, smtp-mail.outlook.com
  ["outlook.com", ["login.microsoftonline.com", MICROSOFT_SCOPES]],
  // autodiscover.hotmail.com
  ["hotmail.com", ["login.microsoftonline.com", MICROSOFT_SCOPES]],

  ["imap.fastmail.com", ["www.fastmail.com", FASTMAIL_SCOPES]],
  ["pop.fastmail.com", ["www.fastmail.com", FASTMAIL_SCOPES]],
  ["smtp.fastmail.com", ["www.fastmail.com", FASTMAIL_SCOPES]],
  ["carddav.fastmail.com", ["www.fastmail.com", FASTMAIL_SCOPES.carddav]],
  ["caldav.fastmail.com", ["www.fastmail.com", FASTMAIL_SCOPES.caldav]],

  ["imap.comcast.net", ["comcast.net", COMCAST_SCOPES]],
  ["pop.comcast.net", ["comcast.net", COMCAST_SCOPES]],
  ["smtp.comcast.net", ["comcast.net", COMCAST_SCOPES]],

  ["thundermail.com", ["auth.tb.pro", TBPRO_SCOPES]],
  ["stage-thundermail.com", ["auth-stage.tb.pro", TBPRO_SCOPES]],

  // For testing purposes.
  ["mochi.test", ["test.test", "test_scope"]],
  [
    "test.test",
    [
      "test.test",
      {
        imap: "test_mail",
        pop3: "test_mail",
        smtp: "test_mail",
        ews: "test_mail",
        carddav: "test_addressbook",
        caldav: "test_calendar",
      },
    ],
  ],
]);

/**
 * Map of issuers to clientId, clientSecret, authorizationEndpoint, tokenEndpoint,
 *  and usePKCE (RFC7636).
 * Issuer is a unique string for the organization that a Thunderbird account
 * was registered at.
 *
 * For the moment these details are hard-coded, since dynamic client
 * registration is not yet supported. Don't copy these values for your
 * own application - register one for yourself! This code (and possibly even the
 * registration itself) will disappear when this is switched to dynamic
 * client registration.
 */
var kIssuers = new Map([
  [
    "accounts.google.com",
    {
      name: "accounts.google.com",
      builtIn: true,
      clientId:
        "406964657835-aq8lmia8j95dhl1a2bvharmfk3t1hgqj.apps.googleusercontent.com",
      clientSecret: "kSmqreRr0qwBWJgbf5Y-PjSU",
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/auth",
      tokenEndpoint: "https://www.googleapis.com/oauth2/v3/token",
    },
  ],
  [
    "o2.mail.ru",
    {
      name: "o2.mail.ru",
      builtIn: true,
      clientId: "thunderbird",
      clientSecret: "I0dCAXrcaNFujaaY",
      authorizationEndpoint: "https://o2.mail.ru/login",
      tokenEndpoint: "https://o2.mail.ru/token",
    },
  ],
  [
    "oauth.yandex.com",
    {
      name: "oauth.yandex.com",
      builtIn: true,
      clientId: "2a00bba7374047a6ab79666485ffce31",
      clientSecret: "3ded85b4ec574c2187a55dc49d361280",
      authorizationEndpoint: "https://oauth.yandex.com/authorize",
      tokenEndpoint: "https://oauth.yandex.com/token",
    },
  ],
  [
    "login.yahoo.com",
    {
      name: "login.yahoo.com",
      builtIn: true,
      clientId:
        "dj0yJmk9NUtCTWFMNVpTaVJmJmQ9WVdrOVJ6UjVTa2xJTXpRbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD0yYw--",
      clientSecret: "f2de6a30ae123cdbc258c15e0812799010d589cc",
      authorizationEndpoint: "https://api.login.yahoo.com/oauth2/request_auth",
      tokenEndpoint: "https://api.login.yahoo.com/oauth2/get_token",
    },
  ],
  [
    "login.aol.com",
    {
      name: "login.aol.com",
      builtIn: true,
      clientId:
        "dj0yJmk9OXRHc1FqZHRQYzVvJmQ9WVdrOU1UQnJOR0pvTjJrbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD02NQ--",
      clientSecret: "79c1c11991d148ddd02a919000d69879942fc278",
      authorizationEndpoint: "https://api.login.aol.com/oauth2/request_auth",
      tokenEndpoint: "https://api.login.aol.com/oauth2/get_token",
    },
  ],

  [
    "login.microsoftonline.com",
    {
      name: "login.microsoftonline.com",
      builtIn: true,
      clientId: "9e5f94bc-e8a4-4e73-b8be-63364c29d753", // Application (client) ID
      // https://docs.microsoft.com/en-us/azure/active-directory/develop/active-directory-v2-protocols#endpoints
      authorizationEndpoint:
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenEndpoint:
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      redirectionEndpoint: "https://localhost",
    },
  ],

  [
    "www.fastmail.com",
    {
      name: "www.fastmail.com",
      builtIn: true,
      clientId: "35f141ae",
      authorizationEndpoint: "https://api.fastmail.com/oauth/authorize",
      tokenEndpoint: "https://api.fastmail.com/oauth/refresh",
      usePKCE: true,
    },
  ],

  [
    "comcast.net",
    {
      name: "comcast.net",
      builtIn: true,
      clientId: "thunderbird-oauth",
      clientSecret: "fc5d0a314549bb3d059e0cec751fa4bd40a9cc7b",
      authorizationEndpoint: "https://oauth.xfinity.com/oauth/authorize",
      tokenEndpoint: "https://oauth.xfinity.com/oauth/token",
      usePKCE: true,
    },
  ],

  [
    "auth.tb.pro",
    {
      name: "auth.tb.pro",
      builtIn: true,
      clientId: "desktop",
      authorizationEndpoint:
        "https://auth.tb.pro/realms/tbpro/protocol/openid-connect/auth",
      tokenEndpoint:
        "https://auth.tb.pro/realms/tbpro/protocol/openid-connect/token",
      usePKCE: true,
    },
  ],

  [
    "auth-stage.tb.pro",
    {
      name: "auth-stage.tb.pro",
      builtIn: true,
      clientId: "desktop",
      authorizationEndpoint:
        "https://auth-stage.tb.pro/realms/tbpro/protocol/openid-connect/auth",
      tokenEndpoint:
        "https://auth-stage.tb.pro/realms/tbpro/protocol/openid-connect/token",
      usePKCE: true,
    },
  ],

  // For testing purposes.
  [
    "test.test",
    {
      name: "test.test",
      builtIn: true,
      clientId: "test_client_id",
      clientSecret: "test_secret",
      authorizationEndpoint: "https://oauth.test.test/form",
      tokenEndpoint: "https://oauth.test.test/token",
      redirectionEndpoint: "https://localhost",
    },
  ],
]);

/**
 * OAuth2Providers: Methods to lookup OAuth2 parameters for supported OAuth2
 * providers.
 */
export var OAuth2Providers = {
  /**
   * @typedef hostnameDetails
   * @property {string} issuer - A string representing the organization.
   * @property {string} allScopes - A space-separated list of all scopes for
   *   the hostname.
   * @property {string} requiredScopes - A space-separated list of all scopes
   *  required for the given type.
   */

  /**
   * Map a hostname to the relevant issuer and scope.
   *
   * @param {string} hostname - The hostname of the server. For example
   *  "imap.googlemail.com".
   * @param {string} type - The type of activity we need a token for,
   *   e.g. "imap" or "caldav".
   * @returns {hostnameDetails} An object containing issuer and scope information
   *   for the hostname and type, or undefined if not found.
   */
  getHostnameDetails(hostname, type) {
    if (!type) {
      throw new Error("passing a `type` argument is required");
    }
    if (type.startsWith("owl")) {
      type = "exchange";
    }

    const details = this._getHostnameDetails(hostname);
    if (!details) {
      // No data, return.
      return undefined;
    }

    // Only allow graph scopes if the Graph API support pref is enabled.
    const graphApiPrefEnabled = Services.prefs.getBoolPref(
      "mail.graph.enabled",
      false
    );

    let [issuer, scopes] = details;
    if (
      issuer == "login.microsoftonline.com" &&
      ["ews", "exchange"].includes(type)
    ) {
      // Special case for EWS, to avoid asking for the scope when not needed.
      scopes = EWS_SCOPES;
    } else if (
      graphApiPrefEnabled &&
      issuer == "login.microsoftonline.com" &&
      type == "graph"
    ) {
      scopes = GRAPH_SCOPES;
    }

    if (typeof scopes == "string") {
      // Scopes not separated into types.
      return { issuer, allScopes: scopes, requiredScopes: scopes };
    }

    const allScopes = combineScopes(Object.values(scopes));
    if (!scopes[type]) {
      // No data for type.
      return undefined;
    }

    const requiredScopes = combineScopes([scopes[type], scopes.extra]);
    return { issuer, allScopes, requiredScopes };
  },

  _getHostnameDetails(hostname) {
    // During CardDAV SRV autodiscovery, rfc6764#section-6 says:
    //
    // *  The client will need to make authenticated HTTP requests to
    //    the service.  Typically, a "user identifier" is required for
    //    some form of user/password authentication.  When a user
    //    identifier is required, clients MUST first use the "mailbox"
    //
    // However macOS Contacts does not do this and just uses the "localpart"
    // instead. To work around this bug, during SRV autodiscovery Fastmail
    // returns SRV records of the form '0 1 443 d[0-9]+.carddav.fastmail.com.'
    // which encodes the internal domainid of the queried SRV domain in the
    // sub-domain of the Target (rfc2782) of the SRV result. This can
    // then be extracted from the Host header on each DAV request, the
    // original domain looked up and attached to the "localpart" to create
    // a full "mailbox", allowing autodiscovery to just work for usernames
    // in any domain including self hosted domains.
    //
    // So for this hostname -> issuer/scope lookup to work, we need to
    // look not just at the hostname, but also any sub-domains of this
    // hostname.
    while (hostname.includes(".")) {
      const foundHost = kHostnames.get(hostname);
      if (foundHost) {
        return foundHost;
      }
      hostname = hostname.replace(/^[^.]*[.]/, "");
    }
    return undefined;
  },

  /**
   * Map an issuer to OAuth2 account details.
   *
   * @param {string} issuer - The organization issuing OAuth2 parameters, e.g.
   *   "accounts.google.com".
   *
   * @returns {Array} An array containing [clientId, clientSecret, authorizationEndpoint, tokenEndpoint].
   *   clientId and clientSecret are strings representing the account registered
   *   for Thunderbird with the organization.
   *   authorizationEndpoint and tokenEndpoint are url strings representing
   *   endpoints to access OAuth2 authentication.
   */
  getIssuerDetails(issuer) {
    return kIssuers.get(issuer);
  },

  /**
   * Add a provider at run-time. This will typically only be called by the
   * extension API.
   *
   * @param {string} issuer - To identify this provider in the login manager.
   * @param {string} clientId - Identifies the OAuth client to the server.
   * @param {string} clientSecret - Identifies the OAuth client to the server.
   * @param {string} authorizationEndpoint - OAuth authorization endpoint address.
   * @param {string} tokenEndpoint - OAuth token endpoint address.
   * @param {string} redirectionEndpoint - OAuth redirection endpoint.
   * @param {boolean} usePKCE - If the authorization uses PKCE.
   * @param {string[]} hostnames - One or more hostnames which use this OAuth provider.
   * @param {string} scopes - The scopes to request when using this OAuth provider.
   */
  registerProvider(
    issuer,
    clientId,
    clientSecret,
    authorizationEndpoint,
    tokenEndpoint,
    redirectionEndpoint,
    usePKCE,
    hostnames,
    scopes
  ) {
    if (kIssuers.has(issuer)) {
      throw new Error(`Issuer ${issuer} already registered.`);
    }
    for (const hostname of hostnames) {
      if (kHostnames.has(hostname)) {
        throw new Error(`Hostname ${hostname} already registered.`);
      }
    }
    kIssuers.set(issuer, {
      name: issuer,
      builtIn: false,
      clientId,
      clientSecret,
      authorizationEndpoint,
      tokenEndpoint,
      redirectionEndpoint,
      usePKCE,
    });
    for (const hostname of hostnames) {
      kHostnames.set(hostname, [issuer, scopes]);
    }
  },

  /**
   * Remove a runtime-added provider. Built-in providers cannot be removed.
   *
   * @param {string} issuer - The same string used for `registerProvider`.
   */
  unregisterProvider(issuer) {
    if (!kIssuers.has(issuer)) {
      throw new Error(`Issuer ${issuer} was not registered.`);
    }
    if (kIssuers.get(issuer).builtIn) {
      throw new Error(`Refusing to unregister built-in provider ${issuer}.`);
    }
    kIssuers.delete(issuer);
    for (const [hostname, details] of kHostnames) {
      if (details[0] == issuer) {
        kHostnames.delete(hostname);
      }
    }
  },
};

/**
 * Turns zero or more space-delimited strings of scopes into a single string,
 * avoiding duplicates.
 *
 * @param {string[]} scopeStrings
 * @returns {string}
 */
function combineScopes(scopeStrings) {
  const scopes = new Set();
  for (const scopeString of scopeStrings) {
    if (!scopeString) {
      continue;
    }
    for (const scope of scopeString.split(" ")) {
      scopes.add(scope);
    }
  }
  return [...scopes].join(" ");
}
