/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var ewsServer;
var incomingServer;

add_setup(async function () {
  // Create a new mock EWS server, and start it.
  ewsServer = new EwsServer({});
  ewsServer.start();

  // Only include a single root folder in the account so that we don't spend too
  // much time waiting out feedback statuses about folders we don't care about.
  ewsServer.setRemoteFolders([
    new RemoteFolder("root", null, "Root", "msgfolderroot"),
  ]);

  // Create a new account and connect it to the mock EWS server.
  incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "127.0.0.1",
    "ews"
  );

  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = incomingServer;

  // Store the account's credentials into the login manager so we're not
  // prompted for a password when trying to sync messages.
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "ews://127.0.0.1",
    null,
    "ews://127.0.0.1",
    "user",
    "password",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  // A previous test might have triggered some messages to appear in the status
  // bar. Reset it.
  const status = window.MsgStatusFeedback;
  if (BrowserTestUtils.isVisible(status._progressBar)) {
    status._stopMeteors();
  }
  status._startRequests = 0;
  status._activeProcesses.length = 0;

  if (status._statusIntervalId) {
    clearInterval(status._statusIntervalId);
    delete status._statusIntervalId;
  }
  status._statusText.value = "";
  status._statusLastShown = 0;
  status._statusQueue.length = 0;

  registerCleanupFunction(() => {
    ewsServer.stop();
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(ewsAccount, false);
    Services.logins.removeAllLogins();
  });
});

/**
 * Tests that syncing an entire account results in the expected updates to the
 * status bar.
 */
add_task(async function test_sync_account() {
  // Create a new folder for our test on the server.
  const folderName = "serverSyncFeedback";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, null)
  );

  // Sync the new folder locally (without the message window so it doesn't
  // trigger any update to the status bar).
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  const rootFolder = incomingServer.rootFolder;
  incomingServer.getNewMessages(rootFolder, null, urlListener);
  await urlListener.promise;

  // Build the string we expect to see in the status bar.
  const l10n = new Localization(["messenger/activityFeedback.ftl"], true);
  const expectedAccountStatus = l10n.formatValueSync(
    "looking-for-messages-account",
    {
      accountName: incomingServer.prettyName,
    }
  );

  const expectedFolderStatus = l10n.formatValueSync(
    "looking-for-messages-folder",
    {
      folderName,
    }
  );

  // Sync the account, this time with the message window so the status bar gets
  // updated.
  incomingServer.getNewMessages(rootFolder, window.msgWindow, null);

  // Check we first get a status message for the whole account, then that we get
  // one for the individual folder, before clearing the status bar.
  const statusText = document.getElementById("statusText");
  await TestUtils.waitForCondition(
    () => statusText.value == expectedAccountStatus,
    "the status bar should update with the expected status for the account"
  );

  await TestUtils.waitForCondition(
    () => statusText.value == expectedFolderStatus,
    "the status bar should update with the expected status for the folder"
  );

  await TestUtils.waitForCondition(
    () => statusText.value == "",
    "the status bar should eventually revert to an empty status"
  );

  Assert.ok(true);
});

/**
 * Tests that syncing a single folder results in the expected updates to the
 * status bar.
 */
add_task(async function test_sync_folder() {
  // Create a new folder for our test on the server.
  const folderName = "folderSyncFeedback";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, null)
  );

  // Sync the new folder locally.
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  const rootFolder = incomingServer.rootFolder;
  incomingServer.getNewMessages(rootFolder, null, urlListener);
  await urlListener.promise;

  // Build the string we expect to see in the status bar.
  const l10n = new Localization(["messenger/activityFeedback.ftl"], true);
  const expectedStatus = l10n.formatValueSync("looking-for-messages-folder", {
    folderName,
  });

  // Sync the folder, with the message window so the status bar gets updated.
  const folder = rootFolder.getChildNamed(folderName);
  folder.getNewMessages(window.msgWindow, null);

  // Check that we get a status message for the individual folder only, and that
  // it eventually clears up.
  const statusText = document.getElementById("statusText");
  await TestUtils.waitForCondition(
    () => statusText.value == expectedStatus,
    "the status bar should update with the expected status"
  );

  await TestUtils.waitForCondition(
    () => statusText.value == "",
    "the status bar should eventually revert to an empty status"
  );

  Assert.ok(true);
});

/**
 * Tests that deleting a message results in the expected updates to the status
 * bar.
 */
add_task(async function test_delete_message() {
  // Create a new folder for our test on the server.
  const folderName = "messageDeletionFeedback";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, null)
  );

  const generator = new MessageGenerator();
  const messages = generator.makeMessages({});
  ewsServer.addMessages(folderName, messages);

  // Sync the new folder locally.
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  const rootFolder = incomingServer.rootFolder;
  incomingServer.getNewMessages(rootFolder, null, urlListener);
  await urlListener.promise;

  // Wait for the folder's messages to get sync'd.
  const folder = rootFolder.getChildNamed(folderName);
  await TestUtils.waitForCondition(
    () => [...folder.messages].length > 0,
    "the folder should be populated with its messages"
  );

  // Build the string we expect to see in the status bar.
  const l10n = new Localization(["messenger/activityFeedback.ftl"], true);
  const expectedStatus = l10n.formatValueSync("deleting-message", {
    number: "1",
    folderName,
  });

  // Delete a single message from the folder.
  const msgToDelete = [...folder.messages][0];
  folder.deleteMessages(
    [msgToDelete],
    window.msgWindow,
    true,
    false,
    null,
    false
  );

  // Check that we get the correct status message, and that it eventually gets
  // updated as the deletion completes.
  const statusText = document.getElementById("statusText");
  await TestUtils.waitForCondition(
    () => statusText.value == expectedStatus,
    "the status bar should update with the expected status"
  );

  await TestUtils.waitForCondition(
    () => statusText.value != expectedStatus,
    "the status bar should eventually change to another status as the operation completes"
  );

  Assert.ok(true);
});
