/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ConversationOpener } = ChromeUtils.import(
  "resource:///modules/ConversationOpener.jsm"
);
var { MailConsts } = ChromeUtils.import("resource:///modules/MailConsts.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

const TEST_MESSAGE_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/browser/files/sampleContent.eml";

let tabmail = document.getElementById("tabmail");
let testFolder, testMessages;

function checkMenuitems(menu, ...expectedItems) {
  if (expectedItems.length == 0) {
    // Menu should not be shown.
    Assert.equal(menu.state, "closed");
    return;
  }

  Assert.notEqual(menu.state, "closed");

  let actualItems = [];
  for (let item of menu.children) {
    if (["menu", "menuitem"].includes(item.localName) && !item.hidden) {
      actualItems.push(item.id);
    }
  }
  Assert.deepEqual(actualItems, expectedItems);
}

add_setup(async function() {
  let generator = new MessageGenerator();

  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("mailContextFolder", null);
  testFolder = rootFolder
    .getChildNamed("mailContextFolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  let message = await fetch(TEST_MESSAGE_URL).then(r => r.text());
  testFolder.addMessageBatch([message]);
  let messages = [
    ...generator.makeMessages({ count: 5 }),
    ...generator.makeMessages({ count: 5, msgsPerThread: 5 }),
  ];
  let messageStrings = messages.map(message => message.toMboxString());
  testFolder.addMessageBatch(messageStrings);
  testMessages = [...testFolder.messages];

  tabmail.currentAbout3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mail.openMessageBehavior");
  });
});

/**
 * Tests the mailContext menu on the thread tree and message pane when no
 * messages are selected.
 */
add_task(async function testNoMessages() {
  let about3Pane = tabmail.currentAbout3Pane;
  let mailContext = about3Pane.document.getElementById("mailContext");
  let threadTree = about3Pane.threadTree;
  about3Pane.messagePane.clearAll();

  // The message pane browser isn't visible.

  Assert.ok(BrowserTestUtils.is_hidden(about3Pane.messageBrowser));
  Assert.equal(about3Pane.messageBrowser.currentURI.spec, "about:message");
  Assert.equal(
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser().currentURI
      .spec,
    "about:blank"
  );
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.document.getElementById("messagePane"),
    { type: "contextmenu" }
  );
  checkMenuitems(mailContext);

  // Open the menu from an empty part of the thread pane.

  let treeRect = threadTree.getBoundingClientRect();
  EventUtils.synthesizeMouse(
    threadTree,
    treeRect.x + treeRect.width / 2,
    treeRect.bottom - 10,
    {
      type: "contextmenu",
    },
    about3Pane
  );
  checkMenuitems(mailContext);
});

/**
 * Tests the mailContext menu on the thread tree and message pane when one
 * message is selected.
 */
add_task(async function testSingleMessage() {
  await TestUtils.waitForCondition(
    () => ConversationOpener.isMessageIndexed(testMessages[0]),
    "waiting for Gloda to finish indexing",
    500
  );

  let about3Pane = tabmail.currentAbout3Pane;
  let mailContext = about3Pane.document.getElementById("mailContext");
  let threadTree = about3Pane.threadTree;
  let loadedPromise = BrowserTestUtils.browserLoaded(about3Pane.messageBrowser);
  about3Pane.threadTree.selectedIndex = 0;
  await loadedPromise;

  // Open the menu from the message pane.

  Assert.ok(BrowserTestUtils.is_visible(about3Pane.messageBrowser));
  let shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    about3Pane.messageBrowser
  );
  await shownPromise;
  let messageItems = [
    "mailContext-selectall",
    "mailContext-openConversation",
    "mailContext-replySender",
    "mailContext-replyAll",
    "mailContext-replyList",
    "mailContext-forward",
    "mailContext-forwardAsMenu",
    "mailContext-redirect",
    "mailContext-editAsNew",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-archive",
    "mailContext-moveMenu",
    "mailContext-copyMenu",
    // "mailContext-calendar-convert-menu",
    "mailContext-delete",
    "mailContext-ignoreThread",
    "mailContext-ignoreSubthread",
    "mailContext-watchThread",
    "mailContext-saveAs",
    "mailContext-print",
  ];
  checkMenuitems(mailContext, ...messageItems);
  mailContext.hidePopup();

  // Open the menu from the thread pane.

  shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(0),
    {
      type: "contextmenu",
    },
    about3Pane
  );
  await shownPromise;
  let treeItems = [
    "mailContext-openNewTab",
    "mailContext-openNewWindow",
    "mailContext-openConversation",
    "mailContext-replySender",
    "mailContext-replyAll",
    "mailContext-replyList",
    "mailContext-forward",
    "mailContext-forwardAsMenu",
    "mailContext-redirect",
    "mailContext-editAsNew",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-archive",
    "mailContext-moveMenu",
    "mailContext-copyMenu",
    // "mailContext-calendar-convert-menu",
    "mailContext-delete",
    "mailContext-ignoreThread",
    "mailContext-ignoreSubthread",
    "mailContext-watchThread",
    "mailContext-saveAs",
    "mailContext-print",
  ];
  checkMenuitems(mailContext, ...treeItems);
  mailContext.hidePopup();
});

