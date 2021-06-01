/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LDAPClient"];
var { BindRequest, LDAPResponse } = ChromeUtils.import(
  "resource:///modules/LDAPMessage.jsm"
);

class LDAPClient {
  constructor(url, port) {
    this._socket = new TCPSocket(url, port, {
      binaryType: "arraybuffer",
    });
    this._socket.onopen = this._onOpen;
    this._socket.onerror = this._onError;

    this._messageId = 1;

    this._logger = console.createInstance({
      prefix: "mailnews.ldap",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mailnews.ldap.loglevel",
    });
  }

  /**
   * Send a bind request to the server.
   * @param {string} dn - The name to bind.
   * @param {string} password - The password.
   */
  bind(dn, password) {
    this._logger.debug(`Binding ${dn}`);
    let req = new BindRequest(dn, password);
    this._send(req);
  }

  /**
   * The open event handler.
   */
  _onOpen = () => {
    this._logger.debug("Connected");
    this._socket.ondata = this._onData;
    this._socket.onclose = this._onClose;
  };

  /**
   * The data event handler.
   * @param {TCPSocketEvent} event - The data event.
   */
  _onData = event => {
    let res = LDAPResponse.fromBER(event.data);
    this._logger.debug(res.constructor.name, res);
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
  };

  /**
   * Send a message to the server.
   * @param {LDAPMessage} msg - The message to send.
   */
  _send(msg) {
    this._socket.send(msg.toBER(this._messageId++));
  }
}
