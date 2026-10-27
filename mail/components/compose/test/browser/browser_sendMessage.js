/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the ways to make Thunderbird send mail. In this file are best case
 * scenarios. Edge cases and failure cases are in separate files.
 */

let smtpServer, smtpIdentity;
let ewsServer, ewsIdentity;
let graphServer, graphIdentity;

add_setup(async function () {
  [smtpServer, ewsServer, graphServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.smtp.plain,
    ServerTestUtils.serverDefs.ews.plain,
    ServerTestUtils.serverDefs.graph.plain,
  ]);

  let smtpAccount, smtpOutgoingServer;
  ({ smtpAccount, smtpIdentity, smtpOutgoingServer } = createSMTPAccount());
  await addLoginInfo("smtp://test.test", "user", "password");

  let ewsAccount;
  ({ ewsAccount, ewsIdentity } = createEWSAccount());
  await addLoginInfo("ews://test.test", "user", "password");

  let graphAccount;
  ({ graphAccount, graphIdentity } = createGraphAccount());
  await addLoginInfo("graph://test.test", "user", "password");

  registerCleanupFunction(async function () {
    smtpOutgoingServer.closeCachedConnections();

    MailServices.accounts.removeAccount(smtpAccount, false);
    MailServices.accounts.removeAccount(ewsAccount, false);
    MailServices.accounts.removeAccount(graphAccount, false);
    await Services.logins.removeAllLoginsAsync();
  });
});

/**
 * Tests clicking on the toolbar button.
 *
 * @param {nsIMsgIdentity} identity
 * @param {SMTPServer|EWSServer} server
 */
async function subtestToolbarButton(identity, server) {
  const { composeWindow, subject } = await newComposeWindow(identity);
  const composeDocument = composeWindow.document;
  const toolbarButton = composeDocument.getElementById("button-send");

  Assert.ok(!toolbarButton.disabled, "toolbar button should not be disabled");
  EventUtils.synthesizeMouseAtCenter(toolbarButton, {}, composeWindow);

  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}

add_task(async function testToolbarButtonSMTP() {
  await subtestToolbarButton(smtpIdentity, smtpServer);
});

add_task(async function testToolbarButtonEWS() {
  await subtestToolbarButton(ewsIdentity, ewsServer);
});

add_task(async function testToolbarButtonGraph() {
  await subtestToolbarButton(graphIdentity, graphServer);
});

/**
 * Tests the "Send Now" menu item from the File menu.
 *
 * @param {nsIMsgIdentity} identity
 * @param {SMTPServer|EWSServer} server
 */
async function subtestFileMenu(identity, server) {
  const { composeWindow, subject } = await newComposeWindow(identity);
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
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}

add_task(async function testFileMenuSMTP() {
  await subtestFileMenu(smtpIdentity, smtpServer);
}).skip(AppConstants.platform == "macosx"); // Can't click the menu bar on mac.

add_task(async function testFileMenuEWS() {
  await subtestFileMenu(ewsIdentity, ewsServer);
}).skip(AppConstants.platform == "macosx"); // Can't click the menu bar on mac.

add_task(async function testFileMenuGraph() {
  await subtestFileMenu(graphIdentity, graphServer);
}).skip(AppConstants.platform == "macosx"); // Can't click the menu bar on mac.

/**
 * Tests the keyboard shortcut Ctrl/⌘+Enter.
 *
 * @param {nsIMsgIdentity} identity
 * @param {SMTPServer|EWSServer} server
 */
async function subtestKeyboardShortcut(identity, server) {
  await SpecialPowers.pushPrefEnv({
    clear: [["mail.warn_on_send_accel_key"]],
  });
  Assert.ok(
    Services.prefs.getBoolPref("mail.warn_on_send_accel_key"),
    "default value of warning pref should be true"
  );

  // Send a message using the keyboard shortcut. Cancel the first prompt,
  // accept the second, but don't check the box to disable the prompt.

  let { composeWindow, subject } = await newComposeWindow(identity);

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
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  // Send another message. This time check the box to disable the prompt.

  ({ composeWindow, subject } = await newComposeWindow(identity));

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
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  // Send a third message. This should happen without a prompt.

  ({ composeWindow, subject } = await newComposeWindow(identity));

  EventUtils.synthesizeKey("KEY_Enter", { accelKey: true }, composeWindow);

  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.ok(
    !Services.prefs.getBoolPref("mail.warn_on_send_accel_key"),
    "warning pref should still be false"
  );
  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  await SpecialPowers.popPrefEnv();
}

add_task(async function testKeyboardShortcutSMTP() {
  await subtestKeyboardShortcut(smtpIdentity, smtpServer);
});

add_task(async function testKeyboardShortcutEWS() {
  await subtestKeyboardShortcut(ewsIdentity, ewsServer);
});

add_task(async function testKeyboardShortcutGraph() {
  await subtestKeyboardShortcut(graphIdentity, graphServer);
});

/**
 * Tests that the keyboard shortcut only depends on the modifiers being pressed
 * when Enter is pressed, and not when Enter is released.
 */
add_task(async function testKeyboardShortcutReleaseOrder() {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.warn_on_send_accel_key", false]],
  });
  const { composeWindow, subject } = await newComposeWindow(smtpIdentity);
  let sendCount = 0;
  composeWindow.addEventListener("send-message", () => sendCount++, {
    capture: true,
  });

  // Enter is pressed without modifiers, Ctrl is pressed before Enter is
  // released, like when typing a new line followed by a quick Ctrl+V.
  EventUtils.synthesizeKey("KEY_Enter", { type: "keydown" }, composeWindow);
  EventUtils.synthesizeKey(
    "KEY_Enter",
    { type: "keyup", accelKey: true },
    composeWindow
  );
  await TestUtils.waitForTick();
  Assert.equal(sendCount, 0, "message should not be sent");

  // Ctrl+Enter is pressed, but Ctrl is released before Enter.
  EventUtils.synthesizeKey(
    "KEY_Enter",
    { type: "keydown", accelKey: true },
    composeWindow
  );
  EventUtils.synthesizeKey("KEY_Enter", { type: "keyup" }, composeWindow);
  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.equal(sendCount, 1, "message should be sent once");
  Assert.stringContains(
    smtpServer.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  await SpecialPowers.popPrefEnv();
}).skip(AppConstants.platform == "macosx"); // ⌘+Enter is handled on keydown.

function handleWarningPrompt(buttonToClick, rememberChoice = false) {
  // When cancelling, wait for the prompt to be closed, otherwise it might
  // still be the active window when the compose window is expected to have
  // focus again.
  const method =
    buttonToClick == "cancel" ? "promiseAlertDialog" : "promiseAlertDialogOpen";
  return BrowserTestUtils[method](undefined, undefined, {
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
