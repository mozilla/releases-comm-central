/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the "navigation" butttons at the top of the mail context menu.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let testFolder, testMessages;

add_setup(async function () {
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  testFolder = rootFolder
    .createLocalSubfolder("mailContextNavigationFolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const messages = [...generator.makeMessages({ count: 5 })];
  const messageStrings = messages.map(message => message.toMessageString());
  testFolder.addMessageBatch(messageStrings);
  testMessages = [...testFolder.messages];

  tabmail.currentAbout3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  const about3Pane = tabmail.currentAbout3Pane;
  const loadedPromise = BrowserTestUtils.browserLoaded(
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser(),
    undefined,
    url => url.endsWith(about3Pane.gDBView.getKeyAt(0))
  );
  about3Pane.threadTree.selectedIndex = 0;
  about3Pane.threadTree.scrollToIndex(0, true);
  await loadedPromise;

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function test_markRead() {
  const about3Pane = tabmail.currentAbout3Pane;
  const mailContext = about3Pane.document.getElementById("mailContext");
  const row0 = await TestUtils.waitForCondition(
    () => about3Pane.threadTree.getRowAtIndex(0),
    "waiting for rows to be added"
  );
  const markRead = about3Pane.document.getElementById("navContext-markRead");
  const markUnread = about3Pane.document.getElementById(
    "navContext-markUnread"
  );

  Assert.ok(testMessages[0].isRead, "Test message should be read");
  EventUtils.synthesizeMouseAtCenter(row0, { type: "contextmenu" }, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");

  Assert.ok(
    BrowserTestUtils.isHidden(markRead),
    "Should not show mark read for read message"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(markUnread),
    "Should show mark unread for read message"
  );

  EventUtils.synthesizeMouseAtCenter(markUnread, {}, about3Pane);

  await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");

  Assert.ok(!testMessages[0].isRead, "Test message should be unread");
  EventUtils.synthesizeMouseAtCenter(row0, { type: "contextmenu" }, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");

  Assert.ok(
    BrowserTestUtils.isVisible(markRead),
    "Should show mark read for unread message"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(markUnread),
    "Should not show mark unread for unread message"
  );

  EventUtils.synthesizeMouseAtCenter(markRead, {}, about3Pane);

  await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");

  Assert.ok(testMessages[0].isRead, "Test message should be read again");
});

add_task(async function test_junk() {
  const about3Pane = tabmail.currentAbout3Pane;
  const mailContext = about3Pane.document.getElementById("mailContext");
  const row0 = await TestUtils.waitForCondition(
    () => about3Pane.threadTree.getRowAtIndex(0),
    "waiting for rows to be added"
  );
  const markJunk = about3Pane.document.getElementById("navContext-markAsJunk");
  const markNotJunk = about3Pane.document.getElementById(
    "navContext-markAsNotJunk"
  );

  Assert.equal(
    testMessages[0].getStringProperty("junkscore"),
    Ci.nsIJunkMailPlugin.IS_HAM_SCORE,
    "Message should not be junk"
  );

  EventUtils.synthesizeMouseAtCenter(row0, { type: "contextmenu" }, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");

  Assert.ok(
    BrowserTestUtils.isVisible(markJunk),
    "Should show mark as junk for normal message"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(markNotJunk),
    "Should not show mark as not junk for normal message"
  );

  EventUtils.synthesizeMouseAtCenter(markJunk, {}, about3Pane);

  await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");

  Assert.equal(
    testMessages[0].getStringProperty("junkscore"),
    Ci.nsIJunkMailPlugin.IS_SPAM_SCORE,
    "Should mark message as junk"
  );
  EventUtils.synthesizeMouseAtCenter(row0, { type: "contextmenu" }, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");

  Assert.ok(
    BrowserTestUtils.isHidden(markJunk),
    "Should not show mark as junk for junk message"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(markNotJunk),
    "Should show mark as not junk for junk message"
  );

  EventUtils.synthesizeMouseAtCenter(markNotJunk, {}, about3Pane);

  await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");

  Assert.equal(
    testMessages[0].getStringProperty("junkscore"),
    Ci.nsIJunkMailPlugin.IS_HAM_SCORE,
    "Should mark message as not junk"
  );
});
