/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["MailNewsCommandLineHandler"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

var MAPI_STARTUP_ARG = "MapiStartup";
var MESSAGE_ID_PARAM = "?messageid=";

function MailNewsCommandLineHandler() {}
MailNewsCommandLineHandler.prototype = {
  get messenger() {
    delete this._messenger;
    return (this._messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    ));
  },

  /* nsICommandLineHandler */

  /**
   * Handles the following command line arguments:
   * - -mail: opens the mail folder view
   * - -MapiStartup: indicates that this startup is due to MAPI.
   *   Don't do anything for now.
   */
  handle(aCommandLine) {
    // Do this here because xpcshell isn't too happy with this at startup
    var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
    // -mail <URL>
    let mailURL = null;
    try {
      mailURL = aCommandLine.handleFlagWithParam("mail", false);
    } catch (e) {
      // We're going to cover -mail without a parameter later
    }

    if (mailURL && mailURL.length > 0) {
      let msgHdr = null;
      if (/^(mailbox|imap|news)-message:\/\//.test(mailURL)) {
        // This might be a standard message URI, or one with a messageID
        // parameter. Handle both cases.
        let messageIDIndex = mailURL.toLowerCase().indexOf(MESSAGE_ID_PARAM);
        if (messageIDIndex != -1) {
          // messageID parameter
          // Convert the message URI into a folder URI
          let folderURI = mailURL
            .slice(0, messageIDIndex)
            .replace("-message", "");
          // Get the message ID
          let messageID = mailURL.slice(
            messageIDIndex + MESSAGE_ID_PARAM.length
          );
          // Make sure the folder tree is initialized
          MailUtils.discoverFolders();

          let folder = MailUtils.getExistingFolder(folderURI);
          // The folder might not exist, so guard against that
          if (folder && messageID.length > 0) {
            msgHdr = folder.msgDatabase.getMsgHdrForMessageID(messageID);
          }
        } else {
          // message URI
          msgHdr = this.messenger.msgHdrFromURI(mailURL);
        }
      } else {
        // Necko URL, so convert it into a message header
        let neckoURL = null;
        try {
          neckoURL = Services.io.newURI(mailURL);
        } catch (e) {
          // We failed to convert the URI. Oh well.
        }

        if (neckoURL instanceof Ci.nsIMsgMessageUrl) {
          msgHdr = neckoURL.messageHeader;
        }
      }

      if (msgHdr) {
        aCommandLine.preventDefault = true;
        MailUtils.displayMessage(msgHdr);
      } else if (
        AppConstants.MOZ_APP_NAME == "seamonkey" &&
        /\.(eml|msg)$/i.test(mailURL)
      ) {
        try {
          let file = aCommandLine.resolveFile(mailURL);
          // No point in trying to open a file if it doesn't exist or is empty
          if (file.exists() && file.fileSize > 0) {
            // Get the URL for this file
            let fileURL = Services.io
              .newFileURI(file)
              .QueryInterface(Ci.nsIFileURL);
            fileURL = fileURL
              .mutate()
              .setQuery("type=application/x-message-display")
              .finalize();
            // Open this file in a new message window.
            Services.ww.openWindow(
              null,
              "chrome://messenger/content/messageWindow.xhtml",
              "_blank",
              "all,chrome,dialog=no,status,toolbar",
              fileURL
            );
            aCommandLine.preventDefault = true;
          }
        } catch (e) {}
      } else {
        dump("Unrecognized URL: " + mailURL + "\n");
        Services.console.logStringMessage("Unrecognized URL: " + mailURL);
      }
    }

    // -mail (no parameter)
    let mailFlag = aCommandLine.handleFlag("mail", false);
    if (mailFlag) {
      // Focus the 3pane window if one is present, else open one
      let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
      if (mail3PaneWindow) {
        mail3PaneWindow.focus();
      } else {
        Services.ww.openWindow(
          null,
          "chrome://messenger/content/messenger.xhtml",
          "_blank",
          "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar,dialog=no",
          null
        );
      }
      aCommandLine.preventDefault = true;
    }

    // -MapiStartup
    aCommandLine.handleFlag(MAPI_STARTUP_ARG, false);
  },

  helpInfo:
    "  -mail              Open the mail folder view.\n" +
    "  -mail <URL>        Open the message specified by this URL.\n",

  /* nsIFactory */
  createInstance(outer, iid) {
    if (outer != null) {
      throw Components.Exception("", Cr.NS_ERROR_NO_AGGREGATION);
    }

    return this.QueryInterface(iid);
  },

  QueryInterface: ChromeUtils.generateQI([
    "nsICommandLineHandler",
    "nsIFactory",
    "nsIModule",
  ]),
};
