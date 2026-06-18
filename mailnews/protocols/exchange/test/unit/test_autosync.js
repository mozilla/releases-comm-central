/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

let ewsServer, ewsIncomingServer;
let graphServer, graphIncomingServer;
let autoSyncManager;

const generator = new MessageGenerator();

/**
 * Mostly copied from `autoSyncListenerPromise` from
 * mailnews/imap/test/unit/test_imapAutoSync.js
 */
class AutoSyncListener {
  waitingForUpdateList = [];
  waitingForUpdate = false;

  #promiseOnDownloadCompleted = new Promise(resolve => {
    this._resolveOnDownloadCompleted = resolve;
  });

  onStateChanged(_running) {}

  onFolderAddedIntoQ(queue, folder) {
    info(`Folder added into queue ${this.qName(queue)}: ${folder.URI}`);
  }
  onFolderRemovedFromQ(queue, folder) {
    info(`Folder removed from queue ${this.qName(queue)}: ${folder.URI}`);
  }
  onDownloadStarted(folder) {
    info(`Folder download started: ${folder.URI}`);
  }

  onDownloadCompleted(folder) {
    info(`Folder download completed: ${folder.URI}`);
    if (folder instanceof Ci.nsIMsgFolder) {
      const index = mailTestUtils.non_strict_index_of(
        this.waitingForUpdateList,
        folder
      );
      if (index != -1) {
        this.waitingForUpdateList.splice(index, 1);
      }
      if (this.waitingForUpdate && this.waitingForUpdateList.length == 0) {
        info("Got last folder update.");
        this.waitingForUpdate = false;
        this._resolveOnDownloadCompleted();
      }
    }
  }

  onDownloadError(folder) {
    info(`onDownloadError: ${folder.name}`);
  }

  onDiscoveryQProcessed(folder) {
    info(`onDiscoveryQProcessed: ${folder.name}`);
  }

  onAutoSyncInitiated() {}
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
  }
  get promiseOnDownloadCompleted() {
    return this.#promiseOnDownloadCompleted;
  }
}

add_setup(async function () {
  [ewsServer, ewsIncomingServer] = setupBasicEwsTestServer({});
  const ewsAccount = MailServices.accounts.createAccount();
  const ewsIdentity = MailServices.accounts.createIdentity();
  ewsAccount.addIdentity(ewsIdentity);
  ewsAccount.incomingServer = ewsIncomingServer;

  [graphServer, graphIncomingServer] = setupBasicGraphTestServer({});
  const graphAccount = MailServices.accounts.createAccount();
  const graphIdentity = MailServices.accounts.createIdentity();
  graphAccount.addIdentity(graphIdentity);
  graphAccount.incomingServer = graphIncomingServer;

  autoSyncManager = Cc["@mozilla.org/imap/autosyncmgr;1"].getService(
    Ci.nsIAutoSyncManager
  );

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(ewsAccount, false);
    MailServices.accounts.removeAccount(graphAccount, false);
  });
});

/**
 * Tests that messages in folders can be downloaded automatically.
 *
 * @param {MockServer} mockServer - The `MockServer` child class instance to use
 *   for creating folders and messages.
 * @param {nsIMsgIncomingFolder} incomingServer - The incoming message for the
 *   protocol that's being tested.
 */
async function runAutoSyncTest(mockServer, incomingServer) {
  const folderName = `autosync_${incomingServer.type}`;

  mockServer.appendRemoteFolder(new RemoteFolder(folderName, "root"));
  await syncFolder(incomingServer, incomingServer.rootFolder);

  // Create a listener and attach it to the autosync manager.
  const listener = new AutoSyncListener();
  autoSyncManager.addListener(listener);

  // Get the folder and mark it for offline use.
  const targetFolder = incomingServer.rootFolder.getChildNamed(folderName);
  targetFolder.setFlag(Ci.nsMsgFolderFlags.Offline);

  // Record the folder as one to watch in the listener.
  listener.waitingForUpdateList.push(targetFolder);
  listener.waitingForUpdate = true;

  mockServer.addMessages(folderName, [generator.makeMessage()]);

  // Start the autosync manager, and wait until it's done downloading messages
  // in the folder.
  const observer = autoSyncManager.QueryInterface(Ci.nsIObserver);
  observer.observe(null, "mail-startup-done", "");
  observer.observe(null, "mail:appIdle", "idle");
  await listener.promiseOnDownloadCompleted;

  Assert.equal(
    targetFolder.getTotalMessages(true),
    1,
    "the message should have appeared in the folder"
  );

  const msg = [...targetFolder.messages][0];
  Assert.ok(
    msg.flags & Ci.nsMsgMessageFlags.Offline,
    "the message's content should have been downloaded"
  );
}

add_task(async function test_autosync_ews() {
  await runAutoSyncTest(ewsServer, ewsIncomingServer);
});

add_task(async function test_autosync_graph() {
  await runAutoSyncTest(graphServer, graphIncomingServer);
});
