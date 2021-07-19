/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpClient"];

var { CommonUtils } = ChromeUtils.import("resource://services-common/utils.js");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { NntpNewsGroup } = ChromeUtils.import(
  "resource:///modules/NntpNewsGroup.jsm"
);

/**
 * A structure to represent a response received from the server. A response can
 * be a single status line of a multi-line data block.
 * @typedef {Object} NntpResponse
 * @property {number} status - The status code of the response.
 * @property {string} statusText - The status line of the response excluding the
 *   status code.
 * @property {string} data - The part of a multi-line data block excluding the
 *   status line.
 */

/**
 * A class to interact with NNTP server.
 */
class NntpClient {
  /**
   * @param {nsINntpIncomingServer} server - The associated server instance.
   * @param {string} uri - The server uri.
   */
  constructor(server, uri) {
    this.onOpen = () => {};
    this.onError = () => {};

    this._server = server;
    let matches = /.+:\/\/(.+)\/(.+)/.exec(uri);
    this._host = matches[1];
    this._groupName = matches[2];
    this._newsFolder = this._server.findGroup(this._groupName);
    this._newsGroup = new NntpNewsGroup(this._server, this._groupName);
    this.runningUri = Services.io
      .newURI(uri)
      .QueryInterface(Ci.nsIMsgMailNewsUrl);

    this._logger = console.createInstance({
      prefix: "mailnews.nntp",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mailnews.nntp.loglevel",
    });
  }

  /**
   * Initiate a connection to the server
   */
  connect() {
    this._urlListener?.OnStartRunningUrl(this.runningUri);
    let port = this._server.port;
    let useSecureTransport = this._server.isSecure;
    this._logger.debug(
      `Connecting to ${useSecureTransport ? "snews" : "news"}://${
        this._host
      }:${port}`
    );
    this._socket = new TCPSocket(this._host, port, {
      binaryType: "arraybuffer",
      useSecureTransport,
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
    this.onOpen();
  };

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
    this._logger.error(event);
  };

  /**
   * The close event handler.
   */
  _onClose = () => {
    this._logger.debug("Connection closed.");
  };

  /**
   * Parse the server response.
   * @param {string} str - Response received from the server.
   * @returns {NntpResponse}
   */
  _parse(str) {
    let matches = /^(\d{3}) (.+)\r\n([^]*)/.exec(str);
    if (matches) {
      let [, status, statusText, data] = matches;
      return { status: Number(status), statusText, data };
    }
    return { data: str };
  }

  /**
   * Send a string to the socket.
   * @param {string} str - The string to send.
   */
  _sendString(str) {
    this._logger.debug(`C: ${str}`);
    this._socket.send(CommonUtils.byteStringToArrayBuffer(str + "\r\n").buffer);
  }

  /**
   * Get new articles.
   * @param {boolean} getOld - Get old articles as well.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   */
  getNewNews(getOld, urlListener, msgWindow) {
    this._newsGroup.getOldMessages = getOld;
    this._urlListener = urlListener;
    this._msgWindow = msgWindow;
    this.runningUri.updatingFolder = true;
    this._nextAction = this._actionModeReader;
  }

  /**
   * Send `MODE READER` request to the server.
   */
  _actionModeReader() {
    this._sendString("MODE READER");
    this._nextAction = this._actionGroup;
  }

  /**
   * Send `GROUP` request to the server.
   */
  _actionGroup() {
    this._sendString(`GROUP ${this._groupName}`);
    this._nextAction = this._actionXOver;
  }

  /**
   * Send `XOVER` request to the server.
   */
  _actionXOver(res) {
    let [count, low, high] = res.statusText.split(" ");
    this._newsFolder.updateSummaryFromNNTPInfo(low, high, count);
    let [start, end] = this._newsGroup.getArticlesRangeToFetch(
      this._msgWindow,
      Number(low),
      Number(high)
    );
    if (start && end) {
      this._sendString(`XOVER ${start}-${end}`);
      this._nextAction = this._actionXOverResponse;
    } else {
      this._actionDone();
    }
  }

  /**
   * A transient action to consume the status line of XOVER response.
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionXOverResponse(res) {
    this._actionReadXOver(res);
    this._nextAction = this._actionReadXOver;
  }

  /**
   * Handle XOVER response.
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionReadXOver({ data }) {
    // XOVER response can span multiple ondata events, an event's leftover data
    // is saved in this._xoverData.
    if (this._xoverData) {
      data = this._xoverData + data;
      this._xoverData = null;
    }
    while (data) {
      let index = data.indexOf("\r\n");
      if (index == -1) {
        // Not enough data, save it for the next round.
        this._xoverData = data;
        break;
      }
      if (data == ".\r\n") {
        // Finished reading XOVER response.
        this._newsGroup.finishProcessingXOver();
        this._actionDone();
        break;
      }
      this._newsGroup.processXOverLine(data.slice(0, index));
      data = data.slice(index + 2);
    }
  }

  /**
   * Close the connection and do necessary cleanup.
   */
  _actionDone() {
    this._newsGroup.cleanUp();
    this._newsFolder.OnStopRunningUrl(this.runningUri, 0);
    this._urlListener?.OnStopRunningUrl(this.runningUri, 0);
    this._socket.close();
    this._nextAction = null;
  }
}
