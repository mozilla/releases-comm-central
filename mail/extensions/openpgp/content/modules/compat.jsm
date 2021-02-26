/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/**
 *  compatibility Module
 */

var EXPORTED_SYMBOLS = ["EnigmailCompat"];

ChromeUtils.defineModuleGetter(
  this,
  "MailUtils",
  "resource:///modules/MailUtils.jsm"
);

var EnigmailCompat = {
  generateQI(aCid) {
    return ChromeUtils.generateQI(aCid);
  },

  getExistingFolder(folderUri) {
    return MailUtils.getExistingFolder(folderUri);
  },

  /**
   * Get a mail URL from a uriSpec
   *
   * @param uriSpec: String - URI of the desired message
   *
   * @return Object: nsIURL or nsIMsgMailNewsUrl object
   */
  getUrlFromUriSpec(uriSpec) {
    try {
      if (!uriSpec) {
        return null;
      }

      let messenger = Cc["@mozilla.org/messenger;1"].getService(
        Ci.nsIMessenger
      );
      let msgService = messenger.messageServiceFromURI(uriSpec);

      // TB
      let url = msgService.getUrlForUri(uriSpec);

      if (url.scheme == "file") {
        return url;
      }

      return url.QueryInterface(Ci.nsIMsgMailNewsUrl);
    } catch (ex) {
      return null;
    }
  },
  /**
   * Copy a file to a mail folder.
   *   in nsIFile aFile,
   *   in nsIMsgFolder dstFolder,
   *   in unsigned long aMsgFlags,
   *   in ACString aMsgKeywords,
   *   in nsIMsgCopyServiceListener listener,
   *   in nsIMsgWindow msgWindow
   */
  copyFileToMailFolder(
    file,
    destFolder,
    msgFlags,
    msgKeywords,
    listener,
    msgWindow
  ) {
    let copySvc = Cc["@mozilla.org/messenger/messagecopyservice;1"].getService(
      Ci.nsIMsgCopyService
    );

    return copySvc.CopyFileMessage(
      file,
      destFolder,
      null,
      false,
      msgFlags,
      msgKeywords,
      listener,
      msgWindow
    );
  },

  /**
   * Get functions that wrap the changes on nsITreeView between TB 60 and TB 68
   *
   * @param treeObj
   * @param listViewHolder
   *
   * @return {Object}
   */
  getTreeCompatibleFuncs(treeObj, listViewHolder) {
    return {
      getCellAt(x, y) {
        return treeObj.getCellAt(x, y);
      },
      rowCountChanged(a, b) {
        return treeObj.rowCountChanged(a, b);
      },
      invalidate() {
        return treeObj.invalidate();
      },
      invalidateRow(r) {
        return treeObj.invalidateRow(r);
      },
    };
  },
};
