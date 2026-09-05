/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let incomingServer;
let server;
let inbox;
let storedLogin;
let promptCount = 0;

const msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

const asyncPrompter = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgAsyncPrompter"]),

  queueAsyncAuthPrompt() {
    promptCount++;
    incomingServer.password = "password";
  },
};

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  MockRegistrar.register(
    "@mozilla.org/messenger/msgAsyncPrompter;1",
    asyncPrompter
  );

  server = new IMAPServer();

  const account = MailServices.accounts.createAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  incomingServer.port = server.port;
  account.incomingServer = incomingServer;

  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "imap://localhost",
    null,
    "imap://localhost",
    "user",
    "password",
    "",
    ""
  );
  storedLogin = await Services.logins.addLoginAsync(loginInfo);
  incomingServer.password = "password";

  const discoverListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(
    incomingServer.rootFolder,
    discoverListener,
    null
  );
  await discoverListener.promise;

  inbox = incomingServer.rootFolder
    .getChildNamed("INBOX")
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  registerCleanupFunction(async () => {
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(incomingServer, false);
    await Services.logins.removeLoginAsync(storedLogin);
  });
});

async function closeConnections() {
  incomingServer.closeCachedConnections();
  await TestUtils.waitForCondition(
    () => !server.daemon.getConnections().length,
    "waiting for all IMAP connections to close"
  );
}

async function updateInbox(aMsgWindow) {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  inbox.updateFolderWithListener(aMsgWindow, listener);
  await listener.promise;
}

add_task(async function testRefreshPasswordFromStorageForFetch() {
  const generator = new MessageGenerator();

  await closeConnections();
  incomingServer.forgetSessionPassword(false);
  await updateInbox(null);

  await closeConnections();
  incomingServer.forgetSessionPassword(false);
  await server.addMessages("INBOX", [generator.makeMessage()], false);

  await updateInbox(msgWindow);
  Assert.equal(promptCount, 1, "the manual fetch should queue one prompt");
  Assert.equal(
    inbox.getTotalMessages(false),
    1,
    "the manual fetch should retrieve the message"
  );
});
