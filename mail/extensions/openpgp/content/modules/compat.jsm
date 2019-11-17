/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/**
 *  compatibility Module
 */

var EXPORTED_SYMBOLS = ["EnigmailCompat"];

const XPCOM_APPINFO = "@mozilla.org/xre/app-info;1";

var gTb68OrNewer = null;
var MailUtils;

MailUtils = ChromeUtils.import("resource:///modules/MailUtils.jsm").MailUtils;

var gCompFields, gPgpMimeObj;

var EnigmailCompat = {
  generateQI: function(aCid) {
    if (this.isAtLeastTb68()) {
      // TB > 60
      return ChromeUtils.generateQI(aCid);
    }
    else {
      let XPCOMUtils = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm").XPCOMUtils;
      return XPCOMUtils.generateQI(aCid);
    }
  },

  getSecurityField: function() {
    if (!gCompFields) {
      gCompFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
    }
    return ("securityInfo" in gCompFields ? /* TB < 64 */ "securityInfo" : "composeSecure");
  },

  getExistingFolder: function(folderUri) {
    if ("getExistingFolder" in MailUtils) {
      // TB >= 65
      return MailUtils.getExistingFolder(folderUri);
    }
    else {
      return MailUtils.getFolderForURI(folderUri, false);
    }
  },

  isMessageUriInPgpMime: function() {
    if (!gPgpMimeObj) {
      gPgpMimeObj = Cc["@mozilla.org/mime/pgp-mime-js-decrypt;1"].createInstance(Ci.nsIPgpMimeProxy);
    }

    return ("messageURI" in gPgpMimeObj);
  },

  /**
   * return true, if platform is newer than or equal a given version
   */
  isPlatformNewerThan: function(requestedVersion) {
    let vc = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
    let appVer = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).platformVersion;

    return vc.compare(appVer, requestedVersion) >= 0;
  },

  /**
   * Get a mail URL from a uriSpec
   *
   * @param uriSpec: String - URI of the desired message
   *
   * @return Object: nsIURL or nsIMsgMailNewsUrl object
   */
  getUrlFromUriSpec: function(uriSpec) {
    try {
      if (!uriSpec)
        return null;

      let messenger = Cc["@mozilla.org/messenger;1"].getService(Ci.nsIMessenger);
      let msgService = messenger.messageServiceFromURI(uriSpec);

      let url;
      // TB
      let urlObj = {};
      msgService.GetUrlForUri(uriSpec, urlObj, null);

      url = urlObj.value;

      if (url.scheme == "file") {
        return url;
      }
      else {
        return url.QueryInterface(Ci.nsIMsgMailNewsUrl);
      }

    }
    catch (ex) {
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
  copyFileToMailFolder: function(file, destFolder, msgFlags, msgKeywords, listener, msgWindow) {
    let copySvc = Cc["@mozilla.org/messenger/messagecopyservice;1"].getService(Ci.nsIMsgCopyService);

    return copySvc.CopyFileMessage(file, destFolder, null, false, msgFlags, msgKeywords, listener, msgWindow);
  },

  /**
   * Determine if Platform is at version 68 or newer
   *
   * @return {Boolean}: true if at TB 68.0a1 or newer found
   */
  isAtLeastTb68: function() {
    if (gTb68OrNewer === null) {
      gTb68OrNewer = this.isPlatformNewerThan("68.0a1");
    }

    return gTb68OrNewer;
  },

  /**
   * Get functions that wrap the changes on nsITreeView between TB 60 and TB 68
   *
   * @param treeObj
   * @param listViewHolder
   *
   * @return {Object}
   */
  getTreeCompatibleFuncs: function(treeObj, listViewHolder) {

    if (this.isAtLeastTb68()) {
      return {
        getCellAt: function(x,y) {
          return treeObj.getCellAt(x, y);
        },
        rowCountChanged: function(a, b) {
          return treeObj.rowCountChanged(a, b);
        },
        invalidate: function() {
          return treeObj.invalidate();
        },
        invalidateRow: function(r) {
          return treeObj.invalidateRow(r);
        }
      };
    }
    else {
      return {
        getCellAt: function(x, y) {
            let row = {};
            let col = {};
            let elt = {};
            treeObj.treeBoxObject.getCellAt(x, y, row, col, elt);

            return {
              row: row.value,
              col: col.value
            };
        },
        rowCountChanged: function(a, b) {
          return listViewHolder.treebox.rowCountChanged(a, b);
        },
        invalidate: function() {
          return listViewHolder.treebox.invalidate();
        },
        invalidateRow: function(r) {
          return listViewHolder.treebox.invalidateRow(r);
        }
      };
    }
  },
};
