/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Functions use for junk processing commands
 */

/*
 * TODO: These functions make the false assumption that a view only contains
 *       a single folder. This is not true for XF saved searches.
 *
 * globals prerequisites used:
 *
 *   top.window.MsgStatusFeedback
 */

/* globals gDBView, gViewWrapper, VirtualFolderHelper */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

/**
 * Performs required operations on a list of newly-classified junk messages.
 *
 * @param {nsIMsgFolder} aFolder - The folder with messages being marked as
 *   junk.
 * @param {nsIMsgDBHdr[]} aJunkMsgHdrs - New junk messages.
 * @param {nsIMsgDBHdr[]} aGoodMsgHdrs - New good messages.
 */
async function performActionsOnJunkMsgs(aFolder, aJunkMsgHdrs, aGoodMsgHdrs) {
  let deferred = Promise.withResolvers();
  aFolder.performActionsOnJunkMsgs(aJunkMsgHdrs, true, top.msgWindow, {
    OnStopRunningUrl(url, status) {
      if (Components.isSuccessCode(status)) {
        deferred.resolve();
      } else {
        deferred.reject(
          new Error(
            `performActionsOnJunkMsgs failed with status: ${status.toString(16)}`
          )
        );
      }
    },
  });
  await deferred.promise;
  deferred = Promise.withResolvers();
  aFolder.performActionsOnJunkMsgs(aGoodMsgHdrs, false, top.msgWindow, {
    OnStopRunningUrl(url, status) {
      if (Components.isSuccessCode(status)) {
        deferred.resolve();
      } else {
        deferred.reject(
          new Error(
            `performActionsOnJunkMsgs failed with status: ${status.toString(16)}`
          )
        );
      }
    },
  });
  await deferred.promise;
}

/**
 * Helper object storing the list of pending messages to process,
 * and implementing junk processing callback.
 *
 * @param {nsIMsgFolder} aFolder - The folder with messages to be analyzed for junk.
 * @param {integer} aTotalMessages - Number of messages to process, used for
 *   progress report only.
 */

function MessageClassifier(aFolder, aTotalMessages) {
  this.mFolder = aFolder;
  this.mJunkMsgHdrs = [];
  this.mGoodMsgHdrs = [];
  this.mMessages = {};
  this.mMessageQueue = [];
  this.mTotalMessages = aTotalMessages;
  this.mProcessedMessages = 0;
  this.firstMessage = true;
  this.lastStatusTime = Date.now();
}

/**
 * @implements {nsIJunkMailClassificationListener}
 */
MessageClassifier.prototype = {
  /**
   * Starts the message classification process for a message. If the message
   * sender's address is whitelisted, the message is skipped.
   *
   * @param {nsIMsgDBHdr} aMsgHdr - The header of the message to classify.
   * @param {nsISpamSettings} aSpamSettings - The object with information about
   *   whitelists
   */
  analyzeMessage(aMsgHdr, aSpamSettings) {
    var junkscoreorigin = aMsgHdr.getStringProperty("junkscoreorigin");
    if (junkscoreorigin == "user") {
      // don't override user-set junk status
      return;
    }

    // check whitelisting
    if (aSpamSettings.checkWhiteList(aMsgHdr)) {
      // message is ham from whitelist
      var db = aMsgHdr.folder.msgDatabase;
      db.setStringProperty(
        aMsgHdr.messageKey,
        "junkscore",
        Ci.nsIJunkMailPlugin.IS_HAM_SCORE
      );
      db.setStringProperty(aMsgHdr.messageKey, "junkscoreorigin", "whitelist");
      this.mGoodMsgHdrs.push(aMsgHdr);
      return;
    }

    const messageURI = aMsgHdr.folder.generateMessageURI(aMsgHdr.messageKey);
    this.mMessages[messageURI] = aMsgHdr;
    if (this.firstMessage) {
      this.firstMessage = false;
      MailServices.junk.classifyMessage(messageURI, top.msgWindow, this);
    } else {
      this.mMessageQueue.push(messageURI);
    }
  },

  /**
   * Callback function from nsIJunkMailPlugin with classification results.
   *
   * @param {string} aClassifiedMsgURI - URI of classified message.
   * @param {integer} aClassification - Junk classification (0: UNCLASSIFIED, 1: GOOD, 2: JUNK)
   * @param {integer} aJunkPercent - 0 - 100 indicator of junk likelihood,
   *   with 100 meaning probably junk.
   * @see {nsIJunkMailClassificationListener}
   */
  async onMessageClassified(aClassifiedMsgURI, aClassification, aJunkPercent) {
    if (!aClassifiedMsgURI) {
      // Ignore end of batch.
      return;
    }
    var score =
      aClassification == Ci.nsIJunkMailPlugin.JUNK
        ? Ci.nsIJunkMailPlugin.IS_SPAM_SCORE
        : Ci.nsIJunkMailPlugin.IS_HAM_SCORE;
    const statusDisplayInterval = 1000; // milliseconds between status updates

    // set these props via the db (instead of the message header
    // directly) so that the nsMsgDBView knows to update the UI
    //
    var msgHdr = this.mMessages[aClassifiedMsgURI];
    var db = msgHdr.folder.msgDatabase;
    db.setStringProperty(msgHdr.messageKey, "junkscore", score);
    db.setStringProperty(msgHdr.messageKey, "junkscoreorigin", "plugin");
    db.setStringProperty(msgHdr.messageKey, "junkpercent", aJunkPercent);

    if (aClassification == Ci.nsIJunkMailPlugin.JUNK) {
      this.mJunkMsgHdrs.push(msgHdr);
    } else if (aClassification == Ci.nsIJunkMailPlugin.GOOD) {
      this.mGoodMsgHdrs.push(msgHdr);
    }

    var nextMsgURI = this.mMessageQueue.shift();

    if (nextMsgURI) {
      ++this.mProcessedMessages;
      if (Date.now() > this.lastStatusTime + statusDisplayInterval) {
        this.lastStatusTime = Date.now();
        const percentage = this.mTotalMessages
          ? this.mProcessedMessages / this.mTotalMessages
          : 0;
        const status = await document.l10n.formatValue(
          "spam-analysis-percentage",
          {
            percentage,
          }
        );
        top.window.MsgStatusFeedback.showStatusString(status);
      }
      MailServices.junk.classifyMessage(nextMsgURI, top.msgWindow, this);
    } else {
      const status = await document.l10n.formatValue("spam-processing-message");
      top.window.MsgStatusFeedback.showStatusString(status);
      await performActionsOnJunkMsgs(
        this.mFolder,
        this.mJunkMsgHdrs,
        this.mGoodMsgHdrs
      );
      // This notification only exists for tests.
      Services.obs.notifyObservers(null, "message-classification-complete");
      setTimeout(() => {
        top.window.MsgStatusFeedback.showStatusString("");
      }, 500);
    }
  },
};

