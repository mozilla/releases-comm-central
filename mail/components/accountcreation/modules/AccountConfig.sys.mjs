/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file creates the class AccountConfig, which is a JS object that holds
 * a configuration for a certain account. It is *not* created in the backend
 * yet (use aw-createAccount.js for that), and it may be incomplete.
 *
 * Several AccountConfig objects may co-exist, e.g. for autoconfig.
 * One AccountConfig object is used to prefill and read the widgets
 * in the Wizard UI.
 * When we autoconfigure, we autoconfig writes the values into a
 * new object and returns that, and the caller can copy these
 * values into the object used by the UI.
 *
 * See also
 * <https://wiki.mozilla.org/Thunderbird:Autoconfiguration:ConfigFileFormat>
 * for values stored.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AccountCreationUtils:
    "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
});

export function AccountConfig() {
  this.incoming = this.createNewIncoming();
  this.incomingAlternatives = [];
  this.outgoing = this.createNewOutgoing();
  this.outgoingAlternatives = [];
  this.identity = {
    // displayed real name of user
    realname: "%REALNAME%",
    // email address of user, as shown in From of outgoing mails
    emailAddress: "%EMAILADDRESS%",
  };
  this.inputFields = [];
  this.domains = [];
}

AccountConfig.prototype = {
  // @see createNewIncoming()
  incoming: null,
  // @see createNewOutgoing()
  outgoing: null,
  /**
   * Other servers which can be used instead of |incoming|,
   * in order of decreasing preference.
   * (|incoming| itself should not be included here.)
   * { Array of incoming/createNewIncoming() }
   */
  incomingAlternatives: null,
  outgoingAlternatives: null,
  // just an internal string to refer to this. Do not show to user.
  id: null,
  // who created the config.
  // { one of kSource* }
  source: null,
  /**
   * Used for displaying a success message to the user and telemetry purposes.
   * - for kSourceXML, subSource is one of xml-from-{disk, db, isp-https, isp-http}.
   * - for kSourceExchange, subSource is one of exchange-from-urlN[-guess].
   */
  subSource: null,
  displayName: null,
  // { Array of { varname (value without %), displayName, exampleValue } }
  inputFields: null,
  // email address domains for which this config is applicable
  // { Array of Strings }
  domains: null,

  /**
   * Factory function for incoming and incomingAlternatives
   */
  createNewIncoming() {
    return {
      // { String-enum: "pop3", "imap", "nntp", "exchange", "ews" }
      type: null,
      hostname: null,
      // { Integer }
      port: null,
      // May be a placeholder (starts and ends with %). { String }
      username: null,
      password: null,
      // {nsMsgSocketType} @see MailNewsTypes2.idl. -1 means not inited
      socketType: -1,
      /**
       * true when the cert is invalid (and thus SSL useless), because it's
       * 1) not from an accepted CA (including self-signed certs)
       * 2) for a different hostname or
       * 3) expired.
       * May go back to false when user explicitly accepted the cert.
       */
      badCert: false,
      /**
       * How to log in to the server: plaintext or encrypted pw, GSSAPI etc.
       * Defined by Ci.nsMsgAuthMethod
       * Same as server pref "authMethod".
       */
      auth: 0,
      /**
       * Other auth methods that we think the server supports.
       * They are ordered by descreasing preference.
       * (|auth| itself is not included in |authAlternatives|)
       * {Array of Ci.nsMsgAuthMethod} (same as .auth)
       */
      authAlternatives: null,
      // in minutes { Integer }
      checkInterval: 10,
      loginAtStartup: true,
      // POP3 only:
      // Not yet implemented. { Boolean }
      useGlobalInbox: false,
      leaveMessagesOnServer: true,
      daysToLeaveMessagesOnServer: 14,
      deleteByAgeFromServer: true,
      // When user hits delete, delete from local store and from server
      deleteOnServerWhenLocalDelete: true,
      downloadOnBiff: true,
      // Override `addThisServer` for a specific incoming server
      useGlobalPreferredServer: false,

      // OAuth2 configuration, if needed.
      oauthSettings: null,

      // for Microsoft Exchange servers. Optional.
      owaURL: null,
      ewsURL: null,
      easURL: null,
      // for when an addon overrides the account type. Optional.
      addonAccountType: null,
    };
  },
  /**
   * Factory function for outgoing and outgoingAlternatives
   */
  createNewOutgoing() {
    return {
      // { String-enum: "smtp" }
      type: null,
      hostname: null,
      port: null, // see incoming
      username: null, // see incoming. may be null, if auth is 0.
      password: null, // see incoming. may be null, if auth is 0.
      socketType: -1, // see incoming
      badCert: false, // see incoming
      auth: 0, // see incoming
      authAlternatives: null, // see incoming
      addThisServer: true, // if we already have a server, add this
      // if we already have a server, use it.
      useGlobalPreferredServer: false,
      // we should reuse an already configured server.
      // nsIMsgOutgoingServer.key
      existingServerKey: null,
      // user display value for existingServerKey
      existingServerLabel: null,

      // OAuth2 configuration, if needed.
      oauthSettings: null,
    };
  },

  /**
   * The configuration needs an addon to handle the account type.
   * The addon needs to be installed before the account can be created
   * in the backend.
   * You can choose one, if there are several addons in the list.
   * (Optional)
   *
   * Array of:
   * {
   *   id: "owl@example.com" {string},
   *
   *   // already localized string
   *   name: "Owl" {string},
   *
   *   // already localized string
   *   description: "A third party addon that allows you to connect to Exchange servers" {string}
   *
   *   // Minimal version of the addon. Needed in case the addon is already installed,
   *   // to verify that the installed version is sufficient.
   *   // The XPI URL below must satisfy this.
   *   // Must satisfy <https://developer.mozilla.org/en-US/docs/Mozilla/Toolkit_version_format>
   *   minVersion: "0.2" {string}
   *
   *   xpiURL: "https://live.thunderbird.net/autoconfig/owl.xpi" {URL},
   *   websiteURL: "https://www.beonex.com/owl/" {URL},
   *   icon32: "https://www.beonex.com/owl/owl-32x32.png" {URL},
   *
   *   useType : {
   *     // Type shown as radio button to user in the config result.
   *     // Users won't understand OWA vs. EWS vs. EAS etc., so this is an abstraction
   *     // from the end user perspective.
   *     generalType: "exchange" {string},
   *
   *     // Protocol
   *     // Independent of the addon
   *     protocolType: "owa" {string},
   *
   *     // Account type in the Thunderbird backend.
   *     // What nsIMsgAccount.type will be set to when creating the account.
   *     // This is specific to the addon.
   *     addonAccountType: "owl-owa" {string},
   *   }
   * }
   */
  addons: null,

  /**
   * Returns a deep copy of this object,
   * i.e. modifying the copy will not affect the original object.
   */
  copy() {
    // Workaround: deepCopy() fails to preserve base obj (instanceof)
    const result = new AccountConfig();
    for (const prop in this) {
      result[prop] = lazy.AccountCreationUtils.deepCopy(this[prop]);
    }

    return result;
  },

  isComplete() {
    return (
      !!this.incoming.hostname &&
      !!this.incoming.port &&
      this.incoming.socketType != -1 &&
      !!this.incoming.auth &&
      !!this.incoming.username &&
      (!!this.outgoing.existingServerKey ||
        this.outgoing.useGlobalPreferredServer ||
        (!!this.outgoing.hostname &&
          !!this.outgoing.port &&
          this.outgoing.socketType != -1 &&
          !!this.outgoing.auth &&
          !!this.outgoing.username))
    );
  },

  toString() {
    function sslToString(socketType) {
      switch (socketType) {
        case 0:
          return "plain";
        case 2:
          return "STARTTLS";
        case 3:
          return "SSL";
        default:
          return "invalid";
      }
    }

    function authToString(authMethod) {
      switch (authMethod) {
        case 0:
          return "undefined";
        case 1:
          return "none";
        case 2:
          return "old plain";
        case 3:
          return "plain";
        case 4:
          return "encrypted";
        case 5:
          return "Kerberos";
        case 6:
          return "NTLM";
        case 7:
          return "external/SSL";
        case 8:
          return "any secure";
        case 10:
          return "OAuth2";
        default:
          return "invalid";
      }
    }

    function passwordToString(password) {
      return password ? "set" : "not set";
    }

    function configToString(config) {
      return (
        config.type +
        ", " +
        config.hostname +
        ":" +
        config.port +
        ", " +
        sslToString(config.socketType) +
        ", auth: " +
        authToString(config.auth) +
        ", username: " +
        (config.username || "(undefined)") +
        ", password: " +
        passwordToString(config.password)
      );
    }

    let result = "Incoming: " + configToString(this.incoming) + "\nOutgoing: ";
    if (
      this.outgoing.useGlobalPreferredServer ||
      this.incoming.useGlobalPreferredServer
    ) {
      result += "Use global server";
    } else if (this.outgoing.existingServerKey) {
      result += "Use existing server " + this.outgoing.existingServerKey;
    } else {
      result += configToString(this.outgoing);
    }
    for (const config of this.incomingAlternatives) {
      result += "\nIncoming alt: " + configToString(config);
    }
    for (const config of this.outgoingAlternatives) {
      result += "\nOutgoing alt: " + configToString(config);
    }
    return result;
  },

  /**
   * Sort the config alternatives such that exchange is the last of the
   * alternatives.
   *
   * Note this method is expected to be called in the final stages of the
   * Exchange Autodiscover process, before we set a specific server type if we
   * natively support the specific flavour of Exchange, so filtering on
   * "exchange" should work regardless of whether we support the server natively
   * or through an addon.
   */
  preferStandardProtocols() {
    const alternatives = this.incomingAlternatives;
    // Add default incoming as one alternative.
    alternatives.unshift(this.incoming);
    alternatives.sort((a, b) => {
      if (a.type == "exchange") {
        return 1;
      }
      if (b.type == "exchange") {
        return -1;
      }
      return 0;
    });
    this.incomingAlternatives = alternatives;
    this.incoming = alternatives.shift();
  },
};

