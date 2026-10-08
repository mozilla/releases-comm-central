/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests that messages and folders can be moved into the root mailbox of a
 * namespace, named like the prefix without its trailing delimiter
 * (bug 2005701).
 */

var gServer, gImapServer, gInbox;

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  const daemon = new ImapDaemon();
  daemon.createMailbox("shared", { subscribed: true });
  daemon.createMailbox("shared/sub", { subscribed: true });
  daemon.createMailbox("folder", { subscribed: true });
  addMessage(daemon.getMailbox("INBOX"));
  addMessage(daemon.getMailbox("shared"));

  // Like Dovecot or Cyrus, advertise the prefix with its trailing delimiter.
  gServer = makeServer(daemon, "RFC2342", {
    NAMESPACE() {
      return '* NAMESPACE (("" "/")) NIL (("shared/" "/"))\0OK NAMESPACE completed';
    },
  });
  gImapServer = createLocalIMAPServer(gServer.port);
  gImapServer.maximumConnectionsNumber = 1;
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
    gImapServer.rootFolder.getChildNamed("shared"),
    "the namespace root should be discovered"
  );
});

registerCleanupFunction(function () {
  gImapServer.closeCachedConnections();
  gServer.resetTest();
  gServer.stop();
});

add_task(async function testMoveMessageToNamespaceRoot() {
  const shared = gImapServer.rootFolder.getChildNamed("shared");
  await updateFolder(gInbox);
  const [header] = [...gInbox.msgDatabase.enumerateMessages()];
  const listener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    gInbox,
    [header],
    shared,
    true,
    listener,
    null,
    false
  );
  await listener.promise;
  Assert.equal(gServer._daemon.getMailbox("shared")._messages.length, 2);
});

add_task(async function testMoveFolderToNamespaceRoot() {
  const root = gImapServer.rootFolder;
  const listener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(
    root.getChildNamed("folder"),
    root.getChildNamed("shared"),
    true,
    listener,
    null
  );
  await listener.promise;
  Assert.ok(gServer._daemon.getMailbox("shared/folder"));
});

async function updateFolder(folder) {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder
    .QueryInterface(Ci.nsIMsgImapMailFolder)
    .updateFolderWithListener(null, listener);
  await listener.promise;
}

function addMessage(mailbox) {
  const message = gMessageGenerator.makeMessage();
  const uri = Services.io.newURI(
    "data:text/plain;base64," + btoa(message.toMessageString())
  );
  mailbox.addMessage(new ImapMessage(uri.spec, mailbox.uidnext++, []));
}