/**
 * Tests the mailContext menu on the thread tree and message pane when more
 * than one message is selected.
 */
add_task(async function testMultipleMessages() {
  await TestUtils.waitForCondition(
    () => ConversationOpener.isMessageIndexed(testMessages[1]),
    "waiting for Gloda to finish indexing",
    500
  );

  let about3Pane = tabmail.currentAbout3Pane;
  let mailContext = about3Pane.document.getElementById("mailContext");
  let threadTree = about3Pane.threadTree;
  threadTree.selectedIndices = [1, 2, 3];

  // The message pane browser isn't visible.

  Assert.ok(BrowserTestUtils.is_hidden(about3Pane.messageBrowser));
  Assert.ok(BrowserTestUtils.is_visible(about3Pane.multiMessageBrowser));
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.document.getElementById("messagePane"),
    { type: "contextmenu" }
  );
  checkMenuitems(mailContext);

  // Open the menu from the thread pane.
  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(2),
    {
      type: "contextmenu",
    },
    about3Pane
  );
  checkMenuitems(
    mailContext,
    "mailContext-openConversation",
    "mailContext-multiForwardAsAttachment",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-archive",
    "mailContext-moveMenu",
    "mailContext-copyMenu",
    // "mailContext-decryptToFolder",
    "mailContext-delete",
    "mailContext-ignoreThread",
    "mailContext-ignoreSubthread",
    "mailContext-watchThread",
    "mailContext-saveAs",
    "mailContext-print",
    "mailContext-downloadSelected"
  );
  mailContext.hidePopup();
});

/**
 * Tests the mailContext menu on the thread tree and message pane of a Gloda
 * synthetic view (in this case a conversation, but a list of search results
 * should be the same).
 */
add_task(async function testSyntheticFolder() {
  await TestUtils.waitForCondition(
    () => ConversationOpener.isMessageIndexed(testMessages[6]),
    "waiting for Gloda to finish indexing",
    500
  );

  let tabPromise = BrowserTestUtils.waitForEvent(window, "aboutMessageLoaded");
  new ConversationOpener(window).openConversationForMessages(
    testMessages.slice(6)
  );
  await tabPromise;
  await new Promise(resolve => setTimeout(resolve));

  let about3Pane = tabmail.currentAbout3Pane;
  let mailContext = about3Pane.document.getElementById("mailContext");
  let threadTree = about3Pane.threadTree;

  let loadedPromise = BrowserTestUtils.browserLoaded(about3Pane.messageBrowser);
  about3Pane.threadTree.selectedIndex = 0;
  await loadedPromise;

  // Open the menu from the message pane.

  Assert.ok(BrowserTestUtils.is_visible(about3Pane.messageBrowser));
  let shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    about3Pane.messageBrowser
  );
  await shownPromise;
  let messageItems = [
    "mailContext-selectall",
    "mailContext-openConversation",
    "mailContext-openContainingFolder",
    "mailContext-replySender",
    "mailContext-replyAll",
    "mailContext-replyList",
    "mailContext-forward",
    "mailContext-forwardAsMenu",
    "mailContext-redirect",
    "mailContext-editAsNew",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-archive",
    "mailContext-moveMenu",
    "mailContext-copyMenu",
    // "mailContext-calendar-convert-menu",
    "mailContext-delete",
    "mailContext-ignoreThread",
    "mailContext-ignoreSubthread",
    "mailContext-watchThread",
    "mailContext-saveAs",
    "mailContext-print",
  ];
  checkMenuitems(mailContext, ...messageItems);
  mailContext.hidePopup();

  // Open the menu from the thread pane.

  shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(0),
    {
      type: "contextmenu",
    },
    about3Pane
  );
  await shownPromise;
  let treeItems = [
    "mailContext-openNewTab",
    "mailContext-openNewWindow",
    "mailContext-openConversation",
    "mailContext-openContainingFolder",
    "mailContext-replySender",
    "mailContext-replyAll",
    "mailContext-replyList",
    "mailContext-forward",
    "mailContext-forwardAsMenu",
    "mailContext-redirect",
    "mailContext-editAsNew",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-archive",
    "mailContext-moveMenu",
    "mailContext-copyMenu",
    // "mailContext-calendar-convert-menu",
    "mailContext-delete",
    "mailContext-ignoreThread",
    "mailContext-ignoreSubthread",
    "mailContext-watchThread",
    "mailContext-saveAs",
    "mailContext-print",
  ];
  checkMenuitems(mailContext, ...treeItems);
  mailContext.hidePopup();

  tabmail.closeOtherTabs(0);
});

/**
 * Tests the mailContext menu on the message pane of a message in a tab.
 */
