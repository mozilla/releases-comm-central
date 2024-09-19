/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file provides utilities useful in using Promises and Task.sys.mjs
 * with mailnews tests.
 */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * Url listener that can wrap another listener and trigger a callback.
 *
 * @param [aWrapped] The nsIUrlListener to pass all notifications through to.
 *     This gets called prior to the callback (or async resumption).
 */

export var PromiseTestUtils = {};

PromiseTestUtils.PromiseUrlListener = function (aWrapped) {
  this.wrapped = aWrapped;
  this._promise = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
};

PromiseTestUtils.PromiseUrlListener.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIUrlListener"]),

  OnStartRunningUrl(aUrl) {
    if (this.wrapped && this.wrapped.OnStartRunningUrl) {
      this.wrapped.OnStartRunningUrl(aUrl);
    }
  },
  OnStopRunningUrl(aUrl, aExitCode) {
    if (this.wrapped && this.wrapped.OnStopRunningUrl) {
      this.wrapped.OnStopRunningUrl(aUrl, aExitCode);
    }
    if (aExitCode == Cr.NS_OK) {
      this._resolve();
    } else {
      this._reject(aExitCode);
    }
  },
  get promise() {
    return this._promise;
  },
};

/**
 * Copy listener that can wrap another listener and trigger a callback.
 *
 * @param {nsIMsgCopyServiceListener} [aWrapped] - The nsIMsgCopyServiceListener
 *   to pass all notifications through to. This gets called prior to the
 *   callback (or async resumption).
 */
PromiseTestUtils.PromiseCopyListener = function (aWrapped) {
  this.wrapped = aWrapped;
  this._promise = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
  this._result = { messageKeys: [], messageIds: [] };
};

/** @implements {nsIMsgCopyServiceListener} */
PromiseTestUtils.PromiseCopyListener.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
  onStartCopy() {
    if (this.wrapped && this.wrapped.onStartCopy) {
      this.wrapped.onStartCopy();
    }
  },
  onProgress(aProgress, aProgressMax) {
    if (this.wrapped && this.wrapped.onProgress) {
      this.wrapped.onProgress(aProgress, aProgressMax);
    }
  },
  setMessageKey(aKey) {
    if (this.wrapped && this.wrapped.setMessageKey) {
      this.wrapped.setMessageKey(aKey);
    }

    this._result.messageKeys.push(aKey);
  },
  getMessageId() {
    if (this.wrapped && this.wrapped.getMessageId) {
      const mid = this.wrapped.getMessageId();
      this._result.messageIds.push(mid);
      return mid;
    }
    return null;
  },
  onStopCopy(aStatus) {
    if (this.wrapped && this.wrapped.onStopCopy) {
      this.wrapped.onStopCopy(aStatus);
    }

    if (aStatus == Cr.NS_OK) {
      this._resolve(this._result);
    } else {
      this._reject(aStatus);
    }
  },
  get promise() {
    return this._promise;
  },
};

/**
 * Request observer that can wrap another observer and be turned into a Promise.
 */
PromiseTestUtils.PromiseRequestObserver = class {
  QueryInterface = ChromeUtils.generateQI(["nsIRequestObserver"]);

  /**
   * @param {nsIRequestObserver} [wrapped] - The nsIRequestObserver to pass all
   *   notifications through to. This gets called prior to the callback (or
   *   async resumption).
   */
  constructor(wrapped) {
    this.wrapped = wrapped;
    this._promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this._resolveValue = null;
  }

  onStartRequest(aRequest) {
    if (this.wrapped && this.wrapped.onStartRequest) {
      this.wrapped.onStartRequest(aRequest);
    }
  }

  onStopRequest(aRequest, aStatusCode) {
    if (this.wrapped && this.wrapped.onStopRequest) {
      this.wrapped.onStopRequest(aRequest, aStatusCode);
    }
    if (aStatusCode == Cr.NS_OK) {
      this._resolve(this._resolveValue);
    } else {
      this._reject(aStatusCode);
    }
  }

  get promise() {
    return this._promise;
  }
};

