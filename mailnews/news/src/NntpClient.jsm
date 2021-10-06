/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpClient"];

var { CommonUtils } = ChromeUtils.import("resource://services-common/utils.js");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { NntpNewsGroup } = ChromeUtils.import(
  "resource:///modules/NntpNewsGroup.jsm"
);

// Server response code.
const AUTH_ACCEPTED = 281;
const AUTH_PASSWORD_REQUIRED = 381;
const AUTH_REQUIRED = 480;
const AUTH_FAILED = 481;
const SERVICE_UNAVAILABLE = 502;
const NOT_SUPPORTED = 503;

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
  constructor(server) {
    this.onOpen = () => {};
    this.onError = () => {};
    this.onData = () => {};
    this.onDone = () => {};

    this._server = server;

    let uri = `news://${this._server.realHostName}:${this._server.port}`;
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
   * @type {NntpAuthenticator} - An authentication helper.
   */
  get _authenticator() {
    if (!this._nntpAuthenticator) {
      var { NntpAuthenticator } = ChromeUtils.import(
        "resource:///modules/MailAuthenticator.jsm"
      );
      this._nntpAuthenticator = new NntpAuthenticator(this._server);
    }
    return this._nntpAuthenticator;
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
    this.runningUri.SetUrlState(true, Cr.NS_OK);
    this._nextAction = ({ status }) => {
      if (status == 200) {
        this._nextAction = null;
        this.onOpen();
      }
    };
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

    switch (res.status) {
      case AUTH_REQUIRED:
        this._actionAuthUser();
        return;
      case SERVICE_UNAVAILABLE:
        this._actionDone();
        return;
    }

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
    this._actionModeReader(this._actionList);
    this._urlListener = this._server.QueryInterface(Ci.nsIUrlListener);
  }

  /**
   * Get new articles.
   * @param {boolean} getOld - Get old articles as well.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   */
  getNewNews(groupName, newsGroup, urlListener, msgWindow) {
    this._groupName = groupName;
    this._newsGroup = newsGroup;
    this._newsFolder = this._server.findGroup(groupName);
    this._urlListener = urlListener;
    this._msgWindow = msgWindow;
    this.runningUri.updatingFolder = true;
    this._actionModeReader(this._actionGroup);
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
    this._actionModeReader(this._actionGroup);
    this._firstCommand = this._actionArticle;
  }

  /**
   * Get a single article by the message id.
   * @param {string} messageId - The message id.
   */
  getArticleByMessageId(messageId) {
    this._articleNumber = `<${messageId}>`;
    this._actionModeReader(this._actionArticle);
  }

  /**
   * Send a `Control: cancel <msg-id>` message to cancel an article, not every
   * server supports it, see rfc5537.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {string} groupName - The group name.
   */
  cancelArticle(urlListener, groupName) {
    this._urlListener = urlListener;
    this._groupName = groupName;
    this._firstCommand = this.post;
    this._actionModeReader(this._actionGroup);
  }

  /**
   * Send a `XPAT <header> <message-id> <pattern>` message, not every server
   * supports it, see rfc2980.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {string} groupName - The group name.
   * @param {string[]} xpatLines - An array of xpat lines to send.
   */
  search(urlListener, groupName, xpatLines) {
    this._urlListener = urlListener;
    this._groupName = groupName;
    this._xpatLines = xpatLines;
    this._firstCommand = this._actionXPat;
    this._actionModeReader(this._actionGroup);
  }

  /**
   * Load a news uri directly, see rfc5538 about supported news uri.
   * @param {string} uir - The news uri to load.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {nsIStreamListener} streamListener - The listener for the request.
   */
  loadNewsUrl(uri, msgWindow, streamListener) {
    this._logger.debug(`Loading ${uri}`);
    let url = new URL(uri);
    let path = url.pathname.slice(1);
    let action;
    if (path == "*") {
      action = () => this.getListOfGroups();
    } else if (path.includes("@")) {
      action = () => this.getArticleByMessageId(path);
    } else {
      this._groupName = path;
      this._newsGroup = new NntpNewsGroup(this._server, this._groupName);
      this._newsFolder = this._server.findGroup(this._groupName);
      action = () => this._actionModeReader(this._actionGroup);
    }
    if (!action) {
      return;
    }
    this._msgWindow = msgWindow;
    let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    let inputStream = pipe.inputStream;
    let outputStream = pipe.outputStream;
    this.connect();
    this.onOpen = () => {
      streamListener.onStartRequest(null, Cr.NS_OK);
      action();
    };
    this.onData = data => {
      outputStream.write(data, data.length);
      streamListener.onDataAvailable(null, inputStream, 0, data.length);
    };
    this.onDone = () => {
      streamListener.onStopRequest(null, Cr.NS_OK);
    };
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
  _actionModeReader(nextAction) {
    this._sendCommand("MODE READER");
    this._nextAction = nextAction;
  }

  /**
   * Send `LIST` request to the server.
   */
  _actionList() {
    this._sendCommand("LIST");
    this._currentAction = this._actionList;
    this._nextAction = this._actionReadData;
  }

  /**
   * Send `GROUP` request to the server.
   */
  _actionGroup() {
    this._sendCommand(`GROUP ${this._groupName}`);
    this._currentAction = this._actionGroup;
    this._nextAction = this._firstCommand || this._actionXOver;
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
      this._startArticle = start;
      this._endArticle = end;
      this._nextAction = this._actionXOverResponse;
      this._sendCommand(`XOVER ${start}-${end}`);
    } else {
      this._actionDone();
    }
  }

  /**
   * A transient action to consume the status line of XOVER response.
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionXOverResponse(res) {
    if (res.status == 224) {
      this._nextAction = this._actionReadXOver;
      this._actionReadXOver(res);
    } else {
      // Somehow XOVER is not supported by the server, fallback to use HEAD to
      // fetch one by one.
      this._actionHead();
    }
  }

  /**
   * Handle XOVER response.
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionReadXOver({ data }) {
    this._lineReader(
      data,
      line => {
        this._newsGroup.processXOverLine(line);
      },
      () => {
        // Fetch extra headers used by filters, but not returned in XOVER response.
        this._xhdrFields = this._newsGroup.getXHdrFields();
        this._actionXHdr();
      }
    );
  }

  /**
   * Send `XHDR` request to the server.
   */
  _actionXHdr = () => {
    this._curXHdrHeader = this._xhdrFields.shift();
    if (this._curXHdrHeader) {
      this._nextAction = this._actionXHdrResponse;
      this._sendCommand(
        `XHDR ${this._curXHdrHeader} ${this._startArticle}-${this._endArticle}`
      );
    } else {
      this._newsGroup.finishProcessingXOver();
      this._actionDone();
    }
  };

  /**
   * Handle XHDR response.
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionXHdrResponse({ status, data }) {
    if (status == NOT_SUPPORTED) {
      // Fallback to HEAD request.
      this._actionHead();
      return;
    }

    this._lineReader(
      data,
      line => {
        this._newsGroup.processXHdrLine(this._curXHdrHeader, line);
      },
      this._actionXHdr
    );
  }

  /**
   * Send `HEAD` request to the server.
   */
  _actionHead() {
    if (this._startArticle <= this._endArticle) {
      this._nextAction = this._actionReadHead;
      this._sendCommand(`HEAD ${this._startArticle}`);
      this._newsGroup.initHdr(this._startArticle);
      this._startArticle++;
    } else {
      this._newsGroup.finishProcessingXOver();
      this._actionDone();
    }
  }

  /**
   * Handle HEAD response.
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionReadHead({ data }) {
    this._lineReader(
      data,
      line => {
        this._newsGroup.processHeadLine(line);
      },
      () => {
        this._newsGroup.initHdr(-1);
        this._actionHead();
      }
    );
  }

  /**
   * Send `ARTICLE` request to the server.
   */
  _actionArticle() {
    this._sendCommand(`ARTICLE ${this._articleNumber}`);
    this._nextAction = this._actionReadData;
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
   * Handle multi-line data blocks response, e.g. ARTICLE/LIST response. Emit
   * each line through onData.
   * @param {NntpResponse} res - Response received from the server.
   */
  _actionReadData({ data }) {
    this._lineReader(data, this.onData, this._actionDone);
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
   * Send `AUTHINFO user <name>` to the server.
   * @param {boolean} [forcePrompt=false] - Whether to force showing an auth prompt.
   */
  _actionAuthUser(forcePrompt = false) {
    if (!this._newsFolder) {
      this._newsFolder = this._server.rootFolder.QueryInterface(
        Ci.nsIMsgNewsFolder
      );
    }
    if (!this._newsFolder.groupUsername) {
      this._newsFolder.getAuthenticationCredentials(
        this._msgWindow,
        true,
        forcePrompt
      );
    }
    this._sendCommand(`AUTHINFO user ${this._newsFolder.groupUsername}`);
    this._nextAction = this._actionAuthResult;
  }

  /**
   * Send `AUTHINFO pass <password>` to the server.
   */
  _actionAuthPassword() {
    this._sendCommand(`AUTHINFO pass ${this._newsFolder.groupPassword}`);
    this._nextAction = this._actionAuthResult;
  }

  /**
   * Decide the next step according to the auth response.
   * @param {NntpResponse} res - Auth response received from the server.
   */
  _actionAuthResult({ status }) {
    switch (status) {
      case AUTH_ACCEPTED:
        this._currentAction?.();
        return;
      case AUTH_PASSWORD_REQUIRED:
        this._actionAuthPassword();
        return;
      case AUTH_FAILED:
        let action = this._authenticator.promptAuthFailed();
        if (action == 1) {
          // Cancel button pressed.
          this._actionDone();
          return;
        }
        if (action == 2) {
          // 'New password' button pressed.
          this._newsFolder.forgetAuthenticationCredentials();
        }
        // Retry.
        this._actionAuthUser();
    }
  }

  /**
   * Send `XPAT <header> <message-id> <pattern>` to the server.
   */
  _actionXPat = () => {
    let xptLine = this._xpatLines.shift();
    if (!xptLine) {
      this._actionDone();
      return;
    }
    this._sendCommand(xptLine);
    this._nextAction = this._actionXPatResponse;
  };

  /**
   * Handle XPAT response.
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionXPatResponse({ data }) {
    this._lineReader(data, this.onData, this._actionXPat);
  }

  /**
   * Close the connection and do necessary cleanup.
   */
  _actionDone = () => {
    this.onDone();
    this._newsGroup?.cleanUp();
    this._newsFolder?.OnStopRunningUrl?.(this.runningUri, 0);
    this._urlListener?.OnStopRunningUrl(this.runningUri, 0);
    this.runningUri.SetUrlState(false, Cr.NS_OK);
    this._socket.close();
    this._nextAction = null;
  };
}
