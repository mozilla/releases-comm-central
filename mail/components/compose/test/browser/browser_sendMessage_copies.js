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
  // An idle fake-server connection times out and stops the whole server.
  imapAccount.incomingServer.QueryInterface(
    Ci.nsIImapIncomingServer
  ).maximumConnectionsNumber = 1;
  imapAccount.incomingServer.setBoolValue("autosync_offline_stores", false);

  imapIdentity = MailServices.accounts.createIdentity();
  imapIdentity.fullName = "test";
  imapIdentity.email = "test@test.test";
  imapIdentity.smtpServerKey = smtpOutgoingServer.key;

  imapAccount.addIdentity(imapIdentity);
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapAccount.incomingServer.performBiff(false);
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
 * Explicit special folders which have disappeared should stop the operation
 * and report the configuration problem to the user. In particular, a missing
 * Sent folder should stop sending before SMTP delivery.
 */
add_task(async function testExplicitMissingFolders() {
  const cases = [
    {
      action: "send",
      folderProperty: "fccFolderURI",
      pickerProperty: "fccFolderPickerMode",
      folderName: "Sent",
      expectedTitle: "Send Message Error",
    },
    {
      action: "saveAsDraft",
      folderProperty: "draftsFolderURI",
      pickerProperty: "draftsFolderPickerMode",
      folderName: "Drafts",
      expectedTitle: "Save Draft Error",
    },
    {
      action: "saveAsTemplate",
      folderProperty: "templatesFolderURI",
      pickerProperty: "templatesFolderPickerMode",
      folderName: "Templates",
      expectedTitle: "Save Template Error",
    },
  ];

  for (const testCase of cases) {
    info(`testing a missing explicit ${testCase.folderName} folder`);
    imapIdentity[testCase.pickerProperty] = "1";
    imapIdentity[testCase.folderProperty] =
      `${imapRootFolder.server.serverURI}/Missing${testCase.folderName}`;

    const messageBeforeOperation = smtpServer.lastSentMessage;
    const { composeWindow } = await newComposeWindow(imapIdentity);
    registerCleanupFunction(async () => {
      if (!composeWindow.closed) {
        await BrowserTestUtils.closeWindow(composeWindow);
      }
    });
    const originalPrompt = Services.prompt;
    const promptCalled = Promise.withResolvers();
    let promptParent;
    let promptTitle;
    let promptMessage;
    Services.prompt = {
      QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
      alert(parentWindow, title, message) {
        promptParent = parentWindow;
        promptTitle = title;
        promptMessage = message;
        promptCalled.resolve();
      },
    };

    try {
      if (testCase.action == "send") {
        EventUtils.synthesizeMouseAtCenter(
          composeWindow.document.getElementById("button-send"),
          {},
          composeWindow
        );
      } else {
        EventUtils.synthesizeMouseAtCenter(
          composeWindow.document.querySelector("#button-save > dropmarker"),
          {},
          composeWindow
        );
        const savePopup =
          composeWindow.document.getElementById("button-savePopup");
        await BrowserTestUtils.waitForPopupEvent(savePopup, "shown");
        savePopup.activateItem(
          composeWindow.document.getElementById(`savePopup_${testCase.action}`)
        );
        await BrowserTestUtils.waitForPopupEvent(savePopup, "hidden");
      }
      await promptCalled.promise;
      await TestUtils.waitForCondition(
        () =>
          !composeWindow.gWindowLocked &&
          !composeWindow.gSendOperationInProgress &&
          !composeWindow.gSaveOperationInProgress,
        "waiting for the compose operation to stop and the window to unlock"
      );
    } finally {
      Services.prompt = originalPrompt;
      imapIdentity[testCase.pickerProperty] = "0";
      imapIdentity[testCase.folderProperty] = "";
    }

    Assert.equal(
      promptParent,
      composeWindow,
      "the error prompt should be attached to the compose window"
    );
    Assert.equal(promptTitle, testCase.expectedTitle);
    Assert.stringContains(
      promptMessage,
      "The folder selected for sent messages could not be found.",
      "the error should identify the missing configured folder"
    );
    Assert.equal(
      smtpServer.lastSentMessage,
      messageBeforeOperation,
      "the operation should not deliver a message over SMTP"
    );
    Assert.ok(!composeWindow.closed, "the compose window should remain open");

    await BrowserTestUtils.closeWindow(composeWindow);
  }
});

