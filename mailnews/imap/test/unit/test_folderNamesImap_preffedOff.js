/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests folders which should have a localised name that is different from the
 * folder's name, when those folders come from an IMAP server.
 *
 * This version of the test runs with mail.useLocalizedFolderNames set to false.
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);

add_task(async function () {
  // Get the localized strings. This test should work in any locale, or if you
  // change the string values in messenger.properties/messenger.ftl.

  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
  const inboxFolderName = bundle.GetStringFromName("inboxFolderName");

  // Extensions needed for the \\AllMail flag.
  const server = new IMAPServer({ extensions: ["GMAIL", "RFC3348"] });
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
  server.daemon.createMailbox("All Mail", {
    flags: ["\\Archive"],
    subscribed: true,
    specialUseFlag: "\\AllMail",
  });

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
  Assert.ok(inboxFolder.flags & Ci.nsMsgFolderFlags.Inbox);
  Assert.equal(inboxFolder.name, "INBOX");
  Assert.equal(inboxFolder.localizedName, inboxFolderName);
  Assert.equal(inboxFolder.msgDatabase.dBFolderInfo.folderName, "");

  const sentFolder = rootFolder.getChildNamed("Sent");
  Assert.ok(sentFolder.flags & Ci.nsMsgFolderFlags.SentMail);
  Assert.equal(sentFolder.name, "Sent");
  Assert.equal(sentFolder.localizedName, "Sent");
  Assert.equal(sentFolder.msgDatabase.dBFolderInfo.folderName, "");

  const draftsFolder = rootFolder.getChildNamed("Drafts");
  Assert.ok(draftsFolder.flags & Ci.nsMsgFolderFlags.Drafts);
  Assert.equal(draftsFolder.name, "Drafts");
  Assert.equal(draftsFolder.localizedName, "Drafts");
  Assert.equal(draftsFolder.msgDatabase.dBFolderInfo.folderName, "");

  const trashFolder = rootFolder.getChildNamed("Trash");
  Assert.ok(trashFolder.flags & Ci.nsMsgFolderFlags.Trash);
  Assert.equal(trashFolder.name, "Trash");
  Assert.equal(trashFolder.localizedName, "Trash");
  Assert.equal(trashFolder.msgDatabase.dBFolderInfo.folderName, "");

  const spamFolder = rootFolder.getChildNamed("Spam");
  Assert.ok(spamFolder.flags & Ci.nsMsgFolderFlags.Junk);
  Assert.equal(spamFolder.name, "Spam");
  Assert.equal(spamFolder.localizedName, "Spam");
  Assert.equal(spamFolder.msgDatabase.dBFolderInfo.folderName, "");

  const archivesFolder = rootFolder.getChildNamed("Archives");
  Assert.ok(archivesFolder.flags & Ci.nsMsgFolderFlags.Archive);
  Assert.equal(archivesFolder.name, "Archives");
  Assert.equal(archivesFolder.localizedName, "Archives");
  Assert.equal(archivesFolder.msgDatabase.dBFolderInfo.folderName, "");

  const allMailFolder = rootFolder.getChildNamed("All Mail");
  Assert.ok(allMailFolder.flags & Ci.nsMsgFolderFlags.Archive);
  Assert.ok(allMailFolder.flags & Ci.nsMsgFolderFlags.AllMail);
  Assert.equal(allMailFolder.name, "All Mail");
  Assert.equal(allMailFolder.localizedName, "All Mail");
  Assert.equal(allMailFolder.msgDatabase.dBFolderInfo.folderName, "");
});
