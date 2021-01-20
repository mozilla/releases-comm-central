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

const TEST_DOCUMENT_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/browser/files/sampleContent.html";

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

async function checkABrowser(browser) {
  if (
    browser.webProgress?.isLoadingDocument ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(browser);
  }

  let mailContext = browser.ownerDocument.getElementById("mailContext");

  let shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  BrowserTestUtils.synthesizeMouseAtCenter(
    "p",
    { type: "contextmenu" },
    browser
  );
  await shownPromise;
  checkMenuitems(
    mailContext,
    "mailContext-reload",
    "mailContext-stop",
    "mailContext-selectall"
  );
  mailContext.hidePopup();

  shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  BrowserTestUtils.synthesizeMouseAtCenter(
    "a",
    { type: "contextmenu" },
    browser
  );
  await shownPromise;
  checkMenuitems(
    mailContext,
    "mailContext-openLinkInBrowser",
    "mailContext-selectall",
    "mailContext-copylink",
    "mailContext-savelink"
  );
  mailContext.hidePopup();

  BrowserTestUtils.synthesizeMouseAtCenter("input", {}, browser);
  shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  BrowserTestUtils.synthesizeMouseAtCenter(
    "input",
    { type: "contextmenu" },
    browser
  );
  await shownPromise;
  checkMenuitems(
    mailContext,
    "mailContext-undo",
    "mailContext-cut",
    "mailContext-copy",
    "mailContext-paste",
    "mailContext-selectall",
    "mailContext-spell-check-enabled"
  );
  mailContext.hidePopup();
}

add_task(async function testMessagePane() {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test", null);
  let testFolder = rootFolder
    .getChildNamed("test")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  let messages = new MessageGenerator().makeMessages({ count: 5 });
  let messageStrings = messages.map(message => message.toMboxString());
  testFolder.addMessageBatch(messageStrings);

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, true);
  });

  window.gFolderTreeView.selectFolder(testFolder);
  if (window.IsMessagePaneCollapsed()) {
    window.MsgToggleMessagePane();
  }

  // No messages are selected.

  let mailContext = document.getElementById("mailContext");
  let messagePane = document.getElementById("messagepane");
  await BrowserTestUtils.browserLoaded(messagePane, undefined, "about:blank");
  Assert.equal(messagePane.currentURI.spec, "about:blank");
  BrowserTestUtils.synthesizeMouseAtCenter(
    "html",
    { type: "contextmenu" },
    messagePane
  );
  checkMenuitems(mailContext);

  // A web page is shown in the message pane.

  BrowserTestUtils.loadURI(messagePane, TEST_DOCUMENT_URL);
  await checkABrowser(messagePane);

  let tree = window.gFolderDisplay.tree;
  let coords = tree.getCoordsForCellItem(6, tree.columns.subjectCol, "cell");
  let treeChildren = tree.lastElementChild;
  EventUtils.synthesizeMouse(
    treeChildren,
    coords.x + coords.width / 2,
    coords.y + coords.height / 2,
    { type: "contextmenu" }
  );
  checkMenuitems(mailContext);

  // One message is selected.

  window.gFolderDisplay.selectViewIndex(0);
  await BrowserTestUtils.browserLoaded(messagePane);
  let shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    messagePane
  );
  await shownPromise;
  let messageItems = [
    "mailContext-selectall",
    "mailContext-openContainingFolder",
    "mailContext-replySender",
    "mailContext-replyAll",
    "mailContext-replyList",
    "mailContext-forward",
    "mailContext-forwardAsMenu",
    "mailContext-editAsNew",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-archive",
    "mailContext-moveMenu",
    "mailContext-copyMenu",
    "mailContext-moveToFolderAgain",
    "mailContext-calendar-convert-menu",
    "mailContext-delete",
    "mailContext-ignoreThread",
    "mailContext-ignoreSubthread",
    "mailContext-watchThread",
    "mailContext-saveAs",
  ];
  if (AppConstants.platform == "macosx") {
    messageItems.push("mailContext-print");
  } else {
    messageItems.push("mailContext-printpreview", "mailContext-print");
  }
  checkMenuitems(mailContext, ...messageItems);
  mailContext.hidePopup();

  shownPromise = BrowserTestUtils.waitForEvent(mailContext, "popupshown");
  EventUtils.synthesizeMouse(
    treeChildren,
    coords.x + coords.width / 2,
    coords.y + coords.height / 2,
    { type: "contextmenu" }
  );
  await shownPromise;
  let treeItems = [
    "threadPaneContext-openNewTab",
    "mailContext-openNewWindow",
    "mailContext-openContainingFolder",
    "mailContext-replySender",
    "mailContext-replyAll",
    "mailContext-replyList",
    "mailContext-forward",
    "mailContext-forwardAsMenu",
    "mailContext-editAsNew",
    "mailContext-tags",
    "mailContext-mark",
    "mailContext-archive",
    "mailContext-moveMenu",
    "mailContext-copyMenu",
    "mailContext-moveToFolderAgain",
    "mailContext-calendar-convert-menu",
    "mailContext-delete",
    "mailContext-ignoreThread",
    "mailContext-ignoreSubthread",
    "mailContext-watchThread",
    "mailContext-saveAs",
  ];
  if (AppConstants.platform == "macosx") {
    treeItems.push("mailContext-print");
  } else {
    treeItems.push("mailContext-printpreview", "mailContext-print");
  }
  checkMenuitems(mailContext, ...treeItems);
  mailContext.hidePopup();

  // Multiple messages are selected.

  tree.view.selection.rangedSelect(1, 3, false);

  EventUtils.synthesizeMouse(
    treeChildren,
    coords.x + coords.width / 2,
    coords.y + coords.height / 2,
    { type: "contextmenu" }
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
    "mailContext-delete",
    "mailContext-ignoreThread",
    "mailContext-ignoreSubthread",
    "mailContext-watchThread",
    "mailContext-saveAs",
    "mailContext-print",
    "downloadSelected"
  );
  mailContext.hidePopup();
});

