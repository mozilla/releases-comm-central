/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NntpChannel } from "resource:///modules/NntpChannel.sys.mjs";

/**
 * @implements {nsIProtocolHandler}
 */
export class NewsProtocolHandler {
  QueryInterface = ChromeUtils.generateQI(["nsIProtocolHandler"]);

  scheme = "news";

  newChannel(uri, loadInfo) {
    const channel = new NntpChannel(uri, loadInfo);
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

  allowPort(port, scheme) {
    return true;
  }
}

NewsProtocolHandler.prototype.classID = Components.ID(
  "{24220ecd-cb05-4676-8a47-fa1da7b86e6e}"
);

export class SnewsProtocolHandler extends NewsProtocolHandler {
  scheme = "snews";
}

SnewsProtocolHandler.prototype.classID = Components.ID(
  "{1895016d-5302-46a9-b3f5-9c47694d9eca}"
);
