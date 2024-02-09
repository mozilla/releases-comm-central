/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests fetching mail with no password or a bad password, and the prompts
 * that causes.
 */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const generator = new MessageGenerator();
let localAccount, localRootFolder;
let imapServer, imapAccount, imapRootFolder, imapInbox;
let pop3Server, pop3Account, pop3RootFolder, pop3Inbox;
let nntpServer, nntpAccount, nntpRootFolder, nntpFolder;

const allInboxes = [];

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const getMessagesButton = about3Pane.document.getElementById(
  "folderPaneGetMessages"
);
const getMessagesContext = about3Pane.document.getElementById(
  "folderPaneGetMessagesContext"
);

add_setup(async function () {
  Services.prefs.setBoolPref("signon.rememberSignons", true);

  localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder;

  [imapServer, pop3Server, nntpServer] = await ServerTestUtils.createServers(
    this,
    [
      ServerTestUtils.serverDefs.imap.plain,
      ServerTestUtils.serverDefs.pop3.plain,
      {
        ...ServerTestUtils.serverDefs.nntp.plain,
        options: { username: "user", password: "password" },
      },
    ]
  );
  nntpServer.addGroup("getmessages.newsgroup");

  imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "imap"
  );
  imapAccount.incomingServer.prettyName = "IMAP Account";
  imapAccount.incomingServer.port = 143;
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapInbox = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(imapInbox);

  pop3Account = MailServices.accounts.createAccount();
  pop3Account.addIdentity(MailServices.accounts.createIdentity());
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "pop3"
  );
  pop3Account.incomingServer.prettyName = "POP3 Account";
  pop3Account.incomingServer.port = 110;
  pop3RootFolder = pop3Account.incomingServer.rootFolder;
  pop3Inbox = pop3RootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(pop3Inbox);

  nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.addIdentity(MailServices.accounts.createIdentity());
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "nntp"
  );
  nntpAccount.incomingServer.prettyName = "NNTP Account";
  nntpAccount.incomingServer.port = 119;
  nntpAccount.incomingServer.authMethod = Ci.nsMsgAuthMethod.passwordEncrypted;
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;
  nntpRootFolder.createSubfolder("getmessages.newsgroup", null);
  nntpFolder = nntpRootFolder.getChildNamed("getmessages.newsgroup");
  allInboxes.push(nntpFolder);

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
    MailServices.accounts.removeAccount(nntpAccount, false);

    Services.logins.removeAllLogins();
    Services.prefs.clearUserPref("signon.rememberSignons");
  });
});

async function addMessagesToServer(type) {
  if (type == "imap") {
    await imapServer.addMessages(imapInbox, generator.makeMessages({}), false);
  } else if (type == "pop3") {
    await pop3Server.addMessages(generator.makeMessages({}));
  } else if (type == "nntp") {
    await nntpServer.addMessages(
      "getmessages.newsgroup",
      generator.makeMessages({})
    );
  }
}

async function fetchMessages(inbox) {
  EventUtils.synthesizeMouseAtCenter(
    getMessagesButton,
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "shown");
  getMessagesContext.activateItem(
    getMessagesContext.querySelector(`[data-server-key="${inbox.server.key}"]`)
  );
  await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "hidden");
}

async function waitForMessages(inbox) {
  await TestUtils.waitForCondition(
    () => inbox.getNumUnread(false) == 10 && inbox.numPendingUnread == 0,
    `waiting for new ${inbox.server.type} messages to be received`
  );
  await promiseServerIdle(inbox.server);
  info(`${inbox.server.type} messages received`);

  inbox.markAllMessagesRead(window.msgWindow);
  await promiseServerIdle(inbox.server);
  await TestUtils.waitForCondition(
    () => inbox.getNumUnread(false) == 0 && inbox.numPendingUnread == 0,
    `waiting for ${inbox.server.type} messages to be marked read`
  );
  info(`${inbox.server.type} messages marked as read`);
}

