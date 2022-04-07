/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapClient"];

var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);

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
      this.onOpen();
    };
  };

  /**
   * The data event handler.
   * @param {TCPSocketEvent} event - The data event.
   */
  _onData = async event => {
    let stringPayload = MailStringUtils.uint8ArrayToByteString(
      new Uint8Array(event.data)
    );
    this._logger.debug(`S: ${stringPayload}`);
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
   * Close the connection and do necessary cleanup.
   */
  _actionDone = (status = Cr.NS_OK) => {
    this._logger.debug(`Done with status=${status}`);
  };
}
