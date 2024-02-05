/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that items on the mail context menu are correctly shown in context.
 */

var { ConversationOpener } = ChromeUtils.import(
  "resource:///modules/ConversationOpener.jsm"
);
var { Gloda } = ChromeUtils.import("resource:///modules/gloda/Gloda.jsm");
var { GlodaSyntheticView } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaSyntheticView.jsm"
);
var { MailConsts } = ChromeUtils.importESModule(
  "resource:///modules/MailConsts.sys.mjs"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let testFolder, testMessages;
let draftsFolder, draftsMessages;
let templatesFolder, templatesMessages;
let listFolder, listMessages;

const singleSelectionMessagePane = [
  "singleMessage",
  "draftsFolder",
  "templatesFolder",
  "listFolder",
  "syntheticFolderDraft",
  "syntheticFolder",
];
const singleSelectionThreadPane = [
  "singleMessageTree",
  "draftsFolderTree",
  "templatesFolderTree",
  "listFolderTree",
  "syntheticFolderDraftTree",
  "syntheticFolderTree",
];
const onePane = ["messageTab", "messageWindow"];
const external = ["externalMessageTab", "externalMessageWindow"];
const allSingleSelection = [
  ...singleSelectionMessagePane,
  ...singleSelectionThreadPane,
  ...onePane,
  ...external,
];
const allThreePane = [
  ...singleSelectionMessagePane,
  ...singleSelectionThreadPane,
  "multipleMessagesTree",
  "collapsedThreadTree",
  "multipleDraftsFolderTree",
  "multipleTemplatesFolderTree",
];
const noCollapsedThreads = [
  ...singleSelectionMessagePane,
  ...singleSelectionThreadPane,
  "multipleMessagesTree",
  "multipleDraftsFolderTree",
  "multipleTemplatesFolderTree",
  ...onePane,
  ...external,
];
const notExternal = [...allThreePane, ...onePane];
const singleNotExternal = [
  ...singleSelectionMessagePane,
  ...singleSelectionThreadPane,
  ...onePane,
];

const mailContextData = {
  "mailContext-openInBrowser": [],
  "mailContext-openLinkInBrowser": [],
  "mailContext-copylink": [],
  "mailContext-savelink": [],
  "mailContext-reportPhishingURL": [],
  "mailContext-addemail": [],
  "mailContext-composeemailto": [],
  "mailContext-copyemail": [],
  "mailContext-copyimage": [],
  "mailContext-saveimage": [],
  "mailContext-copy": [],
  "mailContext-selectall": [
    ...singleSelectionMessagePane,
    ...onePane,
    ...external,
  ],
  "mailContext-searchTheWeb": [],
  "mailContext-editDraftMsg": [
    "draftsFolder",
    "draftsFolderTree",
    "multipleDraftsFolderTree",
    "syntheticFolderDraft",
    "syntheticFolderDraftTree",
  ],
  "mailContext-newMsgFromTemplate": [
    "templatesFolder",
    "templatesFolderTree",
    "multipleTemplatesFolderTree",
  ],
  "mailContext-editTemplateMsg": [
    "templatesFolder",
    "templatesFolderTree",
    "multipleTemplatesFolderTree",
  ],
  "mailContext-openNewTab": singleSelectionThreadPane,
  "mailContext-openNewWindow": singleSelectionThreadPane,
  "mailContext-openConversation": [
    ...singleSelectionMessagePane,
    ...singleSelectionThreadPane,
    ...onePane,
    "collapsedThreadTree",
  ],
  "mailContext-openContainingFolder": [
    "syntheticFolderDraft",
    "syntheticFolderDraftTree",
    "syntheticFolder",
    "syntheticFolderTree",
    ...onePane,
  ],
  "mailContext-replyNewsgroup": [],
  "mailContext-replySender": noCollapsedThreads,
  "mailContext-replyAll": noCollapsedThreads,
  "mailContext-replyList": ["listFolder", "listFolderTree"],
  "mailContext-forward": allSingleSelection,
  "mailContext-forwardAsMenu": allSingleSelection,
  "mailContext-multiForwardAsAttachment": [
    "multipleMessagesTree",
    "multipleDraftsFolderTree",
    "multipleTemplatesFolderTree",
  ],
  "mailContext-redirect": noCollapsedThreads,
  "mailContext-cancel": [],
  "mailContext-editAsNew": noCollapsedThreads,
  "mailContext-tags": notExternal,
  "mailContext-mark": notExternal,
  "mailContext-copyMessageUrl": [],
  "mailContext-archive": notExternal,
  "mailContext-moveMenu": notExternal,
  "mailContext-copyMenu": true,
  "mailContext-moveToFolderAgain": [],
  "mailContext-decryptToFolder": [
    "multipleMessagesTree",
    "collapsedThreadTree",
    "multipleDraftsFolderTree",
    "multipleTemplatesFolderTree",
  ],
  "mailContext-calendar-convert-menu": singleNotExternal,
  "mailContext-delete": notExternal,
  "mailContext-ignoreThread": allThreePane,
  "mailContext-ignoreSubthread": allThreePane,
  "mailContext-watchThread": notExternal,
  "mailContext-saveAs": true,
  "mailContext-print": true,
  "mailContext-downloadSelected": [
    "multipleMessagesTree",
    "collapsedThreadTree",
    "multipleDraftsFolderTree",
    "multipleTemplatesFolderTree",
  ],
};

function checkMenuitems(menu, mode) {
  if (!mode) {
    // Menu should not be shown.
    Assert.equal(menu.state, "closed");
    return;
  }

  info(`Checking menus for ${mode} ...`);

  Assert.notEqual(menu.state, "closed", "Menu should be closed");

  const expectedItems = [];
  for (const [id, modes] of Object.entries(mailContextData)) {
    if (modes === true || modes.includes(mode)) {
      expectedItems.push(id);
    }
  }

  const actualItems = [];
  for (const item of menu.children) {
    if (["menu", "menuitem"].includes(item.localName) && !item.hidden) {
      actualItems.push(item.id);
    }
  }

  const notFoundItems = expectedItems.filter(i => !actualItems.includes(i));
  if (notFoundItems.length) {
    Assert.report(
      true,
      undefined,
      undefined,
      "items expected but not found: " + notFoundItems.join(", ")
    );
  }

  const unexpectedItems = actualItems.filter(i => !expectedItems.includes(i));
  if (unexpectedItems.length) {
    Assert.report(
      true,
      undefined,
      undefined,
      "items found but not expected: " + unexpectedItems.join(", ")
    );
  }

  Assert.deepEqual(actualItems, expectedItems);

  menu.hidePopup();
}

add_setup(async function () {
  Services.prefs.clearUserPref("mail.last_msg_movecopy_target_uri");
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
    ...generator.makeMessages({ count: 200 }),
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
  templatesMessages = [...templatesFolder.messages];
  listFolder = rootFolder
    .createLocalSubfolder("mailContextMailingList")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  listFolder.addMessage(
    "From - Mon Jan 01 00:00:00 2001\n" +
      "To: Mailing List <list@example.com>\n" +
      "Date: Mon, 01 Jan 2001 00:00:00 +0100\n" +
      "List-Help: <https://list.example.com>\n" +
      "List-Post: <mailto:list@example.com>\n" +
      "List-Software: Mailing List Software\n" +
      "List-Subscribe: <https://subscribe.example.com>\n" +
      "Precedence: list\n" +
      "Subject: Mailing List Test Mail\n" +
      `Message-ID: <${Date.now()}@example.com>\n` +
      "From: Mailing List <list@example.com>\n" +
      "List-Unsubscribe: <https://unsubscribe.example.com>,\n" +
      " <mailto:unsubscribe@example.com?subject=Unsubscribe Test>\n" +
      "MIME-Version: 1.0\n" +
      "Content-Type: text/plain; charset=UTF-8\n" +
      "Content-Transfer-Encoding: quoted-printable\n" +
      "\n" +
      "Mailing List Message Body\n"
  );
  listMessages = [...listFolder.messages];

  tabmail.currentAbout3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  // Enable home calendar.
  cal.manager.getCalendars()[0].setProperty("disabled", false);

  registerCleanupFunction(() => {
    for (const folder of MailServices.accounts.allFolders) {
      Gloda.setFolderIndexingPriority(folder, -1);
    }
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mail.openMessageBehavior");
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
  checkMenuitems(mailContext);

  // Open the menu from an empty part of the thread pane.

  const treeRect = threadTree.getBoundingClientRect();
  EventUtils.synthesizeMouse(
    threadTree,
    treeRect.x + treeRect.width / 2,
    treeRect.bottom - 10,
    { type: "contextmenu" },
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
    1000
  );

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
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "singleMessage");

  // Open the menu from the thread pane.

  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(0),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "singleMessageTree");

  // Open the menu through the keyboard.

  const row = threadTree.getRowAtIndex(0);
  row.focus();
  EventUtils.synthesizeMouseAtCenter(
    row,
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
  Assert.ok(row.parentNode, "Row element should still be attached");
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

  threadTree.scrollToIndex(200, true);
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  Assert.ok(!row.parentNode, "Row element should no longer be attached");
  Assert.equal(threadTree.currentIndex, 5, "Row 5 is the current row");
  Assert.ok(
    !threadTree.getRowAtIndex(threadTree.currentIndex),
    "Current row is scrolled out of view"
  );
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
  await TestUtils.waitForCondition(
    () => ConversationOpener.isMessageIndexed(testMessages[5]),
    "waiting for Gloda to finish indexing",
    1000
  );

  const about3Pane = tabmail.currentAbout3Pane;
  const mailContext = about3Pane.document.getElementById("mailContext");
  const { messageBrowser, multiMessageBrowser, threadTree } = about3Pane;
  threadTree.scrollToIndex(1, true);
  threadTree.selectedIndices = [1, 2, 3];
  await TestUtils.waitForTick(); // Wait for rows to be added.

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
  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(2),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "multipleMessagesTree");

  // Select a collapsed thread and open the menu.

  threadTree.scrollToIndex(5, true);
  threadTree.selectedIndices = [5];

  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(5),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "collapsedThreadTree");

  // Open the menu in the thread pane on a message scrolled out of view.

  threadTree.selectAll();
  threadTree.currentIndex = 200;
  await TestUtils.waitForTick();
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  threadTree.scrollToIndex(0, true);
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  Assert.ok(
    !threadTree.getRowAtIndex(threadTree.currentIndex),
    "Current row is scrolled out of view"
  );

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

  await TestUtils.waitForCondition(
    () => ConversationOpener.isMessageIndexed(draftsMessages[1]),
    "waiting for Gloda to finish indexing",
    1000
  );

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
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "draftsFolder");

  // Open the menu from the thread pane.

  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(0),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "draftsFolderTree");

  threadTree.scrollToIndex(1, true);
  threadTree.selectedIndices = [1, 2, 3];

  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(2),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "multipleDraftsFolderTree");
});

