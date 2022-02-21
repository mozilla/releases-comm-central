/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Pop3Client"];

var { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { CommonUtils } = ChromeUtils.import("resource://services-common/utils.js");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { LineReader } = ChromeUtils.import("resource:///modules/LineReader.jsm");
var { MailCryptoUtils } = ChromeUtils.import(
  "resource:///modules/MailCryptoUtils.jsm"
);
var { Pop3Authenticator } = ChromeUtils.import(
  "resource:///modules/MailAuthenticator.jsm"
);

/**
 * A structure to represent a response received from the server. A response can
 * be a single status line of a multi-line data block.
 * @typedef {Object} Pop3Response
 * @property {boolean} success - True for a positive status indicator ("+OK","+").
 * @property {string} status - The status indicator, can be "+OK", "-ERR" or "+".
 * @property {string} statusText - The status line of the response excluding the
 *   status indicator.
 * @property {string} data - The part of a multi-line data block excluding the
 *   status line.
 *
 * A single char to represent a uidl status, possible values are:
 *   - 'k'=KEEP,
 *   - 'd'=DELETE
 *   - 'b'=TOO_BIG
 *   - 'f'=FETCH_BODY
 * @typedef {string} UidlStatus
 */

const UIDL_KEEP = "k";
const UIDL_DELETE = "d";
const UIDL_TOO_BIG = "b";
const UIDL_FETCH_BODY = "f";

/**
 * A class to interact with POP3 server.
 */
class Pop3Client {
  /**
   * @param {nsIPop3IncomingServer} server - The associated server instance.
   */
  constructor(server) {
    this._server = server.QueryInterface(Ci.nsIMsgIncomingServer);
    this._authenticator = new Pop3Authenticator(server);
    this._lineReader = new LineReader();

    // Somehow, Services.io.newURI("pop3://localhost") doesn't work, what we
    // need is just a valid nsIMsgMailNewsUrl to propagate OnStopRunningUrl and
    // secInfo.
    this.runningUri = Services.io
      .newURI(`smtp://${this._server.realHostName}:${this._server.port}`)
      .mutate()
      .setScheme("pop3")
      .finalize()
      .QueryInterface(Ci.nsIMsgMailNewsUrl);

    // A list of auth methods detected from the EHLO response.
    this._supportedAuthMethods = [];
    // A list of auth methods that worth a try.
    this._possibleAuthMethods = [];
    // Auth method set by user preference.
    this._preferredAuthMethods =
      {
        [Ci.nsMsgAuthMethod.passwordCleartext]: ["PLAIN", "LOGIN"],
        [Ci.nsMsgAuthMethod.passwordEncrypted]: ["CRAM-MD5"],
        [Ci.nsMsgAuthMethod.GSSAPI]: ["GSSAPI"],
        [Ci.nsMsgAuthMethod.NTLM]: ["NTLM"],
        [Ci.nsMsgAuthMethod.OAuth2]: ["XOAUTH2"],
        [Ci.nsMsgAuthMethod.secure]: ["CRAM-MD5", "GSSAPI"],
      }[server.authMethod] || [];
    // The next auth method to try if the current failed.
    this._nextAuthMethod = null;

    this._sink = Cc["@mozilla.org/messenger/pop3-sink;1"].createInstance(
      Ci.nsIPop3Sink
    );
    this._sink.popServer = server;

    this._logger = console.createInstance({
      prefix: "mailnews.pop3",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mailnews.pop3.loglevel",
    });

    this.onReady = () => {};

    this._cutOffTimestamp = -1;
    if (
      this._server.deleteByAgeFromServer &&
      this._server.numDaysToLeaveOnServer
    ) {
      // We will send DELE request for messages received before this timestamp.
      this._cutOffTimestamp =
        Date.now() / 1000 - this._server.numDaysToLeaveOnServer * 24 * 60 * 60;
    }

    this._maxMessageSize = Infinity;
    if (this._server.limitOfflineMessageSize) {
      this._maxMessageSize = this._server.maxMessageSize
        ? this._server.maxMessageSize * 1024
        : 50 * 1024;
    }

    this._messagesToHandle = [];
  }

  /**
   * Initiate a connection to the server
   */
  connect() {
    if (this._server.serverBusy) {
      this._actionError("pop3ServerBusy", [this._server.prettyName]);
      return;
    }

    this._logger.debug(
      `Connecting to pop://${this._server.realHostName}:${this._server.port}`
    );
    this._server.serverBusy = true;
    this._secureTransport = this._server.socketType == Ci.nsMsgSocketType.SSL;
    this._socket = new TCPSocket(this._server.realHostName, this._server.port, {
      binaryType: "arraybuffer",
      useSecureTransport: this._secureTransport,
    });
    this._socket.onopen = this._onOpen;
    this._socket.onerror = this._onError;

    this._authenticating = false;
    // Indicates if the connection has been closed and can't be used anymore.
    this._destroyed = false;
  }

  /**
   * Check and fetch new mails.
   * @param {boolean} downloadMail - Whether to download mails using TOP/RETR.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {nsIMsgFolder} folder - The folder to save the messages to.
   */
  async getMail(downloadMail, msgWindow, urlListener, folder) {
    this._downloadMail = downloadMail;
    this._msgWindow = msgWindow;
    this._urlListener = urlListener;
    this._sink.folder = folder;
    this._actionAfterAuth = this._actionStat;
    this._urlListener?.OnStartRunningUrl(this.runningUri, Cr.NS_OK);

    await this._loadUidlState();
    this._actionCapa();
  }

  /**
   * Verify that we can logon to the server. Exit after auth success/failure.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   */
  verifyLogon(msgWindow, urlListener) {
    this._msgWindow = msgWindow;
    this._urlListener = urlListener;
    this._verifyLogon = true;
    this._actionAfterAuth = this._actionDone;
    this._actionCapa();
  }

  /**
   * Fetch the full message of a uidl.
   * @param {nsIPop3Sink} sink - The sink to use for this request.
   * @param {string} uidl - The uidl of the message to fetch.
   */
  async fetchBodyForUidl(sink, uidl) {
    this._downloadMail = true;
    this._sink = sink;
    this._sink.buildMessageUri = true;
    this._urlListener = sink.folder.QueryInterface(Ci.nsIUrlListener);
    this._urlListener?.OnStartRunningUrl(this.runningUri, Cr.NS_OK);

    await this._loadUidlState();

    let uidlState = this._uidlMap.get(uidl);
    if (!uidlState) {
      // This uidl is no longer on the server, use this._sink to delete the
      // msgHdr.
      this._sink.beginMailDelivery(true, null);
      this._sink.incorporateBegin(uidl, 0);
      this._actionDone(Cr.NS_ERROR_FAILURE);
      return;
    }
    if (uidlState.status != UIDL_TOO_BIG) {
      this._actionDone(Cr.NS_ERROR_FAILURE);
      return;
    }

    this._singleUidlToDownload = uidl;
    this._uidlMap.set(uidl, {
      ...uidlState,
      status: UIDL_FETCH_BODY,
    });
    this._actionAfterAuth = this._actionStat;
    this._actionCapa();
  }

  /**
   * Mark uidl status by a passed in Map, then write to popstate.dat.
   * @param {Map<string, UidlStatus>} uidlsToMark - A Map from uidl to status.
   */
  async markMessages(uidlsToMark) {
    await this._loadUidlState();
    for (let [uidl, status] of uidlsToMark) {
      let uidlState = this._uidlMap.get(uidl);
      if (!uidlState) {
        continue;
      }
      this._uidlMap.set(uidl, {
        ...uidlState,
        status,
      });
      this._uidlMapChanged = true;
    }
    await this._writeUidlState();
  }

  /**
   * Send `QUIT` request to the server.
   */
  quit() {
    this._send("QUIT");
    this._nextAction = this.close;
  }

  /**
   * Close the socket.
   */
  close() {
    this._socket.close();
  }

  /**
   * The open event handler.
   */
  _onOpen = () => {
    this._logger.debug("Connected");
    this._socket.ondata = this._onData;
    this._socket.onclose = this._onClose;
    this._nextAction = () => {
      this.onOpen();
    };
  };

  /**
   * Parse the server response.
   * @param {string} str - Response received from the server.
   * @returns {Pop3Response}
   */
  _parse(str) {
    if (this._lineReader.processingMultiLineResponse) {
      // When processing multi-line response, no parsing should happen. If
      // `+something` is treated as status line, _actionRetrResponse will treat
      // it as a new message.
      return { data: str };
    }
    let matches = /^(\+OK|-ERR|\+) ?(.*)\r\n([^]*)/.exec(str);
    if (matches) {
      let [, status, statusText, data] = matches;
      return { success: status != "-ERR", status, statusText, data };
    }
    return { data: str };
  }

  /**
   * The data event handler.
   * @param {TCPSocketEvent} event - The data event.
   */
  _onData = async event => {
    // Some servers close the socket on invalid username/password, this line
    // guarantees onclose is handled before we try another AUTH method. See the
    // same handling in SmtpClient.jsm.
    await new Promise(resolve => setTimeout(resolve));

    let stringPayload = CommonUtils.arrayBufferToByteString(
      new Uint8Array(event.data)
    );
    this._logger.debug(`S: ${stringPayload}`);
    let res = this._parse(stringPayload);
    this._nextAction?.(res);
  };

  /**
   * The error event handler.
   * @param {TCPSocketErrorEvent} event - The error event.
   */
  _onError = event => {
    this._logger.error(event, event.name, event.message, event.errorCode);
    this.quit();
    let secInfo = event.target.transport?.securityInfo;
    if (secInfo) {
      this.runningUri.failedSecInfo = secInfo;
    }
    this._actionDone(event.errorCode);
  };

  /**
   * The close event handler.
   */
  _onClose = () => {
    this._logger.debug("Connection closed.");
    this._server.serverBusy = false;
    this._destroyed = true;
    if (this._authenticating) {
      // In some cases, socket is closed for invalid username/password.
      this._actionAuthResponse({ success: false });
    }
  };

  _lineSeparator = AppConstants.platform == "win" ? "\r\n" : "\n";

  /**
   * Read popstate.dat into this._uidlMap.
   */
  async _loadUidlState() {
    this._uidlMap = new Map();
    let stateFile = this._server.localPath;
    stateFile.append("popstate.dat");
    if (!(await IOUtils.exists(stateFile.path))) {
      return;
    }

    let content = await IOUtils.readUTF8(stateFile.path);
    let uidlLine = false;
    for (let line of content.split(this._lineSeparator)) {
      if (!line) {
        continue;
      }
      if (uidlLine) {
        let [status, uidl, receivedAt] = line.split(" ");
        this._uidlMap.set(uidl, {
          status, // @type {UidlStatus}
          uidl,
          receivedAt,
        });
      }
      if (line.startsWith("#")) {
        // A comment line.
        continue;
      }
      if (line.startsWith("*")) {
        // The host & user line.
        uidlLine = true;
      }
    }
  }

  /**
   * Write this._uidlMap into popstate.dat.
   */
  async _writeUidlState() {
    if (!this._uidlMapChanged) {
      return;
    }

    let stateFile = this._server.localPath;
    stateFile.append("popstate.dat");
    let content = [
      "# POP3 State File",
      "# This is a generated file!  Do not edit.",
      "",
      `*${this._server.realHostName} ${this._server.realUsername}`,
    ];
    for (let msg of this._messagesToHandle) {
      // _messagesToHandle is not empty means an error happened, put them back
      // to _uidlMap to prevent loss of popstate.
      this._uidlMap.set(msg.uidl, msg);
    }
    for (let { status, uidl, receivedAt } of this._uidlMap.values()) {
      content.push(`${status} ${uidl} ${receivedAt}`);
    }
    await IOUtils.writeUTF8(stateFile.path, content.join(this._lineSeparator));

    this._uidlMapChanged = false;
  }

  /**
   * Send a command to the server.
   * @param {string} str - The command string to send.
   * @param {boolean} [suppressLogging=false] - Whether to suppress logging the str.
   */
  _send(str, suppressLogging) {
    if (suppressLogging && AppConstants.MOZ_UPDATE_CHANNEL != "default") {
      this._logger.debug(
        "C: Logging suppressed (it probably contained auth information)"
      );
    } else {
      // Do not suppress for non-release builds, so that debugging auth problems
      // is easier.
      this._logger.debug(`C: ${str}`);
    }

    if (this._socket?.readyState != "open") {
      this._logger.warn(
        `Failed to send because socket state is ${this._socket?.readyState}`
      );
      return;
    }

    this._socket.send(CommonUtils.byteStringToArrayBuffer(str + "\r\n").buffer);
  }

  /**
   * Send `CAPA` request to the server.
   */
  _actionCapa = () => {
    this._nextAction = this._actionCapaResponse;
    this._capabilities = [];
    this._send("CAPA");
  };

  /**
   * Handle `CAPA` response.
   * @param {Pop3Response} res - CAPA response received from the server.
   */
  _actionCapaResponse = res => {
    if (res.status && !res.success) {
      this._actionChooseFirstAuthMethod();
      return;
    }
    this._lineReader.read(
      res.data,
      line => {
        if (line.startsWith("SASL ")) {
          this._supportedAuthMethods = line
            .slice(5)
            .trim()
            .split(" ");
        } else {
          this._capabilities.push(line.trim().split(" ")[0]);
        }
      },
      () => this._actionChooseFirstAuthMethod()
    );
  };

  /**
   * Decide the first auth method to try.
   */
  _actionChooseFirstAuthMethod = () => {
    if (
      [
        Ci.nsMsgSocketType.trySTARTTLS,
        Ci.nsMsgSocketType.alwaysSTARTTLS,
      ].includes(this._server.socketType) &&
      !this._secureTransport
    ) {
      if (this._capabilities.includes("STLS")) {
        // Init STARTTLS negotiation if required by user pref and supported.
        this._nextAction = this._actionStlsResponse;
        // STLS is the POP3 command to init STARTTLS.
        this._send("STLS");
      } else {
        // Abort if not supported.
        this._logger.error("Server doesn't support STLS. Aborting.");
        this._actionError("nsErrorCouldNotConnectViaTls");
      }
      return;
    }

    // If a preferred method is not supported by the server, no need to try it.
    this._possibleAuthMethods = this._preferredAuthMethods.filter(x =>
      this._supportedAuthMethods.includes(x)
    );
    this._logger.debug(`Possible auth methods: ${this._possibleAuthMethods}`);
    this._nextAuthMethod = this._nextAuthMethod || this._possibleAuthMethods[0];
    if (
      !this._supportedAuthMethods.length &&
      this._server.authMethod == Ci.nsMsgAuthMethod.passwordCleartext
    ) {
      this._possibleAuthMethods.unshift("USERPASS");
      this._nextAuthMethod = "USERPASS";
    }

    if (this._nextAuthMethod) {
      this._actionAuth();
      return;
    }

    // Preferred auth methods don't match any supported auth methods. Give user
    // some hints to change the config.
    if (
      this._server.authMethod == Ci.nsMsgAuthMethod.passwordCleartext &&
      this._supportedAuthMethods.includes("CRAM-MD5")
    ) {
      // Suggest changing from plain password to encrypted password.
      this._actionError("pop3AuthChangePlainToEncrypt");
    } else if (
      this._server.authMethod == Ci.nsMsgAuthMethod.passwordEncrypted &&
      (this._supportedAuthMethods.includes("PLAIN") ||
        this._supportedAuthMethods.includes("LOGIN"))
    ) {
      // Suggest changing from encrypted password to plain password.
      this._actionError(
        this._secureTransport
          ? "pop3AuthChangeEncryptToPlainSSL"
          : "pop3AuthChangeEncryptToPlainNoSSL"
      );
    } else {
      // General suggestion about changing auth method.
      this._actionError("pop3AuthMechNotSupported");
    }
  };

  /**
   * Handle STLS response. STLS is the POP3 command to init STARTTLS.
   * @param {Pop3Response} res - STLS response received from the server.
   */
  _actionStlsResponse = res => {
    if (!res.success) {
      this._actionDone(Cr.NS_ERROR_FAILURE);
      return;
    }
    this._socket.upgradeToSecure();
    this._secureTransport = true;
    this._actionCapa();
  };

  /**
   * Init authentication depending on server capabilities and user prefs.
   */
  _actionAuth = async () => {
    if (!this._nextAuthMethod) {
      this._actionDone(Cr.NS_ERROR_FAILURE);
      return;
    }

    if (this._destroyed) {
      // If connection is lost, reconnect.
      this.connect();
      return;
    }

    this._authenticating = true;

    this._currentAuthMethod = this._nextAuthMethod;
    this._nextAuthMethod = this._possibleAuthMethods[
      this._possibleAuthMethods.indexOf(this._currentAuthMethod) + 1
    ];
    this._logger.debug(`Current auth method: ${this._currentAuthMethod}`);
    this._nextAction = this._actionAuthResponse;

    switch (this._currentAuthMethod) {
      case "USERPASS":
        this._nextAction = this._actionAuthUserPass;
        this._send(`USER ${this._authenticator.username}`);
        break;
      case "PLAIN":
        this._nextAction = this._actionAuthPlain;
        this._send("AUTH PLAIN");
        break;
      case "LOGIN":
        this._nextAction = this._actionAuthLoginUser;
        this._send("AUTH LOGIN");
        break;
      case "CRAM-MD5":
        this._nextAction = this._actionAuthCramMd5;
        this._send("AUTH CRAM-MD5");
        break;
      case "GSSAPI": {
        this._nextAction = this._actionAuthGssapi;
        this._authenticator.initGssapiAuth("pop");
        let token;
        try {
          token = this._authenticator.getNextGssapiToken("");
        } catch (e) {
          this._logger.error(e);
          this._actionError("pop3GssapiFailure");
          return;
        }
        this._send(`AUTH GSSAPI ${token}`, true);
        break;
      }
      case "NTLM": {
        this._nextAction = this._actionAuthNtlm;
        this._authenticator.initNtlmAuth("pop");
        let token;
        try {
          token = this._authenticator.getNextNtlmToken("");
        } catch (e) {
          this._logger.error(e);
          this._actionDone(Cr.NS_ERROR_FAILURE);
        }
        this._send(`AUTH NTLM ${token}`, true);
        break;
      }
      case "XOAUTH2":
        this._nextAction = this._actionAuthResponse;
        let token = await this._authenticator.getOAuthToken();
        this._send(`AUTH XOAUTH2 ${token}`, true);
        break;
      default:
        this._actionDone();
    }
  };

  /**
   * Handle authentication response.
   * @param {Pop3Response} res - Authentication response received from the server.
   */
  _actionAuthResponse = res => {
    this._authenticating = false;
    if (res.success) {
      this._actionAfterAuth();
      return;
    }

    if (this._nextAuthMethod) {
      // Try the next auth method.
      this._actionAuth();
      return;
    }

    if (this._verifyLogon) {
      return;
    }

    if (
      ["USERPASS", "PLAIN", "LOGIN", "CRAM-MD5"].includes(
        this._currentAuthMethod
      )
    ) {
      this._actionError(
        "pop3PasswordFailed",
        [this._server.realUsername],
        res.statusText
      );

      // Ask user what to do.
      let action = this._authenticator.promptAuthFailed();
      if (action == 1) {
        // Cancel button pressed.
        this._actionDone(Cr.NS_ERROR_FAILURE);
        return;
      }
      if (action == 2) {
        // 'New password' button pressed.
        this._authenticator.forgetPassword();
      }

      // Retry.
      this._nextAuthMethod = this._possibleAuthMethods[0];
      this._actionAuth();
    } else if (this._currentAuthMethod == "GSSAPI") {
      this._actionError("pop3GssapiFailure", [], res.statusText);
    }
  };

  /**
   * The second step of USER/PASS auth, send the password to the server.
   */
  _actionAuthUserPass = res => {
    if (!res.success) {
      this._actionError("pop3UsernameFailure", [], res.statusText);
      return;
    }
    this._nextAction = this._actionAuthResponse;
    this._send(`PASS ${this._authenticator.getPassword()}`, true);
  };

  /**
   * The second step of PLAIN auth, send the auth token to the server.
   */
  _actionAuthPlain = res => {
    if (!res.success) {
      this._actionError("pop3UsernameFailure", [], res.statusText);
      return;
    }
    this._nextAction = this._actionAuthResponse;
    let password = String.fromCharCode(
      ...new TextEncoder().encode(this._authenticator.getPassword())
    );
    this._send(
      btoa("\0" + this._authenticator.username + "\0" + password),
      true
    );
  };

  /**
   * The second step of LOGIN auth, send the username to the server.
   */
  _actionAuthLoginUser = () => {
    this._nextAction = this._actionAuthLoginPass;
    this._logger.debug("AUTH LOGIN USER");
    this._send(btoa(this._authenticator.username), true);
  };

  /**
   * The third step of LOGIN auth, send the password to the server.
   */
  _actionAuthLoginPass = res => {
    if (!res.success) {
      this._actionError("pop3UsernameFailure", [], res.statusText);
      return;
    }
    this._nextAction = this._actionAuthResponse;
    this._logger.debug("AUTH LOGIN PASS");
    let password = this._authenticator.getPassword();
    if (
      !Services.prefs.getBoolPref(
        "mail.smtp_login_pop3_user_pass_auth_is_latin1",
        true
      ) ||
      !/^[\x00-\xFF]+$/.test(password) // eslint-disable-line no-control-regex
    ) {
      // Unlike PLAIN auth, the payload of LOGIN auth is not standardized. When
      // `mail.smtp_login_pop3_user_pass_auth_is_latin1` is true, we apply
      // base64 encoding directly. Otherwise, we convert it to UTF-8
      // BinaryString first.
      password = String.fromCharCode(...new TextEncoder().encode(password));
    }
    this._send(btoa(password), true);
  };

  /**
   * The second step of CRAM-MD5 auth, send a HMAC-MD5 signature to the server.
   * @param {Pop3Response} res - AUTH response received from the server.
   */
  _actionAuthCramMd5 = res => {
    if (!res.success) {
      this._actionError("pop3UsernameFailure", [], res.statusText);
      return;
    }
    this._nextAction = this._actionAuthResponse;

    // Server sent us a base64 encoded challenge.
    let challenge = atob(res.statusText);
    let password = this._authenticator.getPassword();
    // Use password as key, challenge as payload, generate a HMAC-MD5 signature.
    let signature = MailCryptoUtils.hmacMd5(
      new TextEncoder().encode(password),
      new TextEncoder().encode(challenge)
    );
    // Get the hex form of the signature.
    let hex = [...signature].map(x => x.toString(16).padStart(2, "0")).join("");
    // Send the username and signature back to the server.
    this._send(btoa(`${this._authenticator.username} ${hex}`), true);
  };

  /**
   * The second and next step of GSSAPI auth.
   * @param {Pop3Response} res - AUTH response received from the server.
   */
  _actionAuthGssapi = res => {
    if (res.status != "+") {
      this._actionAuthResponse(res);
      return;
    }

    // Server returns a challenge, we send a new token. Can happen multiple times.
    let token;
    try {
      token = this._authenticator.getNextGssapiToken(res.statusText);
    } catch (e) {
      this._logger.error(e);
      this._actionAuthResponse({ success: false, data: "AUTH GSSAPI" });
      return;
    }
    this._send(token, true);
  };

  /**
   * The second and next step of NTLM auth.
   * @param {Pop3Response} res - AUTH response received from the server.
   */
  _actionAuthNtlm = res => {
    if (res.status != "+") {
      this._actionAuthResponse(res);
      return;
    }

    // Server returns a challenge, we send a new token. Can happen multiple times.
    let token;
    try {
      token = this._authenticator.getNextNtlmToken(res.statusText);
    } catch (e) {
      this._logger.error(e);
      this._actionAuthResponse({ success: false, data: "AUTH NTLM" });
      return;
    }
    this._send(token, true);
  };

  /**
   * Send `STAT` request to the server.
   */
  _actionStat = () => {
    this._nextAction = this._actionStatResponse;
    this._send("STAT");
  };

  /**
   * Handle `STAT` response.
   * @param {Pop3Response} res - STAT response received from the server.
   */
  _actionStatResponse = res => {
    if (!res.success) {
      this._actionError("pop3StatFail", [], res.statusText);
      return;
    }

    let numberOfMessages = Number.parseInt(res.statusText);
    if (!numberOfMessages) {
      if (this._uidlMap.size) {
        this._uidlMap.clear();
        this._uidlMapChanged = true;
      }
      // Finish if there is no message.
      this._actionDone();
      return;
    }
    if (!this._downloadMail && !this._server.leaveMessagesOnServer) {
      // We are not downloading new mails, so finish now.
      this._sink.setBiffStateAndUpdateFE(
        Ci.nsIMsgFolder.nsMsgBiffState_NewMail,
        numberOfMessages,
        true
      );
      this._actionDone();
      return;
    }

    if (this._downloadMail) {
      try {
        this._sink.beginMailDelivery(
          this._singleUidlToDownload,
          this._msgWindow
        );
      } catch (e) {
        const NS_MSG_FOLDER_BUSY = 2153054218;
        if (e.result == NS_MSG_FOLDER_BUSY) {
          this._actionError("pop3ServerBusy", [this._server.prettyName]);
        } else {
          this._actionError("pop3MessageWriteError");
        }
        return;
      }
    }
    this._actionList();
  };

  /**
   * Send `LIST` request to the server.
   */
  _actionList = () => {
    this._messageSizeMap = new Map();
    this._nextAction = this._actionListResponse;
    this._send("LIST");
  };

  /**
   * Handle `LIST` response.
   * @param {Pop3Response} res - LIST response received from the server.
   */
  _actionListResponse = res => {
    if (res.status && !res.success) {
      this._actionError("pop3ListFailure", [], res.statusText);
      return;
    }
    this._lineReader.read(
      res.data,
      line => {
        let [messageNumber, messageSize] = line.split(" ");
        this._messageSizeMap.set(messageNumber, Number(messageSize));
      },
      () => {
        this._actionUidl();
      }
    );
  };

  /**
   * Send `UIDL` request to the server.
   */
  _actionUidl = () => {
    this._messagesToHandle = [];
    this._newUidlMap = new Map();
    this._nextAction = this._actionUidlResponse;
    this._send("UIDL");
  };

  /**
   * Handle `UIDL` response.
   * @param {Pop3Response} res - UIDL response received from the server.
   */
  _actionUidlResponse = ({ data }) => {
    this._lineReader.read(
      data,
      line => {
        let [messageNumber, uidl] = line.split(" ");
        uidl = uidl.trim();
        let uidlState = this._uidlMap.get(uidl);
        if (uidlState) {
          if (
            uidlState.status == UIDL_KEEP &&
            (!this._server.leaveMessagesOnServer ||
              uidlState.receivedAt < this._cutOffTimestamp)
          ) {
            // Delete this message.
            this._messagesToHandle.push({
              ...uidlState,
              messageNumber,
              status: UIDL_DELETE,
            });
          } else if (
            [UIDL_FETCH_BODY, UIDL_DELETE].includes(uidlState.status)
          ) {
            // Fetch the full message.
            this._messagesToHandle.push({
              ...uidlState,
              messageNumber,
              status: uidlState.status,
            });
          } else {
            // Do nothing to this message.
            this._newUidlMap.set(uidl, uidlState);
          }
        } else {
          // Fetch the full message or only headers depending on server settings
          // and message size.
          let status =
            this._capabilities.includes("TOP") &&
            (this._server.headersOnly ||
              this._messageSizeMap.get(messageNumber) > this._maxMessageSize)
              ? UIDL_TOO_BIG
              : UIDL_FETCH_BODY;
          this._messagesToHandle.push({
            messageNumber,
            uidl,
            status,
          });
        }
      },
      () => {
        if (!this._downloadMail) {
          let numberOfMessages = this._messagesToHandle.filter(
            // No receivedAt means we're seeing it for the first time.
            msg => !msg.receivedAt
          ).length;
          if (numberOfMessages) {
            this._sink.setBiffStateAndUpdateFE(
              Ci.nsIMsgFolder.nsMsgBiffState_NewMail,
              numberOfMessages,
              true
            );
          }
          this._actionDone();
          return;
        }

        if (this._singleUidlToDownload) {
          this._messagesToHandle = this._messagesToHandle.filter(
            msg => msg.uidl == this._singleUidlToDownload
          );
          this._newUidlMap = this._uidlMap;
        }

        let totalDownloadSize = this._messagesToHandle.reduce(
          (acc, msg) =>
            msg.status == UIDL_FETCH_BODY
              ? acc + this._messageSizeMap.get(msg.messageNumber)
              : acc,
          0
        );
        try {
          let localFolder = this._sink.folder.QueryInterface(
            Ci.nsIMsgLocalMailFolder
          );
          if (
            localFolder.warnIfLocalFileTooBig(
              this._msgWindow,
              totalDownloadSize
            )
          ) {
            throw new Error("Not enough disk space");
          }
        } catch (e) {
          this._logger.error(e);
          this._actionDone(Cr.NS_ERROR_FAILURE);
          return;
        }

        this._uidlMapChanged =
          this._uidlMap.size != this._newUidlMap.size ||
          this._messagesToHandle.length;
        // This discards staled uidls that are no longer on the server.
        this._uidlMap = this._newUidlMap;

        this._sink.setMsgsToDownload(
          this._messagesToHandle.filter(msg =>
            [UIDL_FETCH_BODY, UIDL_TOO_BIG].includes(msg.status)
          ).length
        );
        this._actionHandleMessage();
      }
    );
  };

  /**
   * Consume a message from this._messagesToHandle, decide to send TOP, RETR or
   * DELE request.
   */
  _actionHandleMessage = () => {
    this._currentMessage = this._messagesToHandle.shift();
    if (this._currentMessage) {
      switch (this._currentMessage.status) {
        case UIDL_TOO_BIG:
          this._actionTop();
          break;
        case UIDL_FETCH_BODY:
          this._actionRetr();
          break;
        case UIDL_DELETE:
          this._actionDelete();
          break;
        default:
          break;
      }
    } else {
      this._sink.endMailDelivery(this);
      this._actionDone();
    }
  };

  /**
   * Send `TOP` request to the server.
   */
  _actionTop = () => {
    this._nextAction = this._actionTopResponse;
    let lineNumber = this._server.headersOnly ? 0 : 20;
    this._send(`TOP ${this._currentMessage.messageNumber} ${lineNumber}`);
  };

  /**
   * Handle `TOP` response.
   * @param {Pop3Response} res - TOP response received from the server.
   */
  _actionTopResponse = res => {
    if (res.status) {
      try {
        // Call incorporateBegin only once for each message.
        this._sink.incorporateBegin(
          this._currentMessage.uidl,
          Ci.nsMsgMessageFlags.Partial
        );
      } catch (e) {
        this._actionError("pop3MessageWriteError");
        return;
      }
    }
    this._lineReader.read(
      res.data,
      line => {
        // Remove \r\n and use the OS native line ending.
        line = line.slice(0, -2) + this._lineSeparator;
        try {
          this._sink.incorporateWrite(line, line.length);
        } catch (e) {
          this._actionError("pop3MessageWriteError");
          return;
        }
      },
      () => {
        try {
          this._sink.incorporateComplete(
            this._msgWindow,
            // Set size because it's a partial message.
            this._messageSizeMap.get(this._currentMessage.messageNumber)
          );
        } catch (e) {
          this._actionError("pop3MessageWriteError");
          return;
        }

        this._uidlMap.set(this._currentMessage.uidl, {
          status: UIDL_TOO_BIG,
          uidl: this._currentMessage.uidl,
          receivedAt: Math.floor(Date.now() / 1000),
        });
        this._actionHandleMessage();
      }
    );
  };

  /**
   * Send `RETR` request to the server.
   */
  _actionRetr = () => {
    this._nextAction = this._actionRetrResponse;
    this._send(`RETR ${this._currentMessage.messageNumber}`);
  };

  /**
   * Handle `RETR` response.
   * @param {Pop3Response} res - RETR response received from the server.
   */
  _actionRetrResponse = res => {
    if (res.status) {
      if (!res.success) {
        this._actionError("pop3RetrFailure", [], res.statusText);
        return;
      }
      try {
        // Call incorporateBegin only once for each message.
        this._sink.incorporateBegin(this._currentMessage.uidl, 0);
      } catch (e) {
        this._actionError("pop3MessageWriteError");
        return;
      }
    }
    this._lineReader.read(
      res.data,
      line => {
        line = line.slice(0, -2) + this._lineSeparator;
        try {
          this._sink.incorporateWrite(line, line.length);
        } catch (e) {
          this._actionError("pop3MessageWriteError");
          return;
        }
      },
      () => {
        try {
          this._sink.incorporateComplete(
            this._msgWindow,
            0 // Set size only when it's a partial message.
          );
        } catch (e) {
          this._actionError("pop3MessageWriteError");
          return;
        }
        if (this._server.leaveMessagesOnServer) {
          this._uidlMap.set(this._currentMessage.uidl, {
            status: UIDL_KEEP,
            uidl: this._currentMessage.uidl,
            receivedAt: Math.floor(Date.now() / 1000),
          });
          this._actionHandleMessage();
        } else {
          this._actionDelete();
        }
      }
    );
  };

  /**
   * Send `DELE` request to the server.
   */
  _actionDelete = () => {
    this._nextAction = this._actionDeleteResponse;
    this._send(`DELE ${this._currentMessage.messageNumber}`);
  };

  /**
   * Handle `DELE` response.
   * @param {Pop3Response} res - DELE response received from the server.
   */
  _actionDeleteResponse = res => {
    if (!res.success) {
      this._actionError("pop3DeleFailure", [], res.statusText);
      return;
    }
    this._actionHandleMessage();
  };

  /**
   * Show an error prompt.
   * @param {string} errorName - An error name corresponds to an entry of
   *   localMsgs.properties.
   * @param {string[]} errorParams - Params to construct the error message.
   * @param {string} serverErrorMsg - Error message returned by the server.
   */
  _actionError(errorName, errorParams, serverErrorMsg) {
    this._logger.error(`Got an error name=${errorName}`);
    if (errorName != "pop3PasswordFailed") {
      this._actionDone(Cr.NS_ERROR_FAILURE);
    }

    if (!this._msgWindow) {
      return;
    }
    let bundle = Services.strings.createBundle(
      "chrome://messenger/locale/localMsgs.properties"
    );
    let errorMsg;
    if (errorParams) {
      errorMsg = bundle.formatStringFromName(errorName, errorParams);
    } else {
      errorMsg = bundle.GetStringFromName(errorName);
    }
    if (serverErrorMsg) {
      let serverSaidPrefix = bundle.formatStringFromName("pop3ServerSaid", [
        this._server.realHostName,
      ]);
      errorMsg += ` ${serverSaidPrefix} ${serverErrorMsg}`;
    }

    let errorTitle = bundle.formatStringFromName("pop3ErrorDialogTitle", [
      this._server.prettyName,
    ]);
    this._msgWindow.promptDialog.alert(errorTitle, errorMsg);
  }

  _actionDone = (status = Cr.NS_OK) => {
    this._authenticating = false;
    if (status != Cr.NS_OK) {
      this._sink.abortMailDelivery(this);
      if (this._currentMessage) {
        // Put _currentMessage back to the queue to prevent loss of popstate.
        this._messagesToHandle.unshift(this._currentMessage);
      }
    }
    this._writeUidlState();
    this._urlListener?.OnStopRunningUrl(this.runningUri, status);
    this.quit();
  };

  /** @see nsIPop3Protocol */
  checkMessage(uidl) {
    return this._uidlMap.has(uidl);
  }
}
