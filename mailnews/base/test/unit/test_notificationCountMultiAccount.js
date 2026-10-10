/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Regression test for the unread-count badge under-counting with more than one
 * account. After a restart the folders of accounts the folder pane has not
 * shown yet are not loaded, and the badge has to count their inboxes anyway. */

var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

function addUnread(inbox, count) {
  const gen = new MessageGenerator();
  inbox.addMessageBatch(
    gen.makeMessages({ count }).map(m => m.toMessageString())
  );
  inbox.updateFolder(null);
  inbox.msgDatabase.commit(Ci.nsMsgDBCommitType.kLargeCommit);
  return inbox.getNumUnread(false);
}

add_task(async function test_countsAllInboxesAfterRestart() {
  Services.prefs.setBoolPref("mail.notification.count.inbox_only", true);
  Services.prefs.setBoolPref("mail.biff.use_new_count_in_badge", false);

  // Two local accounts, each with unread mail in its Inbox.
  localAccountUtils.loadLocalMailAccount();
  const inbox1 = localAccountUtils.inboxFolder;
  inbox1.setFlag(Ci.nsMsgFolderFlags.Inbox);
  addUnread(inbox1, 3);

  const server2 = MailServices.accounts.createIncomingServer(
    "user2",
    "localhost2",
    "none"
  );
  MailServices.accounts.createAccount().incomingServer = server2;
  const root2 = server2.rootMsgFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const inbox2 = root2
    .createLocalSubfolder("Inbox")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  inbox2.setFlag(Ci.nsMsgFolderFlags.Inbox | Ci.nsMsgFolderFlags.Mail);
  addUnread(inbox2, 5);

  // Simulate a restart: drop the in-memory folder objects, then reload the
  // accounts from prefs.
  Cc["@mozilla.org/messenger/msgFolderCache;1"]
    .getService(Ci.nsIMsgFolderCache)
    .flush();
  MailServices.accounts.unloadAccounts();
  Assert.equal(
    MailServices.accounts.allServers.length,
    2,
    "accounts should reload"
  );

  // numSubFolders reads the in-memory list without discovering, so it confirms
  // the reloaded roots start out with their hierarchies undiscovered.
  for (const server of MailServices.accounts.allServers) {
    Assert.equal(
      server.rootFolder.numSubFolders,
      0,
      "subfolders are not discovered right after reload"
    );
  }

  // Load the service only now, so that it counts at startup against the
  // reloaded accounts, and read the count the way the badge does.
  const { MailNotificationService } = ChromeUtils.importESModule(
    "resource:///modules/MailNotificationService.sys.mjs"
  );
  const counts = [];
  MailNotificationService.addListener({
    onCountChanged(count) {
      counts.push(count);
    },
  });
  Assert.deepEqual(
    counts,
    [8],
    "a badge listener gets the unread count of both accounts' inboxes"
  );
});
