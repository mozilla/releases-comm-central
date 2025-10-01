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
    Services.logins.removeAllLogins();
  });
});

/**
 * Tests that sending a message with no sent mail folder set falls back to
 * saving the message in the local folders.
 */
add_task(async function testEmptyFccCreatesLocalFolder() {
  imapIdentity.fccFolderURI = "";
  await subtest("send", localRootFolder);
  Assert.equal(
    imapIdentity.fccFolderURI,
    `${localRootFolder.URI}/Sent`,
    "the folder URI should be set on the identity"
  );
});

/**
 * Tests that sending a message with a remote sent mail folder set creates
 * the folder on the remote server and saves the message there.
 */
add_task(async function testFccCreatesFolder() {
  imapIdentity.fccFolderURI = imapRootFolder.URI + "/Sent";
  await subtest("send", imapRootFolder);
  Assert.equal(
    imapIdentity.fccFolderURI,
    `${imapRootFolder.URI}/Sent`,
    "the folder URI should be set on the identity"
  );
});

/**
 * Tests that saving a draft message with no drafts folder set falls back
 * to saving the message in the local folders.
 */
add_task(async function testEmptyDraftsCreatesLocalFolder() {
  imapIdentity.draftsFolderURI = "";
  await subtest("saveAsDraft", localRootFolder);
  Assert.equal(
    imapIdentity.draftsFolderURI,
    `${localRootFolder.URI}/Drafts`,
    "the folder URI should be set on the identity"
  );
});

/**
 * Tests that saving a draft message with a remote drafts folder set creates
 * the folder on the remote server and saves the message there.
 */
add_task(async function testDraftsCreatesFolder() {
  imapIdentity.draftsFolderURI = imapRootFolder.URI + "/Drafts";
  await subtest("saveAsDraft", imapRootFolder);
  Assert.equal(
    imapIdentity.draftsFolderURI,
    `${imapRootFolder.URI}/Drafts`,
    "the folder URI should be set on the identity"
  );
});

/**
 * Tests that saving a template with no templates folder set falls back to
 * saving the message in the local folders.
 */
add_task(async function testEmptyTemplatesCreatesLocalFolder() {
  imapIdentity.templatesFolderURI = "";
  await subtest("saveAsTemplate", localRootFolder);
  Assert.equal(
    imapIdentity.templatesFolderURI,
    `${localRootFolder.URI}/Templates`,
    "the folder URI should be set on the identity"
  );
});

/**
 * Tests that saving a template with a remote templates folder set creates
 * the folder on the remote server and saves the message there.
 */
add_task(async function testTemplatesCreatesFolder() {
  imapIdentity.templatesFolderURI = imapRootFolder.URI + "/Templates";
  await subtest("saveAsTemplate", imapRootFolder);
  Assert.equal(
    imapIdentity.templatesFolderURI,
    `${imapRootFolder.URI}/Templates`,
    "the folder URI should be set on the identity"
  );
});

/**
 * @param {string} action
 * @param {nsIMsgFolder} expectedParent
 */
async function subtest(action, expectedParent) {
  const expectedName = {
    send: "Sent",
    saveAsDraft: "Drafts",
    saveAsTemplate: "Templates",
  }[action];
  const expectedFlag = {
    send: Ci.nsMsgFolderFlags.SentMail,
    saveAsDraft: Ci.nsMsgFolderFlags.Drafts,
    saveAsTemplate: Ci.nsMsgFolderFlags.Templates,
  }[action];
  Assert.ok(
    !expectedParent.containsChildNamed(expectedName),
    "folder should not exist at the start of the test"
  );

  const { composeWindow, subject } = await newComposeWindow(imapIdentity);
  const folderCreatedPromise =
    PromiseTestUtils.promiseFolderAdded(expectedName);
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

  const folder = await folderCreatedPromise;
  Assert.ok(folder, "folder should have been created");
  Assert.ok(folder.getFlag(expectedFlag), "folder should have the right flag");
  Assert.equal(
    folder.parent,
    expectedParent,
    "folder should be a child of the right parent"
  );

  // Check that the message was saved to the folder.

  await TestUtils.waitForCondition(
    () => folder.getTotalMessages(false) - folder.numPendingTotalMessages == 1,
    "waiting for message to exist in folder"
  );
  const copies = [...folder.messages];
  Assert.equal(copies.length, 1, "one copy should be in the folder");
  Assert.equal(
    copies[0].subject,
    subject,
    "the copy should have the right subject"
  );

  // Check that the message was saved to the remote server.

  if (expectedParent == imapRootFolder) {
    const serverCopies = imapServer.getMessagesInFolder(folder);
    Assert.equal(
      serverCopies.length,
      1,
      "one copy should be in the server mailbox"
    );
    Assert.stringContains(
      serverCopies[0].getText(),
      `Subject: ${subject}\r\n`,
      "the server copy should have the right subject"
    );
  }

  if (action != "send") {
    await BrowserTestUtils.closeWindow(composeWindow);
  }
}
