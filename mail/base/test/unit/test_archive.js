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
const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
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
const synMessage4 = generator.makeMessage({
  date: new Date(2024, 1, 29, 9, 15),
});

add_task(async function testSetupFailureUnlocksArchiver() {
  const originalGetIdentityForHeader = MailUtils.getIdentityForHeader;
  MailUtils.getIdentityForHeader = () => [
    {
      archiveEnabled: true,
      async getOrCreateArchivesFolderAsync() {
        throw Components.Exception(
          "The configured Archives folder is missing",
          Cr.NS_MSG_ERROR_FOLDER_MISSING
        );
      },
    },
  ];

  const message = {
    date: Date.now() * 1000,
    folder: { server: { type: "none" } },
  };
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await Assert.rejects(
        new MessageArchiver().archiveMessages([message]),
        error => error.result == Cr.NS_MSG_ERROR_FOLDER_MISSING,
        `archive attempt ${attempt} should report the missing folder`
      );
    }
  } finally {
    MailUtils.getIdentityForHeader = originalGetIdentityForHeader;
  }
});

add_task(async function test_archiveCompletionAndFailures() {
  const originalGetIdentityForHeader = MailUtils.getIdentityForHeader;
  const originalFilters = MailServices.filters;
  const originalCopy = MailServices.copy;
  const destination = { canCreateSubfolders: false };
  const identity = {
    archiveEnabled: true,
    archiveGranularity: Ci.nsIMsgIdentity.singleArchiveFolder,
    archiveKeepFolderStructure: false,
    archiveRecreateInbox: false,
    async getOrCreateArchivesFolderAsync() {
      return destination;
    },
  };
  const message = {
    date: Date.now() * 1000,
    messageKey: 1,
    folder: {
      URI: "mailbox://source",
      server: { type: "none" },
      msgDatabase: { containsKey: () => true },
      getProcessingFlags: () => 0,
      canDeleteMessages: true,
    },
  };
  let copyStarted = Promise.withResolvers();
  let copyListener;
  let archivePromise;
  MailUtils.getIdentityForHeader = () => [identity];
  MailServices.filters = {
    applyFilters(_type, _messages, _filters, _folder, _interactive, listener) {
      listener.onStopOperation(Cr.NS_OK);
    },
  };
  MailServices.copy = {
    copyMessages(_source, _messages, _destination, _isMove, listener) {
      copyListener = listener;
      copyStarted.resolve();
    },
  };

  try {
    const archiver = new MessageArchiver();
    let hasFinished = false;
    archivePromise = archiver.archiveMessages([message]);
    archivePromise.then(
      () => (hasFinished = true),
      () => (hasFinished = true)
    );
    await copyStarted.promise;
    await TestUtils.waitForTick();
    Assert.ok(!hasFinished, "archiving should wait for copying to finish");

    await new MessageArchiver().archiveMessages([]);
    await Assert.rejects(
      new MessageArchiver().archiveMessages([message]),
      /Can only have one MessageArchiver/,
      "empty input should preserve the running operation's archive lock"
    );
    copyListener.onStopCopy(Cr.NS_ERROR_FAILURE);
    await Assert.rejects(
      archivePromise,
      e => e.result == Cr.NS_ERROR_FAILURE,
      "archiving should reject when copying fails"
    );

    copyStarted = Promise.withResolvers();
    archivePromise = archiver.archiveMessages([message]);
    await copyStarted.promise;
    copyListener.onStopCopy(Cr.NS_OK);
    await archivePromise;

    identity.archiveGranularity = Ci.nsIMsgIdentity.perYearArchiveFolders;
    destination.canCreateSubfolders = true;
    destination.server = {};
    destination.containsChildNamed = () => false;
    destination.createSubfolderAsync = async () => {
      throw Components.Exception("Folder creation failed", Cr.NS_ERROR_FAILURE);
    };
    await Assert.rejects(
      archiver.archiveMessages([message]),
      e => e.result == Cr.NS_ERROR_FAILURE,
      "archiving should reject when creating a date folder fails"
    );
    await archiver.archiveMessages([]);
  } finally {
    copyListener?.onStopCopy(Cr.NS_ERROR_ABORT);
    await archivePromise?.catch(() => {});
    MailUtils.getIdentityForHeader = originalGetIdentityForHeader;
    MailServices.filters = originalFilters;
    MailServices.copy = originalCopy;
  }
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
  await subtestInboxStructure(account, imapServer);
});

async function subtest(account) {
  const rootFolder = account.incomingServer.rootFolder;
  const sourceFolder1 = rootFolder.getChildNamed("sourceFolder1");
  const [message1, message2, message3] = [...sourceFolder1.messages];

  account.defaultIdentity.archiveGranularity =
    Ci.nsIMsgIdentity.perYearArchiveFolders;

  const archiver = new MessageArchiver();
  await archiver.archiveMessages([message1]);
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

  await archiver.archiveMessages([message2, message3]);
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

/**
 * Archiving with "keep folder structure" and "recreate inbox" enabled should
 * name the recreated folder after the inbox's localized name, not the name it
 * has on the server, which for IMAP is "INBOX".
 */
async function subtestInboxStructure(account, imapServer) {
  const rootFolder = account.incomingServer.rootFolder;
  const inboxFolder = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  Assert.equal(inboxFolder.name, "INBOX", "the inbox should be named INBOX");
  Assert.notEqual(
    inboxFolder.localizedName,
    inboxFolder.name,
    "the inbox's localized name should differ from its name"
  );
  await imapServer.addMessages(inboxFolder, [synMessage4], true);

  account.defaultIdentity.archiveGranularity =
    Ci.nsIMsgIdentity.singleArchiveFolder;
  account.defaultIdentity.archiveKeepFolderStructure = true;
  account.defaultIdentity.archiveRecreateInbox = true;

  const archiver = new MessageArchiver();
  await archiver.archiveMessages([...inboxFolder.messages]);

  const archivesFolder = rootFolder.getChildNamed("Archives");
  const archivedInboxFolder = archivesFolder.getChildNamed(
    inboxFolder.localizedName
  );
  Assert.ok(archivedInboxFolder, "the archived inbox folder should exist");
  Assert.equal(
    archivedInboxFolder.name,
    inboxFolder.localizedName,
    "the archived inbox folder should use the inbox's localized name"
  );
  Assert.equal(
    archivedInboxFolder.getTotalMessages(false),
    1,
    "the archived inbox folder should contain the archived message"
  );
}
