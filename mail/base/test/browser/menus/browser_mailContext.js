/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that items on the mail context menu are correctly shown in context.
 */

var GlodaTestHelper = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/Gloda.sys.mjs"
);
var { GlodaIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaIndexer.sys.mjs"
);
var { GlodaSyntheticView } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaSyntheticView.sys.mjs"
);
var { MailConsts } = ChromeUtils.importESModule(
  "resource:///modules/MailConsts.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let testFolder, testMessages;
let draftsFolder, draftsMessages;
let templatesFolder, listFolder, virtualFolder;

// The checkMenuitems function will be called with one of these modes:
// - singleMessage (the menu is open in the message pane)
// - singleTree (the menu is open in the tree, and one message is selected)
// - multipleTree (same, but multiple messages are selected)

const helper = new ContextMenuTestHelper(undefined, {
  "mailContext-navigation": {},
  "navContext-markRead": { hidden: true },
  "navContext-markUnread": {},
  "navContext-reply": {},
  "navContext-archive": {},
  "navContext-markAsJunk": {},
  "navContext-markAsNotJunk": { hidden: true },
  "navContext-delete": {},
  "mailContext-openInBrowser": { hidden: true },
  "mailContext-openLinkInBrowser": { hidden: true },
  "mailContext-copylink": { hidden: true },
  "mailContext-savelink": { hidden: true },
  "mailContext-reportPhishingURL": { hidden: true },
  "mailContext-addemail": { hidden: true },
  "mailContext-composeemailto": { hidden: true },
  "mailContext-copyemail": { hidden: true },
  "mailContext-copyimage": { hidden: true },
  "mailContext-saveimage": { hidden: true },
  "mailContext-copy": { hidden: true },
  "mailContext-selectall": {
    hidden: ["singleTree", "multipleTree"],
  },
  "mailContext-searchTheWeb": { hidden: true },
  "mailContext-editDraftMsg": { hidden: true },
  "mailContext-newMsgFromTemplate": { hidden: true },
  "mailContext-editTemplateMsg": { hidden: true },
  "mailContext-open": { hidden: ["multipleTree"] },
  "mailContext-openNewTab": {
    hidden: ["singleMessage", "multipleTree"],
  },
  "mailContext-openNewWindow": {
    hidden: ["singleMessage", "multipleTree"],
  },
  "mailContext-openConversation": { hidden: ["multipleTree"] },
  "mailContext-openContainingFolder": { hidden: true },
  "mailContext-reply": {},
  "mailContext-replyNewsgroup": { hidden: true },
  "mailContext-replySender": {},
  "mailContext-replyAll": {},
  "mailContext-replyList": { hidden: true },
  "mailContext-forwardRedirect": {},
  "mailContext-forward": { hidden: ["multipleTree"] },
  "mailContext-forwardAsInline": { hidden: ["multipleTree"] },
  "mailContext-forwardAsAttachment": {},
  "mailContext-redirect": {},
  "mailContext-cancel": { hidden: true },
  "mailContext-editAsNew": {},
  "mailContext-moveToFolderAgain": { hidden: true },
  "mailContext-moveMenu": {},
  "mailContext-copyMenu": {},
  "mailContext-tags": {},
  "mailContext-addNewTag": {},
  "mailContext-manageTags": {},
  "mailContext-tagRemoveAll": {},
  "mailContext-mark": {},
  "mailContext-markRead": { disabled: true },
  "mailContext-markUnread": {},
  "mailContext-markThreadAsRead": { disabled: true },
  "mailContext-markReadByDate": {},
  "mailContext-markAllRead": {},
  "mailContext-markFlagged": {},
  "mailContext-markAsJunk": {},
  "mailContext-markAsNotJunk": {},
  "mailContext-recalculateJunkScore": {},
  "mailContext-organize": {},
  "mailContext-archive": {},
  "mailContext-decryptToFolder": {
    hidden: ["singleMessage", "singleTree"],
  },
  "mailContext-calendar-convert-menu": { hidden: ["multipleTree"] },
  "mailContext-calendar-convert-event-menuitem": {},
  "mailContext-calendar-convert-task-menuitem": {},
  "mailContext-copyMessageLink": { hidden: ["multipleTree"] },
  "mailContext-copyNewsLink": { hidden: true },
  "mailContext-threads": {},
  "mailContext-ignoreThread": {},
  "mailContext-ignoreSubthread": {},
  "mailContext-watchThread": {},
  "mailContext-saveAs": {},
  "mailContext-print": {},
  "mailContext-downloadSelected": {
    hidden: ["singleMessage", "singleTree"],
  },
});

// Applies when the selected message is unread.
const unreadOverride = {
  "navContext-markRead": {},
  "navContext-markUnread": { hidden: true },
  "mailContext-markRead": {},
  "mailContext-markUnread": { disabled: true },
  "mailContext-markThreadAsRead": {},
};
// Applies when the selected message is a draft.
const draftsOverride = {
  "mailContext-editDraftMsg": {},
};
// Applies when in a message tab or window.
const messageOnlyOverride = {
  "mailContext-openContainingFolder": {},
  "mailContext-recalculateJunkScore": { disabled: true },
  "mailContext-ignoreThread": { hidden: true },
  "mailContext-ignoreSubthread": { hidden: true },
};
// Applies when the displayed message is from a file.
const externalOverride = {
  "navContext-markRead": { hidden: true },
  "navContext-markUnread": { hidden: true },
  "navContext-archive": { hidden: true },
  "navContext-markAsJunk": { hidden: true },
  "navContext-delete": { hidden: true },
  "mailContext-open": { hidden: true },
  "mailContext-moveMenu": { hidden: true },
  "mailContext-tags": { hidden: true },
  "mailContext-addNewTag": { hidden: true },
  "mailContext-manageTags": { hidden: true },
  "mailContext-tagRemoveAll": { hidden: true },
  "mailContext-mark": { hidden: true },
  "mailContext-markReadByDate": { hidden: true },
  "mailContext-markAllRead": { hidden: true },
  "mailContext-markFlagged": { hidden: true },
  "mailContext-markAsJunk": { hidden: true },
  "mailContext-markAsNotJunk": { hidden: true },
  "mailContext-recalculateJunkScore": { hidden: true },
  "mailContext-organize": { hidden: true },
  "mailContext-archive": { hidden: true },
  "mailContext-threads": { hidden: true },
};

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    clear: [["mail.last_msg_movecopy_target_uri"]],
  });
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  testFolder = rootFolder
    .createLocalSubfolder("mailContextFolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const messages = [
    ...generator.makeMessages({ count: 5 }),
    ...generator.makeMessages({ count: 5, msgsPerThread: 5 }),
    ...generator.makeMessages({ count: 60 }),
  ];
  const messageStrings = messages.map(message => message.toMessageString());
  testFolder.addMessageBatch(messageStrings);
  testMessages = [...testFolder.messages];

  draftsFolder = rootFolder
    .createLocalSubfolder("mailContextDrafts")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  draftsFolder.setFlag(Ci.nsMsgFolderFlags.Drafts);
  draftsFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  draftsMessages = [...draftsFolder.messages];

  templatesFolder = rootFolder
    .createLocalSubfolder("mailContextTemplates")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  templatesFolder.setFlag(Ci.nsMsgFolderFlags.Templates);
  templatesFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );

  listFolder = rootFolder
    .createLocalSubfolder("mailContextMailingList")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  listFolder.addMessage(
    generator
      .makeMessage({
        clobberHeaders: {
          "List-Help": "<https://list.example.com>",
          "List-Post": "<mailto:list@example.com>",
          "List-Software": "Mailing List Software",
          "List-Subscribe": "<https://subscribe.example.com>",
          "List-Unsubscribe": "<https://unsubscribe.example.com>",
        },
      })
      .toMessageString()
  );

  virtualFolder = VirtualFolderHelper.createNewVirtualFolder(
    "mailContextVirtual",
    rootFolder,
    [draftsFolder, templatesFolder, listFolder],
    "ALL",
    false
  ).virtualFolder;

  tabmail.currentAbout3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  // Enable home calendar.
  cal.manager.getCalendars()[0].setProperty("disabled", false);

  GlodaTestHelper.prepareIndexerForTesting();
  testFolder.updateFolder(null);
  draftsFolder.updateFolder(null);
  templatesFolder.updateFolder(null);
  listFolder.updateFolder(null);
  await TestUtils.waitForCondition(
    () => !GlodaIndexer.indexing,
    "waiting for Gloda to finish indexing"
  );

  // Clear persisted position/size possibly left from earlier tests.
  Services.xulStore.removeDocument(
    "chrome://messenger/content/messageWindow.xhtml"
  );

  registerCleanupFunction(() => {
    for (const folder of MailServices.accounts.allFolders) {
      Gloda.setFolderIndexingPriority(folder, -1);
    }
    MailServices.accounts.removeAccount(account, false);
    cal.manager.getCalendars()[0].setProperty("disabled", true);
  });
});

