/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SmtpService"];

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};
XPCOMUtils.defineLazyModuleGetters(lazy, {
  SmtpClient: "resource:///modules/SmtpClient.jsm",
  MsgUtils: "resource:///modules/MimeMessageUtils.jsm",
});

/**
 * The SMTP service.
 *
 * @implements {nsISmtpService}
 */
class SmtpService {
  QueryInterface = ChromeUtils.generateQI(["nsISmtpService"]);

  constructor() {
    this._servers = [];
    this._logger = lazy.MsgUtils.smtpLogger;
  }

  /**
   * @see nsISmtpService
   */
  get defaultServer() {
    const defaultServerKey = Services.prefs.getCharPref(
      "mail.smtp.defaultserver",
      ""
    );
    if (defaultServerKey) {
      // Get it from the prefs.
      return this.getServerByKey(defaultServerKey);
    }

    // No pref set, so set the first one as default, and return it.
    if (this.servers.length > 0) {
      this.defaultServer = this.servers[0];
      return this.servers[0];
    }
    return null;
  }

  set defaultServer(server) {
    Services.prefs.setCharPref("mail.smtp.defaultserver", server.key);
  }

  get servers() {
    if (!this._servers.length) {
      // Load SMTP servers from prefs.
      this._servers = this._getSmtpServerKeys().map(key =>
        this._keyToServer(key)
      );
    }
    return this._servers;
  }

  get wrappedJSObject() {
    return this;
  }

  /**
   * @see nsISmtpService
   */
  async sendMailMessage(
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
    const server = this.getServerByIdentity(userIdentity);
    if (!server) {
      // Occurs for at least one unit test, but test does not fail if return
      // here. This check for "server" can be removed if tests are fixed.
      console.log(
        `No server found for identity with email ${userIdentity.email} and ` +
          `smtpServerKey ${userIdentity.smtpServerKey}`
      );
      return;
    }
    if (password) {
      server.password = password;
    }
    const runningUrl = this._getRunningUri(server);
    await server.wrappedJSObject.withClient(client => {
      deliveryListener?.OnStartRunningUrl(runningUrl, 0);
      let fresh = true;
      client.onidle = () => {
        // onidle can occur multiple times, but we should only init sending
        // when sending a new message(fresh is true) or when a new connection
        // replaces the original connection due to error 4xx response
        // (client.isRetry is true).
        if (!fresh && !client.isRetry) {
          return;
        }
        // Init when fresh==true OR re-init sending when client.isRetry==true.
        fresh = false;
        let from = sender;
        const to = MailServices.headerParser
          .parseEncodedHeaderW(decodeURIComponent(recipients))
          .map(rec => rec.email);

        if (
          !Services.prefs.getBoolPref(
            "mail.smtp.useSenderForSmtpMailFrom",
            false
          )
        ) {
          from = userIdentity.email;
        }
        if (!messageId) {
          messageId = Cc["@mozilla.org/messengercompose/computils;1"]
            .createInstance(Ci.nsIMsgCompUtils)
            .msgGenerateMessageId(userIdentity, null);
        }
        client.useEnvelope({
          from: MailServices.headerParser.parseEncodedHeaderW(
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
        const fstream = Cc[
          "@mozilla.org/network/file-input-stream;1"
        ].createInstance(Ci.nsIFileInputStream);
        // PR_RDONLY
        fstream.init(messageFile, 0x01, 0, 0);

        const sstream = Cc[
          "@mozilla.org/scriptableinputstream;1"
        ].createInstance(Ci.nsIScriptableInputStream);
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
      client.ondone = exitCode => {
        if (!AppConstants.MOZ_SUITE) {
          Services.telemetry.scalarAdd("tb.mails.sent", 1);
        }
        deliveryListener?.OnStopRunningUrl(runningUrl, exitCode);
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

      outRequest.value = {
        cancel() {
          client.close(true);
        },
      };
    });
  }

  /**
   * @see nsISmtpService
   */
  verifyLogon(server, urlListener, msgWindow) {
    const client = new lazy.SmtpClient(server);
    client.connect();
    const runningUrl = this._getRunningUri(server);
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
  }

  /**
   * @see nsISmtpService
   */
  getServerByIdentity(userIdentity) {
    return userIdentity.smtpServerKey
      ? this.getServerByKey(userIdentity.smtpServerKey)
      : this.defaultServer;
  }

  /**
   * @see nsISmtpService
   */
  getServerByKey(key) {
    return this.servers.find(s => s.key == key);
  }

  /**
   * @see nsISmtpService
   */
  createServer() {
    const serverKeys = this._getSmtpServerKeys();
    let i = 1;
    let key;
    do {
      key = `smtp${i++}`;
    } while (serverKeys.includes(key));

    serverKeys.push(key);
    this._saveSmtpServerKeys(serverKeys);
    this._servers = []; // Reset to force repopulation of this.servers.
    return this.servers.at(-1);
  }

  /**
   * @see nsISmtpService
   */
  deleteServer(server) {
    const serverKeys = this._getSmtpServerKeys().filter(k => k != server.key);
    this._servers = this.servers.filter(s => s.key != server.key);
    this._saveSmtpServerKeys(serverKeys);
  }

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
  }

  /**
   * Get all SMTP server keys from prefs.
   *
   * @returns {string[]}
   */
  _getSmtpServerKeys() {
    return Services.prefs
      .getCharPref("mail.smtpservers", "")
      .split(",")
      .filter(Boolean);
  }

  /**
   * Save SMTP server keys to prefs.
   *
   * @param {string[]} keys - The key list to save.
   */
  _saveSmtpServerKeys(keys) {
    return Services.prefs.setCharPref("mail.smtpservers", keys.join(","));
  }

  /**
   * Create an nsISmtpServer from a key.
   *
   * @param {string} key - The key for the SmtpServer.
   * @returns {nsISmtpServer}
   */
  _keyToServer(key) {
    const server = Cc["@mozilla.org/messenger/smtp/server;1"].createInstance(
      Ci.nsISmtpServer
    );
    // Setting the server key will set up all of its other properties by
    // reading them from the prefs.
    server.key = key;
    return server;
  }

  /**
   * Get the server URI in the form of smtp://user@hostname:port.
   *
   * @param {nsISmtpServer} server - The SMTP server.
   * @returns {nsIURI}
   */
  _getRunningUri(server) {
    const spec = server.serverURI + (server.port ? `:${server.port}` : "");
    return Services.io.newURI(spec);
  }
}
