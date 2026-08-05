/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Regression test for the unread-count badge under-counting with more than one
 * account. After a restart the subfolders of accounts other than the one shown
 * in the folder pane have not been discovered into memory yet. The badge walks
 * nsIMsgFolder.descendants, so descendants must force that discovery from the
 * message store; otherwise the inboxes of the not-yet-loaded accounts are
 * missed and the badge under-counts (typically to zero). See bug for the macOS
 * dock badge showing nothing with multiple inboxes. */

var { MailNotificationService } = ChromeUtils.importESModule(
  "resource:///modules/MailNotificationService.sys.mjs"
);
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

  // Reading descendants must now force discovery so the inboxes show up.
  for (const server of MailServices.accounts.allServers) {
    const inbox = server.rootFolder.descendants.find(
      f => f.flags & Ci.nsMsgFolderFlags.Inbox
    );
    Assert.ok(
      inbox,
      `${server.rootFolder.URI} inbox discovered via descendants`
    );
  }

  // The service counts both inboxes.
  let total = 0;
  for (const server of MailServices.accounts.allServers) {
    total += MailNotificationService.countUnread(server.rootFolder);
  }
  Assert.equal(total, 8, "both accounts' inbox unread should be counted");
});
