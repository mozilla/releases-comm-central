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

/* globals gDBView, gViewWrapper */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
ChromeUtils.defineESModuleGetters(this, {
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
});

/**
 * Determines the actions that should be carried out on the messages
 * that are being marked as junk
 *
 * @param {nsIMsgFolder} aFolder - The folder with messages being marked as junk.
 * @returns {object} result an object with two properties.
 * @returns {boolean} result.markRead - Whether the messages should be marked
 *   as read.
 * @returns {?nsIMsgFolder} result.junkTargetFolder - Where the messages should
 *   be moved, or null if they should not be moved.
 */
function determineActionsForJunkMsgs(aFolder) {
  var actions = { markRead: false, junkTargetFolder: null };
  var spamSettings = aFolder.server.spamSettings;

  // note we will do moves/marking as read even if the spam
  // feature is disabled, since the user has asked to use it
  // despite the disabling

  actions.markRead = spamSettings.markAsReadOnSpam;
  actions.junkTargetFolder = null;

  // move only when the corresponding setting is activated
  // and the currently viewed folder is not the junk folder.
  if (spamSettings.moveOnSpam && !aFolder.getFlag(Ci.nsMsgFolderFlags.Junk)) {
    var spamFolderURI = spamSettings.spamFolderURI;
    if (!spamFolderURI) {
      // XXX TODO
      // we should use nsIPromptService to inform the user of the problem,
      // e.g. when the junk folder was accidentally deleted.
      dump("determineActionsForJunkMsgs: no spam folder found, not moving.");
    } else {
      actions.junkTargetFolder = MailUtils.getOrCreateFolder(spamFolderURI);
    }
  }

  return actions;
}

/**
 * Performs required operations on a list of newly-classified junk messages.
 *
 * @param {nsIMsgFolder} aFolder - The folder with messages being marked as
 *   junk.
 * @param {nsIMsgDBHdr[]} aJunkMsgHdrs - New junk messages.
 * @param {nsIMsgDBHdr[]} aGoodMsgHdrs - New good messages.
 */
async function performActionsOnJunkMsgs(aFolder, aJunkMsgHdrs, aGoodMsgHdrs) {
  return new Promise((resolve, reject) => {
    if (aFolder instanceof Ci.nsIMsgImapMailFolder) {
      // need to update IMAP custom flags
      if (aJunkMsgHdrs.length) {
        const junkMsgKeys = aJunkMsgHdrs.map(hdr => hdr.messageKey);
        aFolder.storeCustomKeywords(null, "Junk", "NonJunk", junkMsgKeys);
      }

      if (aGoodMsgHdrs.length) {
        const goodMsgKeys = aGoodMsgHdrs.map(hdr => hdr.messageKey);
        aFolder.storeCustomKeywords(null, "NonJunk", "Junk", goodMsgKeys);
      }
    }
    if (!aJunkMsgHdrs.length) {
      resolve();
      return;
    }

    const actionParams = determineActionsForJunkMsgs(aFolder);
    if (actionParams.markRead) {
      aFolder.markMessagesRead(aJunkMsgHdrs, true);
    }

    if (!actionParams.junkTargetFolder) {
      resolve();
      return;
    }

    // @implements {nsIMsgCopyServiceListener}
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
      OnStartCopy() {},
      OnProgress(progress, progressMax) {},
      SetMessageKey(key) {},
      GetMessageId() {},
      OnStopCopy(status) {
        if (Components.isSuccessCode(status)) {
          resolve();
          return;
        }
        const uri = actionParams.junkTargetFolder.URI;
        reject(new Error(`Moving junk to ${uri} failed.`));
      },
    };
    MailServices.copy.copyMessages(
      aFolder,
      aJunkMsgHdrs,
      actionParams.junkTargetFolder,
      true /* isMove */,
      listener,
      top.msgWindow,
      true /* allow undo */
    );
  });
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
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );

    if (nextMsgURI) {
      ++this.mProcessedMessages;
      if (Date.now() > this.lastStatusTime + statusDisplayInterval) {
        this.lastStatusTime = Date.now();
        var percentDone = 0;
        if (this.mTotalMessages) {
          percentDone = Math.round(
            (this.mProcessedMessages * 100) / this.mTotalMessages
          );
        }
        top.window.MsgStatusFeedback.showStatusString(
          bundle.formatStringFromName("junkAnalysisPercentComplete", [
            percentDone + "%",
          ])
        );
      }
      MailServices.junk.classifyMessage(nextMsgURI, top.msgWindow, this);
    } else {
      top.window.MsgStatusFeedback.showStatusString(
        bundle.GetStringFromName("processingJunkMessages")
      );
      await performActionsOnJunkMsgs(
        this.mFolder,
        this.mJunkMsgHdrs,
        this.mGoodMsgHdrs
      );
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
 * @returns {integer} The number of messages deleted.
 */
function deleteJunkInFolder() {
  // use direct folder commands if possible so we don't mess with the selection
  const selectedFolder = gViewWrapper.displayedFolder;
  if (!selectedFolder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    const junkMsgHdrs = [];
    for (const msgHdr of gDBView.msgFolder.messages) {
      const junkScore = msgHdr.getStringProperty("junkscore");
      if (junkScore == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE) {
        junkMsgHdrs.push(msgHdr);
      }
    }

    if (junkMsgHdrs.length) {
      gDBView.msgFolder.deleteMessages(
        junkMsgHdrs,
        top.msgWindow,
        false,
        false,
        null,
        true
      );
    }
    return junkMsgHdrs.length;
  }

  // Folder is virtual, let the view do the work (but we lose selection)

  // need to expand all threads, so we find everything
  gDBView.doCommand(Ci.nsMsgViewCommandType.expandAll);

  var treeView = gDBView.QueryInterface(Ci.nsITreeView);
  var count = treeView.rowCount;
  if (!count) {
    return 0;
  }

  var treeSelection = treeView.selection;

  var clearedSelection = false;

  // select the junk messages
  var messageUri;
  let numMessagesDeleted = 0;
  for (let i = 0; i < count; ++i) {
    try {
      messageUri = gDBView.getURIForViewIndex(i);
    } catch (ex) {
      continue; // blow off errors for dummy rows
    }
    const msgHdr =
      MailServices.messageServiceFromURI(messageUri).messageURIToMsgHdr(
        messageUri
      );
    const junkScore = msgHdr.getStringProperty("junkscore");
    var isJunk = junkScore == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE;
    // if the message is junk, select it.
    if (isJunk) {
      // only do this once
      if (!clearedSelection) {
        // clear the current selection
        // since we will be deleting all selected messages
        treeSelection.clearSelection();
        clearedSelection = true;
        treeSelection.selectEventsSuppressed = true;
      }
      treeSelection.rangedSelect(i, i, true /* augment */);
      numMessagesDeleted++;
    }
  }

  // if we didn't clear the selection
  // there was no junk, so bail.
  if (!clearedSelection) {
    return 0;
  }

  treeSelection.selectEventsSuppressed = false;
  // delete the selected messages
  //
  // We'll leave no selection after the delete
  if ("gNextMessageViewIndexAfterDelete" in window) {
    window.gNextMessageViewIndexAfterDelete = 0xffffffff; // nsMsgViewIndex_None
  }
  gDBView.doCommand(Ci.nsMsgViewCommandType.deleteMsg);
  treeSelection.clearSelection();
  return numMessagesDeleted;
}