/**
 * Tests the mailContext menu on the thread tree and message pane of a Templates
 * folder.
 */
add_task(async function testTemplatesFolder() {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({ folderURI: templatesFolder.URI });

  await TestUtils.waitForCondition(
    () => ConversationOpener.isMessageIndexed(templatesMessages[1]),
    "waiting for Gloda to finish indexing",
    1000
  );

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
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "templatesFolder");

  // Open the menu from the thread pane.

  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(0),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "templatesFolderTree");

  threadTree.scrollToIndex(1, true);
  threadTree.selectedIndices = [1, 2, 3];

  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(2),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "multipleTemplatesFolderTree");
});

/**
 * Tests the mailContext menu on the thread tree and message pane of a
 * mailing list message.
 */
add_task(async function testListMessage() {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({ folderURI: listFolder.URI });

  await TestUtils.waitForCondition(
    () => ConversationOpener.isMessageIndexed(listMessages[0]),
    "waiting for Gloda to finish indexing",
    1000
  );

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
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "listFolder");

  // Open the menu from the thread pane.

  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(0),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "listFolderTree");
});

/**
 * Tests the mailContext menu on the thread tree and message pane of a Gloda
 * synthetic view (in this case a conversation, but a list of search results
 * should be the same).
 */
add_task(async function testSyntheticFolder() {
  await TestUtils.waitForCondition(
    () => ConversationOpener.isMessageIndexed(testMessages[5]),
    "waiting for Gloda to finish indexing",
    1000
  );
  await TestUtils.waitForCondition(
    () => ConversationOpener.isMessageIndexed(draftsMessages[4]),
    "waiting for Gloda to finish indexing",
    1000
  );

  const tabPromise = BrowserTestUtils.waitForEvent(
    window,
    "aboutMessageLoaded"
  );
  tabmail.openTab("mail3PaneTab", {
    syntheticView: new GlodaSyntheticView({
      collection: Gloda.getMessageCollectionForHeaders([
        ...draftsMessages,
        ...testMessages.slice(0, 6),
      ]),
    }),
    title: "Test gloda results",
  });
  await tabPromise;
  await new Promise(resolve => setTimeout(resolve));

  const about3Pane = tabmail.currentAbout3Pane;
  const mailContext = about3Pane.document.getElementById("mailContext");
  const { gDBView, messageBrowser, threadTree } = about3Pane;
  const messagePaneBrowser =
    messageBrowser.contentWindow.getMessagePaneBrowser();

  let loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(9))
  );
  threadTree.selectedIndex = 9;
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
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "syntheticFolderDraft");

  // Open the menu from the thread pane.

  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(9),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "syntheticFolderDraftTree");

  loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(4))
  );
  threadTree.selectedIndex = 4;
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
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "syntheticFolder");

  // Open the menu from the thread pane.

  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(5),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "syntheticFolderTree");

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
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "messageTab");

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
    getTestFilePath("files/sampleContent.eml")
  );
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_TAB
  );
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
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "externalMessageTab");

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
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "messageWindow");

  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests the mailContext menu on the message pane of a file message in a window.
 */
add_task(async function testExternalMessageWindow() {
  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  const messageFile = new FileUtils.File(
    getTestFilePath("files/sampleContent.eml")
  );
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_WINDOW
  );
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
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkMenuitems(mailContext, "externalMessageWindow");

  await BrowserTestUtils.closeWindow(win);
});
