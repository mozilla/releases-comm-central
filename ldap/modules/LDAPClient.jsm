/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LDAPClient"];
var { BindRequest, SearchRequest, LDAPResponse } = ChromeUtils.import(
  "resource:///modules/LDAPMessage.jsm"
);

class LDAPClient {
  /**
   * @param {string} url - The LDAP server url.
   * @param {number} port - The LDAP server port.
   */
  constructor(url, port) {
    this.onOpen = () => {};
    this.onError = () => {};

    this._url = url;
    this._port = port;

    this._messageId = 1;
    this._callbackMap = new Map();

    this._logger = console.createInstance({
      prefix: "mailnews.ldap",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mailnews.ldap.loglevel",
    });
  }

  connect() {
    this._socket = new TCPSocket(this._url, this._port, {
      binaryType: "arraybuffer",
    });
    this._socket.onopen = this._onOpen;
    this._socket.onerror = this._onError;
  }

  /**
   * Send a bind request to the server.
   * @param {string} dn - The name to bind.
   * @param {string} password - The password.
   * @param {Function} callback - Callback function when receiving BindResponse.
   */
  bind(dn = "", password = "", callback) {
    this._logger.debug(`Binding ${dn}`);
    let req = new BindRequest(dn, password);
    this._send(req, callback);
  }

  /**
   * Send a search request to the server.
   * @param {string} dn - The name to search.
   * @param {Function} callback - Callback function when receiving search responses.
   */
  search(dn, callback) {
    this._logger.debug(`Searching ${dn}`);
    let req = new SearchRequest(dn);
    this._send(req, callback);
  }

  /**
   * The open event handler.
   */
  _onOpen = () => {
    this._logger.debug("Connected");
    this._socket.ondata = this._onData;
    this._socket.onclose = this._onClose;
    this.onOpen();
  };

  /**
   * The data event handler.
   * @param {TCPSocketEvent} event - The data event.
   */
  _onData = event => {
    let data = event.data;
    // The payload can contain multiple messages, parse it to the end.
    while (data.byteLength) {
      let res = LDAPResponse.fromBER(data);
      this._logger.debug(`S: [${res.messageId}] ${res.constructor.name}`);
      let callback = this._callbackMap.get(res.messageId);
      if (callback) {
        callback(res);
        if (
          !["SearchResultEntry", "SearchResultReference"].includes(
            res.constructor.name
          )
        ) {
          this._callbackMap.delete(res.messageId);
        }
      }
      data = data.slice(res.byteLength);
    }
  };

  /**
   * The close event handler.
   */
  _onClose = () => {
    this._logger.debug("Connection closed");
  };

  /**
   * The error event handler.
   * @param {TCPSocketErrorEvent} event - The error event.
   */
  _onError = event => {
    this._logger.error(event);
    this.onError();
  };

  /**
   * Send a message to the server.
   * @param {LDAPMessage} msg - The message to send.
   * @param {Function} callback - Callback function when receiving server responses.
   */
  _send(msg, callback) {
    if (callback) {
      this._callbackMap.set(this._messageId, callback);
    }
    this._logger.debug(`C: [${this._messageId}] ${msg.constructor.name}`);
    this._socket.send(msg.toBER(this._messageId++));
  }
}
