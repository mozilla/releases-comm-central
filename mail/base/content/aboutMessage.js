/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals Enigmail, MailE10SUtils */

// mailCommon.js
/* globals commandController, dbViewWrapperListener */
/* globals gDBView: true, gFolder: true, gViewWrapper: true */

// msgHdrView.js
/* globals AdjustHeaderView ClearPendingReadTimer
   HideMessageHeaderPane OnLoadMsgHeaderPane OnTagsChange
   OnUnloadMsgHeaderPane */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  DownloadPaths: "resource://gre/modules/DownloadPaths.sys.mjs",
  TreeSelection: "chrome://messenger/content/tree-selection.mjs",
});

XPCOMUtils.defineLazyModuleGetters(this, {
  DBViewWrapper: "resource:///modules/DBViewWrapper.jsm",
  NetUtil: "resource://gre/modules/NetUtil.jsm",
});

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

var gMessage, gMessageURI;
var autodetectCharset;

function getMessagePaneBrowser() {
  return document.getElementById("messagepane");
}

function ReloadMessage() {
  if (!gMessageURI) {
    return;
  }
  displayMessage(gMessageURI, gViewWrapper);
}

function MailSetCharacterSet() {
  let messageService = MailServices.messageServiceFromURI(gMessageURI);
  gMessage = messageService.messageURIToMsgHdr(gMessageURI);
  messageService.DisplayMessage(
    gMessageURI,
    getMessagePaneBrowser().docShell,
    null,
    null,
    true,
    {}
  );
  autodetectCharset = true;
}

window.addEventListener("DOMContentLoaded", event => {
  if (event.target != document) {
    return;
  }

  OnLoadMsgHeaderPane();

  Enigmail.msg.messengerStartup();
  Enigmail.hdrView.hdrViewLoad();

  MailServices.mailSession.AddFolderListener(
    folderListener,
    Ci.nsIFolderListener.removed
  );

  preferenceObserver.init();

  window.dispatchEvent(
    new CustomEvent("aboutMessageLoaded", { bubbles: true })
  );
});

window.addEventListener("unload", () => {
  ClearPendingReadTimer();
  OnUnloadMsgHeaderPane();
  MailServices.mailSession.RemoveFolderListener(folderListener);
  preferenceObserver.cleanUp();
  gViewWrapper?.close();
});

window.addEventListener("keypress", event => {
  // These keypresses are implemented here to aid the development process.
  // It's likely they won't remain here in future.
  switch (event.key) {
    case "F5":
      location.reload();
      break;
  }
});

function displayMessage(uri, viewWrapper) {
  // Clean up existing objects before starting again.
  ClearPendingReadTimer();
  gMessage = null;
  if (gViewWrapper && viewWrapper != gViewWrapper) {
    // Don't clean up gViewWrapper if we're going to reuse it.
    gViewWrapper?.close();
    gViewWrapper = null;
  }
  gDBView = null;

  gMessageURI = uri;

  if (!uri) {
    HideMessageHeaderPane();
    MailE10SUtils.loadAboutBlank(getMessagePaneBrowser());
    window.dispatchEvent(
      new CustomEvent("messageURIChanged", { bubbles: true, detail: uri })
    );
    return;
  }

  let messageService = MailServices.messageServiceFromURI(uri);
  gMessage = messageService.messageURIToMsgHdr(uri);
  gFolder = gMessage.folder;

  messageHistory.push(uri);

  if (gFolder) {
    if (viewWrapper) {
      if (viewWrapper != gViewWrapper) {
        gViewWrapper = viewWrapper.clone(dbViewWrapperListener);
      }
    } else {
      gViewWrapper = new DBViewWrapper(dbViewWrapperListener);
      gViewWrapper._viewFlags = Ci.nsMsgViewFlagsType.kThreadedDisplay;
      gViewWrapper.open(gFolder);
    }
  } else {
    gViewWrapper = new DBViewWrapper(dbViewWrapperListener);
    gViewWrapper.openSearchView();
  }
  gDBView = gViewWrapper.dbView;
  let selection = (gDBView.selection = new TreeSelection());
  selection.view = gDBView;
  selection.select(gDBView.findIndexOfMsgHdr(gMessage, true));
  gDBView?.setJSTree({
    QueryInterface: ChromeUtils.generateQI(["nsIMsgJSTree"]),
    _inBatch: false,
    beginUpdateBatch() {
      this._inBatch = true;
    },
    endUpdateBatch() {
      this._inBatch = false;
    },
    ensureRowIsVisible(index) {},
    invalidate() {},
    invalidateRange(startIndex, endIndex) {},
    rowCountChanged(index, count) {
      // HACK ALERT: If we're here, and the calling function appears to be
      // `DBViewWrapper._deleteCompleted` (actually `nsMsgDBView`), this is
      // the second time we're notified about the row count changing. We don't
      // want to adjust the selection twice, or it'll be wrong.
      if (
        !this._inBatch &&
        parent?.location.href != "about:3pane" &&
        gDBView.selection &&
        Components.stack.caller?.name != "_deleteCompleted"
      ) {
        gDBView.selection.selectEventsSuppressed = true;
        gDBView.selection.adjustSelection(index, count);
        gDBView.selection.selectEventsSuppressed = false;
      }
    },
  });

  if (gMessage.flags & Ci.nsMsgMessageFlags.HasRe) {
    document.title = `Re: ${gMessage.mime2DecodedSubject || ""}`;
  } else {
    document.title = gMessage.mime2DecodedSubject;
  }

  let browser = getMessagePaneBrowser();
  MailE10SUtils.changeRemoteness(browser, null);
  browser.docShell.allowAuth = false;
  browser.docShell.allowDNSPrefetch = false;

  try {
    messageService.DisplayMessage(uri, browser.docShell, null, null, null, {});
  } catch (ex) {
    if (ex.result != Cr.NS_ERROR_OFFLINE) {
      throw ex;
    }

    // TODO: This should be replaced with a real page, and made not ugly.
    let title = messengerBundle.GetStringFromName("nocachedbodytitle");
    // This string includes some HTML! Get rid of it.
    title = title.replace(/<\/?title>/gi, "");
    let body = messengerBundle.GetStringFromName("nocachedbodybody2");
    HideMessageHeaderPane();
    MailE10SUtils.loadURI(
      getMessagePaneBrowser(),
      "data:text/html;base64," +
        btoa(
          `<!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8" />
            <title>${title}</title>
          </head>
          <body>
            <h1>${title}</h1>
            <p>${body}</p>
          </body>
        </html>`
        )
    );
  }
  autodetectCharset = false;

  window.dispatchEvent(
    new CustomEvent("messageURIChanged", { bubbles: true, detail: uri })
  );
}

var folderListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),

  onFolderRemoved(parentFolder, childFolder) {},
  onMessageRemoved(parentFolder, msg) {
    // Close the tab or window if the displayed message is deleted.
    if (
      parent.location.href != "about:3pane" &&
      Services.prefs.getBoolPref("mail.close_message_window.on_delete") &&
      msg == gMessage
    ) {
      let topWindow = window.browsingContext.topChromeWindow;
      let tabmail = topWindow.document.getElementById("tabmail");
      if (tabmail) {
        tabmail.closeTab(window.tabOrWindow);
      } else {
        topWindow.close();
      }
      return;
    }
    messageHistory.onMessageRemoved(parentFolder, msg);
  },
};

var preferenceObserver = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  _topics: [
    "mail.inline_attachments",
    "mail.show_headers",
    "mail.showCondensedAddresses",
    "mailnews.display.disallow_mime_handlers",
    "mailnews.display.html_as",
    "mailnews.display.prefer_plaintext",
    "mailnews.headers.showReferences",
    "rss.show.summary",
  ],

  _reloadTimeout: null,

  init() {
    for (let topic of this._topics) {
      Services.prefs.addObserver(topic, this);
    }
  },

  cleanUp() {
    for (let topic of this._topics) {
      Services.prefs.removeObserver(topic, this);
    }
  },

  observe(subject, topic, data) {
    if (data == "mail.show_headers") {
      AdjustHeaderView(Services.prefs.getIntPref(data));
    }
    if (!this._reloadTimeout) {
      // Clear the event queue before reloading the message. Several prefs may
      // be changed at once.
      this._reloadTimeout = setTimeout(() => {
        this._reloadTimeout = null;
        ReloadMessage();
      });
    }
  },
};

