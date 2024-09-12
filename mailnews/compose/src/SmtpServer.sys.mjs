/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SmtpClient: "resource:///modules/SmtpClient.sys.mjs",
});

/**
 * This class represents a single SMTP server.
 *
 * @implements {nsIMsgOutgoingServer}
 * @implements {nsISupportsWeakReference}
 * @implements {nsIObserver}
 */
export class SmtpServer {
  QueryInterface = ChromeUtils.generateQI([
    "nsIMsgOutgoingServer",
    "nsISmtpServer",
    "nsISupportsWeakReference",
    "nsIObserver",
  ]);

  constructor() {
    this._key = "";
    this._loadPrefs();
    this._uri = null;

    Services.obs.addObserver(this, "passwordmgr-storage-changed", true);
  }

  /**
   * Observe() receives notifications for all accounts, not just this SMTP
   * server's * account. So we ignore all notifications not intended for this
   * server. When the state of the password manager changes we need to clear
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
      } else if (subject instanceof Ci.nsIArray && subject.length > 0) {
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

  get type() {
    return "smtp";
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

    // Void out the cached URI so that the next access to `this.serverURI`
    // regenerates the nsIURI.
    this._uri = null;
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
    // Void out the cached URI so that the next access to `this.serverURI`
    // regenerates the nsIURI.
    this._uri = null;
  }

  get clientid() {
    return this._getCharPrefWithDefault("clientid");
  }

  set clientid(value) {
    if (this.clientidEnabled) {
      this._setCharPref("clientid", value);
    }
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
    return this._getIntPrefWithDefault(
      "authMethod",
      Ci.nsMsgAuthMethod.passwordCleartext
    );
  }

  set authMethod(value) {
    this._prefs.setIntPref("authMethod", value);
  }

  get socketType() {
    return this._getIntPrefWithDefault("try_ssl", Ci.nsMsgSocketType.plain);
  }

  set socketType(value) {
    this._prefs.setIntPref("try_ssl", value);
  }

  /**
   * May contain an alternative argument to EHLO or HELO to provide to the
   * server. Reflects the value of the mail.smtpserver.*.hello_argument pref.
   * This is mainly useful where ISPs don't bother providing PTR records for
   * their servers and therefore users get an error on sending. See bug 244030
   * for more discussion.
   *
   * We currently only set this property in tests, in order to ensure the
   * predictability of the EHLO message.
   */
  get helloArgument() {
    return this._getCharPrefWithDefault("hello_argument");
  }

  get serverURI() {
    // We cache the URI because sendMailMessage uses it to store error
    // information from the SMTP client (which MessageSend then uses to
    // propagate to the console and user). This would not work if we were
    // recreating the nsIURI on each access.
    if (!this._uri) {
      const spec = this._getServerURISpec(true, true);
      this._uri = Services.io.newURI(spec);
    }

    return this._uri;
  }

