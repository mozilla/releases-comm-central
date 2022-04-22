/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapClient"];

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);
var { ImapAuthenticator } = ChromeUtils.import(
  "resource:///modules/MailAuthenticator.jsm"
);
var { ImapResponse } = ChromeUtils.import(
  "resource:///modules/ImapResponse.jsm"
);
var { ImapUtils } = ChromeUtils.import("resource:///modules/ImapUtils.jsm");

// There can be multiple ImapClient running concurrently, assign each logger a
// unique prefix.
let loggerInstanceId = 0;

/**
 * A class to interact with IMAP server.
 */
class ImapClient {
  _logger = console.createInstance({
    prefix: `mailnews.imap.${loggerInstanceId++}`,
    maxLogLevel: "Warn",
    maxLogLevelPref: "mailnews.imap.loglevel",
  });

  /**
   * @param {nsIImapIncomingServer} server - The associated server instance.
   */
  constructor(server) {
    this._server = server.QueryInterface(Ci.nsIMsgIncomingServer);
    this._authenticator = new ImapAuthenticator(server);

    this._tag = Math.floor(100 * Math.random());
  }

  /**
   * Initiate a connection to the server
   */
  connect() {
    this._logger.debug(
      `Connecting to ${this._server.realHostName}:${this._server.port}`
    );
    this._secureTransport = this._server.socketType == Ci.nsMsgSocketType.SSL;
    this._socket = new TCPSocket(this._server.realHostName, this._server.port, {
      binaryType: "arraybuffer",
      useSecureTransport: this._secureTransport,
    });
    this._socket.onopen = this._onOpen;
    this._socket.onerror = this._onError;
  }

  /**
   * Select a folder.
   * @param {nsIMsgFolder} folder - The folder to select.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   */
  selectFolder(folder, urlListener, msgWindow) {
    this._folder = folder;
    this._urlListener = urlListener || folder.QueryInterface(Ci.nsIUrlListener);
    this.runningUrl = Services.io
      .newURI(`imap://${this._server.realHostName}`)
      .QueryInterface(Ci.nsIMsgMailNewsUrl);
    this.runningUrl.updatingFolder = true;
    this._urlListener.OnStartRunningUrl(this.runningUrl, Cr.NS_OK);

    this._actionAfterSelectFolder = this._actionUidFetch;
    this._nextAction = this._actionSelectResponse;
    this._sendTagged(`SELECT "${folder.name}"`);
  }

  /**
   * Add, remove or replace flags of specificed messages.
   * @param {string} action - "+" means add, "-" means remove, "" means replace.
   * @param {nsIMsgFolder} folder - The target folder.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {string} messageIds - Message UIDs, e.g. "23,30:33".
   * @param {number} flags - The internal flags number to update.
   */
  updateMesageFlags(action, folder, urlListener, messageIds, flags) {
    let getCommand = () => {
      // _supportedFlags is available after _actionSelectResponse.
      let flagsStr = ImapUtils.flagsToString(flags, this._supportedFlags);
      return `UID STORE ${messageIds} ${action}FLAGS ${flagsStr}`;
    };
    if (this._folder == folder) {
      this._sendTagged(getCommand());
    } else {
      this._folder = folder;
      this._actionAfterSelectFolder = () => {
        this._nextAction = null;
        this._sendTagged(getCommand());
      };
      this._nextAction = this._actionSelectResponse;
      this._sendTagged(`SELECT "${folder.name}"`);
    }
  }

  /**
   * The open event handler.
   */
  _onOpen = () => {
    this._logger.debug("Connected");
    this._socket.ondata = this._onData;
    this._socket.onclose = this._onClose;
    this._nextAction = () => {
      this._actionCapabilityResponse();
    };
  };

  /**
   * Parse the server response.
   * @param {string} str - Response received from the server.
   * @returns {ImapResponse}
   */
  _parse(str) {
    let [tag, status, data, text] = str.split(" ");
    return { tag, status, data, text };
  }

  /**
   * The data event handler.
   * @param {TCPSocketEvent} event - The data event.
   */
  _onData = async event => {
    let stringPayload = MailStringUtils.uint8ArrayToByteString(
      new Uint8Array(event.data)
    );
    this._logger.debug(`S: ${stringPayload}`);
    let res = ImapResponse.parse(stringPayload);
    this._logger.debug("Parsed:", res);
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
  };

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

