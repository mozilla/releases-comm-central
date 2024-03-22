/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ImapChannel } from "resource:///modules/ImapChannel.sys.mjs";

/**
 * @implements {nsIProtocolHandler}
 */
export class ImapProtocolHandler {
  QueryInterface = ChromeUtils.generateQI(["nsIProtocolHandler"]);

  scheme = "imap";

  newChannel(uri, loadInfo) {
    const channel = new ImapChannel(uri, loadInfo);
    const spec = uri.spec;
    if (
      spec.includes("part=") &&
      !spec.includes("type=message/rfc822") &&
      !spec.includes("type=application/x-message-display") &&
      !spec.includes("type=application/pdf")
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

ImapProtocolHandler.prototype.classID = Components.ID(
  "{ebb06c58-6ccd-4bde-9087-40663e0388ae}"
);
