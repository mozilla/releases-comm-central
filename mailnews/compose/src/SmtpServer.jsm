/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SmtpServer"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  SmtpClient: "resource:///modules/SmtpClient.jsm",
});

/**
 * This class represents a single SMTP server.
 *
 * @implements {nsISmtpServer}
 * @implements {nsIObserver}
 */

class SmtpServer {
  QueryInterface = ChromeUtils.generateQI(["nsISmtpServer", "nsIObserver"]);

  constructor() {
    this._key = "";
    this._loadPrefs();

    Services.obs.addObserver(this, "passwordmgr-storage-changed");
  }

  /**
   * Observe() receives notifications for all accounts, not just this SMTP
   * server's * account. So we ignore all notifications not intended for this
   * server. When the state of the password manager changes we need to clear the
   * this server's password from the cache in case the user just changed or
   * removed the password or username.
   * OAuth2 servers often automatically change the password manager's stored
   * password (the token).
   */
  observe(subject, topic, data) {
    if (topic == "passwordmgr-storage-changed") {
      // Check that the notification is for this server and user.
      let otherFullName = "";
      let otherUsername = "";
      if (subject instanceof Ci.nsILoginInfo) {
        // The login info for a server has been removed with aData being
        // "removeLogin" or "removeAllLogins".
        otherFullName = subject.origin;
        otherUsername = subject.username;
      } else if (subject instanceof Ci.nsIArray) {
        // Probably a 2 element array containing old and new login info due to
        // aData being "modifyLogin". E.g., a user has modified the password or
        // username in the password manager or an OAuth2 token string has
        // automatically changed. Only need to look at names in first array
        // element (login info before any modification) since the user might
        // have changed the username as found in the 2nd elements. (The
        // hostname can't be modified in the password manager.
        otherFullName = subject.queryElementAt(0, Ci.nsISupports).origin;
        otherUsername = subject.queryElementAt(0, Ci.nsISupports).username;
      }
      if (otherFullName) {
        if (
          otherFullName != "smtp://" + this.hostname ||
          otherUsername != this.username
        ) {
          // Not for this account; keep this account's password.
          return;
        }
      } else if (data != "hostSavingDisabled") {
        // "hostSavingDisabled" only occurs during test_smtpServer.js and
        // expects the password to be removed from memory cache. Otherwise, we
        // don't have enough information to decide to remove the cached
        // password, so keep it.
        return;
      }
      // Remove the password for this server cached in memory.
      this.password = "";
    }
  }

  get key() {
    return this._key;
  }

  set key(key) {
    this._key = key;
    this._loadPrefs();
  }

  get UID() {
    const uid = this._prefs.getStringPref("uid", "");
    if (uid) {
      return uid;
    }
    return (this.UID = Services.uuid
      .generateUUID()
      .toString()
      .substring(1, 37));
  }

  set UID(uid) {
    if (this._prefs.prefHasUserValue("uid")) {
      throw new Components.Exception("uid is already set", Cr.NS_ERROR_ABORT);
    }
    this._prefs.setStringPref("uid", uid);
  }

  get description() {
    return this._prefs.getStringPref("description", "");
  }

  set description(value) {
    this._prefs.setStringPref("description", value);
  }

  get hostname() {
    return this._prefs.getStringPref("hostname", "");
  }

  set hostname(value) {
    if (value.toLowerCase() != this.hostname.toLowerCase()) {
      // Reset password so that users are prompted for new password for the new
      // host.
      this.forgetPassword();
    }
    this._prefs.setStringPref("hostname", value);
  }

  get port() {
    return this._prefs.getIntPref("port", 0);
  }

  set port(value) {
    if (value) {
      this._prefs.setIntPref("port", value);
    } else {
      this._prefs.clearUserPref("port");
    }
  }

  get displayname() {
    return `${this.hostname}` + (this.port ? `:${this.port}` : "");
  }

  get username() {
    return this._prefs.getCharPref("username", "");
  }

  set username(value) {
    if (value != this.username) {
      // Reset password so that users are prompted for new password for the new
      // username.
      this.forgetPassword();
    }
    this._setCharPref("username", value);
  }

