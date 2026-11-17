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
  ]) {
    daemon.createMailbox(name, { subscribed: true });
  }

  gServer = makeServer(daemon, "RFC2342", {
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

async function updateFolder(folder) {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder
    .QueryInterface(Ci.nsIMsgImapMailFolder)
    .updateFolderWithListener(false, listener);
  await listener.promise;
}
