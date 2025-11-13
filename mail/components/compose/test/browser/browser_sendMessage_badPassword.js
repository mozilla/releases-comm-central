/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests sending mail with no password or a bad password, and the prompts
 * that causes.
 */

let smtpServer, smtpOutgoingServer, smtpIdentity;
let ewsServer, ewsOutgoingServer, ewsIdentity;

add_setup(async function () {
  Services.prefs.setBoolPref("signon.rememberSignons", true);

  [smtpServer, ewsServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.smtp.plain,
    ServerTestUtils.serverDefs.ews.plain,
  ]);

  let smtpAccount;
  ({ smtpAccount, smtpIdentity, smtpOutgoingServer } = createSMTPAccount());

  let ewsAccount;
  ({ ewsAccount, ewsIdentity, ewsOutgoingServer } = createEWSAccount());
  await addLoginInfo("ews://test.test", "user", "password");

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(smtpAccount, false);
    MailServices.accounts.removeAccount(ewsAccount, false);
    Services.logins.removeAllLogins();
    Services.prefs.clearUserPref("signon.rememberSignons");
  });
});

/**
 * Tests getting messages when there is no password to use.
 *
 * @param {nsIMsgIdentity} identity
 * @param {nsIMsgOutgoingServer} outgoingServer
 * @param {SMTPServer|EWSServer} server
 */
async function subtestEnterPassword(identity, outgoingServer, server) {
  Services.logins.removeAllLogins();

  const { composeWindow, subject } = await newComposeWindow(identity);

  const promptPromise = handlePasswordPrompt("accept", "password");
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await promptPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 0, "no passwords should be saved");
  outgoingServer.forgetPassword();

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}

add_task(async function testEnterPasswordSMTP() {
  await subtestEnterPassword(smtpIdentity, smtpOutgoingServer, smtpServer);
  smtpOutgoingServer.closeCachedConnections();
});

add_task(async function testEnterPasswordEWS() {
  await subtestEnterPassword(ewsIdentity, ewsOutgoingServer, ewsServer);
});

/**
 * Tests getting messages when there is no password to use.
 * The entered password should be saved to the password manager.
 *
 * @param {nsIMsgIdentity} identity
 * @param {nsIMsgOutgoingServer} outgoingServer
 * @param {SMTPServer|EWSServer} server
 */
async function subtestEnterAndSavePassword(identity, outgoingServer, server) {
  Services.logins.removeAllLogins();

  const { composeWindow, subject } = await newComposeWindow(identity);

  const promptPromise = handlePasswordPrompt("accept", "password", true);
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await promptPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "there should be a saved password");
  Assert.equal(
    logins[0].hostname,
    `${outgoingServer.type}://test.test`,
    "login hostname"
  );
  Assert.equal(logins[0].username, "user", "login username");
  Assert.equal(logins[0].password, "password", "login password");
  Services.logins.removeAllLogins();
  outgoingServer.forgetPassword();

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}

add_task(async function testEnterAndSavePasswordSMTP() {
  await subtestEnterAndSavePassword(
    smtpIdentity,
    smtpOutgoingServer,
    smtpServer
  );
  smtpOutgoingServer.closeCachedConnections();
});

add_task(async function testEnterAndSavePasswordEWS() {
  await subtestEnterAndSavePassword(ewsIdentity, ewsOutgoingServer, ewsServer);
});

/**
 * Tests getting messages when there is a bad password in the password manager.
 * The new password should be saved to the password manager.
 *
 * @param {nsIMsgIdentity} identity
 * @param {nsIMsgOutgoingServer} outgoingServer
 * @param {SMTPServer|EWSServer} server
 */
async function subtestWrongPassword(identity, outgoingServer, server) {
  const { composeWindow, subject } = await newComposeWindow(identity);

  const promptPromise = handleFailurePrompt().then(() =>
    handlePasswordPrompt("accept", "password", true)
  );
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await promptPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "there should be a saved password");
  Assert.equal(
    logins[0].hostname,
    `${outgoingServer.type}://test.test`,
    "login hostname"
  );
  Assert.equal(logins[0].username, "user", "login username");
  Assert.equal(logins[0].password, "password", "login password");
  Services.logins.removeAllLogins();
  outgoingServer.forgetPassword();

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}

add_task(async function testWrongPasswordSMTP() {
  Services.logins.removeAllLogins();
  await addLoginInfo("smtp://test.test", "user", "wrong password");
  await subtestWrongPassword(smtpIdentity, smtpOutgoingServer, smtpServer);
  smtpOutgoingServer.closeCachedConnections();
});

add_task(async function testWrongPasswordEWS() {
  Services.logins.removeAllLogins();
  await addLoginInfo("ews://test.test", "user", "wrong password");
  await subtestWrongPassword(ewsIdentity, ewsOutgoingServer, ewsServer);
});

function handleFailurePrompt() {
  return BrowserTestUtils.promiseAlertDialogOpen(undefined, undefined, {
    async callback(win) {
      await TestUtils.waitForTick();
      info("password dialog shown");
      Assert.stringContains(
        win.document.getElementById("infoBody").textContent,
        "Login to server test.test with username user failed.",
        "dialog text"
      );

      const dialog = win.document.querySelector("dialog");
      Assert.deepEqual(
        Array.from(
          dialog.buttonBox.querySelectorAll("button:not([hidden])"),
          b => b.getAttribute("dlgtype")
        ).sort(),
        ["accept", "cancel", "extra1"],
        "dialog buttons"
      );
      dialog.getButton("extra1").click();
    },
  });
}

function handlePasswordPrompt(button, password, rememberPassword = false) {
  return BrowserTestUtils.promiseAlertDialog(undefined, undefined, {
    async callback(win) {
      await TestUtils.waitForTick();
      info("password dialog shown");
      Assert.stringContains(
        win.document.getElementById("infoBody").textContent,
        " password for ",
        "dialog text"
      );

      win.document.getElementById("password1Textbox").select();
      EventUtils.sendString(password, win);

      const checkbox = win.document.getElementById("checkbox");
      if (checkbox.checked != rememberPassword) {
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
      dialog.getButton(button).click();
    },
  });
}
