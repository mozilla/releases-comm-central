/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let smtpServer;

add_setup(async function () {
  smtpServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.smtp.plain
  );

  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test",
    "pop3"
  );
  MailServices.accounts.defaultAccount = account;
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("sendMessage", null);

  const outgoingServer = MailServices.outgoingServer.createServer("smtp");
  outgoingServer.QueryInterface(Ci.nsISmtpServer);
  outgoingServer.hostname = "test.test";
  outgoingServer.port = 587;
  outgoingServer.username = "user";

  const identity = MailServices.accounts.createIdentity();
  identity.fullName = "test";
  identity.email = "test@test.test";
  identity.smtpServerKey = outgoingServer.key;
  identity.fccFolder = rootFolder.getChildNamed("sendMessage").URI;

  account.addIdentity(identity);

  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "smtp://test.test",
    null,
    "smtp://test.test",
    "user",
    "password",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  registerCleanupFunction(async function () {
    outgoingServer.closeCachedConnections();

    MailServices.accounts.removeAccount(account, false);
    Services.logins.removeAllLogins();
    Services.prefs.clearUserPref("mail.warn_on_send_accel_key");
  });
});

/**
 * Tests clicking on the toolbar button.
 */
add_task(async function testToolbarButton() {
  const { composeWindow, subject } = await newComposeWindow();
  const composeDocument = composeWindow.document;
  const toolbarButton = composeDocument.getElementById("button-send");

  Assert.ok(!toolbarButton.disabled, "toolbar button should not be disabled");
  EventUtils.synthesizeMouseAtCenter(toolbarButton, {}, composeWindow);

  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
});

/**
 * Tests the "Send Now" menu item from the File menu.
 */
add_task(async function testFileMenu() {
  const { composeWindow, subject } = await newComposeWindow();
  const composeDocument = composeWindow.document;
  const fileMenu = composeDocument.getElementById("menu_File");
  const fileMenuSendNow = composeDocument.getElementById("menu-item-send-now");

  EventUtils.synthesizeMouseAtCenter(fileMenu, {}, composeWindow);
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
  Assert.ok(!fileMenuSendNow.disabled, "menu item should not be disabled");
  fileMenu.menupopup.activateItem(fileMenuSendNow);
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");

  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}).skip(AppConstants.platform == "macosx"); // Can't click the menu bar on mac.

/**
 * Tests the keyboard shortcut Ctrl/⌘+Enter.
 */
add_task(async function testKeyboardShortcut() {
  Assert.ok(
    Services.prefs.getBoolPref("mail.warn_on_send_accel_key"),
    "default value of warning pref should be true"
  );

  // Send a message using the keyboard shortcut. Cancel the first prompt,
  // accept the second, but don't check the box to disable the prompt.

  let { composeWindow, subject } = await newComposeWindow();

  // Press the keys, but cancel the prompt.
  let promptPromise = handleWarningPrompt("cancel");
  EventUtils.synthesizeKey("KEY_Enter", { accelKey: true }, composeWindow);
  await promptPromise;
  await TestUtils.waitForTick();
  await SimpleTest.promiseFocus(composeWindow);

  Assert.ok(
    Services.prefs.getBoolPref("mail.warn_on_send_accel_key"),
    "warning pref should still be true"
  );

  // Press the keys, this time accept the prompt.
  promptPromise = handleWarningPrompt("accept");
  EventUtils.synthesizeKey("KEY_Enter", { accelKey: true }, composeWindow);
  await promptPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.ok(
    Services.prefs.getBoolPref("mail.warn_on_send_accel_key"),
    "warning pref should still be true"
  );
  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  // Send another message. This time check the box to disable the prompt.

  ({ composeWindow, subject } = await newComposeWindow());

  // Press the keys, accept the prompt, and remember the choice.
  promptPromise = handleWarningPrompt("accept", true);
  EventUtils.synthesizeKey("KEY_Enter", { accelKey: true }, composeWindow);
  await promptPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.ok(
    !Services.prefs.getBoolPref("mail.warn_on_send_accel_key"),
    "warning pref should now be false"
  );
  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  // Send a third message. This should happen without a prompt.

  ({ composeWindow, subject } = await newComposeWindow());

  EventUtils.synthesizeKey("KEY_Enter", { accelKey: true }, composeWindow);

  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.ok(
    !Services.prefs.getBoolPref("mail.warn_on_send_accel_key"),
    "warning pref should still be false"
  );
  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
});

function handleWarningPrompt(buttonToClick, rememberChoice = false) {
  return BrowserTestUtils.promiseAlertDialogOpen(undefined, undefined, {
    async callback(win) {
      await TestUtils.waitForTick();
      Assert.stringContains(
        win.document.getElementById("infoBody").textContent,
        "Are you sure you are ready to send this message?",
        "dialog text"
      );

      const checkbox = win.document.getElementById("checkbox");
      if (checkbox.checked != rememberChoice) {
        EventUtils.synthesizeMouseAtCenter(checkbox, {}, win);
      }

      const dialog = win.document.querySelector("dialog");
      Assert.deepEqual(
        Array.from(
          dialog.buttonBox.querySelectorAll("button:not([hidden])"),
          b => b.getAttribute("dlgtype")
        ).sort(),
        ["accept", "cancel"],
        "dialog buttons"
      );
      dialog.getButton(buttonToClick).click();
    },
  });
}