// enum consts

// .source
AccountConfig.kSourceUser = "user"; // user manually entered the config
AccountConfig.kSourceXML = "xml"; // config from XML from ISP or Mozilla DB
AccountConfig.kSourceGuess = "guess"; // guessConfig()
AccountConfig.kSourceExchange = "exchange"; // from Microsoft Exchange AutoDiscover

/**
 * Some fields on the account config accept placeholders (when coming from XML).
 *
 * These are the predefined ones
 * %EMAILADDRESS% (full email address of the user, usually entered by user)
 * %EMAILLOCALPART% (email address, part before @)
 * %EMAILDOMAIN% (email address, part after @)
 * %REALNAME%
 * as well as those defined in account.inputFields.*.varname, with % added
 * before and after.
 *
 * These must replaced with real values, supplied by the user or app,
 * before the account is created. This is done here. You call this function once
 * you have all the data - gathered the standard vars mentioned above as well as
 * all listed in account.inputFields, and pass them in here. This function will
 * insert them in the fields, returning a fully filled-out account ready to be
 * created.
 *
 * @param account {AccountConfig}
 * The account data to be modified. It may or may not contain placeholders.
 * After this function, it should not contain placeholders anymore.
 * This object will be modified in-place.
 *
 * @param emailfull {String}
 * Full email address of this account, e.g. "joe@example.com".
 * Empty of incomplete email addresses will/may be rejected.
 *
 * @param realname {String}
 * Real name of user, as will appear in From of outgoing messages
 *
 * @param password {String}
 * The password for the incoming server and (if necessary) the outgoing server
 */
