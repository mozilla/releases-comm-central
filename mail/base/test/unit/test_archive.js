/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that archive folders can be created synchronously and asynchronously.
 */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { MessageArchiver } = ChromeUtils.importESModule(
  "resource:///modules/MessageArchiver.sys.mjs"
);

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const generator = new MessageGenerator();
const synMessage1 = generator.makeMessage({
  date: new Date(2025, 5, 10, 20, 25),
});
const synMessage2 = generator.makeMessage({
  date: new Date(2023, 3, 1, 21, 25),
});
const synMessage3 = generator.makeMessage({
  date: new Date(2023, 7, 14, 18, 0),
});

add_task(async function testLocal() {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  const sourceFolder1 = rootFolder.createLocalSubfolder("sourceFolder1");
  sourceFolder1.QueryInterface(Ci.nsIMsgLocalMailFolder);

  sourceFolder1.addMessage(synMessage1.toMessageString());
  sourceFolder1.addMessage(synMessage2.toMessageString());
  sourceFolder1.addMessage(synMessage3.toMessageString());

  await subtest(account);
});

add_task(async function testImap() {
  const imapServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.imap.plain
  );
  imapServer.daemon.createMailbox("sourceFolder1", { subscribed: true });
  // We have to already have an archives folder, or the local folders will be used.
  imapServer.daemon.createMailbox("Archives", {
    flags: ["\\Archive"],
    subscribed: true,
  });

  const account = MailServices.accounts.createAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "imap"
  );
  account.incomingServer.port = 143;
  account.incomingServer.password = "password";
  account.incomingServer.QueryInterface(Ci.nsIImapIncomingServer);

  const rootFolder = account.incomingServer.rootFolder;
  account.incomingServer.subscribeToFolder("sourceFolder1", true);

  const sourceFolder1 = await TestUtils.waitForCondition(() =>
    rootFolder.getChildNamed("sourceFolder1")
  );
  await imapServer.addMessages(
    sourceFolder1,
    [synMessage1, synMessage2, synMessage3],
    true
  );

  await subtest(account);
});

async function subtest(account) {
  const rootFolder = account.incomingServer.rootFolder;
  const sourceFolder1 = rootFolder.getChildNamed("sourceFolder1");
  const [message1, message2, message3] = [...sourceFolder1.messages];

  account.defaultIdentity.archiveGranularity =
    Ci.nsIMsgIdentity.perYearArchiveFolders;

  let deferred = Promise.withResolvers();
  let archiver = new MessageArchiver();
  archiver.oncomplete = deferred.resolve;
  archiver.archiveMessages([message1]);
  await deferred.promise;
  Assert.equal(sourceFolder1.getTotalMessages(false), 2);

  const archivesFolder = rootFolder.getChildNamed("Archives");
  Assert.ok(archivesFolder.getFlag(Ci.nsMsgFolderFlags.Archive));
  Assert.deepEqual(
    archivesFolder.subFolders.map(f => f.name),
    ["2025"]
  );
  const archives2025Folder = archivesFolder.getChildNamed("2025");
  Assert.equal(archives2025Folder.getTotalMessages(false), 1);

  account.defaultIdentity.archiveGranularity =
    Ci.nsIMsgIdentity.perMonthArchiveFolders;

  deferred = Promise.withResolvers();
  archiver = new MessageArchiver();
  archiver.oncomplete = deferred.resolve;
  archiver.archiveMessages([message2, message3]);
  await deferred.promise;
  Assert.equal(sourceFolder1.getTotalMessages(false), 0);

  Assert.deepEqual(archivesFolder.subFolders.map(f => f.name).toSorted(), [
    "2023",
    "2025",
  ]);
  const archives2023Folder = archivesFolder.getChildNamed("2023");
  Assert.ok(archives2023Folder);
  Assert.equal(archives2023Folder.getTotalMessages(false), 0);
  Assert.deepEqual(archives2023Folder.subFolders.map(f => f.name).toSorted(), [
    "2023-04",
    "2023-08",
  ]);
  Assert.equal(
    archives2023Folder.getChildNamed("2023-04").getTotalMessages(false),
    1
  );
  Assert.equal(
    archives2023Folder.getChildNamed("2023-08").getTotalMessages(false),
    1
  );
}
