/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpNewsGroup"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
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
    this._msgHdrs = [];
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
    this._msgWindow = msgWindow;
    let groupInfo = this._db.dBFolderInfo;
    if (groupInfo) {
      if (lastPossible < groupInfo.highWater) {
        groupInfo.highWater = lastPossible;
      }
      this._keySet = new MsgKeySet(groupInfo.knownArtsSet);
    } else {
      this._keySet = new MsgKeySet();
      this._keySet.addRange(
        this._db.lowWaterArticleNum,
        this._db.highWaterArticleNum
      );
    }
    if (this._keySet.has(lastPossible)) {
      let bundle = Services.strings.createBundle(
        "chrome://messenger/locale/news.properties"
      );
      msgWindow.statusFeedback.showStatusString(
        bundle.GetStringFromName("noNewMessages")
      );
    }

    if (this._getOldMessages || !this._keySet.has(lastPossible)) {
      let [start, end] = this._keySet.getLastMissingRange(
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

  /**
   * Parse an XOVER line to a msg hdr.
   * @param {string} line - An XOVER response line.
   */
  processXOverLine(line) {
    let parts = line.split("\t");
    if (parts.length < 8) {
      return;
    }
    let [
      articleNumber,
      subject,
      from,
      date,
      messageId,
      references,
      bytes,
      lines,
    ] = parts;
    let msgHdr = this._db.CreateNewHdr(articleNumber);
    msgHdr.OrFlags(Ci.nsMsgMessageFlags.New);
    msgHdr.subject = subject;
    msgHdr.author = from;
    msgHdr.date = new Date(date).valueOf() * 1000;
    msgHdr.messageId = messageId;
    msgHdr.setReferences(references);
    msgHdr.messageSize = bytes;
    msgHdr.lineCount = lines;
    this._msgHdrs.push(msgHdr);
    this._keySet.add(articleNumber);
  }

  /**
   * Finish processing XOVER responses.
   */
  finishProcessingXOver() {
    this._runFilters();
    let groupInfo = this._db.dBFolderInfo;
    if (groupInfo) {
      groupInfo.knownArtsSet = this._keySet.toString();
    }
  }

  /**
   * Run filters to all newly added msg hdrs.
   */
  _runFilters() {
    let folderFilterList = this._folder.getFilterList(this._msgWindow);
    let folderFilterCount = folderFilterList.filterCount;
    let serverFilterList = this._folder.getFilterList(this._msgWindow);
    let serverFilterCount = serverFilterList.filterCount;

    for (let msgHdr of this._msgHdrs) {
      this._filteringHdr = msgHdr;
      this._addHdrToDB = true;
      let headers = "";
      if (folderFilterCount || serverFilterCount) {
        let author = this._filteringHdr.author;
        let subject = this._filteringHdr.subject;
        if (author) {
          headers += `From: ${author}\0`;
        }
        if (subject) {
          headers += `Subject: ${subject}\0`;
        }
      }
      if (folderFilterCount) {
        folderFilterList.applyFiltersToHdr(
          Ci.nsMsgFilterType.NewsRule,
          msgHdr,
          this._folder,
          this._db,
          headers,
          this,
          this._msgWindow
        );
      }
      if (serverFilterCount) {
        serverFilterList.applyFiltersToHdr(
          Ci.nsMsgFilterType.NewsRule,
          msgHdr,
          this._folder,
          this._db,
          headers,
          this,
          this._msgWindow
        );
      }
      if (this._addHdrToDB) {
        this._db.AddNewHdrToDB(msgHdr, true);
        MailServices.mfn.notifyMsgAdded(msgHdr);
        this._folder.orProcessingFlags(
          msgHdr.messageKey,
          Ci.nsMsgProcessingFlags.NotReportedClassified
        );
      }
    }
  }

  /**
   * Callback of nsIMsgFilterList.applyFiltersToHdr.
   * @see nsIMsgFilterHitNotify
   */
  applyFilterHit(filter, msgWindow) {
    let loggingEnabled = filter.filterList.loggingEnabled;
    let applyMore = true;

    for (let action of filter.sortedActionList) {
      if (loggingEnabled) {
        filter.logRuleHit(action, this._filteringHdr);
      }
      switch (action.type) {
        case Ci.nsMsgFilterAction.Delete:
          this._addHdrToDB = false;
          break;
        case Ci.nsMsgFilterAction.MarkRead:
          this._db.MarkHdrRead(this._filteringHdr, true, null);
          break;
        case Ci.nsMsgFilterAction.MarkUnread:
          this._db.MarkHdrRead(this._filteringHdr, false, null);
          break;
        case Ci.nsMsgFilterAction.KillThread:
          this._filteringHdr.setUint32Property(
            "ProtoThreadFlags",
            Ci.nsMsgMessageFlags.Ignored
          );
          break;
        case Ci.nsMsgFilterAction.KillSubthread:
          this._filteringHdr.orFlags(Ci.nsMsgMessageFlags.Ignored);
          break;
        case Ci.nsMsgFilterAction.WatchThread:
          this._filteringHdr.orFlags(Ci.nsMsgMessageFlags.Watched);
          break;
        case Ci.nsMsgFilterAction.MarkFlagged:
          this._filteringHdr.markFlagged(true);
          break;
        case Ci.nsMsgFilterAction.ChangePriority:
          this._filteringHdr.setPriority(action.priority);
          break;
        case Ci.nsMsgFilterAction.AddTag:
          this._folder.addKeywordsToMessages(
            [this._filteringHdr],
            action.strValue
          );
          break;
        case Ci.nsMsgFilterAction.Label:
          this._filteringHdr.setLabel(
            this._filteringHdr.messageKey,
            action.label
          );
          break;
        case Ci.nsMsgFilterAction.StopExecution:
          applyMore = false;
          break;
        case Ci.nsMsgFilterAction.Custom:
          action.customAction.applyAction(
            [this._filteringHdr],
            action.strValue,
            null,
            Ci.nsMsgFilterType.NewsRule,
            this._msgWindow
          );
          break;
        default:
          throw Components.Exception(
            `Unexpected filter action type=${action.type}`,
            Cr.NS_ERROR_UNEXPECTED
          );
      }
    }
    return applyMore;
  }

  /**
   * Commit changes to msg db.
   */
  cleanUp() {
    this._folder.notifyFinishedDownloadinghdrs();
    this._db.Commit(Ci.nsMsgDBCommitType.kSessionCommit);
    this._db.Close(true);
  }
}