AccountConfig.replaceVariables = function (
  account,
  realname,
  emailfull,
  password
) {
  lazy.Sanitizer.nonemptystring(emailfull);
  const emailsplit = emailfull.split("@");
  lazy.AccountCreationUtils.assert(
    emailsplit.length == 2,
    "email address not in expected format: must contain exactly one @"
  );
  const emaillocal = lazy.Sanitizer.nonemptystring(emailsplit[0]);
  const emaildomain = lazy.Sanitizer.hostname(emailsplit[1]);
  lazy.Sanitizer.label(realname);
  lazy.Sanitizer.nonemptystring(realname);

  const otherVariables = {};
  otherVariables.EMAILADDRESS = emailfull;
  otherVariables.EMAILLOCALPART = emaillocal;
  otherVariables.EMAILDOMAIN = emaildomain;
  otherVariables.REALNAME = realname;

  if (password) {
    account.incoming.password = password;
    account.outgoing.password = password; // set member only if auth required?
  }
  account.incoming.username = _replaceVariable(
    account.incoming.username,
    otherVariables
  );
  account.outgoing.username = _replaceVariable(
    account.outgoing.username,
    otherVariables
  );
  account.incoming.hostname = _replaceVariable(
    account.incoming.hostname,
    otherVariables
  );
  if (account.outgoing.hostname) {
    // will be null if user picked existing server.
    account.outgoing.hostname = _replaceVariable(
      account.outgoing.hostname,
      otherVariables
    );
  }
  account.identity.realname = _replaceVariable(
    account.identity.realname,
    otherVariables
  );
  account.identity.emailAddress = _replaceVariable(
    account.identity.emailAddress,
    otherVariables
  );
  account.displayName = _replaceVariable(account.displayName, otherVariables);
};

function _replaceVariable(variable, values) {
  let str = variable;
  if (typeof str != "string") {
    return str;
  }

  for (const varname in values) {
    str = str.replace("%" + varname + "%", values[varname]);
  }

  return str;
}