  get clientid() {
    return this._getCharPrefWithDefault("clientid");
  }

  set clientid(value) {
    this._setCharPref("clientid", value);
  }

  get clientidEnabled() {
    try {
      return this._prefs.getBoolPref("clientidEnabled");
    } catch (e) {
      return this._defaultPrefs.getBoolPref("clientidEnabled", false);
    }
  }

  set clientidEnabled(value) {
    this._prefs.setBoolPref("clientidEnabled", value);
  }

  get authMethod() {
    return this._getIntPrefWithDefault("authMethod", 3);
  }

  set authMethod(value) {
    this._prefs.setIntPref("authMethod", value);
  }

  get socketType() {
    return this._getIntPrefWithDefault("try_ssl", 0);
  }

  set socketType(value) {
    this._prefs.setIntPref("try_ssl", value);
  }

  get helloArgument() {
    return this._getCharPrefWithDefault("hello_argument");
  }

  get serverURI() {
    return this._getServerURI(true);
  }

  /**
   * If pref max_cached_connection is set to less than 1, allow only one
   * connection and one message to be sent on that connection. Otherwise, allow
   * up to max_cached_connection (default to 3) with each connection allowed to
   * send multiple messages.
   */
  get maximumConnectionsNumber() {
    const maxConnections = this._getIntPrefWithDefault(
      "max_cached_connections",
      3
    );
    // Always return a value >= 0.
    return maxConnections > 0 ? maxConnections : 0;
  }

  set maximumConnectionsNumber(value) {
    this._prefs.setIntPref("max_cached_connections", value);
  }

