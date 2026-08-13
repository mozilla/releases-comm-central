/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that sending or saving a message puts copies in the right folder,
 * creating the folder if necessary.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

let smtpServer;
let imapServer, imapIdentity, imapRootFolder;
let localRootFolder;

add_setup(async function () {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder;

  await addLoginInfo("imap://test.test", "user", "password");
  await addLoginInfo("smtp://test.test", "user", "password");

  [smtpServer, imapServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.smtp.plain,
    ServerTestUtils.serverDefs.imap.plain,
  ]);

  const smtpOutgoingServer = MailServices.outgoingServer.createServer("smtp");
  smtpOutgoingServer.QueryInterface(Ci.nsISmtpServer);
  smtpOutgoingServer.hostname = "test.test";
  smtpOutgoingServer.port = 587;
  smtpOutgoingServer.username = "user";

  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "imap"
  );

  imapIdentity = MailServices.accounts.createIdentity();
  imapIdentity.fullName = "test";
  imapIdentity.email = "test@test.test";
  imapIdentity.smtpServerKey = smtpOutgoingServer.key;

  imapAccount.addIdentity(imapIdentity);
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapAccount.incomingServer.performBiff(null);
  await TestUtils.waitForCondition(() =>
    imapRootFolder.containsChildNamed("Trash")
  );

  registerCleanupFunction(async function () {
    imapAccount.incomingServer.closeCachedConnections();
    smtpOutgoingServer.closeCachedConnections();

    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(localAccount, false);
    await Services.logins.removeAllLoginsAsync();
  });
});

/**
 * Preference not set.
 * No folder with the flag or name exists on the server.
 * Folder with the default name should be created on the server.
 */
add_task(async function testEmptyPrefNoFolder() {
  imapIdentity.fccFolderURI = "";
  imapIdentity.draftsFolderURI = "";
  imapIdentity.templatesFolderURI = "";

  const createdSentFolder = await subtest("send", imapRootFolder);
  const createdDraftsFolder = await subtest("saveAsDraft", imapRootFolder);
  const createdTemplatesFolder = await subtest(
    "saveAsTemplate",
    imapRootFolder
  );

  await removeFolder(createdSentFolder);
  await removeFolder(createdDraftsFolder);
  await removeFolder(createdTemplatesFolder);
});

/**
 * Preference not set.
 * No folder with the flag or name exists on the server.
 * Folder creation fails.
 * Default folder on the server should be created on Local Folders.
 */
add_task(async function testEmptyPrefFolderCreateFails() {
  imapRootFolder.setFlag(Ci.nsMsgFolderFlags.ImapNoinferiors);
  imapIdentity.fccFolderURI = "";
  imapIdentity.draftsFolderURI = "";
  imapIdentity.templatesFolderURI = "";

  const createdSentFolder = await subtest("send", localRootFolder);
  const createdDraftsFolder = await subtest("saveAsDraft", localRootFolder);
  const createdTemplatesFolder = await subtest(
    "saveAsTemplate",
    localRootFolder
  );

  await removeFolder(createdSentFolder);
  await removeFolder(createdDraftsFolder);
  await removeFolder(createdTemplatesFolder);
  imapRootFolder.clearFlag(Ci.nsMsgFolderFlags.ImapNoinferiors);
});

/**
 * Preference not set.
 * Folder with the flag exists on the server.
 * Folder with the flag should be used.
 */
add_task(async function testEmptyPrefFolderWithFlagExists() {
  const flaggedSentFolder =
    await imapRootFolder.createSubfolderAsync("FlaggedSentFolder");
  flaggedSentFolder.setFlag(Ci.nsMsgFolderFlags.SentMail);
  const flaggedDraftsFolder = await imapRootFolder.createSubfolderAsync(
    "FlaggedDraftsFolder"
  );
  flaggedDraftsFolder.setFlag(Ci.nsMsgFolderFlags.Drafts);
  const flaggedTemplatesFolder = await imapRootFolder.createSubfolderAsync(
    "FlaggedTemplatesFolder"
  );
  flaggedTemplatesFolder.setFlag(Ci.nsMsgFolderFlags.Templates);

  imapIdentity.fccFolderURI = "";
  imapIdentity.draftsFolderURI = "";
  imapIdentity.templatesFolderURI = "";

  await subtest("send", imapRootFolder, "FlaggedSentFolder");
  await subtest("saveAsDraft", imapRootFolder, "FlaggedDraftsFolder");
  await subtest("saveAsTemplate", imapRootFolder, "FlaggedTemplatesFolder");

  await removeFolder(flaggedSentFolder);
  await removeFolder(flaggedDraftsFolder);
  await removeFolder(flaggedTemplatesFolder);
});

/**
 * Preference not set.
 * Folder with the default name exists on the server.
 * Folder with the default name should be used.
 */
