/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests folders with special use flags prevent removal of those flags, if the
 * flags come from an IMAP server.
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);

add_task(async function () {
  const server = new IMAPServer();
  server.daemon.createMailbox("Trash", {
    flags: ["\\Trash"],
    subscribed: true,
  });
  server.daemon.createMailbox("Sent", { flags: ["\\Sent"], subscribed: true });
  server.daemon.createMailbox("Drafts", {
    flags: ["\\Drafts"],
    subscribed: true,
  });
  server.daemon.createMailbox("Spam", { flags: ["\\Spam"], subscribed: true });
  server.daemon.createMailbox("Archives", {
    flags: ["\\Archive"],
    subscribed: true,
  });
  server.daemon.createMailbox("Not Special", { subscribed: true });

  const account = MailServices.accounts.createAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  account.incomingServer.password = "password";
  account.incomingServer.port = server.port;

  const rootFolder = account.incomingServer.rootFolder;
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(rootFolder, listener, null);
  await listener.promise;

  const inboxFolder = rootFolder.getChildNamed("INBOX");
  testLockedFlag(inboxFolder, "Inbox");
  testUnlockedFlag(inboxFolder);

  const sentFolder = rootFolder.getChildNamed("Sent");
  testLockedFlag(sentFolder, "SentMail");
  testUnlockedFlag(sentFolder);

  const draftsFolder = rootFolder.getChildNamed("Drafts");
  testLockedFlag(draftsFolder, "Drafts");
  testUnlockedFlag(draftsFolder);

  const trashFolder = rootFolder.getChildNamed("Trash");
  testLockedFlag(trashFolder, "Trash");
  testUnlockedFlag(trashFolder);

  const spamFolder = rootFolder.getChildNamed("Spam");
  testLockedFlag(spamFolder, "Junk");
  testUnlockedFlag(spamFolder);

  const archivesFolder = rootFolder.getChildNamed("Archives");
  testLockedFlag(archivesFolder, "Archive");
  testUnlockedFlag(archivesFolder);

  const notSpecialFolder = rootFolder.getChildNamed("Not Special");
  testUnlockedFlag(notSpecialFolder);
  testUnlockedFlag(notSpecialFolder, "SentMail");
  testUnlockedFlag(notSpecialFolder, "Archive");
});

function testLockedFlag(folder, flagName) {
  info(`checking the locked functions with ${flagName} flag on ${folder.URI}`);
  const flag = Ci.nsMsgFolderFlags[flagName];
  const initialFlags = folder.flags;
  Assert.ok(initialFlags & flag, "folder had flag to begin with");

  folder.clearFlag(flag);
  Assert.equal(
    folder.flags.toString(16),
    initialFlags.toString(16),
    "flags are unchanged after clearFlag"
  );

  folder.toggleFlag(flag);
  Assert.equal(
    folder.flags.toString(16),
    initialFlags.toString(16),
    "flags are unchanged after toggleFlag"
  );

  folder.flags &= ~flag;
  Assert.equal(
    folder.flags.toString(16),
    initialFlags.toString(16),
    "flags are unchanged after setFlags"
  );
}

function testUnlockedFlag(folder, flagName = "Unused4") {
  info(
    `checking the unlocked functions with ${flagName} flag on ${folder.URI}`
  );
  const flag = Ci.nsMsgFolderFlags[flagName];
  const initialFlags = folder.flags;
  Assert.ok(!(initialFlags & flag), "folder did not have flag to begin with");

  folder.setFlag(flag);
  Assert.equal(
    folder.flags.toString(16),
    (initialFlags | flag).toString(16),
    "flag is added by setFlag"
  );

  folder.clearFlag(flag);
  Assert.equal(
    folder.flags.toString(16),
    initialFlags.toString(16),
    "flag is removed by clearFlag"
  );

  folder.toggleFlag(flag);
  Assert.equal(
    folder.flags.toString(16),
    (initialFlags | flag).toString(16),
    "flag is added by toggleFlag"
  );

  folder.flags &= ~flag;
  Assert.equal(
    folder.flags.toString(16),
    initialFlags.toString(16),
    "flag is removed by setFlags"
  );
}
