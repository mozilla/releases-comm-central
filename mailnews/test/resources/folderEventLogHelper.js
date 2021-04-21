/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from logHelper.js */

/*
 * Hook up folder notifications to logHelper.js.  This is for the benefit of
 *  gloda but others can benefit too.  Cramming it in gloda's file structure
 *  for now.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

function registerFolderEventLogHelper() {
  // Bail if there's no one on the other end who cares about our very
  //  expensive log additions.
  // This stuff might be useful for straight console debugging, but it'll
  //  be costly in the success case, so no go for now.
  if (!logHelperHasInterestedListeners()) {
    return;
  }

  MailServices.mailSession.AddFolderListener(
    _folderEventLogHelper_folderListener,
    Ci.nsIFolderListener.propertyFlagChanged | Ci.nsIFolderListener.event
  );
  MailServices.mfn.addListener(
    _folderEventLogHelper_msgFolderListener,
    Ci.nsIMsgFolderNotificationService.msgAdded |
      Ci.nsIMsgFolderNotificationService.msgsClassified |
      Ci.nsIMsgFolderNotificationService.msgsJunkStatusChanged |
      Ci.nsIMsgFolderNotificationService.msgsDeleted |
      Ci.nsIMsgFolderNotificationService.msgsMoveCopyCompleted |
      Ci.nsIMsgFolderNotificationService.msgKeyChanged |
      Ci.nsIMsgFolderNotificationService.msgUnincorporatedMoved |
      Ci.nsIMsgFolderNotificationService.folderAdded |
      Ci.nsIMsgFolderNotificationService.folderDeleted |
      Ci.nsIMsgFolderNotificationService.folderMoveCopyCompleted |
      Ci.nsIMsgFolderNotificationService.folderRenamed |
      Ci.nsIMsgFolderNotificationService.folderCompactStart |
      Ci.nsIMsgFolderNotificationService.folderCompactFinish |
      Ci.nsIMsgFolderNotificationService.folderReindexTriggered
  );
}

/**
 * nsIMsgFolderListener implementation to logHelper events that gloda cares
 *  about.
 * @implements {nsIMsgFolderListener}
 */
var _folderEventLogHelper_msgFolderListener = {
  msgAdded(aMsg) {
    mark_action("msgEvent", "msgAdded", [aMsg]);
  },

  /**
   * @param {Array<nsIMsgDBHdr>} aMsgs
   */
  msgsClassified(aMsgs, aJunkProcessed, aTraitProcessed) {
    let args = [
      aJunkProcessed ? "junk processed" : "did not junk process",
      aTraitProcessed ? "trait processed" : "did not trait process",
    ];
    args.push(...aMsgs);
    mark_action("msgEvent", "msgsClassified", args);
  },

  msgsJunkStatusChanged(messages) {
    mark_action("msgEvent", "msgsJunkStatusChanged", messages);
  },

  /**
   * @param {Array<nsIMsgDBHdr>} aMsgs
   */
  msgsDeleted(aMsgs) {
    mark_action("msgEvent", "msgsDeleted", aMsgs);
  },

  /**
   * @param {boolean} aMove
   * @param {nsIArray} aSrcMsgs
   * @param {nsIMsgFolder} aDestFolder
   * @param {nsIArray} aDestMsgs
   */
  msgsMoveCopyCompleted(aMove, aSrcMsgs, aDestFolder, aDestMsgs) {
    let args = [aMove ? "moved" : "copied"];
    args.push(...aSrcMsgs);
    args.push("to");
    args.push(aDestFolder);
    if (aDestMsgs) {
      args.push("dest headers:");
      args.push(...aDestMsgs);
    }
    mark_action("msgEvent", "msgsMoveCopyCompleted", args);
  },

  msgKeyChanged(aOldMsgKey, aNewMsgHdr) {
    let args = ["old key", aOldMsgKey, "new header", aNewMsgHdr];
    mark_action("msgEvent", "msgKeyChanged", args);
  },

  msgUnincorporatedMoved(srcFolder, msg) {
    mark_action("msgEvent", "msgUnincorporatedMoved", [srcFolder, msg]);
  },

  folderAdded(aFolder) {
    mark_action("msgEvent", "folderAdded", [aFolder]);
  },

  folderDeleted(aFolder) {
    mark_action("msgEvent", "folderDeleted", [aFolder]);
  },

  folderMoveCopyCompleted(aMove, aSrcFolder, aDestFolder) {
    mark_action("msgEvent", "folderMoveCopyCompleted", [
      aMove ? "move" : "copy",
      aSrcFolder,
      "to",
      aDestFolder,
    ]);
  },

  folderRenamed(aOrigFolder, aNewFolder) {
    mark_action("msgEvent", "folderRenamed", [aOrigFolder, "to", aNewFolder]);
  },

  folderCompactStart(folder) {
    mark_action("msgEvent", "folderCompactStart", [folder]);
  },

  folderCompactFinish(folder) {
    mark_action("msgEvent", "folderCompactFinish", [folder]);
  },

  folderReindexTriggered(folder) {
    mark_action("msgEvent", "folderReindexTriggered", [folder]);
  },
};

/**
 * nsIFolderListener implementation to logHelper stuff that gloda cares about.
 */
var _folderEventLogHelper_folderListener = {
  OnItemAdded(aParentItem, aItem) {},
  OnItemRemoved(aParentItem, aItem) {},
  OnItemPropertyChanged(aItem, aProperty, aOldValue, aNewValue) {},
  OnItemIntPropertyChanged(aItem, aProperty, aOldValue, aNewValue) {},
  OnItemBoolPropertyChanged(aItem, aProperty, aOldValue, aNewValue) {},
  OnItemUnicharPropertyChanged(aItem, aProperty, aOldValue, aNewValue) {},
  /**
   * Notice when user activity adds/removes tags or changes a message's
   *  status.
   */
  OnItemPropertyFlagChanged(aMsgHdr, aProperty, aOldValue, aNewValue) {
    mark_action("msgEvent", "OnItemPropertyFlagChanged", [
      "Header",
      aMsgHdr,
      "had property " +
        aProperty +
        " have the " +
        "following bits change: " +
        _explode_flags(aOldValue ^ aNewValue, Ci.nsMsgMessageFlags),
    ]);
  },

  /**
   * Get folder loaded notifications for folders that had to do some
   *  (asynchronous) processing before they could be opened.
   */
  OnItemEvent(aFolder, aEvent) {
    mark_action("msgEvent", "OnItemEvent", [aFolder, aEvent]);
  },
};
