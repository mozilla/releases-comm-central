/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests sending mail with no password or a bad password, and the prompts
 * that causes.
 */

let smtpServer, ewsServer;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rememberSignons", true]],
  });

  [smtpServer, ewsServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.smtp.plain,
    ServerTestUtils.serverDefs.ews.plain,
  ]);

  registerCleanupFunction(async function () {
    await Services.logins.removeAllLoginsAsync();
    clearHttpAuthCache();
  });
});

function forgetServerPassword(outgoingServer) {
  clearHttpAuthCache();
  outgoingServer.forgetPassword();
  outgoingServer.forgetSessionPassword();
  outgoingServer.password = "";

  Assert.equal(
    outgoingServer.password,
    "",
    `${outgoingServer.type} session password should be cleared`
  );
}

async function runWithFreshSmtpAccount(subtest) {
  const { smtpAccount, smtpIdentity, smtpOutgoingServer } = createSMTPAccount();

  try {
    await subtest(smtpIdentity, smtpOutgoingServer, smtpServer);
  } finally {
    smtpOutgoingServer.closeCachedConnections();
    forgetServerPassword(smtpOutgoingServer);
    await Services.logins.removeAllLoginsAsync();

    MailServices.accounts.removeAccount(smtpAccount, false);
    MailServices.outgoingServer.deleteServer(smtpOutgoingServer);
  }
}

async function runWithFreshEwsAccount(subtest) {
  const { ewsAccount, ewsIdentity, ewsOutgoingServer } = createEWSAccount();

  try {
    await subtest(ewsIdentity, ewsOutgoingServer, ewsServer);
  } finally {
    forgetServerPassword(ewsOutgoingServer);
    await Services.logins.removeAllLoginsAsync();

    MailServices.accounts.removeAccount(ewsAccount, false);
    MailServices.outgoingServer.deleteServer(ewsOutgoingServer);
  }
}

/**
 * Tests getting messages when there is no password to use.
 *
 * @param {nsIMsgIdentity} identity
 * @param {nsIMsgOutgoingServer} outgoingServer
 * @param {SMTPServer|EWSServer} server
 */
async function subtestEnterPassword(identity, outgoingServer, server) {
  await Services.logins.removeAllLoginsAsync();
  forgetServerPassword(outgoingServer);

  const { composeWindow, subject } = await newComposeWindow(identity);
  const composeClosedPromise = BrowserTestUtils.domWindowClosed(composeWindow);

  const promptPromise = handlePasswordPrompt("accept", "password");
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await promptPromise;

  await composeClosedPromise;
  clearHttpAuthCache();

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 0, "no passwords should be saved");
  forgetServerPassword(outgoingServer);

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}

add_task(async function testEnterPasswordSMTP() {
  await runWithFreshSmtpAccount(subtestEnterPassword);
});

add_task(async function testEnterPasswordEWS() {
  await runWithFreshEwsAccount(subtestEnterPassword);
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
  await Services.logins.removeAllLoginsAsync();
  forgetServerPassword(outgoingServer);

  let logins = await Services.logins.getAllLogins();
  Assert.equal(
    logins.length,
    0,
    "there should be no saved passwords before opening the compose window"
  );

  const { composeWindow, subject } = await newComposeWindow(identity);

  Assert.equal(
    outgoingServer.password,
    "",
    `${outgoingServer.type} session password should still be cleared`
  );

  logins = await Services.logins.getAllLogins();
  Assert.equal(
    logins.length,
    0,
    "there should still be no saved passwords after opening the compose window"
  );

  const composeClosedPromise = BrowserTestUtils.domWindowClosed(composeWindow);

  const promptPromise = handlePasswordPrompt("accept", "password", true);
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await promptPromise;

  await composeClosedPromise;
  clearHttpAuthCache();

  logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "there should be a saved password");
  Assert.equal(
    logins[0].hostname,
    `${outgoingServer.type}://test.test`,
    "login hostname"
  );
  Assert.equal(logins[0].username, "user", "login username");
  Assert.equal(logins[0].password, "password", "login password");
  await Services.logins.removeAllLoginsAsync();
  forgetServerPassword(outgoingServer);

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}

add_task(async function testEnterAndSavePasswordSMTP() {
  await runWithFreshSmtpAccount(subtestEnterAndSavePassword);
});

add_task(async function testEnterAndSavePasswordEWS() {
  await runWithFreshEwsAccount(subtestEnterAndSavePassword);
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
  clearHttpAuthCache();

  const { composeWindow, subject } = await newComposeWindow(identity);
  const composeClosedPromise = BrowserTestUtils.domWindowClosed(composeWindow);

  const promptPromise = handleFailurePrompt().then(() =>
    handlePasswordPrompt("accept", "password", true)
  );
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await promptPromise;

  await composeClosedPromise;
  clearHttpAuthCache();

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "there should be a saved password");
  Assert.equal(
    logins[0].hostname,
    `${outgoingServer.type}://test.test`,
    "login hostname"
  );
  Assert.equal(logins[0].username, "user", "login username");
  Assert.equal(logins[0].password, "password", "login password");
  await Services.logins.removeAllLoginsAsync();
  forgetServerPassword(outgoingServer);

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}

add_task(async function testWrongPasswordSMTP() {
  await Services.logins.removeAllLoginsAsync();

  await runWithFreshSmtpAccount(async (identity, outgoingServer, server) => {
    await addLoginInfo("smtp://test.test", "user", "wrong password");
    await subtestWrongPassword(identity, outgoingServer, server);
  });
});

add_task(async function testWrongPasswordEWS() {
  await Services.logins.removeAllLoginsAsync();

  await runWithFreshEwsAccount(async (identity, outgoingServer, server) => {
    await addLoginInfo("ews://test.test", "user", "wrong password");
    await subtestWrongPassword(identity, outgoingServer, server);
  });
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