/**
 * Stream listener that can wrap another listener and be turned into a Promise.
 */
PromiseTestUtils.PromiseStreamListener = class extends (
  PromiseTestUtils.PromiseRequestObserver
) {
  QueryInterface = ChromeUtils.generateQI(["nsIStreamListener"]);

  /**
   * @param {nsIStreamListener} [wrapped] - The nsIStreamListener to pass all
   *   notifications through to. This gets called prior to the callback (or
   *   async resumption).
   */
  constructor(wrapped) {
    super(wrapped);
    this._stream = null;
  }

  onStartRequest(aRequest) {
    super.onStartRequest(aRequest);

    this._resolveValue = "";
    this._stream = null;
  }

  onDataAvailable(aRequest, aInputStream, aOff, aCount) {
    if (this.wrapped && this.wrapped.onDataAvailable) {
      this.wrapped.onDataAvailable(aRequest, aInputStream, aOff, aCount);
    }
    if (!this._stream) {
      this._stream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      this._stream.init(aInputStream);
    }
    this._resolveValue += this._stream.read(aCount);
  }
};

/**
 * Folder listener to resolve a promise when a certain folder event occurs.
 *
 * @param {nsIMsgFolder} folder - nsIMsgFolder to listen to
 * @param {string} event - Event name to listen for. Example event is
 *    "DeleteOrMoveMsgCompleted".
 * @returns {Promise} Promise that resolves when the event occurs.
 */
PromiseTestUtils.promiseFolderEvent = function (folder, event) {
  return new Promise(resolve => {
    const folderListener = {
      QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
      onFolderEvent(aEventFolder, aEvent) {
        if (folder === aEventFolder && event == aEvent) {
          MailServices.mailSession.RemoveFolderListener(folderListener);
          resolve();
        }
      },
    };
    MailServices.mailSession.AddFolderListener(
      folderListener,
      Ci.nsIFolderListener.event
    );
  });
};

/**
 * Folder listener to resolve a promise when a certain folder event occurs.
 *
 * @param {nsIMsgFolder} folder - nsIMsgFolder to listen to.
 * @param {string} listenerMethod - string listener method to listen for.
 *   Example listener method is "msgsClassified".
 * @returns {Promise} Promise that resolves when the event occurs.
 */
PromiseTestUtils.promiseFolderNotification = function (folder, listenerMethod) {
  return new Promise(resolve => {
    const mfnListener = {};
    mfnListener[listenerMethod] = function () {
      const args = Array.from(arguments);
      let flag = true;
      for (const arg of args) {
        if (folder && arg instanceof Ci.nsIMsgFolder) {
          if (arg == folder) {
            flag = true;
            break;
          } else {
            return;
          }
        }
      }

      if (flag) {
        MailServices.mfn.removeListener(mfnListener);
        resolve(args);
      }
    };
    MailServices.mfn.addListener(
      mfnListener,
      Ci.nsIMsgFolderNotificationService[listenerMethod]
    );
  });
};

/**
 * Folder listener to resolve a promise when a folder with a certain
 * name is added.
 *
 * @param {string} folderName - folder name to listen for
 * @returns {Promise<nsIMsgFolder>} Promise that resolves with the new folder
 *   when the folder add completes.
 */
PromiseTestUtils.promiseFolderAdded = function (folderName) {
  return new Promise(resolve => {
    var listener = {
      folderAdded: aFolder => {
        if (aFolder.name == folderName) {
          MailServices.mfn.removeListener(listener);
          resolve(aFolder);
        }
      },
    };
    MailServices.mfn.addListener(
      listener,
      Ci.nsIMsgFolderNotificationService.folderAdded
    );
  });
};

/**
 * Timer to resolve a promise after a delay
 *
 * @param {integer} aDelay - Delay in milliseconds
 * @returns {Promise} Promise that resolves after the delay.
 */
PromiseTestUtils.promiseDelay = function (aDelay) {
  return new Promise(resolve => {
    const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback(resolve, aDelay, Ci.nsITimer.TYPE_ONE_SHOT);
  });
};

