/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env webextensions */

var { MailE10SUtils } = ChromeUtils.import(
  "resource:///modules/MailE10SUtils.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

const TEST_DOCUMENT_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/browser/files/formContent.html";

let testFolder;

async function checkABrowser(browser) {
  if (
    browser.webProgress?.isLoadingDocument ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(browser);
  }

  let win = browser.ownerGlobal;
  let doc = browser.ownerDocument;

  let picker = doc.getElementById(browser.getAttribute("datetimepicker"));
  Assert.ok(picker, "date/time picker exists");

  // Click on the input box to open the popup.
  let shownPromise = BrowserTestUtils.waitForEvent(picker, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    `input[type="date"]`,
    {},
    browser
  );
  await shownPromise;

  // Allow the picker time to initialise.
  await new Promise(r => win.setTimeout(r, 500));

  // Click in the middle of the picker. This should always land on a date and
  // close the picker.
  let hiddenPromise = BrowserTestUtils.waitForEvent(picker, "popuphidden");
  EventUtils.synthesizeMouseAtCenter(picker, {}, win);
  await hiddenPromise;

  // Check the date was assigned to the input.
  await SpecialPowers.spawn(browser, [], () => {
    Assert.ok(content.document.querySelector(`input[type="date"]`).value);
  });
}

add_task(async function testMessagePane() {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test", null);
  testFolder = rootFolder
    .getChildNamed("test")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  let messages = new MessageGenerator().makeMessages({ count: 5 });
  let messageStrings = messages.map(message => message.toMboxString());
  testFolder.addMessageBatch(messageStrings);

  let messagePane = document.getElementById("messagepane");

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, true);
  });

  window.gFolderTreeView.selectFolder(testFolder);
  if (window.IsMessagePaneCollapsed()) {
    window.MsgToggleMessagePane();
  }

  MailE10SUtils.loadURI(messagePane, TEST_DOCUMENT_URL);
  await checkABrowser(messagePane);
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
        url: "formContent.html",
        type: "popup",
        width: 800,
        height: 500,
      });
      browser.test.notifyPass("ready");
    },
    files: {
      "formContent.html": await fetch(TEST_DOCUMENT_URL).then(response =>
        response.text()
      ),
    },
  });

  await extension.startup();
  await extension.awaitFinish("ready");

  let extensionPopup = Services.wm.getMostRecentWindow("mail:extensionPopup");
  // extensionPopup.xhtml needs time to initialise properly.
  await new Promise(resolve => extensionPopup.setTimeout(resolve, 500));
  await checkABrowser(extensionPopup.document.getElementById("requestFrame"));
  await BrowserTestUtils.closeWindow(extensionPopup);

  await extension.unload();
});

add_task(async function testExtensionBrowserAction() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "formContent.html": await fetch(TEST_DOCUMENT_URL).then(response =>
        response.text()
      ),
    },
    manifest: {
      applications: {
        gecko: {
          id: "formpickers@mochi.test",
        },
      },
      browser_action: {
        default_popup: "formContent.html",
      },
    },
  });

  await extension.startup();

  let browserPromise = awaitExtensionPanel(extension, window);
  let actionButton = document.getElementById(
    "formpickers_mochi_test-browserAction-toolbarbutton"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {});

  let browser = await browserPromise;
  let panel = document.getElementById("formpickers_mochi_test-panel");
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
      "formContent.html": await fetch(TEST_DOCUMENT_URL).then(response =>
        response.text()
      ),
    },
    manifest: {
      applications: {
        gecko: {
          id: "formpickers@mochi.test",
        },
      },
      compose_action: {
        default_popup: "formContent.html",
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
    "formpickers_mochi_test-composeAction-toolbarbutton"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {}, composeWindow);

  let browser = await browserPromise;
  let panel = composeDocument.getElementById("formpickers_mochi_test-panel");
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
      "formContent.html": await fetch(TEST_DOCUMENT_URL).then(response =>
        response.text()
      ),
    },
    manifest: {
      applications: {
        gecko: {
          id: "formpickers@mochi.test",
        },
      },
      message_display_action: {
        default_popup: "formContent.html",
      },
    },
  });

  await extension.startup();

  let messageWindowPromise = BrowserTestUtils.domWindowOpened();
  window.MsgOpenNewWindowForMessage(testFolder.messages.getNext());
  let messageWindow = await messageWindowPromise;
  await BrowserTestUtils.waitForEvent(messageWindow, "load");
  let messageDocument = messageWindow.document;

  await new Promise(resolve => messageWindow.setTimeout(resolve, 500));

  let browserPromise = awaitExtensionPanel(extension, messageWindow);
  let actionButton = messageDocument.getElementById(
    "formpickers_mochi_test-messageDisplayAction-toolbarbutton"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {}, messageWindow);

  let browser = await browserPromise;
  let panel = messageDocument.getElementById("formpickers_mochi_test-panel");
  // The panel needs some time to decide how big it's going to be.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
  await BrowserTestUtils.closeWindow(messageWindow);
});