add_task(async function testContentTab() {
  let tab = window.openContentTab(TEST_DOCUMENT_URL);
  await checkABrowser(tab.browser);

  let tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tab);
});

add_task(async function testExtensionPopupWindow() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      await browser.windows.create({
        url: "sampleContent.html",
        type: "popup",
        width: 800,
        height: 500,
      });
      browser.test.notifyPass("ready");
    },
    files: {
      "sampleContent.html": await fetch(TEST_DOCUMENT_URL).then(response =>
        response.text()
      ),
    },
  });

  await extension.startup();
  await extension.awaitFinish("ready");

  let extensionPopup = Services.wm.getMostRecentWindow("mail:extensionPopup");
  await checkABrowser(extensionPopup.document.getElementById("requestFrame"));
  await BrowserTestUtils.closeWindow(extensionPopup);

  await extension.unload();
});

add_task(async function testExtensionBrowserAction() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "sampleContent.html": await fetch(TEST_DOCUMENT_URL).then(response =>
        response.text()
      ),
    },
    manifest: {
      applications: {
        gecko: {
          id: "test1@mochi.test",
        },
      },
      browser_action: {
        default_popup: "sampleContent.html",
      },
    },
  });

  await extension.startup();

  let browserPromise = awaitExtensionPanel(extension, window);
  let actionButton = document.getElementById(
    "test1_mochi_test-browserAction-toolbarbutton"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {});

  let browser = await browserPromise;
  let panel = document.getElementById("test1_mochi_test-panel");
  // The panel needs some time to decide how big it's going to be.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
});

add_task(async function testExtensionComposeAction() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "sampleContent.html": await fetch(TEST_DOCUMENT_URL).then(response =>
        response.text()
      ),
    },
    manifest: {
      applications: {
        gecko: {
          id: "test1@mochi.test",
        },
      },
      compose_action: {
        default_popup: "sampleContent.html",
      },
    },
  });

  await extension.startup();

  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  let composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "load");
  let composeDocument = composeWindow.document;

  await new Promise(resolve => composeWindow.setTimeout(resolve, 500));

  let browserPromise = awaitExtensionPanel(extension, composeWindow);
  let actionButton = composeDocument.getElementById(
    "test1_mochi_test-composeAction-toolbarbutton"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {}, composeWindow);

  let browser = await browserPromise;
  let panel = composeDocument.getElementById("test1_mochi_test-panel");
  // The panel needs some time to decide how big it's going to be.
  await new Promise(resolve => composeWindow.setTimeout(resolve, 500));
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
  await BrowserTestUtils.closeWindow(composeWindow);
});

add_task(async function testExtensionMessageDisplayAction() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "sampleContent.html": await fetch(TEST_DOCUMENT_URL).then(response =>
        response.text()
      ),
    },
    manifest: {
      applications: {
        gecko: {
          id: "test1@mochi.test",
        },
      },
      message_display_action: {
        default_popup: "sampleContent.html",
      },
    },
  });

  await extension.startup();

  window.gFolderDisplay.selectViewIndex(0);
  let messageWindowPromise = BrowserTestUtils.domWindowOpened();
  window.MsgOpenNewWindowForMessage();
  let messageWindow = await messageWindowPromise;
  await BrowserTestUtils.waitForEvent(messageWindow, "load");
  let messageDocument = messageWindow.document;

  await new Promise(resolve => messageWindow.setTimeout(resolve, 500));

  let browserPromise = awaitExtensionPanel(extension, messageWindow);
  let actionButton = messageDocument.getElementById(
    "test1_mochi_test-messageDisplayAction-toolbarbutton"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {}, messageWindow);

  let browser = await browserPromise;
  let panel = messageDocument.getElementById("test1_mochi_test-panel");
  // The panel needs some time to decide how big it's going to be.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
  await BrowserTestUtils.closeWindow(messageWindow);
});

async function awaitExtensionPanel(extension, win) {
  let { originalTarget: browser } = await BrowserTestUtils.waitForEvent(
    win.document,
    "WebExtPopupLoaded",
    true,
    event => event.detail.extension.id === extension.id
  );

  let popup = browser.closest("panel");
  if (popup.state != "open") {
    await BrowserTestUtils.waitForEvent(popup, "popupshown");
  }

  if (
    browser.webProgress?.isLoadingDocument ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(browser);
  }

  return browser;
}