/**
 * Tests the mailContext menu on the thread tree and message pane when no
 * messages are selected.
 */
add_task(async function testNoMessages() {
  const about3Pane = tabmail.currentAbout3Pane;
  const mailContext = about3Pane.document.getElementById("mailContext");
  const { messageBrowser, messagePane, threadTree } = about3Pane;
  messagePane.clearAll();

  // The message pane browser isn't visible.

  Assert.ok(
    BrowserTestUtils.isHidden(messageBrowser),
    "message browser should be hidden"
  );
  Assert.equal(messageBrowser.currentURI.spec, "about:message");
  Assert.equal(
    messageBrowser.contentWindow.getMessagePaneBrowser().currentURI.spec,
    "about:blank"
  );
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.document.getElementById("messagePane"),
    { type: "contextmenu" }
  );
  helper.menu = mailContext;
  await helper.checkMenuitems();

  // Open the menu from an empty part of the thread pane.

  const treeRect = threadTree.getBoundingClientRect();
  EventUtils.synthesizeMouse(
    threadTree,
    treeRect.x + treeRect.width / 2,
    treeRect.bottom - 10,
    { type: "contextmenu" },
    about3Pane
  );
  await helper.checkMenuitems();
});

/**
 * Tests the mailContext menu on the thread tree and message pane when one
 * message is selected.
 */
