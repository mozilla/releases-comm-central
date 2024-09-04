/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let smtpServer;
let outgoingServer, identity;

add_setup(async function () {
  Services.prefs.setBoolPref("signon.rememberSignons", true);

  smtpServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.smtp.plain
  );

  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("sendMessage badPassword", null);

  outgoingServer = MailServices.outgoingServer.createServer("smtp");
  outgoingServer.QueryInterface(Ci.nsISmtpServer);
  outgoingServer.hostname = "test.test";
  outgoingServer.port = 587;
  outgoingServer.username = "user";

  identity = MailServices.accounts.createIdentity();
  identity.fullName = "test";
  identity.email = "test@test.test";
  identity.smtpServerKey = outgoingServer.key;
  identity.fccFolder = rootFolder.getChildNamed("sendMessage badPassword").URI;

  account.addIdentity(identity);

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(account, false);
    Services.logins.removeAllLogins();
    Services.prefs.clearUserPref("signon.rememberSignons");
  });
});

/**
 * Tests getting messages when there is no password to use.
 */
add_task(async function testEnterPassword() {
  Services.logins.removeAllLogins();

  const { composeWindow, subject } = await newComposeWindow();

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
  outgoingServer.closeCachedConnections();

  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
});

/**
 * Tests getting messages when there is no password to use.
 * The entered password should be saved to the password manager.
 */
add_task(async function testEnterAndSavePassword() {
  Services.logins.removeAllLogins();

  const { composeWindow, subject } = await newComposeWindow();

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
  Assert.equal(logins[0].hostname, "smtp://test.test", "login hostname");
  Assert.equal(logins[0].username, "user", "login username");
  Assert.equal(logins[0].password, "password", "login password");
  Services.logins.removeAllLogins();
  outgoingServer.forgetPassword();
  outgoingServer.closeCachedConnections();

  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
});

/**
 * Tests getting messages when there is a bad password in the password manager.
 * The new password should be saved to the password manager.
 */
add_task(async function testWrongPassword() {
  Services.logins.removeAllLogins();

  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "smtp://test.test",
    null,
    "smtp://test.test",
    "user",
    "wrong password",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);
  const { composeWindow, subject } = await newComposeWindow();

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
  Assert.equal(logins[0].hostname, "smtp://test.test", "login hostname");
  Assert.equal(logins[0].username, "user", "login username");
  Assert.equal(logins[0].password, "password", "login password");
  Services.logins.removeAllLogins();
  outgoingServer.forgetPassword();
  outgoingServer.closeCachedConnections();

  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
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
