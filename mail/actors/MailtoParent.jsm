/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["MailtoParent"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

class MailtoParent extends JSWindowActorParent {
  receiveMessage({ data, target }) {
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
}