  get password() {
    if (this._password) {
      return this._password;
    }
    const incomingAccountKey = this._prefs.getCharPref("incomingAccount", "");
    let incomingServer;
    if (incomingAccountKey) {
      incomingServer =
        MailServices.accounts.getIncomingServer(incomingAccountKey);
    } else {
      const useMatchingHostNameServer = Services.prefs.getBoolPref(
        "mail.smtp.useMatchingHostNameServer"
      );
      const useMatchingDomainServer = Services.prefs.getBoolPref(
        "mail.smtp.useMatchingDomainServer"
      );
      if (useMatchingHostNameServer || useMatchingDomainServer) {
        if (useMatchingHostNameServer) {
          // Pass in empty type and port=0, to match imap and pop3.
          incomingServer = MailServices.accounts.findServer(
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
          const newHostname = this.hostname.slice(
            0,
            this.hostname.indexOf(".")
          );
          for (const server of MailServices.accounts.allServers) {
            if (server.username == this.username) {
              const serverHostName = server.hostName;
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
  }

  set password(password) {
    this._password = password;
  }

  getPasswordWithUI(promptMessage, promptTitle) {
    let authPrompt;
    try {
      // This prompt has a checkbox for saving password.
      authPrompt = Cc["@mozilla.org/messenger/msgAuthPrompt;1"].getService(
        Ci.nsIAuthPrompt
      );
    } catch (e) {
      // Often happens in tests. This prompt has no checkbox for saving password.
      authPrompt = Services.ww.getNewAuthPrompter(null);
    }
    const password = this._getPasswordWithoutUI();
    if (password) {
      this.password = password;
      return this.password;
    }
    const outUsername = {};
    const outPassword = {};
    let ok;
    if (this.username) {
      ok = authPrompt.promptPassword(
        promptTitle,
        promptMessage,
        this.serverURI,
        Ci.nsIAuthPrompt.SAVE_PASSWORD_PERMANENTLY,
        outPassword
      );
    } else {
      ok = authPrompt.promptUsernameAndPassword(
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
    } else {
      throw Components.Exception("Password dialog canceled", Cr.NS_ERROR_ABORT);
    }
    return this.password;
  }

  forgetPassword() {
    const serverURI = this._getServerURI();
    const logins = Services.logins.findLogins(serverURI, "", serverURI);
    for (const login of logins) {
      if (login.username == this.username) {
        Services.logins.removeLogin(login);
      }
    }
    this.password = "";
  }

  verifyLogon(urlListener, msgWindow) {
    return MailServices.smtp.verifyLogon(this, urlListener, msgWindow);
  }

  clearAllValues() {
    for (const prefName of this._prefs.getChildList("")) {
      this._prefs.clearUserPref(prefName);
    }
  }

  /**
   * @returns {string}
   */
  _getPasswordWithoutUI() {
    const serverURI = this._getServerURI();
    const logins = Services.logins.findLogins(serverURI, "", serverURI);
    for (const login of logins) {
      if (login.username == this.username) {
        return login.password;
      }
    }
    return null;
  }

  /**
   * Get server URI in the form of smtp://[user@]hostname.
   *
   * @param {boolean} includeUsername - Whether to include the username.
   * @returns {string}
   */
  _getServerURI(includeUsername) {
    // When constructing nsIURI, need to wrap IPv6 address in [].
    const hostname = this.hostname.includes(":")
      ? `[${this.hostname}]`
      : this.hostname;
    return (
      "smtp://" +
      (includeUsername && this.username
        ? `${encodeURIComponent(this.username)}@`
        : "") +
      hostname
    );
  }

  /**
   * Get the associated pref branch and the default SMTP server branch.
   */
  _loadPrefs() {
    this._prefs = Services.prefs.getBranch(`mail.smtpserver.${this._key}.`);
    this._defaultPrefs = Services.prefs.getBranch("mail.smtpserver.default.");
  }

  /**
   * Set or clear a string preference.
   *
   * @param {string} name - The preference name.
   * @param {string} value - The preference value.
   */
  _setCharPref(name, value) {
    if (value) {
      this._prefs.setCharPref(name, value);
    } else {
      this._prefs.clearUserPref(name);
    }
  }

  /**
   * Get the value of a char preference from this or default SMTP server.
   *
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
  }

  /**
   * Get the value of an integer preference from this or default SMTP server.
   *
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
  }

  get wrappedJSObject() {
    return this;
  }

  // @type {SmtpClient[]} - An array of connections can be used.
  _freeConnections = [];
  // @type {SmtpClient[]} - An array of connections in use.
  _busyConnections = [];
  // @type {Function[]} - An array of Promise.resolve functions.
  _connectionWaitingQueue = [];

  closeCachedConnections() {
    // Close all connections.
    for (const client of [...this._freeConnections, ...this._busyConnections]) {
      client.quit();
    }
    // Cancel all waitings in queue.
    for (const resolve of this._connectionWaitingQueue) {
      resolve(false);
    }
    this._freeConnections = [];
    this._busyConnections = [];
  }

  /**
   * Get an idle connection that can be used.
   *
   * @returns {SmtpClient}
   */
  async _getNextClient() {
    // The newest connection is the least likely to have timed out.
    let client = this._freeConnections.pop();
    if (client) {
      this._busyConnections.push(client);
      return client;
    }
    const maxConns = this.maximumConnectionsNumber
      ? this.maximumConnectionsNumber
      : 1;
    if (
      this._freeConnections.length + this._busyConnections.length <
      maxConns
    ) {
      // Create a new client if the pool is not full.
      client = new lazy.SmtpClient(this);
      this._busyConnections.push(client);
      return client;
    }
    // Wait until a connection is available.
    await new Promise(resolve => this._connectionWaitingQueue.push(resolve));
    return this._getNextClient();
  }
  /**
   * Do some actions with a connection.
   *
   * @param {Function} handler - A callback function to take a SmtpClient
   *   instance, and do some actions.
   */
  async withClient(handler) {
    const client = await this._getNextClient();
    client.onFree = () => {
      this._busyConnections = this._busyConnections.filter(c => c != client);
      // Per RFC, the minimum total number of recipients that MUST be buffered
      // is 100 recipients.
      // @see https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.1.8
      // So use a new connection for the next message to avoid running into
      // recipient limits.
      // If user has set SMTP pref max_cached_connection to less than 1,
      // use a new connection for each message.
      if (this.maximumConnectionsNumber == 0 || client.rcptCount > 99) {
        // Send QUIT, server will then terminate the connection
        client.quit();
      } else {
        // Keep using this connection
        this._freeConnections.push(client);
        // Resolve the first waiting in queue.
        this._connectionWaitingQueue.shift()?.();
      }
    };
    handler(client);
    client.connect();
  }
}
