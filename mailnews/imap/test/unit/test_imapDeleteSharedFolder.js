/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests that deleting a folder in a shared namespace deletes it on the server
 * instead of trying to move it into the personal trash, which servers refuse.
 */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var gServer, gImapServer, gInbox;
var gDeletes = [];
// As in nsImapMailFolder.h.
const IMAP_ACL_DELETE_FOLDER = 0x400;

/**
 * @param {string} name - A mailbox name.
 * @returns {string} The shared namespace the mailbox is in, or "" for the
 *   personal one.
 */
function sharedNamespaceOf(name) {
  return (
    ["shared", "user"].find(ns => name == ns || name.startsWith(ns + "/")) ?? ""
  );
}

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  const daemon = new ImapDaemon();
  for (const name of [
    "Trash",
    "personal",
    "shared",
    "shared/sub",
    "user",
    "user/alice",
    "user/alice/sub",
    "shared/refused",
    "shared/with space",
    "shared/gone",
  ]) {
    daemon.createMailbox(name, { subscribed: true });
  }
  daemon.createMailbox("shared/locked", { subscribed: true, rights: "lrkt" });
  daemon.createMailbox("shared/xonly", { subscribed: true, rights: "lrx" });

  gServer = makeServer(daemon, "RFC2342,RFC4314", {
    NAMESPACE() {
      return '* NAMESPACE (("" "/")) (("user/" "/")) (("shared/" "/"))\0OK NAMESPACE completed';
    },
    // Like Dovecot, refuse to rename across namespaces.
    RENAME(args) {
      if (sharedNamespaceOf(args[0]) != sharedNamespaceOf(args[1])) {
        return "NO [CANNOT] Renaming not supported across non-private namespaces";
      }
      return IMAP_RFC3501_handler.prototype.RENAME.call(this, args);
    },
    DELETE(args) {
      gDeletes.push(args[0]);
      if (args[0] == "shared/refused") {
        return "NO [NOPERM] Permission denied";
      }
      return IMAP_RFC3501_handler.prototype.DELETE.call(this, args);
    },
  });
  gImapServer = createLocalIMAPServer(gServer.port);
  // A single connection, so that updating the inbox waits for a running URL.
  gImapServer.maximumConnectionsNumber = 1;
  gImapServer.deleteModel = Ci.nsMsgImapDeleteModels.MoveToTrash;
  localAccountUtils.loadLocalMailAccount();
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  account.defaultIdentity = identity;
  account.incomingServer = gImapServer;
  MailServices.accounts.defaultAccount = account;

  gInbox = gImapServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  await updateFolder(gInbox);
  Assert.ok(
    gImapServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash),
    "the trash should be discovered"
  );
});

registerCleanupFunction(function () {
  gImapServer.closeCachedConnections();
  gServer.resetTest();
  gServer.stop();
});

add_task(function testNamespaceRootIsNotDeletable() {
  const root = gImapServer.rootFolder;
  for (const name of ["shared", "user"]) {
    Assert.ok(
      !root.getChildNamed(name).deletable,
      `the namespace root ${name} should not be deletable`
    );
  }
  Assert.ok(
    root.getChildNamed("shared").getChildNamed("sub").deletable,
    "a folder in a shared namespace should be deletable"
  );
  Assert.ok(
    root.getChildNamed("personal").deletable,
    "a personal folder should be deletable"
  );
});

add_task(async function testDeleteSharedFolder() {
  for (const [parentPath, flag] of [
    ["shared", Ci.nsMsgFolderFlags.ImapPublic],
    ["user/alice", Ci.nsMsgFolderFlags.ImapOtherUser],
  ]) {
    const path = `${parentPath}/sub`;
    const parent = parentPath
      .split("/")
      .reduce((f, name) => f.getChildNamed(name), gImapServer.rootFolder);
    const folder = parent.getChildNamed("sub");
    Assert.ok(folder.getFlag(flag), `${path} should be flagged as shared`);

    folder.deleteSelf(false);
    await TestUtils.waitForCondition(
      () => !gServer._daemon.getMailbox(path),
      `${path} should be deleted on the server`
    );
    await updateFolder(gInbox);
    Assert.ok(
      !gServer._daemon.getMailbox("Trash/sub"),
      `${path} should not be in the trash`
    );
    Assert.ok(
      !parent.containsChildNamed("sub"),
      `${path} should be gone from the folder tree`
    );
  }
});