add_task(async function testSingleMessage() {
  const about3Pane = tabmail.currentAbout3Pane;
  const mailContext = about3Pane.document.getElementById("mailContext");
  const { gDBView, messageBrowser, threadTree } = about3Pane;
  const aboutMessage = messageBrowser.contentWindow;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  const loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(0))
  );
  threadTree.selectedIndex = 0;
  threadTree.scrollToIndex(0, true);
  await loadedPromise;

  // Open the menu from the message pane.

  Assert.ok(
    BrowserTestUtils.isVisible(messageBrowser),
    "message browser should be visible"
  );

  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    messagePaneBrowser
  );
  helper.menu = mailContext;
  await helper.checkMenuitems("singleMessage");

  // Open the menu from the thread pane.

  const row0 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(0),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row0, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("singleTree");

  // Open the menu from an unselected row of the thread pane.

  const row2 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(2),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row2, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("singleTree", unreadOverride);

  // Check that the selection was restored.

  Assert.equal(
    threadTree.selectedIndex,
    0,
    "selection should be restored after the menu closes"
  );

  // Open the menu through the keyboard.

  row0.focus();
  EventUtils.synthesizeMouseAtCenter(
    row0,
    { type: "contextmenu", button: 0 },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  Assert.ok(
    BrowserTestUtils.isVisible(mailContext),
    "Context menu is shown through keyboard action"
  );
  mailContext.hidePopup();

  // Open the menu through the keyboard on a message that is scrolled slightly
  // out of view.

  threadTree.selectedIndex = 5;
  threadTree.scrollToIndex(threadTree.getLastVisibleIndex() + 7, true);
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  Assert.equal(threadTree.currentIndex, 5, "Row 5 is the current row");
  Assert.ok(row0.parentNode, "Row element should still be attached");
  Assert.greater(
    threadTree.getFirstVisibleIndex(),
    5,
    "Selected row should no longer be visible"
  );
  EventUtils.synthesizeMouseAtCenter(
    threadTree,
    { type: "contextmenu", button: 0 },
    about3Pane
  );
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  Assert.greaterOrEqual(
    5,
    threadTree.getFirstVisibleIndex(),
    "Current row is greater than or equal to first visible index"
  );
  Assert.lessOrEqual(
    5,
    threadTree.getLastVisibleIndex(),
    "Current row is less than or equal to last visible index"
  );
  mailContext.hidePopup();

  // Open the menu on a message that is scrolled out of view.

  threadTree.scrollToIndex(60, true);
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  await TestUtils.waitForCondition(
    () => !row0.parentNode,
    "waiting for row element to no longer be attached"
  );
  Assert.equal(threadTree.currentIndex, 5, "Row 5 is the current row");
  Assert.ok(
    !threadTree.getRowAtIndex(threadTree.currentIndex),
    "Current row is scrolled out of view"
  );
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  EventUtils.synthesizeMouseAtCenter(
    threadTree,
    { type: "contextmenu", button: 0 },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  Assert.ok(
    threadTree.getRowAtIndex(threadTree.currentIndex),
    "Current row is scrolled into view when showing context menu"
  );
  Assert.greaterOrEqual(
    5,
    threadTree.getFirstVisibleIndex(),
    "Current row is greater than or equal to first visible index"
  );
  Assert.lessOrEqual(
    5,
    threadTree.getLastVisibleIndex(),
    "Current row is less than or equal to last visible index"
  );
  mailContext.hidePopup();

  Assert.ok(BrowserTestUtils.isHidden(mailContext), "Context menu is hidden");
});

