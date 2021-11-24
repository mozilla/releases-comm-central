/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// mailContext.js
/* globals dbViewWrapperListener */

// mailWindowOverlay.js
/* globals gMessageNotificationBar */

// msgHdrView.js
/* globals HideMessageHeaderPane, initFolderDBListener, messageHeaderSink,
   OnLoadMsgHeaderPane, OnTagsChange, OnUnloadMsgHeaderPane */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  DBViewWrapper: "resource:///modules/DBViewWrapper.jsm",
  JSTreeSelection: "resource:///modules/JsTreeSelection.jsm",
});

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

var gFolder, gViewWrapper, gMessage, gMessageURI;

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
  selectedMessageIsNews: false,
  selectedMessageIsFeed: false,
  view: {
    isNewsFolder: false,
  },
};

var gMessageDisplay = {
  isDummy: true,
};

var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
var MsgStatusFeedback =
  window.browsingContext.topChromeWindow.MsgStatusFeedback;
var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);
msgWindow.msgHeaderSink = window.messageHeaderSink;

window.addEventListener("DOMContentLoaded", () => {
  content = document.querySelector("browser");
  OnLoadMsgHeaderPane();
});

window.addEventListener("unload", () => {
  OnUnloadMsgHeaderPane();
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
  if (!uri) {
    HideMessageHeaderPane();
    window.dispatchEvent(
      new CustomEvent("messageURIChanged", { bubbles: true, detail: uri })
    );
    return;
  }

  gMessageURI = uri;

  let protocol = new URL(uri).protocol.replace(/:$/, "");
  let messageService = Cc[
    `@mozilla.org/messenger/messageservice;1?type=${protocol}`
  ].getService(Ci.nsIMsgMessageService);
  gMessage = messageService.messageURIToMsgHdr(uri);
  if (gFolder != gMessage.folder) {
    gFolder = gMessage.folder;
    initFolderDBListener();
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

  // Ideally we'd do this without creating a msgWindow, and just pass the
  // docShell to the message service, but that's not easy yet.
  messageService.DisplayMessage(
    uri,
    content.docShell,
    msgWindow,
    null,
    null,
    {}
  );

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

function RestoreFocusAfterHdrButton() {
  // set focus to the message pane
  content.focus();
}