add_task(async function testEmptyPrefFolderWithNameExists() {
  const namedSentFolder = await imapRootFolder.createSubfolderAsync("Sent");
  const namedDraftsFolder = await imapRootFolder.createSubfolderAsync("Drafts");
  const namedTemplatesFolder =
    await imapRootFolder.createSubfolderAsync("Templates");

  imapIdentity.fccFolderURI = "";
  imapIdentity.draftsFolderURI = "";
  imapIdentity.templatesFolderURI = "";

  await subtest("send", imapRootFolder);
  await subtest("saveAsDraft", imapRootFolder);
  await subtest("saveAsTemplate", imapRootFolder);

  await removeFolder(namedSentFolder);
  await removeFolder(namedDraftsFolder);
  await removeFolder(namedTemplatesFolder);
});

/**
 * Preference set to remote folder.
 * Target folder does not exist.
 * Folder with the default name should be created on the server.
 */
add_task(async function testServerPrefNoFolder() {
  imapIdentity.fccFolderURI = imapRootFolder.server.serverURI + "/Wrong";
  imapIdentity.draftsFolderURI = imapRootFolder.server.serverURI + "/Wrong";
  imapIdentity.templatesFolderURI = imapRootFolder.server.serverURI + "/Wrong";

  const createdSentFolder = await subtest("send", imapRootFolder);
  const createdDraftsFolder = await subtest("saveAsDraft", imapRootFolder);
  const createdTemplatesFolder = await subtest(
    "saveAsTemplate",
    imapRootFolder
  );

  await removeFolder(createdSentFolder);
  await removeFolder(createdDraftsFolder);
  await removeFolder(createdTemplatesFolder);
});

/**
 * Preference set to remote folder.
 * Target folder exists.
 * Target folder should be used.
 */
add_task(async function testServerPrefFolderExists() {
  const targetFolder =
    await imapRootFolder.createSubfolderAsync("TargetFolder");

  imapIdentity.fccFolderURI = targetFolder.URI;
  imapIdentity.draftsFolderURI = targetFolder.URI;
  imapIdentity.templatesFolderURI = targetFolder.URI;

  await subtest("send", imapRootFolder, "TargetFolder");
  await subtest("saveAsDraft", imapRootFolder, "TargetFolder");
  await subtest("saveAsTemplate", imapRootFolder, "TargetFolder");

  await removeFolder(targetFolder);
});

/**
 * Preference set to nested remote folder.
 * Target folder exists.
 * Target folder should be used.
 */
add_task(async function testServerPrefDeepFolderExists() {
  const inbox = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  const targetFolder = await inbox.createSubfolderAsync("InboxTargetFolder");

  imapIdentity.fccFolderURI = targetFolder.URI;
  imapIdentity.draftsFolderURI = targetFolder.URI;
  imapIdentity.templatesFolderURI = targetFolder.URI;

  await subtest("send", inbox, "InboxTargetFolder");
  await subtest("saveAsDraft", inbox, "InboxTargetFolder");
  await subtest("saveAsTemplate", inbox, "InboxTargetFolder");

  await removeFolder(targetFolder);
});

/**
 * Preference set to local folder with default name.
 * Folder does not exist.
 * Folder with the default name should be created on Local Folders.
 */
add_task(async function testLocalPrefNoFolder() {
  imapIdentity.fccFolderURI = localRootFolder.URI + "/Sent";
  imapIdentity.draftsFolderURI = localRootFolder.URI + "/Drafts";
  imapIdentity.templatesFolderURI = localRootFolder.URI + "/Templates";

  const createdSentFolder = await subtest("send", localRootFolder);
  const createdDraftsFolder = await subtest("saveAsDraft", localRootFolder);
  const createdTemplatesFolder = await subtest(
    "saveAsTemplate",
    localRootFolder
  );

  await removeFolder(createdSentFolder);
  await removeFolder(createdDraftsFolder);
  await removeFolder(createdTemplatesFolder);
});

/**
 * Preference set to local folder.
 * Folder exists.
 * Target folder should be used.
 */
add_task(async function testLocalPrefFolderExists() {
  const targetFolder =
    await localRootFolder.createSubfolderAsync("LocalTargetFolder");

  imapIdentity.fccFolderURI = targetFolder.URI;
  imapIdentity.draftsFolderURI = targetFolder.URI;
  imapIdentity.templatesFolderURI = targetFolder.URI;

  await subtest("send", localRootFolder, "LocalTargetFolder");
  await subtest("saveAsDraft", localRootFolder, "LocalTargetFolder");
  await subtest("saveAsTemplate", localRootFolder, "LocalTargetFolder");

  await removeFolder(targetFolder);
});

/**
 * @param {nsIMsgFolder} folder
 */
