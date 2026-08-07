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

  // The `offline_access` scope instructs the Microsoft backend to provide a
  // refresh token, which we can then store and avoid needing to trigger a new
  // interactive flow at each startup. See
  // https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#successful-response-2
  extra: "offline_access",
};

const GRAPH_SCOPES = {
  exchange:
    "https://graph.microsoft.com/User.Read https://graph.microsoft.com/MailboxFolder.ReadWrite https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send",
  graph:
    "https://graph.microsoft.com/User.Read https://graph.microsoft.com/MailboxFolder.ReadWrite https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send",

  // The `offline_access` scope instructs the Microsoft backend to provide a
  // refresh token, which we can then store and avoid needing to trigger a new
  // interactive flow at each startup. See
  // https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#successful-response-2
  extra: "offline_access",
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

  ["yahoo.com", ["login.yahoo.com", "mail-w ycal-w sdct-w"]],
  ["att.net", ["login.yahoo.com", "mail-w ycal-w sdct-w"]],

  ["aol.com", ["login.aol.com", "mail-w ycal-w sdct-w"]],

  // outlook.office365.com, smtp.office365.com
  ["office365.com", ["login.microsoftonline.com", MICROSOFT_SCOPES]],
  // graph.microsoft.com
  ["graph.microsoft.com", ["login.microsoftonline.com", MICROSOFT_SCOPES]],
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
  ["external.test", ["external.test", "test_mail"]],
  ["net.thunderbird.test", ["net.thunderbird.test", "test_mail"]],
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
 * Extension OAuth provider registrations.
 *
 * Keys are either:
 *
 *   hostname
 *
 * or
 *
 *   hostname|emailDomain
 *
 * allowing multiple extensions to register providers for the same service
 * hostname while restricting registrations to particular authentication
 * username domains.
 *
 * Values are the same format as kHostnames:
 *
 *   [issuer, scopes]
 */
const kExtensionHostnames = new Map();

/**
 * Map of OAuth provider details registered by extensions.
 *
 * Extension issuers remain separate from built-in issuers so that
 * unregistering an extension cannot alter the built-in provider data.
 *
 * @type {Map<string, IssuerDetails>}
 */
const kExtensionIssuers = new Map();

/**
 * This list serves as a helper to filter out issuers that don't use an object
 * to provide type specific scopes but don't support exchange don't offer OAuth
 * for exchange. If an issuer is registered with an object of scopes it doesn't
 * need to be declared in this list, because its capabilities are determined by
 * the keys on the object.
 *
 * @type {Set<string>}
 */
const kIssuersWithoutExchangeSupport = new Set([
  "o2.mail.ru",
  "oauth.yandex.com",
  "login.yahoo.com",
  "login.aol.com",
  "comcast.net",
  "auth.tb.pro",
  "auth-stage.tb.pro",
]);

/**
 * @typedef IssuerDetails
 * The information required to perform OAuth authentication with an provider.
 * See RFC6749 for more information.
 *
 * @property {string} name - An internal name Thunderbird uses to identify the
 *   details object. Usually but not necessarily the hostname of the endpoints.
 * @property {boolean} builtIn - If the details are built-in to the shipped
 *   `kIssuers` map. `registerProvider` always sets this to false.
 * @property {string} clientId - Identifies the OAuth client to the server.
 * @property {string} [clientSecret] - "Secret" to verify the clientId, if the
 *   server requires it.
 * @property {string} [issuerIdentifier] - The issuer identifier, as defined by
 *   RFC9207, if one is expected.
 * @property {string} authorizationEndpoint - OAuth authorization endpoint URL.
 * @property {string} tokenEndpoint - OAuth token endpoint URL.
 * @property {string} [redirectionEndpoint] - OAuth redirection endpoint.
 * @property {boolean} [usePKCE] - The issuer uses PKCE (RFC7636).
 * @property {boolean} [useExternalBrowser] - Whether to use the external
 *   browser OAuth login flow.
 * @property {string} [extensionId] - ID of the extension that registered this
 * provider, if applicable.
 * @property {string} [schemeRedirect] - Alternative redirection endpoint if
 *   using the net.thunderbird:// scheme. Only built-in providers can provide
 *   this, and it will only be used if this instance is configured to.
 */

/**
 * Map of issuers to IssuerDetails. Issuer is a unique string for the
 * organization that a Thunderbird account was registered at.
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
      issuerIdentifier: "https://accounts.google.com",
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/auth",
      tokenEndpoint: "https://www.googleapis.com/oauth2/v3/token",
      usePKCE: true,
      useExternalBrowser: true,
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
        "dj0yJmk9WVZUaWRNUUZSQTBNJmQ9WVdrOVNqbHJUMGhtTkU4bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTgz",
      authorizationEndpoint: "https://api.login.yahoo.com/oauth2/request_auth",
      tokenEndpoint: "https://api.login.yahoo.com/oauth2/get_token",
      redirectionEndpoint: "https://127.0.0.1",
      // This isn't the normal net.thunderbird URL because Yahoo set it and we
      // can't change it (though its uniqueness also helps with their lack of
      // support for issuer identification).
      schemeRedirect: "net.thunderbird://oauth/yahoo",
      usePKCE: true,
    },
  ],
  [
    "login.aol.com",
    {
      name: "login.aol.com",
      builtIn: true,
      clientId:
        "dj0yJmk9MGNoTTQ0SjhIN1dSJmQ9WVdrOVdIVnFkVVp2UkZNbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTNm",
      authorizationEndpoint: "https://api.login.aol.com/oauth2/request_auth",
      tokenEndpoint: "https://api.login.aol.com/oauth2/get_token",
      redirectionEndpoint: "https://127.0.0.1",
      usePKCE: true,
    },
  ],

  [
    "login.microsoftonline.com",
    {
      name: "login.microsoftonline.com",
      builtIn: true,
      clientId: "9e5f94bc-e8a4-4e73-b8be-63364c29d753", // Application (client) ID
      // https://docs.microsoft.com/en-us/azure/active-directory/develop/active-directory-v2-protocols#endpoints
      authorizationEndpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`,
      tokenEndpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
      useExternalBrowser: true,
    },
  ],

  [
    "www.fastmail.com",
    {
      name: "www.fastmail.com",
      builtIn: true,
      clientId: "35f141ae",
      issuerIdentifier: "https://api.fastmail.com",
      authorizationEndpoint: "https://api.fastmail.com/oauth/authorize",
      tokenEndpoint: "https://api.fastmail.com/oauth/refresh",
      usePKCE: true,
      useExternalBrowser: true,
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
      issuerIdentifier: "https://auth.tb.pro/realms/tbpro",
      authorizationEndpoint:
        "https://auth.tb.pro/realms/tbpro/protocol/openid-connect/auth",
      tokenEndpoint:
        "https://auth.tb.pro/realms/tbpro/protocol/openid-connect/token",
      usePKCE: true,
      useExternalBrowser: true,
    },
  ],

  [
    "auth-stage.tb.pro",
    {
      name: "auth-stage.tb.pro",
      builtIn: true,
      clientId: "desktop",
      issuerIdentifier: "https://auth-stage.tb.pro/realms/tbpro",
      authorizationEndpoint:
        "https://auth-stage.tb.pro/realms/tbpro/protocol/openid-connect/auth",
      tokenEndpoint:
        "https://auth-stage.tb.pro/realms/tbpro/protocol/openid-connect/token",
      usePKCE: true,
      useExternalBrowser: true,
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
      usePKCE: true,
    },
  ],
  [
    "external.test",
    {
      name: "external.test",
      builtIn: true,
      clientId: "test_client_id",
      clientSecret: "test_secret",
      authorizationEndpoint: "https://oauth.test.test/form",
      tokenEndpoint: "https://oauth.test.test/token",
      redirectionEndpoint: "http://localhost",
      usePKCE: true,
      useExternalBrowser: true,
    },
  ],
  [
    "net.thunderbird.test",
    {
      name: "net.thunderbird.test",
      builtIn: true,
      clientId: "test_client_id",
      clientSecret: "test_secret",
      authorizationEndpoint: "https://oauth.test.test/form",
      tokenEndpoint: "https://oauth.test.test/token",
      redirectionEndpoint: "http://localhost",
      schemeRedirect: "net.thunderbird://oauth2/callback",
      usePKCE: true,
    },
  ],
]);
for (const issuerDetails of kIssuers.values()) {
  Object.freeze(issuerDetails);
}

/**
 * Build the lookup key for an extension OAuth provider registration.
 *
 * @param {string} hostname
 * @param {?string} emailDomain
 * @returns {string}
 */
function getExtensionHostnameKey(hostname, emailDomain = null) {
  return emailDomain ? `${hostname}|${emailDomain}` : hostname;
}

/**
 * Extract the domain from an email-style authentication username.
 *
 * Usernames may not be email addresses so if it doesn't
 * contain both a local part and a domain, no domain is returned.
 *
 * @param {string} username
 * @returns {?string}
 */
function getUsernameDomain(username) {
  if (typeof username != "string") {
    return null;
  }

  const parts = username.split("@");
  if (parts.length != 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return parts[1].toLowerCase();
}

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
   * @param {string} [username] - The configured authentication username. This is
   *   used to select extension providers restricted to particular username
   *   domains.
   * @returns {hostnameDetails} An object containing issuer and scope information
   *   for the hostname and type, or undefined if not found.
   */
  getHostnameDetails(hostname, type, username) {
    if (!type) {
      throw new Error("passing a `type` argument is required");
    }
    if (type.startsWith("owl")) {
      type = "exchange";
    }

    // Allow extension-registered providers with matching hostname to override
    // built-in provider configurations.
    const details =
      this._getExtensionDetails(hostname, username) ??
      this._getBuiltInDetails(hostname);

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
      if (type == "exchange" && kIssuersWithoutExchangeSupport.has(issuer)) {
        // Exchange is not available for this hostname.
        return undefined;
      }
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

  /**
   * Find an extension provider for the given hostname and username.
   *
   * Hostnames are checked from most specific to least specific, matching the
   * existing built-in hostname lookup behaviour. For each hostname, a provider
   * matching the username's email domain is preferred over an unrestricted
   * provider.
   *
   * @param {string} hostname
   * @param {string} [username]
   * @returns {?Array} An [issuer, scopes] tuple, or undefined if no extension
   *   provider applies.
   */
  _getExtensionDetails(hostname, username) {
    hostname = hostname.toLowerCase();
    const emailDomain = getUsernameDomain(username);

    while (hostname.includes(".")) {
      if (emailDomain) {
        const domainSpecificDetails = kExtensionHostnames.get(
          getExtensionHostnameKey(hostname, emailDomain)
        );
        if (domainSpecificDetails) {
          return domainSpecificDetails;
        }
      }

      const unrestrictedDetails = kExtensionHostnames.get(
        getExtensionHostnameKey(hostname)
      );
      if (unrestrictedDetails) {
        return unrestrictedDetails;
      }

      hostname = hostname.replace(/^[^.]*[.]/, "");
    }

    return undefined;
  },

  _getBuiltInDetails(hostname) {
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
    hostname = hostname.toLowerCase();
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
   * This function will override Microsoft 365 providers to use the Thunderbird
   * Sandbox Azure application ID if the `mail.microsoft.useM365Sandbox`
   * preference is set to true.
   *
   * @param {string} issuer - The organization issuing OAuth2 parameters, e.g.
   *   "accounts.google.com".
   * @returns {?IssuerDetails}
   */
  getIssuerDetails(issuer) {
    let details = kExtensionIssuers.get(issuer);
    if (details) {
      return details;
    }

    details = kIssuers.get(issuer);

    // We have a separate sandbox for prototyping OAuth scopes on Microsoft 365.
    if (
      issuer == "login.microsoftonline.com" &&
      Services.prefs.getBoolPref("mail.microsoft.useM365Sandbox", false)
    ) {
      details = structuredClone(details);
      details.clientId = "b00dc6cb-0459-4bd4-ac0d-2e23516f906a";
      const microsoft365SandboxTenantId =
        "aead8f37-924c-4d3f-9f20-494295c72956";
      details.authorizationEndpoint = `https://login.microsoftonline.com/${microsoft365SandboxTenantId}/oauth2/v2.0/authorize`;
      details.tokenEndpoint = `https://login.microsoftonline.com/${microsoft365SandboxTenantId}/oauth2/v2.0/token`;
      Object.freeze(details);
    }

    return details;
  },

  /**
   * Add a provider at run-time. This will typically only be called by the
   * extension API.
   *
   * @param {IssuerDetails} details - OAuth provider details. `builtIn` and
   *   `schemeRedirect` are ignored and overwritten.
   * @param {string[]} hostnames - One or more hostnames which use this OAuth provider.
   * @param {string} scopes - The scopes to request when using this OAuth provider.
   * @param {string[]} [emailDomains=[]] - Domains of email-like authentication
   *   usernames for which this provider applies. If empty, the provider applies
   *   to all accounts using a matching hostname.
   */
  registerProvider(details, hostnames, scopes, emailDomains = []) {
    const issuer = details.name;

    if (kIssuers.has(issuer) || kExtensionIssuers.has(issuer)) {
      throw new Error(`Issuer ${issuer} already registered.`);
    }

    const normalizedHostnames = hostnames.map(hostname =>
      hostname.trim().toLowerCase()
    );
    const normalizedEmailDomains = emailDomains.map(emailDomain =>
      emailDomain.trim().toLowerCase()
    );

    for (const hostname of normalizedHostnames) {
      try {
        Services.eTLD.getBaseDomainFromHost(hostname);
      } catch (error) {
        if (error.result == Cr.NS_ERROR_INSUFFICIENT_DOMAIN_LEVELS) {
          throw new Error(
            `OAuth provider hostname ${hostname} must not be a public suffix.`
          );
        }
        throw error;
      }
    }

    if (new Set(normalizedHostnames).size != normalizedHostnames.length) {
      throw new Error("Duplicate hostname in OAuth provider registration.");
    }

    if (new Set(normalizedEmailDomains).size != normalizedEmailDomains.length) {
      throw new Error("Duplicate email domain in OAuth provider registration.");
    }

    const registrationKeys = new Set();

    if (normalizedEmailDomains.length) {
      for (const hostname of normalizedHostnames) {
        for (const emailDomain of normalizedEmailDomains) {
          registrationKeys.add(getExtensionHostnameKey(hostname, emailDomain));
        }
      }
    } else {
      for (const hostname of normalizedHostnames) {
        registrationKeys.add(getExtensionHostnameKey(hostname));
      }
    }

    // Extension startup will fail if any registration key is already in use.
    // The add-on may still appear installed, but none of its OAuth provider
    // registrations will be added.
    if (!registrationKeys.isDisjointFrom(kExtensionHostnames)) {
      throw new Error(
        `OAuth provider registration(s) ${registrationKeys
          .intersection(kExtensionHostnames)
          .keys()
          .join(", ")} are already registered by an extension provider.`
      );
    }

    const issuerDetails = {
      ...details,
      builtIn: false,
    };
    delete issuerDetails.schemeRedirect;
    Object.freeze(issuerDetails);

    kExtensionIssuers.set(issuer, issuerDetails);

    const extensionDetails = [issuer, scopes];
    for (const key of registrationKeys) {
      kExtensionHostnames.set(key, extensionDetails);
    }
  },

  /**
   * Remove a runtime-added provider. Built-in providers cannot be removed.
   *
   * @param {string} issuer - The same string used for `registerProvider`.
   */
  unregisterProvider(issuer) {
    if (!kExtensionIssuers.has(issuer)) {
      if (kIssuers.has(issuer)) {
        throw new Error(`Refusing to unregister built-in provider ${issuer}.`);
      }
      throw new Error(`Issuer ${issuer} was not registered.`);
    }

    kExtensionIssuers.delete(issuer);

    for (const [key, [registeredIssuer]] of kExtensionHostnames) {
      if (registeredIssuer == issuer) {
        kExtensionHostnames.delete(key);
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
