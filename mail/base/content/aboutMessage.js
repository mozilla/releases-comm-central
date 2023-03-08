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

  // The folder listener only does something interesting if this is a
  // standalone window or tab, so don't add it if we're inside about:3pane.
  if (window.browsingContext.parent.currentURI.spec != "about:3pane") {
    MailServices.mailSession.AddFolderListener(
      folderListener,
      Ci.nsIFolderListener.removed
    );
  }

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
        Components.stack.caller.name != "_deleteCompleted"
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
    }
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