  /**
   * Obtain the user configured number of simultaneous SMTP connections per
   * server that will be allowed. If pref set to 0 or less, allow 1 connection.
   *
   * Note: Currently the pref setting is ignored and the number of connections
   * per server is set to 1 here. The code to allow multiple connections
   * remains in place if needed in the future.
   */
  get maximumConnectionsNumber() {
    const maxConnections = this._getIntPrefWithDefault(
      "max_cached_connections",
      1
    );
    // return maxConnections < 1 ? 1 : maxConnections;
    return maxConnections ? 1 : 1;
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
    // This prompt has a checkbox for saving password.
    const authPrompt = Cc["@mozilla.org/messenger/msgAuthPrompt;1"].getService(
      Ci.nsIAuthPrompt
    );
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
        this._getServerURISpec(true, false),
        Ci.nsIAuthPrompt.SAVE_PASSWORD_PERMANENTLY,
        outPassword
      );
    } else {
      ok = authPrompt.promptUsernameAndPassword(
        promptTitle,
        promptMessage,
        this._getServerURISpec(true, false),
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
    const serverURI = this._getServerURISpec();
    const logins = Services.logins.findLogins(serverURI, "", serverURI);
    for (const login of logins) {
      if (login.username == this.username) {
        Services.logins.removeLogin(login);
      }
    }
    this.password = "";
  }

  verifyLogon(urlListener) {
    const client = new lazy.SmtpClient(this);
    client.connect();
    client.onerror = (nsError, errorMessage, secInfo) => {
      this.serverURI.QueryInterface(Ci.nsIMsgMailNewsUrl);
      if (secInfo) {
        this.serverURI.failedSecInfo = secInfo;
      }
      this.serverURI.errorMessage = errorMessage;
      urlListener.OnStopRunningUrl(this.serverURI, nsError);
    };
    client.onready = () => {
      urlListener.OnStopRunningUrl(this.serverURI, 0);
      client.close();
    };
    return this.serverURI;
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
    const serverURI = this._getServerURISpec();
    const logins = Services.logins.findLogins(serverURI, "", serverURI);
    for (const login of logins) {
      if (login.username == this.username) {
        return login.password;
      }
    }
    return null;
  }

  /**
   * Get server URI in the form of smtp://[user@]hostname:port.
   *
   * @param {boolean} includeUsername - Whether to include the username.
   * @param {boolean} includePort - Whether to include the port, if non-default.
   * @returns {string}
   */
  _getServerURISpec(includeUsername, includePort) {
    // When constructing nsIURI, need to wrap IPv6 address in [].
    const hostname = this.hostname.includes(":")
      ? `[${this.hostname}]`
      : this.hostname;
    return (
      "smtp://" +
      (includeUsername && this.username
        ? `${encodeURIComponent(this.username)}@`
        : "") +
      hostname +
      (this.port && includePort ? `:${this.port}` : "")
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
   * @see nsIMsgOutgoingServer
   */
  async sendMailMessage(
    messageFile,
    recipients,
    bccRecipients,
    userIdentity,
    sender,
    password,
    statusListener,
    requestDSN,
    messageId,
    requestObserver
  ) {
    // Flag that a send is progress. Precludes sending QUIT during the transfer.
    this.sendIsActive = true;
    const client = await this._getNextClient();
    client.onFree = () => {
      this._busyConnections = this._busyConnections.filter(c => c != client);
      // Check if the connection should be terminated by doing smtp QUIT
      if (!client.reuseConnection) {
        client.quit();
      } else {
        // Keep using this connection
        this._freeConnections.push(client);
        // Resolve the first waiting in queue.
        this._connectionWaitingQueue.shift()?.();
      }
    };

    if (password) {
      this.password = password;
    }

    const request = {
      cancel() {
        client.close(true);
      },
    };

    requestObserver?.onStartRequest(request);
    let fresh = true;
    client.onidle = () => {
      // onidle can occur multiple times, but we should only init sending
      // when sending a new message (fresh is true) or when a new connection
      // replaces the original connection due to error 4xx response
      // (client.isRetry is true).
      if (!fresh && !client.isRetry) {
        return;
      }
      // Init when fresh==true OR re-init sending when client.isRetry==true.
      fresh = false;
      let from = sender;
      const to = recipients.concat(bccRecipients).map(rec => rec.email);

      if (
        !Services.prefs.getBoolPref("mail.smtp.useSenderForSmtpMailFrom", false)
      ) {
        from = userIdentity.email;
      }
      client.useEnvelope({
        from: MailServices.headerParser.parseEncodedHeaderW(from)[0].email,
        to,
        size: messageFile.fileSize,
        requestDSN,
        messageId,
      });
    };
    let socketOnDrain;
    client.onready = async () => {
      const fstream = Cc[
        "@mozilla.org/network/file-input-stream;1"
      ].createInstance(Ci.nsIFileInputStream);
      // PR_RDONLY
      fstream.init(messageFile, 0x01, 0, 0);

      const sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      sstream.init(fstream);

      let sentSize = 0;
      const totalSize = messageFile.fileSize;
      const progressListener = statusListener?.QueryInterface(
        Ci.nsIWebProgressListener
      );

      while (sstream.available()) {
        const chunk = sstream.read(65536);
        const canSendMore = client.send(chunk);
        if (!canSendMore) {
          // Socket buffer is full, wait for the ondrain event.
          await new Promise(resolve => (socketOnDrain = resolve));
        }
        // In practice, chunks are buffered by TCPSocket, progress reaches 100%
        // almost immediately unless message is larger than chunk size.
        sentSize += chunk.length;
        progressListener?.onProgressChange(
          null,
          null,
          sentSize,
          totalSize,
          sentSize,
          totalSize
        );
      }
      sstream.close();
      fstream.close();
      client.end();

      // Set progress to indeterminate.
      progressListener?.onProgressChange(null, null, 0, -1, 0, -1);
    };
    client.ondrain = () => {
      // Socket buffer is empty, safe to continue sending.
      socketOnDrain();
    };
    client.ondone = () => {
      if (!AppConstants.MOZ_SUITE) {
        Glean.compose.mailsSent.add(1);
      }

      requestObserver?.onStopRequest(request, Cr.NS_OK);
    };
    client.onerror = (nsError, errorMessage, secInfo) => {
      this.serverURI.QueryInterface(Ci.nsIMsgMailNewsUrl);
      if (secInfo) {
        // TODO(emilio): Passing the failed security info as part of the URI is
        // quite a smell, but monkey see monkey do...
        this.serverURI.failedSecInfo = secInfo;
      }
      this.serverURI.errorMessage = errorMessage;
      requestObserver?.onStopRequest(request, nsError);
    };

    client.connect();
  }
}
