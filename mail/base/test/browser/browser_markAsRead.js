/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a message does not get marked as read if it is opened in a
 * background tab.
 */

requestLongerTimeout(AppConstants.MOZ_CODE_COVERAGE ? 2 : 1);

const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

let imapServer, ewsServer;
let localTestFolder, imapTestFolder, ewsTestFolder;

add_setup(async function () {
  // We need to get messages directly from the server when displaying them,
  // or this test isn't really testing what it should.
  await SpecialPowers.pushPrefEnv({
    set: [["mail.server.default.offline_download", false]],
  });

  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  localTestFolder = rootFolder
    .createLocalSubfolder("markAsRead")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  localTestFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );

  [imapServer, ewsServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.plain,
    ServerTestUtils.serverDefs.ews.plain,
  ]);

  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.username = "user";
  imapAccount.incomingServer.password = "password";
  imapAccount.incomingServer.prettyName = "IMAP Account";
  const imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapTestFolder = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  await imapServer.addMessages(imapTestFolder, generator.makeMessages({}));

  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "ews"
  );
  ewsAccount.incomingServer.setStringValue(
    "ews_url",
    `http://localhost:${ewsServer.port}/EWS/Exchange.asmx`
  );
  ewsAccount.incomingServer.prettyName = "EWS Account";
  ewsAccount.incomingServer.username = "user";
  ewsAccount.incomingServer.password = "password";
  const ewsRootFolder = ewsAccount.incomingServer.rootFolder;
  ewsAccount.incomingServer.performExpand(null);
  ewsTestFolder = await TestUtils.waitForCondition(
    () => ewsRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox),
    "waiting for EWS folders to sync"
  );
  await ewsServer.addMessages("inbox", generator.makeMessages({}));
  ewsAccount.incomingServer.getNewMessages(ewsRootFolder, null, null);
  await TestUtils.waitForCondition(
    () => ewsTestFolder.getTotalMessages(false) == 10
  );

  registerCleanupFunction(function () {
    MailServices.accounts.removeAccount(account, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(ewsAccount, false);
  });
});

add_task(async function testLocal() {
  await subtest(localTestFolder);
});

add_task(async function testIMAP() {
  // Our IMAP code marks a message as read if we have to fetch it from the
  // server for display, unless we tell it not to. Check we didn't break that.
  await subtest(imapTestFolder);
});

add_task(async function testEWS() {
  await subtest(ewsTestFolder);
});

function checkReadFlags(message, shouldBeRead, description) {
  Assert.equal(message.isRead, shouldBeRead, `in the database, ${description}`);

  if (message.folder.incomingServerType == "imap") {
    const serverMessage = imapServer.daemon
      .getMailbox("INBOX")
      ._messages.find(m => m.uid == message.messageKey);
    Assert.equal(
      serverMessage.flags.includes("\\Seen"),
      shouldBeRead,
      `on the server, ${description}`
    );
  } else if (message.folder.incomingServerType == "ews") {
    const serverMessage = ewsServer.getItemInfo(
      message.getStringProperty("ewsId")
    );
    Assert.equal(
      serverMessage.syntheticMessage.metaState.read,
      shouldBeRead,
      `on the server, ${description}`
    );
  }
}

