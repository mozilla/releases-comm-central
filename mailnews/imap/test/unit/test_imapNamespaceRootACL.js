/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests that Thunderbird fetches the rights of a selectable namespace root
 * like those of any other folder (bug 2078247).
 */

add_setup(function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  localAccountUtils.loadLocalMailAccount();
});

add_task(async function testReadOnlyNamespaceRoot() {
  await checkReadOnlyRoot('(("" "/")) NIL (("shared/" "/"))', true);
});

add_task(async function testReadOnlyNamespaceRootFromDiscovery() {
  // "INBOX/*" doesn't list "shared", so discovery has to list it itself.
  await checkReadOnlyRoot('(("INBOX/" "/")) NIL (("shared/" "/"))', false);
});

add_task(async function testNoselectParentBecomesMailbox() {
  // "shared" is known as a Noselect folder, as when the server listed
  // "shared/sub" first or an earlier version didn't list it, and becomes
  // selectable.
  const daemon = new ImapDaemon();
  daemon.createMailbox("shared", {
    subscribed: true,
    flags: ["\\Noselect"],
  });
  daemon.createMailbox("shared/sub", { subscribed: true, rights: "lr" });
  const server = makeServer(daemon, "RFC2342,RFC4314", {
    NAMESPACE() {
      return '* NAMESPACE (("" "/")) NIL (("shared/" "/"))\0OK NAMESPACE completed';
    },
  });
  const incomingServer = createLocalIMAPServer(server.port);
  incomingServer.maximumConnectionsNumber = 1;
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  account.defaultIdentity = identity;
  account.incomingServer = incomingServer;

  const root = incomingServer.rootFolder;
  await updateFolder(root.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox));
  const shared = root.getChildNamed("shared");
  Assert.ok(
    shared.getFlag(Ci.nsMsgFolderFlags.ImapNoselect),
    "shared folder should not be selectable yet"
  );

  const mailbox = daemon.getMailbox("shared");
  mailbox.flags = [];
  mailbox.rights = "lr";
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(root, listener, false);
  await listener.promise;
  Assert.ok(
    !shared.getFlag(Ci.nsMsgFolderFlags.ImapNoselect),
    "shared folder should be selectable"
  );
  Assert.ok(
    !shared.canFileMessages,
    "should not be able to file messages into shared"
  );

  incomingServer.closeCachedConnections();
  server.stop();
  MailServices.accounts.removeAccount(account, false);
});

/**
 * Lets Thunderbird discover a read-only public namespace root "shared" with
 * a child "sub", and checks that it treats both as read-only.
 *
 * @param {string} namespaces - The NAMESPACE response.
 * @param {boolean} select - Whether to select "shared" before checking.
 */
async function checkReadOnlyRoot(namespaces, select) {
  const daemon = new ImapDaemon();
  daemon.createMailbox("shared", { subscribed: true, rights: "lr" });
  daemon.createMailbox("shared/sub", { subscribed: true, rights: "lr" });
  const server = makeServer(daemon, "RFC2342,RFC4314", {
    NAMESPACE() {
      return `* NAMESPACE ${namespaces}\0OK NAMESPACE completed`;
    },
  });
  const incomingServer = createLocalIMAPServer(server.port);
  incomingServer.maximumConnectionsNumber = 1;
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  account.defaultIdentity = identity;
  account.incomingServer = incomingServer;

  const root = incomingServer.rootFolder;
  await updateFolder(root.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox));
  const shared = root.getChildNamed("shared");
  Assert.ok(
    !shared.getFlag(Ci.nsMsgFolderFlags.ImapNoselect),
    "shared folder should be selectable"
  );
  if (select) {
    await updateFolder(shared);
  }

  for (const folder of [shared, shared.getChildNamed("sub")]) {
    Assert.ok(
      !folder.canFileMessages,
      `should not be able to file messages into ${folder.name}`
    );
    Assert.ok(
      !folder.canDeleteMessages,
      `should not be able to delete messages from ${folder.name}`
    );
  }

  incomingServer.closeCachedConnections();
  server.stop();
  MailServices.accounts.removeAccount(account, false);
}

async function updateFolder(folder) {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder
    .QueryInterface(Ci.nsIMsgImapMailFolder)
    .updateFolderWithListener(false, listener);
  await listener.promise;
}