add_task(async function testDeletePersonalFolderStillMovesToTrash() {
  const folder = gImapServer.rootFolder.getChildNamed("personal");
  Assert.ok(
    !folder.getFlag(
      Ci.nsMsgFolderFlags.ImapPublic | Ci.nsMsgFolderFlags.ImapOtherUser
    ),
    "a personal folder should not be flagged as shared"
  );
  folder.deleteSelf(false);
  const trash = gImapServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Trash
  );
  await TestUtils.waitForCondition(
    () => trash.containsChildNamed("personal"),
    "the folder should be moved into the trash"
  );
  Assert.ok(
    gServer._daemon.getMailbox("Trash/personal"),
    "the folder should be in the trash on the server"
  );
});

add_task(async function testNoDeleteRightIsNotDeletable() {
  const folder = gImapServer.rootFolder
    .getChildNamed("shared")
    .getChildNamed("locked");
  await updateFolder(folder);
  Assert.ok(
    !folder.deletable,
    "a folder without the delete right should not be deletable"
  );
  Assert.equal(
    folder.QueryInterface(Ci.nsIImapMailFolderSink).aclFlags &
      IMAP_ACL_DELETE_FOLDER,
    0,
    "the ACL cache should not have the delete folder right"
  );
  // Like after a restart: the rights come from the cache only. It keeps "t"
  // as the right to delete messages, which comes back as "dt".
  folder.QueryInterface(Ci.nsIImapMailFolderSink).clearFolderRights();
  Assert.ok(
    !folder.deletable,
    "a folder without the delete right should not be deletable after a restart"
  );
});

add_task(async function testDeleteRightIsCached() {
  const folder = gImapServer.rootFolder
    .getChildNamed("shared")
    .getChildNamed("xonly");
  await updateFolder(folder);
  Assert.ok(folder.deletable, "a folder with the x right should be deletable");
  Assert.notEqual(
    folder.QueryInterface(Ci.nsIImapMailFolderSink).aclFlags &
      IMAP_ACL_DELETE_FOLDER,
    0,
    "the ACL cache should have the delete folder right"
  );
  folder.QueryInterface(Ci.nsIImapMailFolderSink).clearFolderRights();
  Assert.ok(
    folder.deletable,
    "a folder with the x right should be deletable after a restart"
  );
});

add_task(async function testRefusedDeleteKeepsFolder() {
  const parent = gImapServer.rootFolder.getChildNamed("shared");
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.deleteFolder(
    parent.getChildNamed("refused"),
    listener,
    false
  );
  await Assert.rejects(
    listener.promise,
    /.*/,
    "deleting should fail when the server refuses the DELETE"
  );
  Assert.ok(
    gDeletes.includes("shared/refused"),
    "the server should get the DELETE"
  );
  Assert.ok(
    parent.containsChildNamed("refused"),
    "a folder the server didn't delete should stay in the folder tree"
  );
});

add_task(async function testRefusedInteractiveDeleteAlerts() {
  const parent = gImapServer.rootFolder.getChildNamed("shared");
  const alerted = new Promise(resolve => {
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),
      onAlert(message, serverKey, silent) {
        MailServices.mailSession.removeUserFeedbackListener(listener);
        resolve({ message, silent });
        return true;
      },
      onCertError() {},
    };
    MailServices.mailSession.addUserFeedbackListener(listener);
  });
  parent.getChildNamed("refused").deleteSelf(true);
  const { message, silent } = await alerted;
  Assert.ok(!silent, "the alert should be shown to the user");
  Assert.stringContains(
    message,
    "Permission denied",
    "the alert should show the server's error"
  );
  Assert.ok(
    parent.containsChildNamed("refused"),
    "a folder the server didn't delete should stay in the folder tree"
  );
});

add_task(async function testDeleteFolderWithSpace() {
  const parent = gImapServer.rootFolder.getChildNamed("shared");
  parent.getChildNamed("with space").deleteSelf(false);
  await TestUtils.waitForCondition(
    () => !gServer._daemon.getMailbox("shared/with space"),
    "the folder should be deleted on the server"
  );
  await updateFolder(gInbox);
  Assert.ok(
    !parent.containsChildNamed("with space"),
    "the folder should be gone from the folder tree"
  );
});

add_task(async function testDeleteFolderGoneOnServer() {
  const parent = gImapServer.rootFolder.getChildNamed("shared");
  gServer._daemon.deleteMailbox(gServer._daemon.getMailbox("shared/gone"));
  const deletes = gDeletes.length;
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.deleteFolder(parent.getChildNamed("gone"), listener, false);
  await listener.promise;
  Assert.equal(gDeletes.length, deletes, "no DELETE should be sent");
  Assert.ok(
    !parent.containsChildNamed("gone"),
    "a folder already gone on the server should be gone locally too"
  );
});

async function updateFolder(folder) {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder
    .QueryInterface(Ci.nsIMsgImapMailFolder)
    .updateFolderWithListener(false, listener);
  await listener.promise;
}