async function subtest(testFolder) {
  const tabmail = document.getElementById("tabmail");
  const firstAbout3Pane = tabmail.currentAbout3Pane;
  firstAbout3Pane.displayFolder(testFolder);
  const testMessages = testFolder.messages;

  // Open a message in the first tab. It should get marked as read immediately.

  let message = testMessages.getNext();
  checkReadFlags(message, false, "message 0 should not be read before load");
  firstAbout3Pane.threadTree.selectedIndex =
    firstAbout3Pane.gDBView.findIndexOfMsgHdr(message, false);
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  await TestUtils.waitForCondition(
    () => message.isRead,
    "waiting for message 0 to be marked as read"
  );
  await promiseServerIdle(testFolder.server);
  checkReadFlags(message, true, "message should be read after load");
  // Extra time to ensure loading completes. Not loading may lead to leaks.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));

  firstAbout3Pane.threadTree.selectedIndex = -1; // Unload the message.
  const firstMessagePane =
    firstAbout3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();
  await TestUtils.waitForCondition(
    () =>
      !firstMessagePane.webProgress.isLoadingDocument &&
      firstMessagePane.currentURI.spec == "about:blank",
    "waiting for message pane to load about:blank"
  );

  // Open a message in a background tab. It should not get marked as read.

  message = testMessages.getNext();
  checkReadFlags(message, false, "message 1 should not be read before load");
  window.OpenMessageInNewTab(message, { background: true });
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  checkReadFlags(
    message,
    false,
    "message 1 should not be read after opening in a background tab"
  );

  // Switch to the tab. The message should get marked as read immediately.

  tabmail.switchToTab(1);
  await TestUtils.waitForTick();
  await TestUtils.waitForCondition(
    () => message.isRead,
    "waiting for message 1 to be marked as read"
  );
  await promiseServerIdle(testFolder.server);
  checkReadFlags(
    message,
    true,
    "message 1 should be read after switching to the background tab"
  );
  tabmail.closeTab(1);

  // With the marking delayed by preferences, open a message in a background tab.
  // It should not get marked as read.

  await SpecialPowers.pushPrefEnv({
    set: [
      ["mailnews.mark_message_read.delay", true],
      ["mailnews.mark_message_read.delay.interval", 2],
    ],
  });

  message = testMessages.getNext();
  checkReadFlags(message, false, "message 2 should not be read before load");
  window.OpenMessageInNewTab(message, { background: true });
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 3000));
  checkReadFlags(
    message,
    false,
    "message 2 should not be read after opening in a background tab"
  );

  // Switch to the tab. The message should get marked as read after the delay.

  const timeBeforeSwitchingTab = Date.now();
  tabmail.switchToTab(1);
  checkReadFlags(
    message,
    false,
    "message 2 should not be read immediately after switching to the background tab"
  );
  await TestUtils.waitForCondition(
    () => message.isRead,
    "waiting for message 2 to be marked as read"
  );
  await promiseServerIdle(testFolder.server);
  checkReadFlags(
    message,
    true,
    "message 2 should be read after switching tabs"
  );
  Assert.greaterOrEqual(
    Date.now() - timeBeforeSwitchingTab,
    2000,
    "message 2 should be read after switching to the background tab and the 2s delay"
  );
  tabmail.closeTab(1);

  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.mark_message_read.delay", false]],
  });

  // With the marking disabled by preferences, open a message in a background
  // tab. It should not get marked as read.

  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.mark_message_read.auto", false]],
  });

  message = testMessages.getNext();
  checkReadFlags(message, false, "message 3 should not be read before load");
  window.OpenMessageInNewTab(message, { background: true });
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  checkReadFlags(
    message,
    false,
    "message 3 should not be read after opening in a background tab"
  );

  // Switch to the tab. The message should not get marked as read.

  tabmail.switchToTab(1);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  checkReadFlags(
    message,
    false,
    "message 3 should not be read after switching to the background tab"
  );
  tabmail.closeTab(1);

  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.mark_message_read.auto", true]],
  });

  // Open a new 3-pane tab in the background and load a message in it. The
  // message should not get marked as read.

  window.MsgOpenNewTabForFolders([testFolder], {
    background: true,
    messagePaneVisible: true,
  });
  const secondAbout3Pane = tabmail.tabInfo[1].chromeBrowser.contentWindow;
  await BrowserTestUtils.waitForEvent(secondAbout3Pane, "aboutMessageLoaded");

  message = testMessages.getNext();
  checkReadFlags(message, false, "message 4 should not be read before load");
  await TestUtils.waitForCondition(
    () => secondAbout3Pane.gDBView,
    "waiting for second tab to select a folder"
  );
  secondAbout3Pane.threadTree.selectedIndex =
    secondAbout3Pane.gDBView.findIndexOfMsgHdr(message, false);
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  checkReadFlags(
    message,
    false,
    "message 4 should not be read after opening in a background tab"
  );

  tabmail.switchToTab(1);
  await TestUtils.waitForTick();
  await TestUtils.waitForCondition(
    () => message.isRead,
    "waiting for message 4 to be marked as read"
  );
  await promiseServerIdle(testFolder.server);
  checkReadFlags(
    message,
    true,
    "message 4 should be read after switching to the background tab"
  );
  tabmail.closeTab(1);

  // Open a message in a new foreground tab. It should get marked as read
  // immediately.

  message = testMessages.getNext();
  checkReadFlags(message, false, "message 5 should not be read before load");
  window.OpenMessageInNewTab(message, { background: false });
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  await TestUtils.waitForCondition(
    () => message.isRead,
    "waiting for message 5 to be marked as read"
  );
  await promiseServerIdle(testFolder.server);
  checkReadFlags(
    message,
    true,
    "message 5 should be read after opening the foreground tab"
  );
  // Extra time to ensure loading completes. Not loading may lead to leaks.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  tabmail.closeTab(1);

  // Open a message in a new window. It should get marked as read immediately.

  message = testMessages.getNext();
  checkReadFlags(message, false, "message 6 should not be read before load");
  const messageWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    async win =>
      win.document.documentURI ==
      "chrome://messenger/content/messageWindow.xhtml"
  );
  MailUtils.openMessageInNewWindow(message);
  const messageWindow = await messageWindowPromise;
  await SimpleTest.promiseFocus(messageWindow);
  await TestUtils.waitForCondition(
    () => message.isRead,
    "waiting for message 6 to be marked as read"
  );
  await promiseServerIdle(testFolder.server);
  checkReadFlags(
    message,
    true,
    "message 6 should be read after opening the foreground tab"
  );
  // Extra time to ensure loading completes. Not loading may lead to leaks.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  await BrowserTestUtils.closeWindow(messageWindow);
}
