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
}
