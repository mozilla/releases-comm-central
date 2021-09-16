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
    this.onData = () => {};
    this.onDone = () => {};

    this._server = server;

    // TODO: NntpClient should not manipulate folder/group directly, use the
    // onData callback instead.
    // The uri is in the form of
    // - news://news.mozilla.org/mozilla.accessibility
    if (uri) {
      let matches = /.+:\/\/([^:]+):?(\d+)?\/(.+)?/.exec(uri);
      this._host = matches[1];
      this._port = matches[2] || this._server.port;
      this._groupName = matches[3];
      this._newsFolder = this._server.findGroup(this._groupName);
      this._newsGroup = new NntpNewsGroup(this._server, this._groupName);
    } else {
      uri = server.serverURI;
    }

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
    let useSecureTransport = this._server.isSecure;
    this._logger.debug(
      `Connecting to ${useSecureTransport ? "snews" : "news"}://${
        this._server.realHostName
      }:${this._server.port}`
    );
    this._socket = new TCPSocket(this._server.realHostName, this._server.port, {
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
    this._logger.error(event, event.name, event.message, event.errorCode);
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
   * Send a command to the socket.
   * @param {string} str - The command string to send.
   */
  _sendCommand(str) {
    this.send(str + "\r\n");
  }

  /**
   * Send a string to the socket.
   * @param {string} str - The string to send.
   */
  send(str) {
    this._logger.debug(`C: ${str}`);
    this._socket.send(CommonUtils.byteStringToArrayBuffer(str).buffer);
  }

  /**
   * Send a single dot line to end the data block.
   */
  sendEnd() {
    this.send("\r\n.\r\n");
    this._nextAction = this._actionDone;
  }

  /**
   * Send a LIST command to get all the groups in the current server.
   */
  getListOfGroups() {
    this._sendCommand("LIST");
    this._nextAction = this._actionReadData;
    this._urlListener = this._server.QueryInterface(Ci.nsIUrlListener);
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
    this._firstCommand = this._actionXOver;
  }

  /**
   * Get a single article by group name and article number.
   * @param {string} groupName - The group name.
   * @param {string} articleNumber - The article number.
   */
  getArticleByArticleNumber(groupName, articleNumber) {
    this._groupName = groupName;
    this._articleNumber = articleNumber;
    this._nextAction = this._actionModeReader;
    this._firstCommand = this._actionArticle;
  }

  /**
   * Get a single article by the message id.
   * @param {string} messageId - The message id.
   */
  getArticleByMessageId(messageId) {
    this._articleNumber = `<${messageId}>`;
    this._nextAction = this._actionArticle;
  }

  /**
   * Send `POST` request to the server.
   */
  post() {
    this._sendCommand("POST");
    this._nextAction = this._actionHandlePost;
  }

  /**
   * Send `MODE READER` request to the server.
   */
  _actionModeReader() {
    this._sendCommand("MODE READER");
    this._nextAction = this._actionGroup;
  }

  /**
   * Send `GROUP` request to the server.
   */
  _actionGroup() {
    this._sendCommand(`GROUP ${this._groupName}`);
    this._nextAction = this._firstCommand;
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
      this._sendCommand(`XOVER ${start}-${end}`);
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
   * Send `ARTICLE` request to the server.
   */
  _actionArticle() {
    this._sendCommand(`ARTICLE ${this._articleNumber}`);
    this._nextAction = this._actionReadData;
  }

  /**
   * Handle multi-line data blocks response, e.g. ARTICLE/LIST response. Emit
   * each line through onData.
   * @param {NntpResponse} res - ARTICLE response received from the server.
   */
  _actionReadData({ data }) {
    let ended = false;
    if (this._leftoverData) {
      data = this._leftoverData + data;
      this._leftoverData = null;
    }
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
      this.onData(line);
      data = data.slice(index + 2);
    }
    if (ended) {
      this._actionDone();
    }
  }

  /**
   * Handle POST response.
   * @param {NntpResponse} res - POST response received from the server.
   */
  _actionHandlePost({ status }) {
    if (status == 340) {
      this.onReadyToPost();
    }
  }

  /**
   * Close the connection and do necessary cleanup.
   */
  _actionDone() {
    this.onDone();
    this._newsGroup?.cleanUp();
    this._newsFolder?.OnStopRunningUrl(this.runningUri, 0);
    this._urlListener?.OnStopRunningUrl(this.runningUri, 0);
    this._socket.close();
    this._nextAction = null;
  }
}
