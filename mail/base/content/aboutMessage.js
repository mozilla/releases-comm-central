/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals Enigmail, MailE10SUtils */

// mailCommon.js
/* globals commandController, dbViewWrapperListener */

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
});

XPCOMUtils.defineLazyModuleGetters(this, {
  DBViewWrapper: "resource:///modules/DBViewWrapper.jsm",
  JSTreeSelection: "resource:///modules/JsTreeSelection.jsm",
  NetUtil: "resource://gre/modules/NetUtil.jsm",
});

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

var gFolder, gViewWrapper, gDBView, gMessage, gMessageURI;

var content;
var gFolderDisplay = {
  get displayedFolder() {
    return this.selectedMessage?.folder;
  },
  get selectedMessage() {
    return gMessage;
  },
  get selectedMessages() {
    if (gMessage) {
      return [gMessage];
    }
    return [];
  },
  get selectedMessageUris() {
    if (gMessageURI) {
      return [gMessageURI];
    }
    return [];
  },
  getCommandStatus(commandType) {
    // no view means not enabled
    if (!gViewWrapper?.dbView) {
      return false;
    }

    let enabledObj = {};
    let checkStatusObj = {};
    gViewWrapper.dbView.getCommandStatus(
      commandType,
      enabledObj,
      checkStatusObj
    );

    return enabledObj.value;
  },
  selectedMessageIsNews: false,
  selectedMessageIsFeed: false,
  view: {
    isNewsFolder: false,
  },
};

var gMessageDisplay = {
  get displayedMessage() {
    return gMessage;
  },
  get isDummy() {
    return !gFolder;
  },
  onLoadCompleted() {},
};

function getMessagePaneBrowser() {
  return content;
}

function ReloadMessage() {
  if (!gMessageURI) {
    return;
  }
  // If the current message was loaded from a file or attachment, the dbView
  // can't handle reloading it. Let's do it ourselves, instead.
  if (gMessageDisplay.isDummy) {
    displayExternalMessage(gMessageURI);
  } else {
    displayMessage(gMessageURI, gViewWrapper);
  }
}

function MailSetCharacterSet() {
  let messageService = MailServices.messageServiceFromURI(gMessageURI);
  gMessage = messageService.messageURIToMsgHdr(gMessageURI);
  messageService.DisplayMessage(
    gMessageURI,
    content.docShell,
    null,
    null,
    true,
    {}
  );
}

window.addEventListener("DOMContentLoaded", event => {
  if (event.target != document) {
    return;
  }

  content = document.querySelector("browser");
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

function displayExternalMessage(uri) {
  // This should just happen as part of displayMessage.
  gFolder = null;
  gMessageURI = uri;
  gViewWrapper = new DBViewWrapper(dbViewWrapperListener);
  gViewWrapper.openSearchView();
  gDBView = gViewWrapper.dbView;

  let messageService = MailServices.messageServiceFromURI(uri);
  messageService.DisplayMessage(uri, content.docShell, null, null, null, {});

  gMessage = top.messenger.msgHdrFromURI(uri);
}

function displayMessage(uri, viewWrapper) {
  ClearPendingReadTimer();
  gMessageURI = uri;
  if (!uri) {
    gMessage = null;
    gViewWrapper = null;
    gDBView = null;
    HideMessageHeaderPane();
    // Don't use MailE10SUtils.loadURI here, it will try to change remoteness
    // and we don't want that.
    content.loadURI("about:blank", {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    window.dispatchEvent(
      new CustomEvent("messageURIChanged", { bubbles: true, detail: uri })
    );
    return;
  }

  let messageService = MailServices.messageServiceFromURI(uri);
  gMessage = messageService.messageURIToMsgHdr(uri);

  if (gMessage) {
    if (gFolder != gMessage.folder) {
      gFolder = gMessage.folder;
    }
    if (viewWrapper) {
      gViewWrapper = viewWrapper.clone(dbViewWrapperListener);
    } else {
      gViewWrapper = new DBViewWrapper(dbViewWrapperListener);
      gViewWrapper._viewFlags = 1;
      gViewWrapper.open(gFolder);
    }
    gViewWrapper.dbView.selection = new JSTreeSelection();
    gViewWrapper.dbView.selection.select(
      gViewWrapper.dbView.findIndexOfMsgHdr(gMessage, true)
    );
    gDBView = gViewWrapper.dbView;
  }

  MailE10SUtils.changeRemoteness(content, null);
  content.docShell.allowAuth = false;
  content.docShell.allowDNSPrefetch = false;
  content.docShell
    ?.QueryInterface(Ci.nsIWebProgress)
    .addProgressListener(
      top.msgWindow.statusFeedback,
      Ci.nsIWebProgress.NOTIFY_ALL
    );

  messageService.DisplayMessage(uri, content.docShell, null, null, null, {});

  if (gMessage.flags & Ci.nsMsgMessageFlags.HasRe) {
    document.title = `Re: ${gMessage.mime2DecodedSubject}`;
  } else {
    document.title = gMessage.mime2DecodedSubject;
  }

  window.dispatchEvent(
    new CustomEvent("messageURIChanged", { bubbles: true, detail: uri })
  );
}

function GetSelectedMsgFolders() {
  if (gFolderDisplay.displayedFolder) {
    return [gFolderDisplay.displayedFolder];
  }
  return [];
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
        let tab = tabmail.getTabForBrowser(content);
        tabmail.closeTab(tab);
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

commandController.registerCallback(
  "cmd_createFilterFromPopup",
  () => {
    // This does nothing because gMessageHeader.createfilter is invoked from
    // the popupnode oncommand.
  },
  () => gFolder?.server.canHaveFilters
);
commandController.registerCallback("cmd_print", () => {
  top.PrintUtils.startPrintWindow(content.browsingContext, {});
});