/**
 * Filter all messages in the current folder for junk
 */
async function filterFolderForJunk() {
  await processFolderForJunk(true);
}

/**
 * Filter selected messages in the current folder for junk
 */
async function analyzeMessagesForJunk() {
  await processFolderForJunk(false);
}

/**
 * Filter messages in the current folder for junk
 *
 * @param {boolean} aAll - true to filter all messages, else filter selection.
 */
async function processFolderForJunk(aAll) {
  let indices;
  if (aAll) {
    // need to expand all threads, so we analyze everything
    gDBView.doCommand(Ci.nsMsgViewCommandType.expandAll);
    var treeView = gDBView.QueryInterface(Ci.nsITreeView);
    var count = treeView.rowCount;
    if (!count) {
      return;
    }
  } else {
    indices =
      AppConstants.MOZ_APP_NAME == "seamonkey"
        ? window.GetSelectedIndices(gDBView)
        : window.threadTree?.selectedIndices;
    if (!indices || !indices.length) {
      return;
    }
  }
  const totalMessages = aAll ? count : indices.length;

  // retrieve server and its spam settings via the header of an arbitrary message
  let tmpMsgURI;
  for (let i = 0; i < totalMessages; i++) {
    const index = aAll ? i : indices[i];
    try {
      tmpMsgURI = gDBView.getURIForViewIndex(index);
      break;
    } catch (e) {
      // dummy headers will fail, so look for another
      continue;
    }
  }
  if (!tmpMsgURI) {
    return;
  }

  const tmpMsgHdr =
    MailServices.messageServiceFromURI(tmpMsgURI).messageURIToMsgHdr(tmpMsgURI);
  const spamSettings = tmpMsgHdr.folder.server.spamSettings;

  // create a classifier instance to classify messages in the folder.
  const msgClassifier = new MessageClassifier(tmpMsgHdr.folder, totalMessages);

  for (let i = 0; i < totalMessages; i++) {
    const index = aAll ? i : indices[i];
    try {
      const msgURI = gDBView.getURIForViewIndex(index);
      const msgHdr =
        MailServices.messageServiceFromURI(msgURI).messageURIToMsgHdr(msgURI);
      msgClassifier.analyzeMessage(msgHdr, spamSettings);
    } catch (ex) {
      // blow off errors here - dummy headers will fail
    }
  }
  if (msgClassifier.firstMessage) {
    // the async plugin was not used, maybe all whitelisted?
    await performActionsOnJunkMsgs(
      msgClassifier.mFolder,
      msgClassifier.mJunkMsgHdrs,
      msgClassifier.mGoodMsgHdrs
    );
  }
}

/**
 * Delete junk messages in the current folder. This provides the guarantee that
 * the method will be synchronous if no messages are deleted.
 *
 * @param {nsIMsgFolder} folder
 * @returns {integer} The number of messages deleted.
 */
function deleteJunkInFolder(folder) {
  // use direct folder commands if possible so we don't mess with the selection
  if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    const virtualFolder = VirtualFolderHelper.wrapVirtualFolder(folder);

    let count = 0;
    for (const searchFolder of virtualFolder.searchFolders) {
      count += deleteJunkInFolder(searchFolder);
    }

    return count;
  }

  const junkMsgHdrs = [];
  for (const msgHdr of folder.messages) {
    const junkScore = msgHdr.getStringProperty("junkscore");
    if (junkScore == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE) {
      junkMsgHdrs.push(msgHdr);
    }
  }

  if (junkMsgHdrs.length) {
    folder.deleteMessages(junkMsgHdrs, top.msgWindow, false, false, null, true);
  }
  return junkMsgHdrs.length;
}
