/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Pop3Client"];

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { CommonUtils } = ChromeUtils.import("resource://services-common/utils.js");
var { Pop3Authenticator } = ChromeUtils.import(
  "resource:///modules/MailAuthenticator.jsm"
);

/**
 * A structure to represent a response received from the server. A response can
 * be a single status line of a multi-line data block.
 * @typedef {Object} Pop3Response
 * @property {boolean} success - True for a positive status indicator ("+OK").
 * @property {string} statusText - The status line of the response excluding the
 *   status indicator.
 * @property {string} data - The part of a multi-line data block excluding the
 *   status line.
 */

/**
 * A class to interact with POP3 server.
 */
class Pop3Client {
  /**
   * @param {nsIPop3IncomingServer} server - The associated server instance.
   */
  constructor(server) {
    this._server = server;
    this._authenticator = new Pop3Authenticator(server);

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
  }

  /**
   * Initiate a connection to the server
   */
  connect() {
    this._logger.debug(
      `pop://${this._server.realHostName}:${this._server.port}`
    );
    this._socket = new TCPSocket(this._server.realHostName, this._server.port, {
      binaryType: "arraybuffer",
      useSecureTransport: this._server.isSecure,
    });
    this._socket.onopen = this._onOpen;
    this._socket.onerror = this._onError;
  }

  /**
   * Check and fetch new mails.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {nsIMsgFolder} folder - The folder to save the messages to.
   */
  async getMail(msgWindow, urlListener, folder) {
    this._msgWindow = msgWindow;
    this._urlListener = urlListener;
    this._sink.folder = folder;

    await this._loadStateFile();
    this._actionUidl();
  }

  /**
   * The open event handler.
   */
  _onOpen = () => {
    this._logger.debug("Connected");
    this._socket.ondata = this._onData;
    this._socket.onclose = this._onClose;
    this._nextAction = this._actionCapa;
  };

  /**
   * Parse the server response.
   * @param {string} str - Response received from the server.
   * @returns {Pop3Response}
   */
  _parse(str) {
    let matches = /^(\+OK|-ERR) ?(.*)\r\n([^]*)/.exec(str);
    if (matches) {
      let [, status, statusText, data] = matches;
      return { success: status == "+OK", statusText, data };
    }
    return { data: str };
  }

  /**
   * The data event handler.
   * @param {TCPSocketEvent} event - The data event.
   */
  _onData = event => {
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
  };

  /**
   * The close event handler.
   */
  _onClose = () => {
    this._logger.debug("Connection closed.");
  };

  _lineSeparator = AppConstants.platform == "win" ? "\r\n" : "\n";

