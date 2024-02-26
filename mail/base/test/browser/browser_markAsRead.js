/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a message does not get marked as read if it is opened in a
 * background tab.
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/IMAPServer.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

let localTestFolder, imapTestFolder;

add_setup(async function () {
  // We need to get messages directly from the server when displaying them,
  // or this test isn't really testing what it should.
  Services.prefs.setBoolPref("mail.server.default.offline_download", false);

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

  const imapServer = new IMAPServer(this);
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
  const imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapTestFolder = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  await imapServer.addMessages(imapTestFolder, generator.makeMessages({}));

  registerCleanupFunction(async function () {
    await promiseServerIdle(imapAccount.incomingServer);
    MailServices.accounts.removeAccount(account, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    Services.prefs.clearUserPref("mail.server.default.offline_download");
    Services.prefs.clearUserPref("mailnews.mark_message_read.auto");
    Services.prefs.clearUserPref("mailnews.mark_message_read.delay");
    Services.prefs.clearUserPref("mailnews.mark_message_read.delay.interval");
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

async function subtest(testFolder) {
  const tabmail = document.getElementById("tabmail");
  const firstAbout3Pane = tabmail.currentAbout3Pane;
  firstAbout3Pane.displayFolder(testFolder);
  const testMessages = testFolder.messages;

  // Open a message in the first tab. It should get marked as read immediately.

  let message = testMessages.getNext();
  Assert.ok(!message.isRead, "message 0 should not be read before load");
  firstAbout3Pane.threadTree.selectedIndex =
    firstAbout3Pane.gDBView.findIndexOfMsgHdr(message, false);
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  await TestUtils.waitForCondition(
    () => message.isRead,
    "waiting for message 0 to be marked as read"
  );

  firstAbout3Pane.threadTree.selectedIndex = -1; // Unload the message.

  // Open a message in a background tab. It should not get marked as read.

  message = testMessages.getNext();
  Assert.ok(!message.isRead, "message 1 should not be read before load");
  window.OpenMessageInNewTab(message, { background: true });
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  Assert.ok(
    !message.isRead,
    "message 1 should not be read after opening in a background tab"
  );

  // Switch to the tab. The message should get marked as read immediately.

  tabmail.switchToTab(1);
  await TestUtils.waitForTick();
  Assert.ok(
    message.isRead,
    "message 1 should be read after switching to the background tab"
  );
  tabmail.closeTab(1);

  // With the marking delayed by preferences, open a message in a background tab.
  // It should not get marked as read.

  Services.prefs.setBoolPref("mailnews.mark_message_read.delay", true);
  Services.prefs.setIntPref("mailnews.mark_message_read.delay.interval", 2);

  message = testMessages.getNext();
  Assert.ok(!message.isRead, "message 2 should not be read before load");
  window.OpenMessageInNewTab(message, { background: true });
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 3000));
  Assert.ok(
    !message.isRead,
    "message 2 should not be read after opening in a background tab"
  );

  // Switch to the tab. The message should get marked as read after the delay.

  const timeBeforeSwitchingTab = Date.now();
  tabmail.switchToTab(1);
  Assert.ok(
    !message.isRead,
    "message 2 should not be read immediately after switching to the background tab"
  );
  await TestUtils.waitForCondition(
    () => message.isRead,
    "waiting for message 2 to be marked as read"
  );
  Assert.greaterOrEqual(
    Date.now() - timeBeforeSwitchingTab,
    2000,
    "message 2 should be read after switching to the background tab and the 2s delay"
  );
  tabmail.closeTab(1);

  Services.prefs.setBoolPref("mailnews.mark_message_read.delay", false);

  // With the marking disabled by preferences, open a message in a background
  // tab. It should not get marked as read.

  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", false);

  message = testMessages.getNext();
  Assert.ok(!message.isRead, "message 3 should not be read before load");
  window.OpenMessageInNewTab(message, { background: true });
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  Assert.ok(
    !message.isRead,
    "message 3 should not be read after opening in a background tab"
  );

  // Switch to the tab. The message should not get marked as read.

  tabmail.switchToTab(1);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  Assert.ok(
    !message.isRead,
    "message 3 should not be read after switching to the background tab"
  );
  tabmail.closeTab(1);

  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", true);

  // Open a new 3-pane tab in the background and load a message in it. The
  // message should not get marked as read.

  window.MsgOpenNewTabForFolders([testFolder], {
    background: true,
    messagePaneVisible: true,
  });
  const secondAbout3Pane = tabmail.tabInfo[1].chromeBrowser.contentWindow;
  await BrowserTestUtils.waitForEvent(secondAbout3Pane, "aboutMessageLoaded");

  message = testMessages.getNext();
  Assert.ok(!message.isRead, "message 4 should not be read before load");
  secondAbout3Pane.threadTree.selectedIndex =
    secondAbout3Pane.gDBView.findIndexOfMsgHdr(message, false);
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  Assert.ok(
    !message.isRead,
    "message 4 should not be read after opening in a background tab"
  );

  tabmail.switchToTab(1);
  await TestUtils.waitForTick();
  Assert.ok(
    message.isRead,
    "message 4 should be read after switching to the background tab"
  );
  tabmail.closeTab(1);

  // Open a message in a new foreground tab. It should get marked as read
  // immediately.

  message = testMessages.getNext();
  Assert.ok(!message.isRead, "message 5 should not be read before load");
  window.OpenMessageInNewTab(message, { background: false });
  await BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  Assert.ok(
    message.isRead,
    "message 5 should be read after opening the foreground tab"
  );
  tabmail.closeTab(1);
}
