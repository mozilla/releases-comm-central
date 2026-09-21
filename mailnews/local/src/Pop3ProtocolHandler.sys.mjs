/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Pop3Channel } from "resource:///modules/Pop3Channel.sys.mjs";

/**
 * @implements {nsIProtocolHandler}
 */
export class Pop3ProtocolHandler {
  QueryInterface = ChromeUtils.generateQI(["nsIProtocolHandler"]);

  scheme = "pop3";

  newChannel(uri, loadInfo) {
    const channel = new Pop3Channel(uri, loadInfo);
    // The type parameter may be escaped, so get the unescaped value rather
    // than searching the spec for it. The same logic exists in
    // MsgPartUrlNeedsAttachmentDisposition.
    const type = new URLSearchParams(uri.query).get("type");
    if (
      uri.spec.includes("part=") &&
      ![
        "message/rfc822",
        "application/x-message-display",
        "application/pdf",
      ].includes(type?.toLowerCase())
    ) {
      channel.contentDisposition = Ci.nsIChannel.DISPOSITION_ATTACHMENT;
    } else {
      channel.contentDisposition = Ci.nsIChannel.DISPOSITION_INLINE;
    }
    return channel;
  }

  allowPort() {
    return true;
  }
}

Pop3ProtocolHandler.prototype.classID = Components.ID(
  "{eed38573-d01b-4c13-9f9d-f69963095a4d}"
);
