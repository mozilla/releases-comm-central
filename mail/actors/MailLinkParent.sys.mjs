/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AttachmentInfo: "resource:///modules/AttachmentInfo.sys.mjs",
  MailServices: "resource:///modules/MailServices.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
});

export class MailLinkParent extends JSWindowActorParent {
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
    const url = new URL(data);
    const filename = url.searchParams.get("filename");
    // When a message is received with a 'news:' link embedded as a MIME part
    // of the message, the internal 'cid:' link is converted to a mailbox link
    // containing `filename=message.rfc822`. In the following function, an
    // attachment with content-type "message/rfc822" is processed before the
    // filename is evaluated (by its extension), so we explicitly set the
    // content-type in this case.
    new lazy.AttachmentInfo({
      contentType: /\.rfc822$/.test(filename) ? "message/rfc822" : "",
      url: data,
      name: filename,
      uri: "",
      isExternalAttachment: false,
    }).open(target.browsingContext);
  }

  _handleMailToLink({ data, target }) {
    let identity = null;

    // If the document with the link is a message, try to get the identity
    // from the message and use it when composing.
    const documentURI = target.windowContext.documentURI;
    if (documentURI instanceof Ci.nsIMsgMessageUrl) {
      documentURI.QueryInterface(Ci.nsIMsgMessageUrl);
      [identity] = lazy.MailUtils.getIdentityForHeader(
        documentURI.messageHeader
      );
    }

    lazy.MailServices.compose.OpenComposeWindowWithURI(
      undefined,
      Services.io.newURI(data),
      identity
    );
  }

  _handleMidLink({ data }) {
    // data is the mid: url.
    lazy.MailUtils.openMessageForMessageId(data.slice(4));
  }

  _handleNewsLink({ data }) {
    lazy.MailUtils.handleNewsUri(
      data,
      Services.wm.getMostRecentWindow("mail:3pane")
    );
  }
}