/**
 * Tests the mailContext menu on the thread tree when more than one message is
 * selected.
 */
add_task(async function testMultipleMessages() {
  const about3Pane = tabmail.currentAbout3Pane;
  const mailContext = about3Pane.document.getElementById("mailContext");
  const { messageBrowser, multiMessageBrowser, threadTree } = about3Pane;
  threadTree.scrollToIndex(1, true);
  threadTree.selectedIndices = [1, 2, 3];

  // The message pane browser isn't visible.

  Assert.ok(
    BrowserTestUtils.isHidden(messageBrowser),
    "message browser should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(multiMessageBrowser),
    "multimessage browser should be visible"
  );

  // Open the menu from the thread pane.

  const row2 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(2),
    "waiting for rows to be added"
  );

  EventUtils.synthesizeMouseAtCenter(row2, { type: "contextmenu" }, about3Pane);
  helper.menu = mailContext;
  await helper.checkMenuitems("multipleTree", unreadOverride);

  // Open the menu from an unselected row of the thread pane.

  const row4 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(4),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row4, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("singleTree", unreadOverride);

  // Check that the selection was restored.

  Assert.deepEqual(
    threadTree.selectedIndices,
    [1, 2, 3],
    "selection should be restored after the menu closes"
  );

  // Select a collapsed thread and open the menu.

  threadTree.scrollToIndex(5, true);
  threadTree.selectedIndices = [5];

  const row5 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(5),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row5, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("multipleTree", {
    ...unreadOverride,
    "navContext-reply": { hidden: true },
    "mailContext-open": {},
    "mailContext-openConversation": {},
    "mailContext-reply": { hidden: true },
    "mailContext-forwardRedirect": { hidden: true },
    "mailContext-editAsNew": { hidden: true },
  });

  // Open the menu in the thread pane on a message scrolled out of view.

  threadTree.selectAll();
  threadTree.currentIndex = 60;
  await TestUtils.waitForTick();
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  threadTree.scrollToIndex(0, true);
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  Assert.ok(
    !threadTree.getRowAtIndex(threadTree.currentIndex),
    "Current row is scrolled out of view"
  );
  await new Promise(resolve => window.requestAnimationFrame(resolve));

  EventUtils.synthesizeMouseAtCenter(
    threadTree,
    { type: "contextmenu", button: 0 },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  Assert.ok(
    threadTree.getRowAtIndex(threadTree.currentIndex),
    "Current row is scrolled into view when popup is shown"
  );
  mailContext.hidePopup();
});

/**
 * Tests the mailContext menu on the thread tree and message pane of a Drafts
 * folder.
 */
add_task(async function testDraftsFolder() {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({ folderURI: draftsFolder.URI });

  const mailContext = about3Pane.document.getElementById("mailContext");
  const { gDBView, messageBrowser, threadTree } = about3Pane;
  const messagePaneBrowser =
    messageBrowser.contentWindow.getMessagePaneBrowser();

  const loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(0))
  );
  threadTree.selectedIndex = 0;
  await loadedPromise;

  // Open the menu from the message pane.

  Assert.ok(
    BrowserTestUtils.isVisible(messageBrowser),
    "message browser should be visible"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    messagePaneBrowser
  );
  helper.menu = mailContext;
  await helper.checkMenuitems("singleMessage", draftsOverride);

  // Open the menu from the thread pane.

  const row0 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(0),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row0, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("singleTree", draftsOverride);

  threadTree.scrollToIndex(1, true);
  threadTree.selectedIndices = [1, 2, 3];

  const row2 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(2),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row2, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("multipleTree", {
    ...unreadOverride,
    ...draftsOverride,
  });
});