/**
 * Saving drafts and templates should not require their future Sent folder.
 */
add_task(async function test_saveWithMissingSentFolder() {
  const oldURI = imapIdentity.fccFolderURI;
  const oldMode = imapIdentity.fccFolderPickerMode;
  const missingURI = `${imapRootFolder.URI}/MissingSent`;
  imapIdentity.fccFolderPickerMode = "1";
  imapIdentity.fccFolderURI = missingURI;
  registerCleanupFunction(() => {
    imapIdentity.fccFolderPickerMode = oldMode;
    imapIdentity.fccFolderURI = oldURI;
  });
  const messageBeforeOperation = smtpServer.lastSentMessage;
  const testCases = [
    [
      "saveAsDraft",
      "draftsFolderURI",
      "draftsFolderPickerMode",
      "DraftWithoutSent",
    ],
    [
      "saveAsTemplate",
      "templatesFolderURI",
      "templatesFolderPickerMode",
      "TemplateWithoutSent",
    ],
  ];
  for (const [action, property, pickerMode, name] of testCases) {
    const destination = await imapRootFolder.createSubfolderAsync(name);
    const oldDestinationURI = imapIdentity[property];
    const oldDestinationMode = imapIdentity[pickerMode];
    imapIdentity[pickerMode] = "1";
    imapIdentity[property] = destination.URI;
    registerCleanupFunction(() => {
      imapIdentity[pickerMode] = oldDestinationMode;
      imapIdentity[property] = oldDestinationURI;
    });
    const folder = await subtest(action, imapRootFolder, name);
    Assert.equal(
      imapIdentity.fccFolderURI,
      missingURI,
      "saving should preserve the future Sent folder URI"
    );
    Assert.equal(
      imapIdentity.fccFolderPickerMode,
      "1",
      "saving should preserve the explicit Sent folder selection"
    );
    Assert.equal(
      imapRootFolder.server.getFolderFromURI(missingURI),
      null,
      "saving should leave the future Sent folder uncreated"
    );
    Assert.equal(
      smtpServer.lastSentMessage,
      messageBeforeOperation,
      "saving should not deliver a message over SMTP"
    );
    await removeFolder(folder);
    imapIdentity[pickerMode] = oldDestinationMode;
    imapIdentity[property] = oldDestinationURI;
  }
  imapIdentity.fccFolderPickerMode = oldMode;
  imapIdentity.fccFolderURI = oldURI;
});

/**
 * @param {nsIMsgFolder} folder
 */
async function removeFolder(folder) {
  info(`removing ${folder.URI}`);
  const rootFolder = folder.rootFolder;
  if (folder.incomingServerType == "imap") {
    // A close promise can resolve before native deactivate handling finishes.
    await TestUtils.waitForTick();
    // Explicitly raising a window can trigger a Mutter/X11 sizing bug.
    await TestUtils.waitForCondition(
      () => window.document.hasFocus(),
      "the mail window should regain focus before the folder deletion prompt"
    );
    const deletedPromise = PromiseTestUtils.promiseFolderDeleted(folder);
    folder.deleteSelf(false);
    await deletedPromise;
  } else {
    folder.deleteSelf(false);
  }

  info("emptying the trash");
  const trashFolder = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
  await TestUtils.waitForCondition(
    () => trashFolder.hasSubFolders,
    "waiting for deleted folder to appear in the trash"
  );
  if (rootFolder.incomingServerType == "imap") {
    const listener = new PromiseTestUtils.PromiseUrlListener();
    rootFolder.emptyTrash(listener);
    await listener.promise;
    await TestUtils.waitForCondition(
      () =>
        rootFolder.server.QueryInterface(Ci.nsIImapIncomingServer)
          .allConnectionsIdle,
      "folder deletion should finish before the next operation"
    );
  } else {
    rootFolder.emptyTrash(null);
  }
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
  if (folder instanceof Ci.nsIMsgImapMailFolder) {
    const listener = new PromiseTestUtils.PromiseUrlListener();
    folder.updateFolderWithListener(false, listener);
    await listener.promise;
  } else {
    folder.updateFolder(true);
  }
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