    this._socket.send(
      MailStringUtils.byteStringToUint8Array(str + "\r\n").buffer
    );
  }

  /**
   * Same as _send, but prepend a tag to the command.
   */
  _sendTagged(str, suppressLogging) {
    this._send(`${this._getNextTag()} ${str}`, suppressLogging);
  }

  /**
   * Get the next command tag.
   * @returns {number}
   */
  _getNextTag() {
    this._tag = (this._tag + 1) % 100;
    return this._tag;
  }

  /**
   * Handle the capability response.
   * @param {ImapResponse} res - Response received from the server.
   * @returns {number}
   */
  _actionCapabilityResponse = res => {
    this._actionAuth();
  };

  /**
   * Init authentication depending on server capabilities and user prefs.
   */
  _actionAuth = () => {
    this._nextAction = this._actionAuthPlain;
    this._sendTagged("AUTHENTICATE PLAIN");
  };

  /**
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionAuthResponse = res => {
    this.onReady();
    // this._actionNamespace();
  };

  /**
   * The second step of PLAIN auth. Send the auth token to the server.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionAuthPlain = res => {
    this._nextAction = this._actionAuthResponse;
    // According to rfc4616#section-2, password should be BinaryString before
    // base64 encoded.
    let password = MailStringUtils.uint8ArrayToByteString(
      new TextEncoder().encode(this._authenticator.getPassword())
    );
    this._send(
      btoa("\0" + this._authenticator.username + "\0" + password),
      true
    );
  };

  /**
   * Handle SELECT response.
   */
  _actionSelectResponse(res) {
    this._supportedFlags = res.flags;
    this._actionAfterSelectFolder();
  }

  /**
   * Send UID FETCH request to the server.
   */
  _actionUidFetch() {
    this._nextAction = this._actionUidFetchResponse;
    this._sendTagged("UID FETCH 1:* (FLAGS)");
  }

  /**
   * Handle UID FETCH response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionUidFetchResponse(res) {
    let outFolderInfo = {};
    this._folder.getDBFolderInfoAndDB(outFolderInfo);
    let highestUid = outFolderInfo.value.getUint32Property(
      "highestRecordedUID",
      0
    );
    let latestUid = res.messages.reduce(
      (maxUid, msg) => Math.max(maxUid, msg.attributes.UID),
      0
    );
    this._nextAction = this._actionUidFetchBodyResponse;
    if (latestUid > highestUid) {
      this._sendTagged(
        `UID FETCH ${highestUid +
          1}:${latestUid} (UID RFC822.SIZE FLAGS BODY.PEEK[])`
      );
    } else {
      this._actionDone();
    }
  }

  /**
   * Handle UID FETCH BODY response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionUidFetchBodyResponse(res) {
    this._msgSink = this._folder.QueryInterface(Ci.nsIImapMessageSink);
    this._folderSink = this._folder.QueryInterface(Ci.nsIImapMailFolderSink);
    for (let msg of res.messages) {
      this._folderSink.StartMessage(this.runningUrl);
      let hdrXferInfo = {
        numHeaders: 1,
        getHeader() {
          return {
            msgUid: msg.attributes.UID,
            msgSize: msg.attributes.body.length,
            get msgHdrs() {
              let sepIndex = msg.attributes.body.indexOf("\r\n\r\n");
              return msg.attributes.body.slice(0, sepIndex + 2);
            },
          };
        },
      };
      this._folderSink.parseMsgHdrs(this, hdrXferInfo);
      this._msgSink.parseAdoptedMsgLine(
        msg.attributes.body,
        msg.attributes.UID,
        this.runningUrl
      );
      this._msgSink.normalEndMsgWriteStream(
        msg.attributes.UID,
        true,
        this.runningUrl,
        msg.attributes.body.length
      );
      this._folderSink.EndMessage(this.runningUrl, msg.attributes.UID);
    }
    this._actionDone();
  }

  /**
   * Finish a request and do necessary cleanup.
   */
  _actionDone = (status = Cr.NS_OK) => {
    this._logger.debug(`Done with status=${status}`);
    this._urlListener.OnStopRunningUrl(this.runningUrl, Cr.NS_OK);
  };
}
