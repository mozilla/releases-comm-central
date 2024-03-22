/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests various features of imap autosync
// N.B. We need to beware of MessageInjection, since it turns off
// imap autosync.

// Our general approach is to attach an nsIAutoSyncMgrListener to the
// autoSyncManager, and listen for the expected events. We simulate idle
// by directly poking the nsIAutoSyncManager QI'd to nsIObserver with app
// idle events. If we really go idle, duplicate idle events are ignored.

// We test that checking non-inbox folders for new messages isn't
// interfering with autoSync's detection of new messages.

// We also test that folders that have messages added to them via move/copy
// get put in the front of the queue.

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var msgFlagOffline = Ci.nsMsgMessageFlags.Offline;

var gAutoSyncManager = Cc["@mozilla.org/imap/autosyncmgr;1"].getService(
  Ci.nsIAutoSyncManager
);
var gTargetFolder;

add_setup(function () {
  setupIMAPPump();
  addMessageToFolder(IMAPPump.inbox);
});

add_task(async function test_createTargetFolder() {
  gAutoSyncManager.addListener(gAutoSyncListener);

  IMAPPump.incomingServer.rootFolder.createSubfolder("targetFolder", null);
  await PromiseTestUtils.promiseFolderAdded("targetFolder");
  gTargetFolder =
    IMAPPump.incomingServer.rootFolder.getChildNamed("targetFolder");
  Assert.ok(gTargetFolder instanceof Ci.nsIMsgImapMailFolder);
  // set folder to be checked for new messages when inbox is checked.
  gTargetFolder.setFlag(Ci.nsMsgFolderFlags.CheckNew);
});

add_task(function test_checkForNewMessages() {
  addMessageToFolder(gTargetFolder);
  // This will update the INBOX and STATUS targetFolder. We only care about
  // the latter.
  IMAPPump.inbox.getNewMessages(null, null);
  IMAPPump.server.performTest("STATUS");
  // Now we'd like to make autosync update folders it knows about, to
  // get the initial autosync out of the way.
});

add_task(function test_triggerAutoSyncIdle() {
  // wait for both folders to get updated.
  gAutoSyncListener._waitingForDiscoveryList.push(IMAPPump.inbox);
  gAutoSyncListener._waitingForDiscoveryList.push(gTargetFolder);
  gAutoSyncListener._waitingForDiscovery = true;
  const observer = gAutoSyncManager.QueryInterface(Ci.nsIObserver);
  observer.observe(null, "mail-startup-done", "");
  observer.observe(null, "mail:appIdle", "idle");
});

// move the message to a diffent folder
add_task(async function test_moveMessageToTargetFolder() {
  const observer = gAutoSyncManager.QueryInterface(Ci.nsIObserver);
  observer.observe(null, "mail:appIdle", "back");
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  Assert.ok(msgHdr !== null);

  const listener = new PromiseTestUtils.PromiseCopyListener();
  // Now move this message to the target folder.
  MailServices.copy.copyMessages(
    IMAPPump.inbox,
    [msgHdr],
    gTargetFolder,
    true,
    listener,
    null,
    false
  );
  await listener.promise;
});

add_task(async function test_waitForTargetUpdate() {
  // After the copy, now we expect to get notified of the gTargetFolder
  // getting updated, after we simulate going idle.
  gAutoSyncListener._waitingForUpdate = true;
  gAutoSyncListener._waitingForUpdateList.push(gTargetFolder);
  gAutoSyncManager
    .QueryInterface(Ci.nsIObserver)
    .observe(null, "mail:appIdle", "idle");
  await gAutoSyncListener.promiseOnDownloadCompleted;
  await gAutoSyncListener.promiseOnDiscoveryQProcessed;
});

// Cleanup
add_task(function endTest() {
  let numMsgs = 0;
  for (const header of gTargetFolder.messages) {
    numMsgs++;
    Assert.notEqual(header.flags & Ci.nsMsgMessageFlags.Offline, 0);
  }
  Assert.equal(2, numMsgs);
  Assert.equal(gAutoSyncListener._waitingForUpdateList.length, 0);
  Assert.ok(!gAutoSyncListener._waitingForDiscovery);
  Assert.ok(!gAutoSyncListener._waitingForUpdate);
  teardownIMAPPump();
});

