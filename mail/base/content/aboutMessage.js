/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// msgHdrView.js
/* globals messageHeaderSink, OnLoadMsgHeaderPane */

var _uri;
var _msg;

var content;
var gFolderDisplay = {
  get displayedFolder() {
    return this.selectedMessage?.folder;
  },
  get selectedMessage() {
    return _msg;
  },
  get selectedMessages() {
    if (_msg) {
      return [_msg];
    }
    return [];
  },
  get selectedMessageUris() {
    if (_uri) {
      return [_uri];
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

function displayMessage(uri) {
  if (!uri) {
    // How did we get here without a uri?
    throw new Error("Call to displayMessage without a URI");
  }

  _uri = uri;

  let protocol = new URL(uri).protocol.replace(/:$/, "");
  let messageService = Cc[
    `@mozilla.org/messenger/messageservice;1?type=${protocol}`
  ].getService(Ci.nsIMsgMessageService);
  _msg = messageService.messageURIToMsgHdr(uri);

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

  if (_msg.flags & Ci.nsMsgMessageFlags.HasRe) {
    document.title = `Re: ${_msg.mime2DecodedSubject}`;
  } else {
    document.title = _msg.mime2DecodedSubject;
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
