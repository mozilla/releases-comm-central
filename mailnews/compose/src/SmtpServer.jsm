/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SmtpServer"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * This class represents a single SMTP server.
 *
 * @implements {nsISmtpServer}
 */
function SmtpServer() {
  this._key = "";
  this._loadPrefs();

  Services.obs.addObserver(this, "passwordmgr-storage-changed");
}

SmtpServer.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsISmtpServer"]),
  classID: Components.ID("{3a75f5ea-651e-4696-9813-848c03da8bbd}"),

  observe(subject, topic, data) {
    if (topic == "passwordmgr-storage-changed") {
      // Check that the notification is for this server.
      if (
        subject instanceof Ci.nsILoginInfo &&
        subject.hostname != "smtp://" + this.hostname
      ) {
        return;
      }
      // When the state of the password manager changes we need to clear the
      // password from the cache in case the user just removed it.
      this.password = "";
    }
  },

  get key() {
    return this._key;
  },

  set key(key) {
    this._key = key;
    this._loadPrefs();
  },

  get description() {
    return this._prefs.getStringPref("description", "");
  },

  set description(value) {
    this._prefs.setStringPref("description", value);
  },

  get hostname() {
    return this._prefs.getStringPref("hostname", "");
  },

  set hostname(value) {
    if (value.toLowerCase() != this.hostname.toLowerCase()) {
      // Reset password so that users are prompted for new password for the new
      // host.
      this.forgetPassword();
    }
    this._prefs.setStringPref("hostname", value);
  },

  get port() {
    return this._prefs.getIntPref("port", 0);
  },

  set port(value) {
    if (value) {
      this._prefs.setIntPref("port", value);
    } else {
      this._prefs.clearUserPref("port");
    }
  },

  get displayname() {
    return `${this.hostname}` + (this.port ? `:${this.port}` : "");
  },

  get username() {
    return this._prefs.getCharPref("username", "");
  },

  set username(value) {
    if (value != this.username) {
      // Reset password so that users are prompted for new password for the new
      // username.
      this.forgetPassword();
    }
    this._setCharPref("username", value);
  },

  get clientid() {
    return this._getCharPrefWithDefault("clientid");
  },

  set clientid(value) {
    this._setCharPref("clientid", value);
  },

  get clientidEnabled() {
    try {
      return this._prefs.getBoolPref("clientidEnabled");
    } catch (e) {
      return this._defaultPrefs.getBoolPref("clientidEnabled", false);
    }
  },

  set clientidEnabled(value) {
    this._prefs.setBoolPref("clientidEnabled", value);
  },

  get authMethod() {
    return this._getIntPrefWithDefault("authMethod", 3);
  },

  set authMethod(value) {
    this._prefs.setIntPref("authMethod", value);
  },

  get socketType() {
    return this._getIntPrefWithDefault("try_ssl", 0);
  },

  set socketType(value) {
    this._prefs.setIntPref("try_ssl", value);
  },

  get helloArgument() {
    return this._getCharPrefWithDefault("hello_argument");
  },

  get serverURI() {
    return this._getServerURI(true);
  },

  get password() {
    if (this._password) {
      return this._password;
    }
    let incomingAccountKey = this._prefs.getCharPref("incomingAccount", "");
    let incomingServer;
    if (incomingAccountKey) {
      incomingServer = MailServices.accounts.getIncomingServer(
        incomingAccountKey
      );
    } else {
      let useMatchingHostNameServer = Services.prefs.getBoolPref(
        "mail.smtp.useMatchingHostNameServer"
      );
      let useMatchingDomainServer = Services.prefs.getBoolPref(
        "mail.smtp.useMatchingDomainServer"
      );
      if (useMatchingHostNameServer || useMatchingDomainServer) {
        if (useMatchingHostNameServer) {
          // Pass in empty type and port=0, to match imap and pop3.
          incomingServer = MailServices.accounts.findRealServer(
            this.username,
            this.hostname,
            "",
            0
          );
        }
        if (
          !incomingServer &&
          useMatchingDomainServer &&
          this.hostname.includes(".")
        ) {
          let newHostname = this.hostname.slice(0, this.hostname.indexOf("."));
          for (let server of MailServices.accounts.allServers) {
            if (server.realUsername == this.username) {
              let serverHostName = server.realHostName;
              if (
                serverHostName.includes(".") &&
                serverHostName.slice(0, serverHostName.indexOf(".")) ==
                  newHostname
              ) {
                incomingServer = server;
                break;
              }
            }
          }
        }
      }
    }
    return incomingServer?.password || "";
  },

  set password(password) {
    this._password = password;
  },

  getPasswordWithUI(promptMessage, promptTitle, prompt) {
    let password = this._getPasswordWithoutUI();
    if (password) {
      this.password = password;
      return this.password;
    }
    let outUsername = {};
    let outPassword = {};
    let ok;
    if (this.username) {
      ok = prompt.promptPassword(
        promptTitle,
        promptMessage,
        this.serverURI,
        Ci.nsIAuthPrompt.SAVE_PASSWORD_PERMANENTLY,
        outPassword
      );
    } else {
      ok = prompt.promptUsernameAndPassword(
        promptTitle,
        promptMessage,
        this.serverURI,
        Ci.nsIAuthPrompt.SAVE_PASSWORD_PERMANENTLY,
        outUsername,
        outPassword
      );
    }
    if (ok) {
      if (outUsername.value) {
        this.username = outUsername.value;
      }
      this.password = outPassword.value;
    }
    return this.password;
  },

  forgetPassword() {
    let serverURI = this._getServerURI();
    let logins = Services.logins.findLogins(serverURI, "", serverURI);
    for (let login of logins) {
      if (login.username == this.username) {
        Services.logins.removeLogin(login);
      }
    }
    this.password = "";
  },

  verifyLogon(urlListner, msgWindow) {
    return MailServices.smtp.verifyLogon(this, urlListner, msgWindow);
  },

  clearAllValues() {
    for (let prefName of this._prefs.getChildList("")) {
      this._prefs.clearUserPref(prefName);
    }
  },

  /**
   * @returns {string}
   */
  _getPasswordWithoutUI() {
    let serverURI = this._getServerURI();
    let logins = Services.logins.findLogins(serverURI, "", serverURI);
    for (let login of logins) {
      if (login.username == this.username) {
        return login.password;
      }
    }
    return null;
  },

  /**
   * Get server URI in the form of smtp://[user@]hostname.
   * @param {boolean} includeUsername - Whether to include the username.
   * @returns {string}
   */
  _getServerURI(includeUsername) {
    return (
      "smtp://" +
      (includeUsername && this.username
        ? `${encodeURIComponent(this.username)}@`
        : "") +
      this.hostname
    );
  },

  /**
   * Get the associated pref branch and the default SMTP server branch.
   */
  _loadPrefs() {
    this._prefs = Services.prefs.getBranch(`mail.smtpserver.${this._key}.`);
    this._defaultPrefs = Services.prefs.getBranch("mail.smtpserver.default.");
  },

  /**
   * Set or clear a string preference.
   * @param {string} name - The preference name.
   * @param {string} value - The preference value.
   */
  _setCharPref(name, value) {
    if (value) {
      this._prefs.setCharPref(name, value);
    } else {
      this._prefs.clearUserPref(name);
    }
  },

  /**
   * Get the value of a string preference from this or default SMTP server.
   * @param {string} name - The preference name.
   * @param {number} [defaultValue=""] - The default value to return.
   * @returns {string}
   */
  _getCharPrefWithDefault(name, defaultValue = "") {
    try {
      return this._prefs.getCharPref(name);
    } catch (e) {
      return this._defaultPrefs.getCharPref(name, defaultValue);
    }
  },

  /**
   * Get the value of an integer preference from this or default SMTP server.
   * @param {string} name - The preference name.
   * @param {number} defaultValue - The default value to return.
   * @returns {number}
   */
  _getIntPrefWithDefault(name, defaultValue) {
    try {
      return this._prefs.getIntPref(name);
    } catch (e) {
      return this._defaultPrefs.getIntPref(name, defaultValue);
    }
  },
};
