/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const lazy = {};
XPCOMUtils.defineLazyModuleGetters(lazy, {
  MailUtils: "resource:///modules/MailUtils.jsm",
});

/**
 * A service for handling content type x-application-imapfolder;
 * that is, opening IMAP folder URLs.
 *
 * Set mailnews.imap.jsmodule to true to use this module.
 *
 * @implements {nsIContentHandler}
 */
export class ImapFolderContentHandler {
  QueryInterface = ChromeUtils.generateQI(["nsIContentHandler"]);

  /**
   * @param contentType - The content type of request.
   * @param windowContest - Window context, used to get things like the current
   *   nsIDOMWindow for this request.
   * @param request - A request whose content type is already known.
   * @see {nsIContentHandler}
   */
  handleContent(contentType, windowContext, request) {
    if (contentType != "x-application-imapfolder") {
      throw Components.Exception(
        `Won't handle ${contentType}`,
        Cr.NS_ERROR_WONT_HANDLE_CONTENT
      );
    }
    request = request.QueryInterface(Ci.nsIChannel);

    const imapFolderURL = Services.io.unescapeString(
      request.URI.spec,
      Ci.nsINetUtil.ESCAPE_URL_PATH
    );

    if (Services.wm.getMostRecentWindow("mail:3pane")) {
      // Clicked IMAP folder URL in the window.
      let folder = MailServices.folderLookup.getFolderForURL(imapFolderURL);
      if (folder) {
        lazy.MailUtils.displayFolderIn3Pane(folder.URI);
      } else {
        folder =
          MailServices.folderLookup.getOrCreateFolderForURL(imapFolderURL);
        // TODO: ask and maybe subscribe, like
        // https://searchfox.org/comm-central/rev/1dd06be9d6c1178a34e6c28db03161e07e97d98c/mailnews/imap/src/nsImapService.cpp#2471-2534
        dump(`Maybe subscribe to folder ${folder.URI}\n`);
      }
    } else {
      // Got IMAP folder URL from command line (most likely).
      Cc["@mozilla.org/messenger/windowservice;1"]
        .getService(Ci.nsIMessengerWindowService)
        .openMessengerWindowWithUri("mail:3pane", imapFolderURL, -1);
    }
  }
}

ImapFolderContentHandler.prototype.classID = Components.ID(
  "{d927a82f-2d15-4972-ab88-6d84601aae68}"
);