/**
 * Search listener to resolve a promise when a search completes
 *
 * @param {nsIMsgSearchSession} aSearchSession - The nsIMsgSearchSession to search
 * @param {nsIMsgSearchNotify} aWrapped - The nsIMsgSearchNotify to pass all
 *   notifications through to. This gets called prior to the callback
 *   (or async resumption).
 */
PromiseTestUtils.PromiseSearchNotify = function (aSearchSession, aWrapped) {
  this._searchSession = aSearchSession;
  this._searchSession.registerListener(this);
  this.wrapped = aWrapped;
  this._promise = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
};

PromiseTestUtils.PromiseSearchNotify.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgSearchNotify"]),
  onSearchHit(aHeader, aFolder) {
    if (this.wrapped && this.wrapped.onSearchHit) {
      this.wrapped.onSearchHit(aHeader, aFolder);
    }
  },
  onSearchDone(aResult) {
    this._searchSession.unregisterListener(this);
    if (this.wrapped && this.wrapped.onSearchDone) {
      this.wrapped.onSearchDone(aResult);
    }
    if (aResult == Cr.NS_OK) {
      this._resolve();
    } else {
      this._reject(aResult);
    }
  },
  onNewSearch() {
    if (this.wrapped && this.wrapped.onNewSearch) {
      this.wrapped.onNewSearch();
    }
  },
  get promise() {
    return this._promise;
  },
};

/**
 * PromiseStoreScanListener is a helper for testing scanning over all the
 * messages in a msgStore (using asyncScan()).
 * Implements a nsIStoreScanListener which collects all the messages and
 * their storeTokens, and has a promise to pause until completion (or failure).
 */
PromiseTestUtils.PromiseStoreScanListener = function () {
  // Collect messages in these arrays. Might be more sensible to have a single
  // array of objects, but that would complicate comparisons in tests. EnvDate
  // in particular will be hard to control in test - it'll usually be a
  // current timestamp.
  // So keep as separate arrays for now.
  this.messages = []; // Full raw message data collects here.
  this.tokens = []; // storeToken collects here.
  this.envAddrs = []; // envAddr collects here.
  this.envDates = []; // envDate collects here.
  this._promise = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
};

PromiseTestUtils.PromiseStoreScanListener.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIStoreScanListener"]),

  // nsIRequestObserver callbacks
  onStartRequest() {},
  onStopRequest() {},

  // nsIStreamListener callbacks
  onDataAvailable(req, stream, offset, count) {
    const ss = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream
    );
    ss.init(stream);
    const chunk = ss.read(count);
    this.messages[this.messages.length - 1] += chunk;
  },

  // nsIStoreScanListener callbacks
  onStartScan() {},
  onStartMessage(tok, envAddr, envDate) {
    this.tokens.push(tok);
    this.envAddrs.push(envAddr);
    this.envDates.push(envDate);
    this.messages.push(""); // To be filled out in onDataAvailable().
  },
  onStopScan(status) {
    if (status == Cr.NS_OK) {
      this._resolve();
    } else {
      this._reject(status);
    }
  },
  get promise() {
    return this._promise;
  },
};

/**
 * PromiseSendLaterListener is a helper for sending messages with a delay via
 * nsIMsgSendLater.
 *
 * If sending was successful, it resolves with an object that includes the
 * number of messages the service tried to send, and the number of messages it
 * successfully sent.
 *
 * @implements {nsIMsgSendLaterListener}
 */
PromiseTestUtils.PromiseSendLaterListener = class {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgSendLaterListener"]);

  constructor() {
    this._promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  onStartSending() {}
  onMessageStartSending() {}
  onMessageSendProgress() {}

  onMessageSendError(aCurrentMessage, aMessageHeader, aStatus) {
    this._reject(aStatus);
  }

  onStopSending(aStatus, aMsg, aTotalTried, aSuccessful) {
    if (aStatus != Cr.NS_OK) {
      this._reject(aStatus);
      return;
    }

    this._resolve({
      totalTried: aTotalTried,
      successful: aSuccessful,
    });
  }

  get promise() {
    return this._promise;
  }
};
