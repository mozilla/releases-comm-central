/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LDAPClient"];
var {
  AbandonRequest,
  BindRequest,
  SearchRequest,
  LDAPResponse,
} = ChromeUtils.import("resource:///modules/LDAPMessage.jsm");

class LDAPClient {
  /**
   * @param {string} host - The LDAP server host.
   * @param {number} port - The LDAP server port.
   * @param {boolean} useSecureTransport - Whether to use TLS connection.
   */
  constructor(host, port, useSecureTransport) {
    this.onOpen = () => {};
    this.onError = () => {};

    this._host = host;
    this._port = port;
    this._useSecureTransport = useSecureTransport;

    this._messageId = 1;
    this._callbackMap = new Map();

    this._logger = console.createInstance({
      prefix: "mailnews.ldap",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mailnews.ldap.loglevel",
    });
  }

  connect() {
    this._logger.debug(
      `Connecting to ${this._useSecureTransport ? "ldaps" : "ldap"}://${
        this._host
      }:${this._port}`
    );
    this._socket = new TCPSocket(this._host, this._port, {
      binaryType: "arraybuffer",
      useSecureTransport: this._useSecureTransport,
    });
    this._socket.onopen = this._onOpen;
    this._socket.onerror = this._onError;
  }

  /**
   * Send a simple bind request to the server.
   * @param {string} dn - The name to bind.
   * @param {string} password - The password.
   * @param {Function} callback - Callback function when receiving BindResponse.
   * @returns {number} The id of the sent request.
   */
  bind(dn, password, callback) {
    this._logger.debug(`Binding ${dn}`);
    let req = new BindRequest(dn || "", password || "");
    return this._send(req, callback);
  }

  /**
   * Send a SASL bind request to the server.
   * @param {string} service - The service host name to bind.
   * @param {string} mechanism - The SASL mechanism to use, e.g. GSSAPI.
   * @param {string} authModuleType - The auth module type, @see nsIMailAuthModule.
   * @param {string} serverCredentials - The challenge token returned from the
   *   server, or emtpy string for the first request, must be used to generate a
   *   new request token.
   * @param {Function} callback - Callback function when receiving BindResponse.
   * @returns {number} The id of the sent request.
   */
  saslBind(service, mechanism, authModuleType, serverCredentials, callback) {
    this._logger.debug(`Binding ${service} using ${mechanism}`);
    if (!this._authModule || this._authModuleType != authModuleType) {
      this._authModuleType = authModuleType;
      this._authModule = Cc["@mozilla.org/mail/auth-module;1"].createInstance(
        Ci.nsIMailAuthModule
      );
      this._authModule.init(
        authModuleType,
        service,
        0, // nsIAuthModule::REQ_DEFAULT
        null, // domain
        null, // username
        null // password
      );
    }
    let credentials = this._authModule.getNextToken(serverCredentials);
    let req = new BindRequest("", "", { mechanism, credentials });
    return this._send(req, callback);
  }

  /**
   * Send a search request to the server.
   * @param {string} dn - The name to search.
   * @param {number} scope - The scope to search.
   * @param {string} filter - The filter string.
   * @param {string} attributes - Attributes to include in the search result.
   * @param {number} timeout - The seconds to wait.
   * @param {number} limit - Maximum number of entries to return.
   * @param {Function} callback - Callback function when receiving search responses.
   * @returns {number} The id of the sent request.
   */
  search(dn, scope, filter, attributes, timeout, limit, callback) {
    this._logger.debug(`Searching ${dn}`);
    let req = new SearchRequest(dn, scope, filter, attributes, timeout, limit);
    return this._send(req, callback);
  }

  /**
   * Send an abandon request to the server.
   * @param {number} messageId - The id of the message to abandon.
   */
  abandon(messageId) {
    this._logger.debug(`Abandoning ${messageId}`);
    this._callbackMap.delete(messageId);
    let req = new AbandonRequest(messageId);
    this._send(req);
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
    if (this._buffer) {
      // Concatenate left over data from the last event with the new data.
      let arr = new Uint8Array(this._buffer.byteLength + data.byteLength);
      arr.set(new Uint8Array(this._buffer));
      arr.set(new Uint8Array(data), this._buffer.byteLength);
      data = arr.buffer;
      this._buffer = null;
    }
    // The payload can contain multiple messages, parse it to the end.
    while (data.byteLength) {
      let res;
      try {
        res = LDAPResponse.fromBER(data);
        if (typeof res == "number") {
          data = data.slice(res);
          continue;
        }
      } catch (e) {
        if (e.result == Cr.NS_ERROR_CANNOT_CONVERT_DATA) {
          // The remaining data doesn't form a valid LDAP message, save it for
          // the next round.
          this._buffer = data;
          return;
        }
        throw e;
      }
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
   * @returns {number} The id of the sent message.
   */
  _send(msg, callback) {
    if (callback) {
      this._callbackMap.set(this._messageId, callback);
    }
    this._logger.debug(`C: [${this._messageId}] ${msg.constructor.name}`);
    this._socket.send(msg.toBER(this._messageId));
    return this._messageId++;
  }
}