/**
 * Tests the mailContext menu on the thread tree and message pane of a Templates
 * folder.
 */
add_task(async function testTemplatesFolder() {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({ folderURI: templatesFolder.URI });

  const mailContext = about3Pane.document.getElementById("mailContext");
  const { gDBView, messageBrowser, threadTree } = about3Pane;
  const messagePaneBrowser =
    messageBrowser.contentWindow.getMessagePaneBrowser();

  const loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(0))
  );
  threadTree.selectedIndex = 0;
  await loadedPromise;

  // Applies to messages that are templates.
  const templatesOverride = {
    "mailContext-newMsgFromTemplate": {},
    "mailContext-editTemplateMsg": {},
  };

  // Open the menu from the message pane.

  Assert.ok(
    BrowserTestUtils.isVisible(messageBrowser),
    "message browser should be visible"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    messagePaneBrowser
  );
  helper.menu = mailContext;
  await helper.checkMenuitems("singleMessage", templatesOverride);

  // Open the menu from the thread pane.

  const row0 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(0),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row0, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("singleTree", templatesOverride);

  threadTree.scrollToIndex(1, true);
  threadTree.selectedIndices = [1, 2, 3];

  const row2 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(2),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row2, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("multipleTree", {
    ...unreadOverride,
    ...templatesOverride,
  });
});

/**
 * Tests the mailContext menu on the thread tree and message pane of a
 * mailing list message.
 */
add_task(async function testListMessage() {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({ folderURI: listFolder.URI });

  const mailContext = about3Pane.document.getElementById("mailContext");
  const { gDBView, messageBrowser, threadTree } = about3Pane;
  const messagePaneBrowser =
    messageBrowser.contentWindow.getMessagePaneBrowser();

  const loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(0))
  );
  threadTree.selectedIndex = 0;
  await loadedPromise;

  // Applies to messages in a mailing list.
  const listOverride = {
    "mailContext-replyList": {},
    // There's only one message here, and it's already marked as read.
    "mailContext-markAllRead": { disabled: true },
    "mailContext-markReadByDate": { disabled: true },
  };

  // Open the menu from the message pane.

  Assert.ok(
    BrowserTestUtils.isVisible(messageBrowser),
    "message browser should be visible"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    messagePaneBrowser
  );
  helper.menu = mailContext;
  await helper.checkMenuitems("singleMessage", listOverride);

  // Open the menu from the thread pane.

  const row0 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(0),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row0, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("singleTree", listOverride);
});

/**
 * Tests a virtual folder which searches multiple folders.
 */
add_task(async function testVirtualFolder() {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({ folderURI: virtualFolder.URI });

  const mailContext = about3Pane.document.getElementById("mailContext");
  const { dbViewWrapperListener, threadTree } = about3Pane;
  await TestUtils.waitForCondition(
    () => dbViewWrapperListener._allMessagesLoaded,
    "waiting for virtual folder to finish searching"
  );
  threadTree.scrollToIndex(1, true);
  threadTree.selectedIndices = [1, 2, 3];

  // Applies to messages in a multi-folder virtual folder.
  const xfvfOverride = {
    ...unreadOverride,
    "mailContext-recalculateJunkScore": { disabled: true },
    "mailContext-threads": { hidden: true },
  };

  // Open the menu from the thread pane.

  const row2 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(2),
    "waiting for rows to be added"
  );

  EventUtils.synthesizeMouseAtCenter(row2, { type: "contextmenu" }, about3Pane);
  helper.menu = mailContext;
  await helper.checkMenuitems("multipleTree", xfvfOverride);

  // Open the menu from an unselected row of the thread pane.

  const row4 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(4),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row4, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("singleTree", xfvfOverride);

  // Check that the selection was restored.

  Assert.deepEqual(
    threadTree.selectedIndices,
    [1, 2, 3],
    "selection should be restored after the menu closes"
  );
});

/**
 * Tests the mailContext menu on the thread tree and message pane of a Gloda
 * synthetic view (in this case a conversation, but a list of search results
 * should be the same).
 */