async function removeFolder(folder) {
  info(`removing ${folder.URI}`);
  const rootFolder = folder.rootFolder;
  if (folder.incomingServerType == "imap") {
    const deletedPromise = PromiseTestUtils.promiseFolderDeleted(folder);
    const promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
    folder.deleteSelf(null);
    await promptPromise;
    await deletedPromise;
  } else {
    folder.deleteSelf(null);
  }

  info("emptying the trash");
  const trashFolder = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
  await TestUtils.waitForCondition(
    () => trashFolder.hasSubFolders,
    "waiting for deleted folder to appear in the trash"
  );
  const listener = new PromiseTestUtils.PromiseUrlListener();
  rootFolder.emptyTrash(listener);
  await listener;
}

/**
 * @param {string} action
 * @param {nsIMsgFolder} expectedParent
 * @returns {nsIMsgFolder}
 */
async function subtest(action, expectedParent, expectedName) {
  const property = {
    send: "fccFolderURI",
    saveAsDraft: "draftsFolderURI",
    saveAsTemplate: "templatesFolderURI",
  }[action];
  expectedName ??= {
    send: "Sent",
    saveAsDraft: "Drafts",
    saveAsTemplate: "Templates",
  }[action];
  const expectedFlag = {
    send: Ci.nsMsgFolderFlags.SentMail,
    saveAsDraft: Ci.nsMsgFolderFlags.Drafts,
    saveAsTemplate: Ci.nsMsgFolderFlags.Templates,
  }[action];

  const folderExistedBeforeTest =
    expectedParent.containsChildNamed(expectedName);
  let folder;
  let folderCountBeforeTest = 0;
  let folderCreatedPromise;
  if (folderExistedBeforeTest) {
    folder = expectedParent.getChildNamed(expectedName);
    folderCountBeforeTest =
      folder.getTotalMessages(false) - folder.numPendingTotalMessages;
  } else {
    folderCreatedPromise = PromiseTestUtils.promiseFolderAdded(expectedName);
  }

  const { composeWindow, subject } = await newComposeWindow(imapIdentity);
  info(`${action} "${subject}"`);
  if (action == "send") {
    EventUtils.synthesizeMouseAtCenter(
      composeWindow.document.getElementById("button-send"),
      {},
      composeWindow
    );
    await BrowserTestUtils.domWindowClosed(composeWindow);
  } else {
    EventUtils.synthesizeMouseAtCenter(
      composeWindow.document.querySelector("#button-save > dropmarker"),
      {},
      composeWindow
    );
    const savePopup = composeWindow.document.getElementById("button-savePopup");
    await BrowserTestUtils.waitForPopupEvent(savePopup, "shown");
    savePopup.activateItem(
      composeWindow.document.getElementById(`savePopup_${action}`)
    );
    await BrowserTestUtils.waitForPopupEvent(savePopup, "hidden");
    // Don't close the window, we'll do that at the end.
  }

  // Check that the folder is created.

  if (folderCreatedPromise) {
    folder = await folderCreatedPromise;
  }
  if (folder.server instanceof Ci.nsIImapIncomingServer) {
    await TestUtils.waitForCondition(() => folder.server.allConnectionsIdle);
  }
  Assert.ok(folder, `${expectedName} folder should have been created`);
  Assert.ok(
    folder.getFlag(expectedFlag),
    `${expectedName} folder should have the ${expectedName} flag`
  );
  Assert.equal(
    folder.parent.URI,
    expectedParent.URI,
    "folder should be a child of the right parent"
  );
  Assert.equal(
    imapIdentity[property],
    `${expectedParent.URI}/${expectedName}`,
    `the folder URI should be set to the identity ${property}`
  );

  // Check that the message was saved to the folder.

  const expectedMessageCount = folderCountBeforeTest + 1;
  folder.updateFolder(window.msgWindow);
  await TestUtils.waitForCondition(
    () =>
      folder.getTotalMessages(false) - folder.numPendingTotalMessages ==
      expectedMessageCount,
    "waiting for the folder's message count to increase"
  );
  let copies;
  await TestUtils.waitForCondition(() => {
    copies = [...folder.messages];
    return copies.length > folderCountBeforeTest;
  }, "waiting for message to exist in the folder");
  Assert.equal(
    copies.length,
    expectedMessageCount,
    "a copy should be in the folder"
  );
  Assert.equal(
    copies.at(-1).subject,
    subject,
    "the copy should have the right subject"
  );

  // Check that the message was saved to the remote server.

  if (folder.server instanceof Ci.nsIImapIncomingServer) {
    const serverCopies = imapServer.getMessagesInFolder(folder);
    Assert.equal(
      serverCopies.length,
      expectedMessageCount,
      "one copy should be in the server mailbox"
    );
    Assert.stringContains(
      serverCopies.at(-1).getText(),
      `Subject: ${subject}\r\n`,
      "the server copy should have the right subject"
    );
  }

  if (action != "send") {
    await BrowserTestUtils.closeWindow(composeWindow);
  }

  return folder;
}