function autoSyncListenerPromise() {
  this._inQFolderList = [];
  this._runnning = false;
  this._lastMessage = {};
  this._waitingForUpdateList = [];
  this._waitingForUpdate = false;
  this._waitingForDiscoveryList = [];
  this._waitingForDiscovery = false;

  this._promiseOnDownloadCompleted = new Promise(resolve => {
    this._resolveOnDownloadCompleted = resolve;
  });
  this._promiseOnDiscoveryQProcessed = new Promise(resolve => {
    this._resolveOnDiscoveryQProcessed = resolve;
  });
}
autoSyncListenerPromise.prototype = {
  onStateChanged(running) {
    this._runnning = running;
  },

  onFolderAddedIntoQ(queue, folder) {
    dump("Folder added into Q " + this.qName(queue) + " " + folder.URI + "\n");
  },
  onFolderRemovedFromQ(queue, folder) {
    dump(
      "Folder removed from Q " + this.qName(queue) + " " + folder.URI + "\n"
    );
  },
  onDownloadStarted(folder) {
    dump("Folder download started" + folder.URI + "\n");
  },

  onDownloadCompleted(folder) {
    dump("Folder download completed" + folder.URI + "\n");
    if (folder instanceof Ci.nsIMsgFolder) {
      const index = mailTestUtils.non_strict_index_of(
        this._waitingForUpdateList,
        folder
      );
      if (index != -1) {
        this._waitingForUpdateList.splice(index, 1);
      }
      if (this._waitingForUpdate && this._waitingForUpdateList.length == 0) {
        dump("Got last folder update looking for.\n");
        this._waitingForUpdate = false;
        this._resolveOnDownloadCompleted();
      }
    }
  },

  onDownloadError(folder) {
    if (folder instanceof Ci.nsIMsgFolder) {
      dump("OnDownloadError: " + folder.prettyName + "\n");
    }
  },

  onDiscoveryQProcessed(folder) {
    dump("onDiscoveryQProcessed: " + folder.prettyName + "\n");
    const index = mailTestUtils.non_strict_index_of(
      this._waitingForDiscoveryList,
      folder
    );
    if (index != -1) {
      this._waitingForDiscoveryList.splice(index, 1);
    }
    if (
      this._waitingForDiscovery &&
      this._waitingForDiscoveryList.length == 0
    ) {
      dump("Got last folder discovery looking for\n");
      this._waitingForDiscovery = false;
      this._resolveOnDiscoveryQProcessed();
    }
  },

  onAutoSyncInitiated() {},
  qName(queueType) {
    if (queueType == Ci.nsIAutoSyncMgrListener.PriorityQueue) {
      return "priorityQ";
    }
    if (queueType == Ci.nsIAutoSyncMgrListener.UpdateQueue) {
      return "updateQ";
    }
    if (queueType == Ci.nsIAutoSyncMgrListener.DiscoveryQueue) {
      return "discoveryQ";
    }
    return "";
  },
  get promiseOnDownloadCompleted() {
    return this._promiseOnDownloadCompleted;
  },
  get promiseOnDiscoveryQProcessed() {
    return this._promiseOnDiscoveryQProcessed;
  },
};
var gAutoSyncListener = new autoSyncListenerPromise();

/*
 * helper functions
 */

// load and update a message in the imap fake server
function addMessageToFolder(folder) {
  let messages = [];
  const gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());

  const msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[0].toMessageString())
  );
  const ImapMailbox = IMAPPump.daemon.getMailbox(folder.name);
  // We add messages with \Seen flag set so that we won't accidentally
  // trigger the code that updates imap folders that have unread messages moved
  // into them.
  const message = new ImapMessage(msgURI.spec, ImapMailbox.uidnext++, [
    "\\Seen",
  ]);
  ImapMailbox.addMessage(message);
}