function handleErrorPrompt() {
  return BrowserTestUtils.promiseAlertDialog(undefined, undefined, {
    async callback(win) {
      await TestUtils.waitForTick();
      info("error message dialog shown");
      Assert.equal(
        win.document.getElementById("infoBody").textContent,
        "Login to server test.test with username user failed.",
        "dialog text should be correct"
      );

      const dialog = win.document.querySelector("dialog");
      Assert.deepEqual(
        Array.from(
          dialog.buttonBox.querySelectorAll("button:not([hidden])"),
          b => b.getAttribute("dlgtype")
        ).sort(),
        ["accept", "cancel", "extra1"],
        "dialog buttons should be the expected ones"
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

      const loginTextbox = win.document.getElementById("loginTextbox");
      if (BrowserTestUtils.isVisible(loginTextbox)) {
        // NNTP requires a username.
        loginTextbox.select();
        EventUtils.sendString("user", win);
      }

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

function checkSavedPassword(inbox) {
  const logins = Services.logins.findLogins(
    `${inbox.server.localStoreType}://test.test`,
    "",
    ""
  );
  Assert.equal(
    logins.length,
    1,
    "there should be a saved password for this server"
  );
  Assert.equal(logins[0].username, "user", "login username");
  Assert.equal(logins[0].password, "password", "login password");
}

/**
 * Tests getting messages when there is no password to use.
 */
add_task(async function testEnterPassword() {
  Services.logins.removeAllLogins();

  for (const inbox of allInboxes) {
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${inbox.server.type} inbox should start with no messages`
    );
  }

  for (const inbox of allInboxes) {
    info(`getting messages for ${inbox.server.type} inbox with no password`);
    await addMessagesToServer(inbox.server.type);

    const promptPromise = handlePasswordPrompt("accept", "password");
    await fetchMessages(inbox);
    await promptPromise;
    await waitForMessages(inbox);
  }

  for (const inbox of allInboxes) {
    info(
      `getting messages for ${inbox.server.type} inbox with remembered password`
    );
    await addMessagesToServer(inbox.server.type);

    await fetchMessages(inbox);
    await waitForMessages(inbox);
  }

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 0, "no passwords should be saved");

  for (const inbox of allInboxes) {
    inbox.server.forgetPassword();
    inbox.server.closeCachedConnections();
  }
});

/**
 * Tests getting messages when there is no password to use.
 * The entered password should be saved to the password manager.
 */
add_task(async function testEnterAndSavePassword() {
  Services.logins.removeAllLogins();

  for (const inbox of allInboxes) {
    info(`getting messages for ${inbox.server.type} inbox with no password`);
    await addMessagesToServer(inbox.server.type);

    const promptPromise = handlePasswordPrompt("accept", "password", true);
    await fetchMessages(inbox);
    await promptPromise;
    await waitForMessages(inbox);
  }

  for (const inbox of allInboxes) {
    checkSavedPassword(inbox);
    inbox.server.forgetPassword();
    inbox.server.closeCachedConnections();
  }

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 0, "no passwords should remain saved");
});

/**
 * Tests getting messages when there is a bad password in the password manager.
 * The new password should be saved to the password manager.
 */
add_task(async function testWrongPassword() {
  Services.logins.removeAllLogins();

  for (const inbox of allInboxes) {
    info(`getting messages for ${inbox.server.type} inbox with bad password`);
    const loginInfo = Cc[
      "@mozilla.org/login-manager/loginInfo;1"
    ].createInstance(Ci.nsILoginInfo);
    loginInfo.init(
      `${inbox.server.localStoreType}://test.test`,
      null,
      `${inbox.server.localStoreType}://test.test`,
      "user",
      "wrong password",
      "",
      ""
    );
    await Services.logins.addLoginAsync(loginInfo);
    await addMessagesToServer(inbox.server.type);

    const promptPromise = (
      inbox.server.type == "pop3"
        ? BrowserTestUtils.promiseAlertDialog("accept")
        : Promise.resolve()
    )
      .then(() => handleErrorPrompt())
      .then(() => handlePasswordPrompt("accept", "password", true));
    await fetchMessages(inbox);
    await promptPromise;
    await waitForMessages(inbox);
  }

  for (const inbox of allInboxes) {
    checkSavedPassword(inbox);
    inbox.server.forgetPassword();
    inbox.server.closeCachedConnections();
  }

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 0, "no passwords should remain saved");
});
