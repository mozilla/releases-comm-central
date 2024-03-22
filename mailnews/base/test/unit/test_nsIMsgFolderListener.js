/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Test suite for basic functionality with nsIMsgFolderListeners.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var nsIMFNService = Ci.nsIMsgFolderNotificationService;

var gIndividualFlags = [
  nsIMFNService.msgAdded,
  nsIMFNService.msgsClassified,
  nsIMFNService.msgsJunkStatusChanged,
  nsIMFNService.msgsDeleted,
  nsIMFNService.msgsMoveCopyCompleted,
  nsIMFNService.msgKeyChanged,
  nsIMFNService.msgUnincorporatedMoved,
  nsIMFNService.folderAdded,
  nsIMFNService.folderDeleted,
  nsIMFNService.folderMoveCopyCompleted,
  nsIMFNService.folderRenamed,
  nsIMFNService.folderCompactStart,
  nsIMFNService.folderCompactFinish,
  nsIMFNService.folderReindexTriggered,
];

// Our listener, which captures events.
function gMFListener() {}
gMFListener.prototype = {
  mReceived: 0,
  mRemoveSelf: false,
  msgAdded() {
    Assert.equal(this.mReceived & nsIMFNService.msgAdded, 0);
    this.mReceived |= nsIMFNService.msgAdded;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  msgsClassified() {
    Assert.equal(this.mReceived & nsIMFNService.msgsClassified, 0);
    this.mReceived |= nsIMFNService.msgsClassified;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  msgsJunkStatusChanged() {
    Assert.equal(this.mReceived & nsIMFNService.msgsJunkStatusChanged, 0);
    this.mReceived |= nsIMFNService.msgsJunkStatusChanged;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  msgsDeleted() {
    Assert.equal(this.mReceived & nsIMFNService.msgsDeleted, 0);
    this.mReceived |= nsIMFNService.msgsDeleted;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  msgsMoveCopyCompleted() {
    Assert.equal(this.mReceived & nsIMFNService.msgsMoveCopyCompleted, 0);
    this.mReceived |= nsIMFNService.msgsMoveCopyCompleted;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  msgKeyChanged() {
    Assert.equal(this.mReceived & nsIMFNService.msgKeyChanged, 0);
    this.mReceived |= nsIMFNService.msgKeyChanged;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  msgUnincorporatedMoved() {
    Assert.equal(this.mReceived & nsIMFNService.msgUnincorporatedMoved, 0);
    this.mReceived |= nsIMFNService.msgUnincorporatedMoved;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  folderAdded() {
    Assert.equal(this.mReceived & nsIMFNService.folderAdded, 0);
    this.mReceived |= nsIMFNService.folderAdded;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  folderDeleted() {
    Assert.equal(this.mReceived & nsIMFNService.folderDeleted, 0);
    this.mReceived |= nsIMFNService.folderDeleted;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  folderMoveCopyCompleted() {
    Assert.equal(this.mReceived & nsIMFNService.folderMoveCopyCompleted, 0);
    this.mReceived |= nsIMFNService.folderMoveCopyCompleted;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  folderRenamed() {
    Assert.equal(this.mReceived & nsIMFNService.folderRenamed, 0);
    this.mReceived |= nsIMFNService.folderRenamed;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  folderCompactStart() {
    Assert.equal(this.mReceived & nsIMFNService.folderCompactStart, 0);
    this.mReceived |= nsIMFNService.folderCompactStart;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  folderCompactFinish() {
    Assert.equal(this.mReceived & nsIMFNService.folderCompactFinish, 0);
    this.mReceived |= nsIMFNService.folderCompactFinish;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },

  folderReindexTriggered() {
    Assert.equal(this.mReceived & nsIMFNService.folderReindexTriggered, 0);
    this.mReceived |= nsIMFNService.folderReindexTriggered;
    if (this.mRemoveSelf) {
      MailServices.mfn.removeListener(this);
    }
  },
};

function NotifyMsgFolderListeners() {
  MailServices.mfn.notifyMsgAdded(null);
  MailServices.mfn.notifyMsgsClassified([], null, null);
  MailServices.mfn.notifyMsgsJunkStatusChanged([]);
  MailServices.mfn.notifyMsgsDeleted([]);
  MailServices.mfn.notifyMsgsMoveCopyCompleted(null, [], null, []);
  MailServices.mfn.notifyMsgKeyChanged(null, null);
  MailServices.mfn.notifyMsgUnincorporatedMoved(null, null);
  MailServices.mfn.notifyFolderAdded(null);
  MailServices.mfn.notifyFolderDeleted(null);
  MailServices.mfn.notifyFolderMoveCopyCompleted(null, null, null);
  MailServices.mfn.notifyFolderRenamed(null, null);
  MailServices.mfn.notifyFolderCompactStart(null);
  MailServices.mfn.notifyFolderCompactFinish(null);
  MailServices.mfn.notifyFolderReindexTriggered(null);
}

function run_test() {
  // Test: Add listeners
  var singleListeners = [];

  var addAListener = function (flag) {
    var listener = new gMFListener();
    MailServices.mfn.addListener(listener, flag);
    singleListeners.push(listener);
  };

  gIndividualFlags.forEach(addAListener);

  // Test: Notify the listeners of all events.
  NotifyMsgFolderListeners();

  // Test: check whether the correct number of notifications have been received.
  // Then remove the listeners
  var checkFlag = function (flag) {
    var listener = singleListeners.shift();
    Assert.equal(listener.mReceived, flag);
    listener.mRemoveSelf = true;
    listener.mReceived = 0;
    singleListeners.push(listener);
  };
  gIndividualFlags.forEach(checkFlag);

  // We'll do one more set of notifications, and remove ourselves in the middle of them
  NotifyMsgFolderListeners();

  // Test: all listeners should be removed at this point
  Assert.ok(!MailServices.mfn.hasListeners);

  // Test: Send notifications again. Check that we don't receive any notifications.
  singleListeners.forEach(function (listener) {
    listener.mReceived = 0;
  });

  NotifyMsgFolderListeners();

  var checkNotReceived = function () {
    Assert.equal(singleListeners.shift().mReceived, 0);
  };
  gIndividualFlags.forEach(checkNotReceived);
}