var messageHistory = {
  MAX_HISTORY_SIZE: 20,
  /**
   * @typedef {object} MessageHistoryEntry
   * @property {string} messageURI - URI of the message for this entry.
   * @property {string} folderURI - URI of the folder for this entry.
   */
  /**
   * @type {MessageHistoryEntry[]}
   */
  _history: [],
  _currentIndex: -1,
  /**
   * Remove the message from the history, cleaning up the state as needed in
   * the process.
   *
   * @param {nsIMsgFolder} parentFolder
   * @param {nsIMsgDBHdr} message
   */
  onMessageRemoved(parentFolder, message) {
    if (!this._history.length) {
      return;
    }
    const messageURI = parentFolder.generateMessageURI(message.messageKey);
    const folderURI = parentFolder.URI;
    const oldLength = this._history.length;
    let removedEntriesBeforeFuture = 0;
    this._history = this._history.filter((entry, index) => {
      const keepEntry =
        entry.messageURI !== messageURI || entry.folderURI !== folderURI;
      if (!keepEntry && index <= this._currentIndex) {
        ++removedEntriesBeforeFuture;
      }
      return keepEntry;
    });
    this._currentIndex -= removedEntriesBeforeFuture;
    // Correct for first entry getting removed while it's the current entry.
    if (this._history.length && this._currentIndex == -1) {
      this._currentIndex = 0;
    }
    if (oldLength === this._history.length) {
      return;
    }
    window.top.goUpdateCommand("cmd_goBack");
    window.top.goUpdateCommand("cmd_goForward");
  },
  /**
   * Get the actual index in the history based on a delta from the current
   * index.
   *
   * @param {number} delta - Relative delta from the current index. Forward is
   *   positive, backward is negative.
   * @returns {number} Absolute index in the history, bounded to the history
   *   size.
   */
  _getAbsoluteIndex(delta) {
    return Math.min(
      Math.max(this._currentIndex + delta, 0),
      this._history.length - 1
    );
  },
  /**
   * Add a message to the end of the history. Does nothing if the message is
   * already the current item. Moves the history forward by one step if the next
   * item already matches the given message. Else removes any "future" history
   * if the current position isn't the newest entry in the history.
   *
   * If the history is growing larger than what we want to keep, it is trimmed.
   *
   * Assumes the view is currently in the folder that should be comitted to
   * history.
   *
   * @param {string} messageURI - Message to add to the history.
   */
  push(messageURI) {
    if (!messageURI) {
      return;
    }
    let currentItem = this._history[this._currentIndex];
    let currentFolder = gFolder?.URI;
    if (
      currentItem &&
      messageURI === currentItem.messageURI &&
      currentFolder === currentItem.folderURI
    ) {
      return;
    }
    let nextMessageIndex = this._currentIndex + 1;
    let erasedFuture = false;
    if (nextMessageIndex < this._history.length) {
      let nextMessage = this._history[nextMessageIndex];
      if (
        nextMessage &&
        messageURI === nextMessage.messageURI &&
        currentFolder === nextMessage.folderURI
      ) {
        this._currentIndex = nextMessageIndex;
        if (this._currentIndex === 1) {
          window.top.goUpdateCommand("cmd_goBack");
        }
        if (this._currentIndex + 1 === this._history.length) {
          window.top.goUpdateCommand("cmd_goForward");
        }
        return;
      }
      this._history.splice(nextMessageIndex, Infinity);
      erasedFuture = true;
    }
    this._history.push({ messageURI, folderURI: currentFolder });
    this._currentIndex = nextMessageIndex;
    if (this._history.length > this.MAX_HISTORY_SIZE) {
      let amountOfItemsToRemove = this._history.length - this.MAX_HISTORY_SIZE;
      this._history.splice(0, amountOfItemsToRemove);
      this._currentIndex -= amountOfItemsToRemove;
    }
    if (!currentItem || this._currentIndex === 0) {
      window.top.goUpdateCommand("cmd_goBack");
    }
    if (erasedFuture) {
      window.top.goUpdateCommand("cmd_goForward");
    }
  },
  /**
   * Go forward or back in history relative to the current position.
   *
   * @param {number} delta
   * @returns {?MessageHistoryEntry} The message and folder URI that are now at
   *   the active position in the history. If null is returned, no action was
   *   taken.
   */
  pop(delta) {
    let targetIndex = this._getAbsoluteIndex(delta);
    if (this._currentIndex == targetIndex && gMessage) {
      return null;
    }
    this._currentIndex = targetIndex;
    window.top.goUpdateCommand("cmd_goBack");
    window.top.goUpdateCommand("cmd_goForward");
    return this._history[targetIndex];
  },
  /**
   * Get the current state of the message history.
   *
   * @returns {{entries: MessageHistoryEntry[], currentIndex: number}}
   *   A list of message and folder URIs as strings and the current index in the
   *   entries.
   */
  getHistory() {
    return { entries: this._history.slice(), currentIndex: this._currentIndex };
  },
  /**
   * Get a specific history entry relative to the current positon.
   *
   * @param {number} delta - Relative index to get the value of.
   * @returns {?MessageHistoryEntry} If found, the message and
   *   folder URI at the given position.
   */
  getMessageAt(delta) {
    if (!this._history.length) {
      return null;
    }
    return this._history[this._getAbsoluteIndex(delta)];
  },
  /**
   * Check if going forward or back in the history by the given steps is
   * possible. A special case is when no message is currently selected, going
   * back to relative position 0 (so the current index) is possible.
   *
   * @param {number} delta - Relative position to go to from the current index.
   * @returns {boolean} If there is a target available at that position in the
   *   current history.
   */
  canPop(delta) {
    let resultIndex = this._currentIndex + delta;
    return (
      resultIndex >= 0 &&
      resultIndex < this._history.length &&
      (resultIndex !== this._currentIndex || !gMessage)
    );
  },
  /**
   * Clear the message history, resetting it to its initial empty state.
   */
  clear() {
    this._history.length = 0;
    this._currentIndex = -1;
    window.top.goUpdateCommand("cmd_goBack");
    window.top.goUpdateCommand("cmd_goForward");
  },
};

commandController.registerCallback("cmd_find", () =>
  document.getElementById("FindToolbar").onFindCommand()
);
commandController.registerCallback("cmd_findAgain", () =>
  document.getElementById("FindToolbar").onFindAgainCommand(false)
);
commandController.registerCallback("cmd_findPrevious", () =>
  document.getElementById("FindToolbar").onFindAgainCommand(true)
);

commandController.registerCallback("cmd_print", () => {
  top.PrintUtils.startPrintWindow(getMessagePaneBrowser().browsingContext, {});
});
