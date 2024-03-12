/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

import { CommonUtils } from "resource://services-common/utils.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { LineReader } from "resource:///modules/LineReader.sys.mjs";
import { NntpNewsGroup } from "resource:///modules/NntpNewsGroup.sys.mjs";

// Server response code.
const AUTH_ACCEPTED = 281;
const AUTH_PASSWORD_REQUIRED = 381;
const AUTH_REQUIRED = 480;
const AUTH_FAILED = 481;
const SERVICE_UNAVAILABLE = 502;
const NOT_SUPPORTED = 503;
const XPAT_OK = 221;

const NNTP_ERROR_MESSAGE = -304;

/**
 * A structure to represent a response received from the server. A response can
 * be a single status line of a multi-line data block.
 *
 * @typedef {object} NntpResponse
 * @property {number} status - The status code of the response.
 * @property {string} statusText - The status line of the response excluding the
 *   status code.
 * @property {string} data - The part of a multi-line data block excluding the
 *   status line.
 */

/**
 * A class to interact with NNTP server.
 */
export class NntpClient {
  /**
   * @param {nsINntpIncomingServer} server - The associated server instance.
   * @param {string} uri - The server uri.
   */
  constructor(server) {
    this._server = server;
    this._lineReader = new LineReader();

    this._reset();
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
      var { NntpAuthenticator } = ChromeUtils.importESModule(
        "resource:///modules/MailAuthenticator.sys.mjs"
      );
      this._nntpAuthenticator = new NntpAuthenticator(this._server);
    }
    return this._nntpAuthenticator;
  }

  /**
   * Reset some internal states to be safely reused.
   */
  _reset() {
    this.onOpen = () => {};
    this.onError = () => {};
    this.onData = () => {};
    this.onDone = () => {};

    this.runningUri = null;
    this.urlListener = null;
    this._msgWindow = null;
    this._newsFolder = null;
  }

  /**
   * Initiate a connection to the server
   */
  connect() {
    this._done = false;
    if (this._socket?.readyState == "open") {
      // Reuse the connection.
      this.onOpen();
    } else {
      // Start a new connection.
      this._authenticated = false;
      const hostname = this._server.hostName.toLowerCase();
      const useSecureTransport = this._server.isSecure;
      this._logger.debug(
        `Connecting to ${useSecureTransport ? "snews" : "news"}://${hostname}:${
          this._server.port
        }`
      );
      this._socket = new TCPSocket(hostname, this._server.port, {
        binaryType: "arraybuffer",
        useSecureTransport,
      });
      this._socket.onopen = this._onOpen;
      this._socket.onerror = this._onError;
      this._showNetworkStatus(Ci.nsISocketTransport.STATUS_CONNECTING_TO);
    }
  }

  /**
   * Construct an nsIMsgMailNewsUrl instance, setup urlListener to notify when
   * the current request is finished.
   *
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {nsIMsgMailNewsUrl} [runningUrl] - The url to run, if provided.
   * @returns {nsIMsgMailNewsUrl}
   */
  startRunningUrl(urlListener, msgWindow, runningUri) {
    this.urlListener = urlListener;
    this._msgWindow = msgWindow;
    this.runningUri = runningUri;
    if (!this.runningUri) {
      this.runningUri = Services.io
        .newURI(`news://${this._server.hostName}:${this._server.port}`)
        .QueryInterface(Ci.nsIMsgMailNewsUrl);
    }
    if (msgWindow) {
      this.runningUri.msgWindow = msgWindow;
    }
    this.urlListener?.OnStartRunningUrl(this.runningUri, Cr.NS_OK);
    this.runningUri.SetUrlState(true, Cr.NS_OK);
    return this.runningUri;
  }

  /**
   * The open event handler.
   */
  _onOpen = () => {
    this._logger.debug("Connected");
    this._socket.ondata = this._onData;
    this._socket.onclose = this._onClose;
    this._inReadingMode = false;
    this._currentGroupName = null;
    this._nextAction = ({ status }) => {
      if ([200, 201].includes(status)) {
        this._nextAction = null;
        this.onOpen();
      } else {
        this.quit(Cr.NS_ERROR_FAILURE);
      }
    };
    this._showNetworkStatus(Ci.nsISocketTransport.STATUS_CONNECTED_TO);
  };

  /**
   * The data event handler.
   *
   * @param {TCPSocketEvent} event - The data event.
   */
  _onData = event => {
    const stringPayload = CommonUtils.arrayBufferToByteString(
      new Uint8Array(event.data)
    );
    this._logger.debug(`S: ${stringPayload}`);

    const res = this._parse(stringPayload);
    switch (res.status) {
      case AUTH_REQUIRED:
        this._currentGroupName = null;
        this._actionAuthUser();
        return;
      case SERVICE_UNAVAILABLE:
        this._actionError(NNTP_ERROR_MESSAGE, res.statusText);
        return;
      default:
        if (res.status == AUTH_FAILED) {
          this._logger.error(
            `Got an error id=${res.status}, the server said: ${res.statusText}`
          );
        } else if (res.status >= 400 && res.status < 500) {
          if (this._messageId || this._articleNumber) {
            let uri = `about:newserror?r=${res.statusText}`;

            if (this._messageId) {
              uri += `&m=${encodeURIComponent(this._messageId)}`;
            } else {
              const msgId = this._newsFolder?.getMessageIdForKey(
                this._articleNumber
              );
              if (msgId) {
                uri += `&m=${encodeURIComponent(msgId)}`;
              }
              uri += `&k=${this._articleNumber}`;
            }
            if (this._newsFolder) {
              uri += `&f=${this._newsFolder.URI}`;
            }
            // Store the uri to display. The registered uriListener will get
            // notified when we stop running the uri, and can act on this data.
            this.runningUri.seeOtherURI = uri;
          }
          this._actionError(NNTP_ERROR_MESSAGE, res.statusText);
          return;
        }
    }

    try {
      this._nextAction?.(res);
    } catch (e) {
      this._logger.error(`Failed to process server response ${res}.`, e);
      this._actionDone(Cr.NS_ERROR_FAILURE);
    }
  };

  /**
   * The error event handler.
   *
   * @param {TCPSocketErrorEvent} event - The error event.
   */
  _onError = event => {
    this._logger.error(event, event.name, event.message, event.errorCode);
    let errorName;
    let uri;
    switch (event.errorCode) {
      case Cr.NS_ERROR_UNKNOWN_HOST:
      case Cr.NS_ERROR_UNKNOWN_PROXY_HOST:
        errorName = "unknownHostError";
        uri = "about:neterror?e=dnsNotFound";
        break;
      case Cr.NS_ERROR_CONNECTION_REFUSED:
        errorName = "connectionRefusedError";
        uri = "about:neterror?e=connectionFailure";
        break;
      case Cr.NS_ERROR_PROXY_CONNECTION_REFUSED:
        errorName = "connectionRefusedError";
        uri = "about:neterror?e=proxyConnectFailure";
        break;
      case Cr.NS_ERROR_NET_TIMEOUT:
        errorName = "netTimeoutError";
        uri = "about:neterror?e=netTimeout";
        break;
      case Cr.NS_ERROR_NET_RESET:
        errorName = "netResetError";
        uri = "about:neterror?e=netReset";
        break;
      case Cr.NS_ERROR_NET_INTERRUPT:
        errorName = "netInterruptError";
        uri = "about:neterror?e=netInterrupt";
        break;
    }
    if (errorName && uri) {
      const bundle = Services.strings.createBundle(
        "chrome://messenger/locale/messenger.properties"
      );
      const errorMessage = bundle.formatStringFromName(errorName, [
        this._server.hostName,
      ]);
      MailServices.mailSession.alertUser(errorMessage, this.runningUri);

      // If we were going to display an article, instead show an error page.
      if (this.runningUri) {
        this.runningUri.seeOtherURI = uri;
      }
    }

    this._msgWindow?.statusFeedback?.showStatusString("");
    this.quit(event.errorCode);
  };

  /**
   * The close event handler.
   */
  _onClose = () => {
    this._logger.debug("Connection closed.");
  };

  /**
   * Parse the server response.
   *
   * @param {string} str - Response received from the server.
   * @returns {NntpResponse}
   */
  _parse(str) {
    if (this._lineReader.receivingMultiLineResponse) {
      // When receiving multi-line response, no parsing should happen.
      return { data: str };
    }
    const matches = /^(\d{3}) (.+)\r\n([^]*)/.exec(str);
    if (matches) {
      const [, status, statusText, data] = matches;
      return { status: Number(status), statusText, data };
    }
    return { data: str };
  }

  /**
   * Send a command to the socket.
   *
   * @param {string} str - The command string to send.
   * @param {boolean} [suppressLogging=false] - Whether to suppress logging the str.
   */
  _sendCommand(str, suppressLogging) {
    if (this._socket.readyState != "open") {
      if (str != "QUIT") {
        this._logger.warn(
          `Failed to send "${str}" because socket state is ${this._socket.readyState}`
        );
      }
      return;
    }
    if (suppressLogging && AppConstants.MOZ_UPDATE_CHANNEL != "default") {
      this._logger.debug(
        "C: Logging suppressed (it probably contained auth information)"
      );
    } else {
      // Do not suppress for non-release builds, so that debugging auth problems
      // is easier.
      this._logger.debug(`C: ${str}`);
    }
    this.send(str + "\r\n");
  }

  /**
   * Send a string to the socket.
   *
   * @param {string} str - The string to send.
   */
  send(str) {
    this._socket.send(CommonUtils.byteStringToArrayBuffer(str).buffer);
  }

  /**
   * Send a LIST or NEWGROUPS command to get groups in the current server.
   *
   * @param {boolean} getOnlyNew - List only new groups.
   */
  getListOfGroups(getOnlyNew) {
    if (!getOnlyNew) {
      this._actionModeReader(this._actionList);
    } else {
      this._actionModeReader(this._actionNewgroups);
    }
    this.urlListener = this._server.QueryInterface(Ci.nsIUrlListener);
  }

  /**
   * Get new articles.
   *
   * @param {string} groupName - The group to get new articles.
   * @param {boolean} getOld - Get old articles as well.
   */
  getNewNews(groupName, getOld) {
    this._currentGroupName = null;
    this._newsFolder = this._getNewsFolder(groupName);
    this._newsGroup = new NntpNewsGroup(this._server, this._newsFolder);
    this._newsGroup.getOldMessages = getOld;
    this._nextGroupName = this._newsFolder.rawName;
    this.runningUri.updatingFolder = true;
    this._firstGroupCommand = this._actionXOver;
    this._actionModeReader(this._actionGroup);
  }

  /**
   * Get a single article by group name and article number.
   *
   * @param {string} groupName - The group name.
   * @param {integer} articleNumber - The article number.
   */
  getArticleByArticleNumber(groupName, articleNumber) {
    this._newsFolder = this._server.rootFolder.getChildNamed(groupName);
    this._nextGroupName = this._getNextGroupName(groupName);
    this._articleNumber = articleNumber;
    this._messageId = "";
    this._firstGroupCommand = this._actionArticle;
    this._actionModeReader(this._actionGroup);
  }

  /**
   * Get a single article by the message id.
   *
   * @param {string} messageId - The message id.
   */
  getArticleByMessageId(messageId) {
    this._messageId = `<${messageId}>`;
    this._articleNumber = 0;
    this._actionModeReader(this._actionArticle);
  }

  /**
   * Send a `Control: cancel <msg-id>` message to cancel an article, not every
   * server supports it, see rfc5537.
   *
   * @param {string} groupName - The group name.
   */
  cancelArticle(groupName) {
    this._nextGroupName = this._getNextGroupName(groupName);
    this._firstGroupCommand = this.post;
    this._actionModeReader(this._actionGroup);
  }

  /**
   * Send a `XPAT <header> <message-id> <pattern>` message, not every server
   * supports it, see rfc2980.
   *
   * @param {string} groupName - The group name.
   * @param {string[]} xpatLines - An array of xpat lines to send.
   */
  search(groupName, xpatLines) {
    this._nextGroupName = this._getNextGroupName(groupName);
    this._xpatLines = xpatLines;
    this._firstGroupCommand = this._actionXPat;
    this._actionModeReader(this._actionGroup);
  }

  /**
   * Load a news uri directly, see rfc5538 about supported news uri.
   *
   * @param {string} uri - The news uri to load.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {nsIStreamListener} streamListener - The listener for the request.
   */
  loadNewsUrl(uri, msgWindow, streamListener) {
    this._logger.debug(`Loading ${uri}`);
    const url = new URL(uri);
    const path = url.pathname.slice(1);
    let action;
    if (path == "*") {
      action = () => this.getListOfGroups();
    } else if (path.includes("@")) {
      action = () => this.getArticleByMessageId(path);
    } else {
      this._newsFolder = this._getNewsFolder(path);
      this._newsGroup = new NntpNewsGroup(this._server, this._newsFolder);
      this._nextGroupName = this._newsFolder.rawName;
      action = () => this._actionModeReader(this._actionGroup);
    }
    if (!action) {
      return;
    }
    this._msgWindow = msgWindow;
    const pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    const inputStream = pipe.inputStream;
    const outputStream = pipe.outputStream;
    this.onOpen = () => {
      streamListener.onStartRequest(null, Cr.NS_OK);
      action();
    };
    this.onData = data => {
      outputStream.write(data, data.length);
      streamListener.onDataAvailable(null, inputStream, 0, data.length);
    };
    this.onDone = status => {
      streamListener.onStopRequest(null, status);
    };
  }

  /**
   * Send LISTGROUP request to the server.
   *
   * @param {string} groupName - The group to request.
   */
  listgroup(groupName) {
    this._actionModeReader(() => {
      this._nextAction = this._actionListgroupResponse;
      this._sendCommand(`LISTGROUP ${groupName}`);
    });
  }

  /**
   * Send `POST` request to the server.
   */
  post() {
    const action = () => {
      this._nextAction = this._actionHandlePost;
      this._sendCommand("POST");
    };
    if (this._server.pushAuth && !this._authenticated) {
      this._currentAction = action;
      this._actionAuthUser();
    } else {
      action();
    }
  }

  /**
   * Send `QUIT` request to the server.
   */
  quit(status = Cr.NS_OK) {
    this._sendCommand("QUIT");
    this._nextAction = this.close;
    this.close();
    this._actionDone(status);
  }

  /**
   * Close the socket.
   */
  close() {
    this._socket.close();
  }

  /**
   * Get the news folder corresponding to a group name.
   *
   * @param {string} groupName - The group name.
   * @returns {nsIMsgNewsFolder}
   */
  _getNewsFolder(groupName) {
    return this._server.rootFolder
      .getChildNamed(groupName)
      .QueryInterface(Ci.nsIMsgNewsFolder);
  }

  /**
   * Given a UTF-8 group name, return the underlying group name used by the server.
   *
   * @param {string} groupName - The UTF-8 group name.
   * @returns {BinaryString} - The group name that can be sent to the server.
   */
  _getNextGroupName(groupName) {
    return this._getNewsFolder(groupName).rawName;
  }

  /**
   * Send `MODE READER` request to the server.
   */
  _actionModeReader(nextAction) {
    if (this._inReadingMode) {
      nextAction();
    } else {
      this._currentAction = () => {
        this._inReadingMode = false;
        this._actionModeReader(nextAction);
      };
      this._sendCommand("MODE READER");
      this._inReadingMode = true;
      this._nextAction = () => {
        if (this._server.pushAuth && !this._authenticated) {
          this._currentAction = nextAction;
          this._actionAuthUser();
        } else {
          nextAction();
        }
      };
    }
  }

  /**
   * Send `LIST` request to the server.
   */
  _actionList = () => {
    this._sendCommand("LIST");
    this._currentAction = this._actionList;
    this._nextAction = this._actionReadData;
  };

  /**
   * Send `NEWGROUPS` request to the server.
   * @see rfc3977#section-7.3
   */
  _actionNewgroups = () => {
    const days = Services.prefs.getIntPref("news.newgroups_for_num_days", 180);
    const dateTime = new Date(Date.now() - 86400000 * days)
      .toISOString()
      .replace(
        /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}).*/,
        "$1$2$3 $4$5$6"
      );
    this._sendCommand("NEWGROUPS " + dateTime + " GMT");
    this._currentAction = this._actionNewgroups;
    this._nextAction = this._actionReadData;
  };

  /**
   * Send `GROUP` request to the server.
   */
  _actionGroup = () => {
    this._firstGroupCommand = this._firstGroupCommand || this._actionXOver;
    if (this._nextGroupName == this._currentGroupName) {
      this._firstGroupCommand();
    } else {
      this._sendCommand(`GROUP ${this._nextGroupName}`);
      this._currentAction = this._actionGroup;
      this._currentGroupName = this._nextGroupName;
      this._nextAction = this._actionGroupResponse;
    }
  };

  /**
   * Handle GROUP response.
   *
   * @param {NntpResponse} res - GROUP response received from the server.
   */
  _actionGroupResponse = res => {
    if (res.status == 411) {
      this._server.groupNotFound(null, this._currentGroupName, true);
      return;
    }
    this._firstGroupCommand(res);
  };

  /**
   * Consume the status line of LISTGROUP response.
   */
  _actionListgroupResponse = res => {
    this._nextAction = this._actionListgroupDataResponse;
    if (res.data) {
      this._actionListgroupDataResponse(res);
    }
  };

  /**
   * Consume the multi-line data of LISTGROUP response.
   *
   * @param {NntpResponse} res - The server response.
   */
  _actionListgroupDataResponse = ({ data }) => {
    this._lineReader.read(
      data,
      line => {
        this.onData(line);
      },
      () => {
        this._actionDone();
      }
    );
  };

  /**
   * Send `XOVER` request to the server.
   */
  _actionXOver = res => {
    const [count, low, high] = res.statusText.split(" ");
    this._newsFolder.updateSummaryFromNNTPInfo(low, high, count);
    const [start, end] = this._newsGroup.getArticlesRangeToFetch(
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
  };

  /**
   * A transient action to consume the status line of XOVER response.
   *
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionXOverResponse(res) {
    if (res.status == 224) {
      this._nextAction = this._actionReadXOver;
      this._newsGroup.addKnownArticles(this._startArticle, this._endArticle);
      this._actionReadXOver(res);
    } else {
      // Somehow XOVER is not supported by the server, fallback to use HEAD to
      // fetch one by one.
      this._actionHead();
    }
  }

  /**
   * Handle XOVER response.
   *
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionReadXOver({ data }) {
    this._lineReader.read(
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
   *
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionXHdrResponse({ status, data }) {
    if (status == NOT_SUPPORTED) {
      // Fallback to HEAD request.
      this._actionHead();
      return;
    }

    this._lineReader.read(
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
  _actionHead = () => {
    if (this._startArticle <= this._endArticle) {
      this._nextAction = this._actionReadHead;
      this._sendCommand(`HEAD ${this._startArticle}`);
      this._newsGroup.initHdr(this._startArticle);
      this._startArticle++;
    } else {
      this._newsGroup.finishProcessingXOver();
      this._actionDone();
    }
  };

  /**
   * Handle HEAD response.
   *
   * @param {NntpResponse} res - XOVER response received from the server.
   */
  _actionReadHead({ data }) {
    this._lineReader.read(
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
   * @see {@link https://www.rfc-editor.org/rfc/rfc3977#section-6.2.1|RFC 3977 §6.2.1}
   */
  _actionArticle = () => {
    this._sendCommand(`ARTICLE ${this._articleNumber || this._messageId}`);
    this._nextAction = this._actionArticleResponse;
    this._newsFolder?.notifyDownloadBegin(this._articleNumber);
    this._downloadingToFolder = true;
  };

  /**
   * Handle `ARTICLE` response.
   *
   * @param {NntpResponse} res - ARTICLE response received from the server.
   */
  _actionArticleResponse = ({ data }) => {
    const lineSeparator = AppConstants.platform == "win" ? "\r\n" : "\n";

    this._lineReader.read(
      data,
      line => {
        // NewsFolder will decide whether to save it to the offline storage.
        this._newsFolder?.notifyDownloadedLine(
          line.slice(0, -2) + lineSeparator
        );
        this.onData(line);
      },
      () => {
        this._newsFolder?.notifyDownloadEnd(Cr.NS_OK);
        this._downloadingToFolder = false;
        this._actionDone();
      }
    );
  };

  /**
   * Handle multi-line data blocks response, e.g. ARTICLE/LIST response. Emit
   * each line through onData.
   *
   * @param {NntpResponse} res - Response received from the server.
   */
  _actionReadData({ data }) {
    this._lineReader.read(data, this.onData, this._actionDone);
  }

  /**
   * Handle POST response.
   *
   * @param {NntpResponse} res - POST response received from the server.
   */
  _actionHandlePost({ status, statusText }) {
    if (status == 340) {
      this.onReadyToPost();
    } else if (status == 240) {
      this._actionDone();
    } else {
      this._actionError(NNTP_ERROR_MESSAGE, statusText);
    }
  }

  /**
   * Send `AUTHINFO user <name>` to the server.
   *
   * @param {boolean} [forcePrompt=false] - Whether to force showing an auth prompt.
   */
  _actionAuthUser(forcePrompt = false) {
    if (!this._newsFolder) {
      this._newsFolder = this._server.rootFolder.QueryInterface(
        Ci.nsIMsgNewsFolder
      );
    }
    if (!this._newsFolder.groupUsername) {
      const gotPassword = this._newsFolder.getAuthenticationCredentials(
        this._msgWindow,
        true,
        forcePrompt
      );
      if (!gotPassword) {
        this._actionDone(Cr.NS_ERROR_ABORT);
        return;
      }
    }
    this._sendCommand(`AUTHINFO user ${this._newsFolder.groupUsername}`, true);
    this._nextAction = this._actionAuthResult;
    this._authenticator.username = this._newsFolder.groupUsername;
  }

  /**
   * Send `AUTHINFO pass <password>` to the server.
   */
  _actionAuthPassword() {
    this._sendCommand(`AUTHINFO pass ${this._newsFolder.groupPassword}`, true);
    this._nextAction = this._actionAuthResult;
  }

  /**
   * Decide the next step according to the auth response.
   *
   * @param {NntpResponse} res - Auth response received from the server.
   */
  _actionAuthResult({ status }) {
    switch (status) {
      case AUTH_ACCEPTED:
        this._authenticated = true;
        this._currentAction?.();
        return;
      case AUTH_PASSWORD_REQUIRED:
        this._actionAuthPassword();
        return;
      case AUTH_FAILED: {
        const action = this._authenticator.promptAuthFailed(this._msgWindow);
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
  }

  /**
   * Send `XPAT <header> <message-id> <pattern>` to the server.
   */
  _actionXPat = () => {
    const xptLine = this._xpatLines.shift();
    if (!xptLine) {
      this._actionDone();
      return;
    }
    this._sendCommand(xptLine);
    this._nextAction = this._actionXPatResponse;
  };

  /**
   * Handle XPAT response.
   *
   * @param {NntpResponse} res - XPAT response received from the server.
   */
  _actionXPatResponse({ status, statusText, data }) {
    if (status && status != XPAT_OK) {
      this._actionError(NNTP_ERROR_MESSAGE, statusText);
      return;
    }
    this._lineReader.read(data, this.onData, this._actionXPat);
  }

  /**
   * Show network status in the status bar.
   *
   * @param {number} status - See NS_NET_STATUS_* in nsISocketTransport.idl.
   */
  _showNetworkStatus(status) {
    const statusMessage = Services.strings.formatStatusMessage(
      status,
      this._server.hostName
    );
    this._msgWindow?.statusFeedback?.showStatusString(statusMessage);
  }

  /**
   * Show an error prompt.
   *
   * @param {number} errorId - An error name corresponds to an entry of
   *   news.properties.
   * @param {string} serverErrorMsg - Error message returned by the server.
   */
  _actionError(errorId, serverErrorMsg) {
    this._logger.error(
      `Got an error id=${errorId}, the server said: ${serverErrorMsg}`
    );
    const msgWindow = this._msgWindow;

    if (!msgWindow) {
      this._actionDone(Cr.NS_ERROR_FAILURE);
      return;
    }
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/news.properties"
    );
    let errorMsg = bundle.GetStringFromID(errorId);
    if (serverErrorMsg) {
      errorMsg += " " + serverErrorMsg;
    }
    Services.prompt.alert(msgWindow?.domWindow, null, errorMsg);

    this._actionDone(Cr.NS_ERROR_FAILURE);
  }

  /**
   * Close the connection and do necessary cleanup.
   */
  _actionDone = (status = Cr.NS_OK) => {
    if (this._done) {
      return;
    }
    if (this._downloadingToFolder) {
      // If we're in the middle of sending a message to the folder, make sure
      // the folder knows we're aborting.
      this._newsFolder?.notifyDownloadEnd(Cr.NS_ERROR_FAILURE);
      this._downloadingToFolder = false;
    }
    this._done = true;
    this._logger.debug(`Done with status=${status}`);
    this.onDone(status);
    this._newsGroup?.cleanUp();
    this._newsFolder?.OnStopRunningUrl?.(this.runningUri, status);
    this.urlListener?.OnStopRunningUrl(this.runningUri, status);
    this.runningUri.SetUrlState(false, status);
    this._reset();
    this.onIdle?.();
  };
}