add_task(async function testSyntheticFolder() {
  const tabPromise = BrowserTestUtils.waitForEvent(
    window,
    "aboutMessageLoaded"
  );
  const tab = tabmail.openTab("mail3PaneTab", {
    syntheticView: new GlodaSyntheticView({
      collection: Gloda.getMessageCollectionForHeaders([
        ...draftsMessages,
        ...testMessages.slice(0, 6),
      ]),
    }),
    title: "Test gloda results",
  });
  await tabPromise;
  await SimpleTest.promiseFocus(tab.chromeBrowser);

  const about3Pane = tab.chromeBrowser.contentWindow;
  const mailContext = about3Pane.document.getElementById("mailContext");
  const { messageBrowser, threadTree } = about3Pane;
  const messagePaneBrowser =
    messageBrowser.contentWindow.getMessagePaneBrowser();

  const gDBView = await TestUtils.waitForCondition(
    () => about3Pane.gDBView,
    "waiting for view to load in new tab"
  );
  let loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(9))
  );

  // Applies to messages in a synthetic view.
  const syntheticOverride = {
    "mailContext-openContainingFolder": {},
    "mailContext-markReadByDate": { disabled: true },
    "mailContext-markAllRead": { disabled: true },
    "mailContext-recalculateJunkScore": { disabled: true },
    "mailContext-threads": { hidden: true },
  };

  // Select a draft. Open the menu from the message pane.

  threadTree.selectedIndex = 9;
  await loadedPromise;

  Assert.ok(
    BrowserTestUtils.isVisible(messageBrowser),
    "message browser should be visible"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    messagePaneBrowser
  );
  helper.menu = mailContext;
  await helper.checkMenuitems("singleMessage", {
    ...draftsOverride,
    ...syntheticOverride,
  });

  // Open the menu from the thread pane.

  const row9 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(9),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row9, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("singleTree", {
    ...draftsOverride,
    ...syntheticOverride,
  });

  // Select an ordinary message. Open the menu from the message pane.

  loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(4))
  );
  threadTree.selectedIndex = 4;
  await loadedPromise;

  Assert.ok(
    BrowserTestUtils.isVisible(messageBrowser),
    "message browser should be visible"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    messagePaneBrowser
  );
  await helper.checkMenuitems("singleMessage", syntheticOverride);

  // Open the menu from the thread pane.

  const row4 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(4),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row4, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("singleTree", syntheticOverride);

  // Open the menu from an unselected row of the thread pane.

  const row3 = await TestUtils.waitForCondition(
    () => threadTree.getRowAtIndex(3),
    "waiting for rows to be added"
  );
  EventUtils.synthesizeMouseAtCenter(row3, { type: "contextmenu" }, about3Pane);
  await helper.checkMenuitems("singleTree", {
    ...unreadOverride,
    ...syntheticOverride,
  });

  // Check that the selection was restored.

  Assert.equal(
    threadTree.selectedIndex,
    4,
    "selection should be restored after the menu closes"
  );

  // A command controller failure should only disable the affected command. In
  // particular, it must not prevent the tags menu from being rebuilt or the
  // separators from being normalized. See bug 2007529.
  const tagPopup = about3Pane.document.getElementById("mailContext-tagpopup");
  while (tagPopup.lastElementChild.localName == "menuitem") {
    tagPopup.lastElementChild.remove();
  }
  for (const separator of mailContext.querySelectorAll(
    ":scope > menuseparator"
  )) {
    separator.hidden = false;
  }

  const originalIsCommandEnabled =
    about3Pane.commandController.isCommandEnabled;
  about3Pane.commandController.isCommandEnabled = function (command) {
    if (command == "cmd_markThreadAsRead") {
      throw new Error("Simulated command state failure");
    }
    return originalIsCommandEnabled.call(this, command);
  };
  const consoleMessage = TestUtils.consoleMessageObserved(message =>
    message.wrappedJSObject?.arguments?.[0]
      ?.toString()
      .includes("Error checking whether cmd_markThreadAsRead is enabled")
  );

  try {
    EventUtils.synthesizeMouseAtCenter(
      row4,
      { type: "contextmenu" },
      about3Pane
    );
    await BrowserTestUtils.waitForEvent(mailContext, "popupshown");
    await consoleMessage;

    Assert.ok(
      about3Pane.document.getElementById("mailContext-markThreadAsRead")
        .disabled,
      "the command with a failed state query should be disabled"
    );
    Assert.equal(
      tagPopup.querySelectorAll("menuitem:not([id])").length,
      MailServices.tags.getAllTags().length,
      "the dynamic tag items should still be rebuilt"
    );

    const visibleItems = [...mailContext.children].filter(item => !item.hidden);
    Assert.notEqual(
      visibleItems[0].localName,
      "menuseparator",
      "the menu should not begin with a separator"
    );
    Assert.notEqual(
      visibleItems.at(-1).localName,
      "menuseparator",
      "the menu should not end with a separator"
    );
    for (let i = 1; i < visibleItems.length; i++) {
      Assert.ok(
        visibleItems[i - 1].localName != "menuseparator" ||
          visibleItems[i].localName != "menuseparator",
        "the menu should not contain adjacent separators"
      );
    }
  } finally {
    about3Pane.commandController.isCommandEnabled = originalIsCommandEnabled;
    mailContext.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");
  }

  tabmail.closeOtherTabs(0);
});

