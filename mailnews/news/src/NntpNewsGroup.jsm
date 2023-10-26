/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpNewsGroup"];

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
   * @param {nsIMsgNewsFolder} folder - The associated news folder.
   */
  constructor(server, folder) {
    this._server = server;
    this._folder = folder;
    this._db = this._folder.msgDatabase;
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
   *
   * @type {nsIMsgWindow} msgWindow - The associated msg window.
   * @type {number} firstPossible - The first article that can be fetched.
   * @type {number} lastPossible - The last article that can be fetched.
   * @returns {[number, number]} A tuple of the first and last article to fetch.
   */
  getArticlesRangeToFetch(msgWindow, firstPossible, lastPossible) {
    this._msgWindow = msgWindow;
    if (!this._msgWindow) {
      try {
        this._msgWindow = MailServices.mailSession.topmostMsgWindow;
      } catch (e) {}
    }

    this._folderFilterList = this._folder.getFilterList(this._msgWindow);
    this._serverFilterList = this._server.getFilterList(this._msgWindow);
    this._filterHeaders = new Set(
      (
        this._folderFilterList.arbitraryHeaders +
        " " +
        this._serverFilterList.arbitraryHeaders
      )
        .split(" ")
        .filter(Boolean)
    );

    const groupInfo = this._db.dBFolderInfo;
    if (groupInfo) {
      if (lastPossible < groupInfo.highWater) {
        groupInfo.highWater = lastPossible;
      }
      this._knownKeySet = new MsgKeySet(groupInfo.knownArtsSet);
    } else {
      this._knownKeySet = new MsgKeySet();
      this._knownKeySet.addRange(
        this._db.lowWaterArticleNum,
        this._db.highWaterArticleNum
      );
    }
    if (this._knownKeySet.has(lastPossible)) {
      const bundle = Services.strings.createBundle(
        "chrome://messenger/locale/news.properties"
      );
      const messengerBundle = Services.strings.createBundle(
        "chrome://messenger/locale/messenger.properties"
      );
      msgWindow?.statusFeedback.showStatusString(
        messengerBundle.formatStringFromName("statusMessage", [
          this._server.prettyName,
          bundle.GetStringFromName("noNewMessages"),
        ])
      );
    }

    if (this._getOldMessages || !this._knownKeySet.has(lastPossible)) {
      let [start, end] = this._knownKeySet.getLastMissingRange(
        firstPossible,
        lastPossible
      );
      if (this._getOldMessages) {
        return [Math.max(start, end - this._server.maxArticles + 1), end];
      }
      if (
        start &&
        end - start > this._server.maxArticles &&
        this._server.notifyOn
      ) {
        // Show a dialog to let user decide how many articles to download.
        const args = Cc[
          "@mozilla.org/messenger/newsdownloaddialogargs;1"
        ].createInstance(Ci.nsINewsDownloadDialogArgs);
        args.articleCount = end - start + 1;
        args.groupName = this._folder.unicodeName;
        args.serverKey = this._server.key;
        this._msgWindow.domWindow.openDialog(
          "chrome://messenger/content/downloadheaders.xhtml",
          "_blank",
          "centerscreen,chrome,modal,titlebar",
          args
        );
        if (!args.hitOK) {
          return [];
        }
        start = args.downloadAll ? start : end - this._server.maxArticles + 1;
        if (this._server.markOldRead) {
          this._readKeySet = new MsgKeySet(
            this._folder.newsrcLine.split(":")[1].trim()
          );
          this._readKeySet.addRange(firstPossible, start - 1);
        }
      }
      return [start, end];
    }
    return [];
  }

  /**
   * Strip multiple localized Re: prefixes and set the subject and the hasRe
   * flag. This emulates NS_MsgStripRE()
   *
   * @param {nsIMsgDBHdr} msgHdr - The nsIMsgDBHdr to update
   * @param {string} subject - The unprocessed subject
   */
  setSubject(msgHdr, subject) {
    const prefixes = Services.prefs
      .getComplexValue("mailnews.localizedRe", Ci.nsIPrefLocalizedString)
      .data.split(",")
      .filter(Boolean);
    if (!prefixes.includes("Re")) {
      prefixes.push("Re");
    }
    // Construct a regular expression like this: ^(Re: |Aw: )+
    const newSubject = subject.replace(
      new RegExp(`^(${prefixes.join(": |")}: )+`, "i"),
      ""
    );
    msgHdr.subject = newSubject;
    if (newSubject != subject) {
      msgHdr.orFlags(Ci.nsMsgMessageFlags.HasRe);
    }
  }

  /**
   * Parse an XOVER line to a msg hdr.
   *
   * @param {string} line - An XOVER response line.
   */
  processXOverLine(line) {
    const parts = line.split("\t");
    if (parts.length < 8) {
      return;
    }
    const [
      articleNumber,
      subject,
      from,
      date,
      messageId,
      references,
      bytes,
      lines,
    ] = parts;
    const msgHdr = this._db.createNewHdr(articleNumber);
    msgHdr.orFlags(Ci.nsMsgMessageFlags.New);
    this.setSubject(msgHdr, subject);
    msgHdr.author = from;
    msgHdr.date = new Date(date).valueOf() * 1000;
    msgHdr.messageId = messageId;
    msgHdr.setReferences(references);
    msgHdr.messageSize = bytes;
    msgHdr.lineCount = lines;
    this._msgHdrs.push(msgHdr);
  }

  /**
   * Add a range (usually XOVER range) to the known key set.
   */
  addKnownArticles(start, end) {
    this._knownKeySet.addRange(start, end);
  }

  /**
   * Finish processing XOVER responses.
   */
  finishProcessingXOver() {
    this._runFilters();
    const groupInfo = this._db.dBFolderInfo;
    if (groupInfo) {
      groupInfo.knownArtsSet = this._knownKeySet.toString();
    }
  }

  /**
   * Extra headers needed by filters, but not returned in XOVER response.
   */
  getXHdrFields() {
    return [...this._filterHeaders].filter(
      x => !["message-id", "references"].includes(x)
    );
  }

  /**
   * Update msgHdr according to XHDR line.
   *
   * @param {string} header - The requested header.
   * @param {string} line - A XHDR response line.
   */
  processXHdrLine(header, line) {
    const spaceIndex = line.indexOf(" ");
    const articleNumber = line.slice(0, spaceIndex);
    const value = line.slice(spaceIndex).trim();
    const msgHdr = this._db.getMsgHdrForKey(articleNumber);
    msgHdr.setStringProperty(header, value);
  }

  /**
   * Init a msgHdr to prepare to take HEAD response.
   *
   * @param {number} articleNumber - The article number.
   */
  initHdr(articleNumber) {
    if (this._msgHdr) {
      this._msgHdrs.push(this._msgHdr);
    }

    if (articleNumber >= 0) {
      this._msgHdr = this._db.createNewHdr(articleNumber);
    }
  }

  /**
   * Update msgHdr according to HEAD line.
   *
   * @param {string} line - A HEAD response line.
   */
  processHeadLine(line) {
    const colonIndex = line.indexOf(":");
    const name = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1).trim();
    switch (name) {
      case "from":
        this._msgHdr.author = value;
        break;
      case "date":
        this._msgHdr.date = new Date(value).valueOf() * 1000;
        break;
      case "subject":
        this.setSubject(this._msgHdr, value);
        this._msgHdr.orFlags(Ci.nsMsgMessageFlags.New);
        break;
      case "message-id":
        this._msgHdr.messageId = value;
        break;
      case "references":
        this._msgHdr.setReferences(value);
        break;
      case "bytes":
        this._msgHdr.messageSize = value;
        break;
      case "lines":
        this._msgHdr.lineCount = value;
        break;
      default:
        if (this._filterHeaders.has(name)) {
          this._msgHdr.setStringProperty(name, value);
        }
    }
  }

  /**
   * Run filters to all newly added msg hdrs.
   */
  _runFilters() {
    const folderFilterCount = this._folderFilterList.filterCount;
    const serverFilterCount = this._serverFilterList.filterCount;

    for (const msgHdr of this._msgHdrs) {
      this._filteringHdr = msgHdr;
      this._addHdrToDB = true;
      let headers = "";
      if (folderFilterCount || serverFilterCount) {
        const author = this._filteringHdr.author;
        const subject = this._filteringHdr.subject;
        if (author) {
          headers += `From: ${author}\0`;
        }
        if (subject) {
          headers += `Subject: ${subject}\0`;
        }
      }
      if (folderFilterCount) {
        this._folderFilterList.applyFiltersToHdr(
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
        this._serverFilterList.applyFiltersToHdr(
          Ci.nsMsgFilterType.NewsRule,
          msgHdr,
          this._folder,
          this._db,
          headers,
          this,
          this._msgWindow
        );
      }
      if (this._addHdrToDB && !this._db.containsKey(msgHdr.messageKey)) {
        this._db.addNewHdrToDB(msgHdr, true);
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
   *
   * @see nsIMsgFilterHitNotify
   */
  applyFilterHit(filter, msgWindow) {
    const loggingEnabled = filter.filterList.loggingEnabled;
    let applyMore = true;

    for (const action of filter.sortedActionList) {
      if (loggingEnabled) {
        filter.logRuleHit(action, this._filteringHdr);
      }
      switch (action.type) {
        case Ci.nsMsgFilterAction.Delete:
          this._addHdrToDB = false;
          break;
        case Ci.nsMsgFilterAction.MarkRead:
          this._db.markHdrRead(this._filteringHdr, true, null);
          break;
        case Ci.nsMsgFilterAction.MarkUnread:
          this._db.markHdrRead(this._filteringHdr, false, null);
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
          this._filteringHdr.priority = action.priority;
          break;
        case Ci.nsMsgFilterAction.AddTag:
          this._folder.addKeywordsToMessages(
            [this._filteringHdr],
            action.strValue
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
            msgWindow
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
    if (this._readKeySet) {
      this._folder.setReadSetFromStr(this._readKeySet);
    }
    this._folder.notifyFinishedDownloadinghdrs();
    this._db.commit(Ci.nsMsgDBCommitType.kSessionCommit);
    this._db.close(true);
  }
}
