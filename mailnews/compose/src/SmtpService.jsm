/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SmtpService"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AppConstants: "resource://gre/modules/AppConstants.jsm",
  Services: "resource://gre/modules/Services.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  SmtpClient: "resource:///modules/SmtpClient.jsm",
  MsgUtils: "resource:///modules/MimeMessageUtils.jsm",
});

/**
 * Set `user_pref("mailnews.smtp.jsmodule", true);` to use this module.
 *
 * @implements {nsISmtpService}
 */
function SmtpService() {
  this._servers = [];
  this._logger = MsgUtils.smtpLogger;
}

SmtpService.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsISmtpService"]),
  classID: Components.ID("{acda6039-8b17-46c1-a8ed-ad50aa80f412}"),

  /**
   * @see nsISmtpService
   */
  get defaultServer() {
    this._loadSmtpServers();
    let defaultServerKey = Services.prefs.getCharPref(
      "mail.smtp.defaultserver",
      ""
    );
    if (defaultServerKey) {
      // Try to get it from the prefs.
      return this.getServerByKey(defaultServerKey);
    }

    // No pref set, so set the first one as default, and return it.
    if (this._servers.length > 0) {
      Services.prefs.setCharPref(
        "mail.smtp.defaultserver",
        this._servers[0].key
      );
      return this._servers[0];
    }
    return null;
  },

  set defaultServer(server) {
    Services.prefs.setCharPref("mail.smtp.defaultserver", server.key);
  },

  get servers() {
    this._loadSmtpServers();
    return this._servers;
  },

  /**
   * @see nsISmtpService
   */
  sendMailMessage(
    messageFile,
    recipients,
    userIdentity,
    sender,
    password,
    deliveryListener,
    statusListener,
    notificationCallbacks,
    requestDSN,
    messageId,
    outURI,
    outRequest
  ) {
    this._logger.debug(`Sending message ${messageId}`);
    let server = this.getServerByIdentity(userIdentity);
    if (password) {
      server.password = password;
    }
    let runningUrl = this._getRunningUri(server);
    let client = new SmtpClient(server);
    deliveryListener?.OnStartRunningUrl(runningUrl, 0);
    client.connect();
    let fresh = true;
    client.onidle = () => {
      // onidle can be emitted multiple times, but we should not init sending
      // process again.
      if (!fresh) {
        return;
      }
      fresh = false;
      let from = sender;
      let to = MailServices.headerParser
        .makeFromDisplayAddress(decodeURIComponent(recipients))
        .map(rec => rec.email);

      if (
        !Services.prefs.getBoolPref("mail.smtp.useSenderForSmtpMailFrom", false)
      ) {
        from = userIdentity.email;
      }
      if (!messageId) {
        messageId = Cc["@mozilla.org/messengercompose/computils;1"]
          .createInstance(Ci.nsIMsgCompUtils)
          .msgGenerateMessageId(userIdentity);
      }
      client.useEnvelope({
        from: MailServices.headerParser.makeFromDisplayAddress(
          decodeURIComponent(from)
        )[0].email,
        to,
        size: messageFile.fileSize,
        requestDSN,
        messageId,
      });
    };
    let socketOnDrain;
    client.onready = async () => {
      let fstream = Cc[
        "@mozilla.org/network/file-input-stream;1"
      ].createInstance(Ci.nsIFileInputStream);
      // PR_RDONLY
      fstream.init(messageFile, 0x01, 0, 0);

      let sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      sstream.init(fstream);

      let sentSize = 0;
      let totalSize = messageFile.fileSize;
      let progressListener = statusListener?.QueryInterface(
        Ci.nsIWebProgressListener
      );

      while (sstream.available()) {
        let chunk = sstream.read(65536);
        let canSendMore = client.send(chunk);
        if (!canSendMore) {
          // Socket buffer is full, wait for the ondrain event.
          await new Promise(resolve => (socketOnDrain = resolve));
        }
        // In practice, chunks are buffered by TCPSocket, progress reaches 100%
        // almost immediately.
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
    };
    client.ondrain = () => {
      // Socket buffer is empty, safe to continue sending.
      socketOnDrain();
    };
    client.ondone = exitCode => {
      if (!AppConstants.MOZ_SUITE) {
        Services.telemetry.scalarAdd("tb.mails.sent", 1);
      }
      deliveryListener?.OnStopRunningUrl(runningUrl, exitCode);
      client.close();
    };
    client.onerror = (nsError, errorMessage, secInfo) => {
      runningUrl.QueryInterface(Ci.nsIMsgMailNewsUrl);
      if (secInfo) {
        // TODO(emilio): Passing the failed security info as part of the URI is
        // quite a smell, but monkey see monkey do...
        runningUrl.failedSecInfo = secInfo;
      }
      runningUrl.errorMessage = errorMessage;
      deliveryListener?.OnStopRunningUrl(runningUrl, nsError);
    };
  },

  /**
   * @see nsISmtpService
   */
  verifyLogon(server, urlListener, msgWindow) {
    let client = new SmtpClient(server);
    client.connect();
    let runningUrl = this._getRunningUri(server);
    client.onerror = (nsError, errorMessage, secInfo) => {
      runningUrl.QueryInterface(Ci.nsIMsgMailNewsUrl);
      if (secInfo) {
        runningUrl.failedSecInfo = secInfo;
      }
      runningUrl.errorMessage = errorMessage;
      urlListener.OnStopRunningUrl(runningUrl, nsError);
    };
    client.onready = () => {
      urlListener.OnStopRunningUrl(runningUrl, 0);
      client.close();
    };
    return runningUrl;
  },

  /**
   * @see nsISmtpService
   */
  getServerByIdentity(userIdentity) {
    return userIdentity.smtpServerKey
      ? this.getServerByKey(userIdentity.smtpServerKey)
      : this.defaultServer;
  },

  /**
   * @see nsISmtpService
   */
  getServerByKey(key) {
    let server = this._servers.find(s => s.key == key);
    return server || this._createKeyedServer(key);
  },

  /**
   * @see nsISmtpService
   */
  createServer() {
    let serverKeys = this._getSmtpServerKeys();
    let i = 1;
    let key;
    do {
      key = `smtp${i++}`;
    } while (serverKeys.includes(key));

    serverKeys.push(key);
    this._saveSmtpServerKeys(serverKeys);
    return this._createKeyedServer(key);
  },

  /**
   * @see nsISmtpService
   */
  deleteServer(server) {
    let serverKeys = this._getSmtpServerKeys().filter(k => k != server.key);
    this._servers = this._servers.filter(s => s.key != server.key);
    this._saveSmtpServerKeys(serverKeys);
  },

  /**
   * @see nsISmtpService
   */
  findServer(username, hostname) {
    username = username?.toLowerCase();
    hostname = hostname?.toLowerCase();
    return this.servers.find(server => {
      if (
        (username && server.username.toLowerCase() != username) ||
        (hostname && server.hostname.toLowerCase() != hostname)
      ) {
        return false;
      }
      return true;
    });
  },

  /**
   * Load SMTP servers from prefs.
   */
  _loadSmtpServers() {
    if (this._servers.length) {
      return;
    }
    this._servers = this._getSmtpServerKeys().map(key =>
      this.getServerByKey(key)
    );
  },

  /**
   * Get all SMTP server keys from prefs.
   * @returns {string[]}
   */
  _getSmtpServerKeys() {
    return Services.prefs
      .getCharPref("mail.smtpservers", "")
      .split(",")
      .filter(Boolean);
  },

  /**
   * Save SMTP server keys to prefs.
   * @params {string[]} keys - The key list to save.
   */
  _saveSmtpServerKeys(keys) {
    return Services.prefs.setCharPref("mail.smtpservers", keys.join(","));
  },

  /**
   * Create an nsISmtpServer from a key.
   * @param {string} key - The key for the SmtpServer.
   * @returns {nsISmtpServer}
   */
  _createKeyedServer(key) {
    let server = Cc["@mozilla.org/messenger/smtp/server;1"].createInstance(
      Ci.nsISmtpServer
    );
    server.key = key;
    this._servers.push(server);
    return server;
  },

  /**
   * Get the server URI in the form of smtp://user@hostname:port.
   * @param {nsISmtpServer} server - The SMTP server.
   * @returns {nsIURI}
   */
  _getRunningUri(server) {
    let spec = server.serverURI + (server.port ? `:${server.port}` : "");
    return Services.io.newURI(spec);
  },
};
