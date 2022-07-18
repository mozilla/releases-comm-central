/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["MailLinkParent"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

class MailLinkParent extends JSWindowActorParent {
  receiveMessage(value) {
    switch (value.name) {
      case "imap:":
      case "mailbox:":
        this._handleMailboxLink(value);
        break;
      case "mailto:":
        this._handleMailToLink(value);
        break;
      case "mid:":
        this._handleMidLink(value);
        break;
      case "news:":
      case "snews:":
        this._handleNewsLink(value);
        break;
      default:
        throw Components.Exception(
          `Unsupported name=${value.name} url=${value.data}`,
          Cr.NS_ERROR_ILLEGAL_VALUE
        );
    }
  }

  _handleMailboxLink({ data, target }) {
    // AttachmentInfo is defined in msgHdrView.js.
    let { AttachmentInfo } = target.browsingContext.topChromeWindow;
    let url = new URL(data);
    new AttachmentInfo(
      "",
      data,
      url.searchParams.get("filename"),
      "",
      false
    ).open();
  }

  _handleMailToLink({ data, target }) {
    let identity = null;

    // If the document with the link is a message, try to get the identity
    // from the message and use it when composing.
    let documentURI = target.windowContext.documentURI;
    if (documentURI instanceof Ci.nsIMsgMessageUrl) {
      documentURI.QueryInterface(Ci.nsIMsgMessageUrl);
      [identity] = MailUtils.getIdentityForHeader(documentURI.messageHeader);
    }

    MailServices.compose.OpenComposeWindowWithURI(
      undefined,
      Services.io.newURI(data),
      identity
    );
  }

  _handleMidLink({ data }) {
    // data is the mid: url.
    MailUtils.openMessageByMessageId(data.slice(4));
  }

  _handleNewsLink({ data }) {
    Services.ww.openWindow(
      null,
      "chrome://messenger/content/messageWindow.xhtml",
      "_blank",
      "all,chrome,dialog=no,status,toolbar",
      Services.io.newURI(data)
    );
  }
}