  /**
   * Read popstate.dat into this._uidlMap.
   */
  async _loadStateFile() {
    let stateFile = this._server.localPath;
    stateFile.append("popstate.dat");
    let content = await IOUtils.readUTF8(stateFile.path);
    this._uidlMap = new Map();
    let uidlLine = false;
    for (let line of content.split(this._lineSeparator)) {
      if (!line) {
        continue;
      }
      if (uidlLine) {
        let [status, uidl, receivedAt] = line.split(" ");
        this._uidlMap.set(uidl, {
          // 'k'=KEEP, 'd'=DELETE, 'b'=TOO_BIG, 'f'=FETCH_BODY
          status,
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
  async _writeStateFile() {
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
    for (let { status, uidl, receivedAt } of this._uidlMap.values()) {
      content.push(`${status} ${uidl} ${receivedAt}`);
    }
    await IOUtils.writeUTF8(stateFile.path, content.join(this._lineSeparator));

    this._uidlMapChanged = false;
  }

  /**
   * Read multi-line data blocks response, emit each line through a callback.
   * @param {string} data - Response received from the server.
   * @param {Function} lineCallback - A line will be passed to the callback each
   *   time.
   * @param {Function} doneCallback - A function to be called when data is ended.
   */
  _lineReader(data, lineCallback, doneCallback) {
    if (this._leftoverData) {
      // For a single request, the response can span multiple ondata events.
      // Concatenate the leftover data from last event to the current data.
      data = this._leftoverData + data;
      this._leftoverData = null;
    }
    let ended = false;
    if (data == ".\r\n" || data.endsWith("\r\n.\r\n")) {
      ended = true;
      data = data.slice(0, -3);
    }
    while (data) {
      let index = data.indexOf("\r\n");
      if (index == -1) {
        // Not enough data, save it for the next round.
        this._leftoverData = data;
        break;
      }
      let line = data.slice(0, index + 2);
      if (line.startsWith("..")) {
        // Remove stuffed dot.
        line = line.slice(1);
      }
      lineCallback(line);
      data = data.slice(index + 2);
    }
    if (ended) {
      doneCallback(null);
    }
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
    this._socket.send(CommonUtils.byteStringToArrayBuffer(str + "\r\n").buffer);
  }

  /**
   * Send `CAPA` request to the server.
   */
  _actionCapa = () => {
    this._nextAction = this._actionCapaResponse;
    this._send("CAPA");
  };

  /**
   * Handle `CAPA` response.
   * @param {Pop3Response} res - CAPA response received from the server.
   */
  _actionCapaResponse = res => {
    this._actionAuth();
  };

  /**
   * Init authentication depending on server capabilities and user prefs.
   */
  _actionAuth = () => {
    this._logger.debug("Authenticating via AUTH PLAIN");
    this._nextAction = this._actionAuthResponse;
    let password = String.fromCharCode(
      ...new TextEncoder().encode(this._authenticator.getPassword())
    );
    this._send(
      "AUTH PLAIN " +
        btoa("\0" + this._authenticator.username + "\0" + password),
      true
    );
  };

  /**
   * Handle authentication response.
   * @param {Pop3Response} res - CAPA response received from the server.
   */
  _actionAuthResponse = res => {
    if (res.success) {
      this.onReady();
    }
  };

  /**
   * Send `UIDL` request to the server.
   */
  _actionUidl = () => {
    this._messages = [];
    this._nextAction = this._actionUidlResponse;
    this._send("UIDL");
  };

  /**
   * Handle `UIDL` response.
   * @param {Pop3Response} res - UIDL response received from the server.
   */
  _actionUidlResponse = ({ data }) => {
    this._lineReader(
      data,
      line => {
        let [messageNumber, messageUidl] = line.split(" ");
        messageUidl = messageUidl.trim();
        if (!this._uidlMap.has(messageUidl)) {
          // Fetch only if it's not already in _uidlMap.
          this._messages.push({ messageNumber, messageUidl });
        }
      },
      () => {
        this._actionRetr();
      }
    );
  };

  /**
   * Send `RETR` request to the server.
   */
  _actionRetr = () => {
    this._currentMessage = this._messages.shift();
    if (this._currentMessage) {
      this._nextAction = this._actionRetrResponse;
      this._send(`RETR ${this._currentMessage.messageNumber}`);
    } else {
      this._actionDone();
    }
  };

  /**
   * Handle `RETR` response.
   * @param {Pop3Response} res - UIDL response received from the server.
   */
  _actionRetrResponse = res => {
    if (res.statusText) {
      this._currentMessageSize = Number.parseInt(res.statusText);
    }
    this._sink.incorporateBegin(this._currentMessage.messageUidl, 0);
    this._lineReader(
      res.data,
      line => {
        this._sink.incorporateWrite(line, line.length);
      },
      () => {
        this._sink.incorporateComplete(
          this._msgWindow,
          this._currentMessageSize
        );
        this._uidlMap.set(this._currentMessage.messageUidl, {
          status: "k",
          uidl: this._currentMessage.messageUidl,
          receivedAt: Math.floor(Date.now() / 1000),
        });
        this._uidlMapChanged = true;
        this._actionRetr();
      }
    );
  };

  _actionDone = () => {
    this._nextAction = null;
    this._writeStateFile();
  };
}
