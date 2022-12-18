/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env webextensions */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

const TEST_MESSAGE_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/browser/files/sampleContent.eml";

let about3Pane, mailContext, testFolder, threadTree;

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
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("browserContextFolder", null);
  testFolder = rootFolder
    .getChildNamed("browserContextFolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  let message = await fetch(TEST_MESSAGE_URL).then(r => r.text());
  testFolder.addMessageBatch([message]);
  let messages = new MessageGenerator().makeMessages({ count: 5 });
  let messageStrings = messages.map(message => message.toMboxString());
  testFolder.addMessageBatch(messageStrings);

  about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });
  mailContext = about3Pane.document.getElementById("mailContext");
  threadTree = about3Pane.threadTree;

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, true);
  });
});

/**
 * Tests the mailContext menu on the thread tree and message pane when no
 * messages are selected.
 */
add_task(async function testNoMessages() {
  about3Pane.displayMessages();

  // The message pane browser isn't visible.

  Assert.ok(BrowserTestUtils.is_hidden(about3Pane.messageBrowser));
  Assert.equal(about3Pane.messageBrowser.currentURI.spec, "about:message");
  Assert.equal(
    about3Pane.messageBrowser.contentWindow.content.currentURI.spec,
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
    "mailContext-moveToFolderAgain",
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
  let treeRect = threadTree.getBoundingClientRect();
  EventUtils.synthesizeMouse(
    threadTree,
    treeRect.x + treeRect.width / 2,
    treeRect.y + 10,
    {
      type: "contextmenu",
    },
    about3Pane
  );
  await shownPromise;
  let treeItems = [
    "mailContext-openNewTab",
    "mailContext-openNewWindow",
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
    "mailContext-moveToFolderAgain",
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

  let treeRect = threadTree.getBoundingClientRect();
  EventUtils.synthesizeMouse(
    threadTree,
    treeRect.x + treeRect.width / 2,
    treeRect.y + 30,
    {
      type: "contextmenu",
    },
    about3Pane
  );
  checkMenuitems(
    mailContext,
    "mailContext-multiForwardAsAttachment",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-archive",
    "mailContext-moveMenu",
    "mailContext-copyMenu",
    "mailContext-moveToFolderAgain",
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
