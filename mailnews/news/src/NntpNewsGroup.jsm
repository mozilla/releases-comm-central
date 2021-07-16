/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpNewsGroup"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MsgKeySet } = ChromeUtils.import("resource:///modules/MsgKeySet.jsm");

/**
 * A helper class for NntpClient to deal with msg db and folders.
 */
class NntpNewsGroup {
  /**
   * @param {nsINntpIncomingServer} server - The associated server instance.
   * @param {string} groupName - The associated group name.
   */
  constructor(server, groupName) {
    this._server = server;
    this._folder = server.findGroup(groupName);
    this._db = this._folder.getDatabaseWithoutCache();
  }

  /**
   * @type {boolean} value - Whether to fetch old messages.
   */
  set getOldMessages(value) {
    this._getOldMessages = value;
  }

  /**
   * Get the articles range to fetch, depending on server setting and user
   * selection.
   * @type {nsIMsgWindow} msgWindow - The associated msg window.
   * @type {number} firstPossible - The first article that can be fetched.
   * @type {number} lastPossible - The last article that can be fetched.
   * @returns {[number, number]} A tuple of the first and last article to fetch.
   */
  getArticlesRangeToFetch(msgWindow, firstPossible, lastPossible) {
    let keySet;
    let groupInfo = this._db.dBFolderInfo;
    if (groupInfo) {
      if (lastPossible < groupInfo.highWater) {
        groupInfo.highWater = lastPossible;
      }
      keySet = new MsgKeySet(groupInfo.knownArtsSet);
    } else {
      keySet = new MsgKeySet();
      keySet.addRange(
        this._db.lowWaterArticleNum,
        this._db.highWaterArticleNum
      );
    }
    if (keySet.has(lastPossible)) {
      let bundle = Services.strings.createBundle(
        "chrome://messenger/locale/news.properties"
      );
      msgWindow.statusFeedback.showStatusString(
        bundle.GetStringFromName("noNewMessages")
      );
    }

    if (this._getOldMessages || !keySet.has(lastPossible)) {
      let [start, end] = keySet.getLastMissingRange(
        firstPossible,
        lastPossible
      );
      if (
        start &&
        end - start > this._server.maxArticles &&
        this._server.notifyOn
      ) {
        // Show a dialog to let user decide how many articles to download.
        let args = Cc[
          "@mozilla.org/messenger/newsdownloaddialogargs;1"
        ].createInstance(Ci.nsINewsDownloadDialogArgs);
        args.articleCount = end - start + 1;
        args.groupName = this._folder.unicodeName;
        args.serverKey = this._server.key;
        msgWindow.domWindow.openDialog(
          "chrome://messenger/content/downloadheaders.xhtml",
          "_blank",
          "centerscreen,chrome,modal,titlebar",
          args
        );
        if (!args.hitOK) {
          return [];
        }
        start = args.downloadAll ? start : end - this._server.maxArticles;
      }
      return [start, end];
    }
    return [];
  }
}