add_task(async function testMessageTab() {
  let tabPromise = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  window.OpenMessageInNewTab(testMessages[0], { background: false });
  await tabPromise;
  await new Promise(resolve => setTimeout(resolve));

  let aboutMessage = tabmail.currentAboutMessage;
  let mailContext = aboutMessage.document.getElementById("mailContext");

  let shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    aboutMessage.getMessagePaneBrowser()
  );
  await shownPromise;
  let messageItems = [
    "mailContext-selectall",
    "mailContext-openConversation",
    "mailContext-openContainingFolder",
    "mailContext-replySender",
    "mailContext-replyAll",
    "mailContext-replyList",
    "mailContext-forward",
    "mailContext-forwardAsMenu",
    "mailContext-redirect",
    "mailContext-editAsNew",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-archive",
    "mailContext-moveMenu",
    "mailContext-copyMenu",
    // "mailContext-calendar-convert-menu",
    "mailContext-delete",
    "mailContext-watchThread",
    "mailContext-saveAs",
    "mailContext-print",
  ];
  checkMenuitems(mailContext, ...messageItems);
  mailContext.hidePopup();

  tabmail.closeOtherTabs(0);
});

/**
 * Tests the mailContext menu on the message pane of a file message in a tab.
 */
add_task(async function testExternalMessageTab() {
  let tabPromise = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  let messageFile = new FileUtils.File(
    getTestFilePath("files/sampleContent.eml")
  );
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_TAB
  );
  window.MsgOpenEMLFile(messageFile, Services.io.newFileURI(messageFile));
  await tabPromise;
  await new Promise(resolve => setTimeout(resolve));

  let aboutMessage = tabmail.currentAboutMessage;
  let mailContext = aboutMessage.document.getElementById("mailContext");

  let shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    aboutMessage.getMessagePaneBrowser()
  );
  await shownPromise;
  let messageItems = [
    "mailContext-selectall",
    "mailContext-replySender",
    "mailContext-replyAll",
    "mailContext-replyList",
    "mailContext-forward",
    "mailContext-forwardAsMenu",
    "mailContext-redirect",
    "mailContext-editAsNew",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-copyMenu",
    // "mailContext-calendar-convert-menu",
    "mailContext-saveAs",
    "mailContext-print",
  ];
  checkMenuitems(mailContext, ...messageItems);
  mailContext.hidePopup();

  tabmail.closeOtherTabs(0);
});

/**
 * Tests the mailContext menu on the message pane of a message in a window.
 */
add_task(async function testMessageWindow() {
  let winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.MsgOpenNewWindowForMessage(testMessages[0]);
  let win = await winPromise;
  await BrowserTestUtils.waitForEvent(win, "MsgLoaded");
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);

  let aboutMessage = win.messageBrowser.contentWindow;
  let mailContext = aboutMessage.document.getElementById("mailContext");

  let shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    aboutMessage.getMessagePaneBrowser()
  );
  await shownPromise;
  let messageItems = [
    "mailContext-selectall",
    "mailContext-openConversation",
    "mailContext-openContainingFolder",
    "mailContext-replySender",
    "mailContext-replyAll",
    "mailContext-replyList",
    "mailContext-forward",
    "mailContext-forwardAsMenu",
    "mailContext-redirect",
    "mailContext-editAsNew",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-archive",
    "mailContext-moveMenu",
    "mailContext-copyMenu",
    // "mailContext-calendar-convert-menu",
    "mailContext-delete",
    "mailContext-watchThread",
    "mailContext-saveAs",
    "mailContext-print",
  ];
  checkMenuitems(mailContext, ...messageItems);
  mailContext.hidePopup();

  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests the mailContext menu on the message pane of a file message in a window.
 */
add_task(async function testExternalMessageWindow() {
  let winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  let messageFile = new FileUtils.File(
    getTestFilePath("files/sampleContent.eml")
  );
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_WINDOW
  );
  window.MsgOpenEMLFile(messageFile, Services.io.newFileURI(messageFile));
  let win = await winPromise;
  await BrowserTestUtils.waitForEvent(win, "MsgLoaded");
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);

  let aboutMessage = win.messageBrowser.contentWindow;
  let mailContext = aboutMessage.document.getElementById("mailContext");

  let shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    aboutMessage.getMessagePaneBrowser()
  );
  await shownPromise;
  let messageItems = [
    "mailContext-selectall",
    "mailContext-replySender",
    "mailContext-replyAll",
    "mailContext-replyList",
    "mailContext-forward",
    "mailContext-forwardAsMenu",
    "mailContext-redirect",
    "mailContext-editAsNew",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-copyMenu",
    // "mailContext-calendar-convert-menu",
    "mailContext-saveAs",
    "mailContext-print",
  ];
  checkMenuitems(mailContext, ...messageItems);
  mailContext.hidePopup();

  await BrowserTestUtils.closeWindow(win);
});
