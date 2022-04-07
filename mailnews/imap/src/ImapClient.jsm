/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapClient"];

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);
var { ImapAuthenticator } = ChromeUtils.import(
  "resource:///modules/MailAuthenticator.jsm"
);

/**
 * A structure to represent a response received from the server.
 * @typedef {Object} ImapResponse
 * @property {string} tag - Can be "*", "+" or client tag.
 * @property {string} status - Can be "OK", "NO" or "BAD".
 * @property {string} statusData - The third part of the status line.
 * @property {string} statusText - The fourth part of the status line.
 */

/**
 * A class to interact with IMAP server.
 */
class ImapClient {
  _logger = console.createInstance({
    prefix: "mailnews.imap",
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
    this._logger.debug(`Select ${folder.name}`);
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
    let tag = this._getNextTag();
    this._send(`${tag} AUTHENTICATE PLAIN`);
  };

  /**
   * The second step of PLAIN auth. Send the auth token to the server.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionAuthPlain = res => {
    this._nextAction = null;
    // According to rfc4616#section-2, password should be BinaryString before
    // base64 encoded.
    let password = MailStringUtils.uint8ArrayToByteString(
      new TextEncoder().encode(this._authenticator.getPassword())
    );
    this._send(btoa("\0" + this._authenticator.username + "\0" + password));
  };

  /**
   * Close the connection and do necessary cleanup.
   */
  _actionDone = (status = Cr.NS_OK) => {
    this._logger.debug(`Done with status=${status}`);
  };
}