/**
 * Tests the mailContext menu on the message pane of a message in a tab.
 */
add_task(async function testMessageTab() {
  const tabPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  window.OpenMessageInNewTab(testMessages[0], { background: false });
  const {
    detail: { tabInfo },
  } = await tabPromise;
  await messageLoadedIn(tabInfo.chromeBrowser);

  const aboutMessage = tabInfo.chromeBrowser.contentWindow;
  const mailContext = aboutMessage.document.getElementById("mailContext");

  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    aboutMessage.getMessagePaneBrowser()
  );
  helper.menu = mailContext;
  await helper.checkMenuitems("singleMessage", messageOnlyOverride);

  tabmail.closeOtherTabs(0);
});

/**
 * Tests the mailContext menu on the message pane of a file message in a tab.
 */
add_task(async function testExternalMessageTab() {
  const tabPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  const messageFile = new FileUtils.File(
    getTestFilePath("../files/sampleContent.eml")
  );
  await SpecialPowers.pushPrefEnv({
    set: [["mail.openMessageBehavior", MailConsts.OpenMessageBehavior.NEW_TAB]],
  });
  MailUtils.openEMLFile(
    window,
    messageFile,
    Services.io.newFileURI(messageFile)
  );
  const {
    detail: { tabInfo },
  } = await tabPromise;
  await messageLoadedIn(tabInfo.chromeBrowser);

  const aboutMessage = tabInfo.chromeBrowser.contentWindow;
  const mailContext = aboutMessage.document.getElementById("mailContext");

  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    aboutMessage.getMessagePaneBrowser()
  );
  helper.menu = mailContext;
  await helper.checkMenuitems("singleMessage", externalOverride);

  tabmail.closeOtherTabs(0);
});

/**
 * Tests the mailContext menu on the message pane of a message in a window.
 */
add_task(async function testMessageWindow() {
  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.MsgOpenNewWindowForMessage(testMessages[0]);
  const win = await winPromise;
  await messageLoadedIn(win.messageBrowser);
  await SimpleTest.promiseFocus(win);

  const aboutMessage = win.messageBrowser.contentWindow;
  const mailContext = aboutMessage.document.getElementById("mailContext");

  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    aboutMessage.getMessagePaneBrowser()
  );
  helper.menu = mailContext;
  await helper.checkMenuitems("singleMessage", messageOnlyOverride);

  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests the mailContext menu on the message pane of a file message in a window.
 */
add_task(async function testExternalMessageWindow() {
  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  const messageFile = new FileUtils.File(
    getTestFilePath("../files/sampleContent.eml")
  );
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.openMessageBehavior", MailConsts.OpenMessageBehavior.NEW_WINDOW],
    ],
  });
  MailUtils.openEMLFile(
    window,
    messageFile,
    Services.io.newFileURI(messageFile)
  );
  const win = await winPromise;
  await messageLoadedIn(win.messageBrowser);
  await SimpleTest.promiseFocus(win);

  const aboutMessage = win.messageBrowser.contentWindow;
  const mailContext = aboutMessage.document.getElementById("mailContext");

  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    aboutMessage.getMessagePaneBrowser()
  );
  helper.menu = mailContext;
  await helper.checkMenuitems("singleMessage", externalOverride);

  await BrowserTestUtils.closeWindow(win);
});
