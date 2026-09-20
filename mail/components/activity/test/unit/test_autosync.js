/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { autosyncModule } = ChromeUtils.importESModule(
  "resource:///modules/activity/autosync.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

let testAccount;
let testFolder;

add_setup(function () {
  do_get_profile();
  testAccount = MailServices.accounts.createLocalMailAccount();
  const rootFolder = testAccount.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder.createLocalSubfolder("AutoSync Activity Test");

  registerCleanupFunction(() => {
    autosyncModule._inQFolderList.length = 0;
    autosyncModule._syncInfoPerFolder.clear();
    autosyncModule._syncInfoPerServer.clear();
    autosyncModule._lastMessage.clear();
    MailServices.accounts.removeAccount(testAccount, false);
  });
});

add_task(function test_untracked_notifications_are_ignored() {
  autosyncModule.onDownloadCompleted(testFolder);
  autosyncModule.onFolderRemovedFromQ(
    Ci.nsIAutoSyncMgrListener.PriorityQueue,
    testFolder
  );

  Assert.equal(autosyncModule._syncInfoPerFolder.size, 0);
  Assert.equal(autosyncModule._syncInfoPerServer.size, 0);
});

add_task(function test_download_start_recovers_missing_queue_notification() {
  autosyncModule._running = true;
  autosyncModule.onDownloadStarted(testFolder, 1, 2);

  const syncItem = autosyncModule._syncInfoPerFolder.get(testFolder.URI);
  Assert.ok(syncItem, "download start should create missing activity state");
  Assert.equal(syncItem.totalDownloaded, 1);
  Assert.equal(syncItem.pendingMsgCount, 2);
  Assert.ok(autosyncModule._syncInfoPerServer.has(testFolder.server));

  autosyncModule.onDownloadCompleted(testFolder);

  // Avoid creating a completed activity event, which is outside this test's
  // scope and would otherwise remain in the global activity manager.
  syncItem.activity.state = Ci.nsIActivityProcess.STATE_CANCELED;
  autosyncModule.onFolderRemovedFromQ(
    Ci.nsIAutoSyncMgrListener.PriorityQueue,
    testFolder
  );

  Assert.ok(!autosyncModule._syncInfoPerFolder.has(testFolder.URI));
  Assert.ok(!autosyncModule._syncInfoPerServer.has(testFolder.server));
  Assert.ok(!autosyncModule._inQFolderList.includes(testFolder));
});
