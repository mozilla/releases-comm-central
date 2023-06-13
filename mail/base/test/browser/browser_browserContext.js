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
const TEST_MESSAGE_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/browser/files/sampleContent.eml";
const TEST_IMAGE_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/browser/files/tb-logo.png";

let about3Pane, testFolder;

async function getImageArrayBuffer() {
  let response = await fetch(TEST_IMAGE_URL);
  let blob = await response.blob();

  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.addEventListener("loadend", event => {
      resolve(event.target.result);
    });
    reader.readAsArrayBuffer(blob);
  });
}

function checkMenuitems(menu, ...expectedItems) {
  if (expectedItems.length == 0) {
    // Menu should not be shown.
    Assert.equal(menu.state, "closed");
    return;
  }

  Assert.notEqual(menu.state, "closed");

  let actualItems = [];
  for (let item of menu.children) {
    if (
      ["menu", "menuitem", "menugroup"].includes(item.localName) &&
      !item.hidden
    ) {
      actualItems.push(item.id);
    }
  }
  Assert.deepEqual(actualItems, expectedItems);
}

async function checkABrowser(browser, doc = browser.ownerDocument) {
  if (
    browser.webProgress?.isLoadingDocument ||
    !browser.currentURI ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(
      browser,
      undefined,
      url => url != "about:blank"
    );
  }

  let browserContext = doc.getElementById("browserContext");
  let isMac = AppConstants.platform == "macosx";
  let isWebPage =
    browser.currentURI.schemeIs("http") || browser.currentURI.schemeIs("https");
  let isExtensionPage = browser.currentURI.schemeIs("moz-extension");

  // Just some text.

  let shownPromise = BrowserTestUtils.waitForEvent(
    browserContext,
    "popupshown"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "p",
    { type: "contextmenu" },
    browser
  );
  await shownPromise;

  let expectedContextItems = [];
  if (isWebPage || isExtensionPage) {
    if (isMac) {
      // Mac has the nav items directly in the context menu and not in the horizontal
      // context-navigation menugroup.
      expectedContextItems.push(
        "browserContext-back",
        "browserContext-forward",
        "browserContext-reload"
      );
    } else {
      expectedContextItems.push("context-navigation");
      checkMenuitems(
        doc.getElementById("context-navigation"),
        "browserContext-back",
        "browserContext-forward",
        "browserContext-reload"
      );
    }
  }
  if (isWebPage) {
    expectedContextItems.push("browserContext-openInBrowser");
  }
  expectedContextItems.push("browserContext-selectall");
  checkMenuitems(browserContext, ...expectedContextItems);
  browserContext.hidePopup();

  // A link.

  shownPromise = BrowserTestUtils.waitForEvent(browserContext, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "a",
    { type: "contextmenu" },
    browser
  );
  await shownPromise;
  checkMenuitems(
    browserContext,
    "browserContext-openLinkInBrowser",
    "browserContext-selectall",
    "browserContext-copylink",
    "browserContext-savelink"
  );
  browserContext.hidePopup();

  // A text input widget.

  await BrowserTestUtils.synthesizeMouseAtCenter("input", {}, browser);
  shownPromise = BrowserTestUtils.waitForEvent(browserContext, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "input",
    { type: "contextmenu" },
    browser
  );
  await shownPromise;
  checkMenuitems(
    browserContext,
    "browserContext-undo",
    "browserContext-cut",
    "browserContext-copy",
    "browserContext-paste",
    "browserContext-selectall",
    "browserContext-spell-check-enabled"
  );
  browserContext.hidePopup();

  // An image. Also checks Save Image As works.

  shownPromise = BrowserTestUtils.waitForEvent(browserContext, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "img",
    { type: "contextmenu" },
    browser
  );
  await shownPromise;
  checkMenuitems(
    browserContext,
    "browserContext-selectall",
    "browserContext-copyimage",
    "browserContext-saveimage"
  );

  let pickerPromise = new Promise(resolve => {
    SpecialPowers.MockFilePicker.init(window);
    SpecialPowers.MockFilePicker.showCallback = picker => {
      resolve(picker.defaultString);
      return Ci.nsIFilePicker.returnCancel;
    };
  });
  browserContext.activateItem(doc.getElementById("browserContext-saveimage"));
  Assert.equal(await pickerPromise, "tb-logo.png");
  SpecialPowers.MockFilePicker.cleanup();
}

add_setup(async function () {
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

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testMessagePane() {
  about3Pane.messagePane.displayWebPage(TEST_DOCUMENT_URL);
  await checkABrowser(about3Pane.webBrowser, document);
  about3Pane.messagePane.clearWebPage();
});

add_task(async function testContentTab() {
  let tab = window.openContentTab(TEST_DOCUMENT_URL);
  await checkABrowser(tab.browser);

  let tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tab);
});

add_task(async function testExtensionTab() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      await browser.tabs.create({ url: "sampleContent.html" });
      browser.test.notifyPass("ready");
    },
    files: {
      "sampleContent.html": await fetch(TEST_DOCUMENT_URL).then(response =>
        response.text()
      ),
      "tb-logo.png": await getImageArrayBuffer(),
    },
  });

  await extension.startup();
  await extension.awaitFinish("ready");

  let tabmail = document.getElementById("tabmail");
  await checkABrowser(tabmail.tabInfo[1].browser);
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);

  await extension.unload();
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
      "tb-logo.png": await getImageArrayBuffer(),
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
      "sampleContent.html": await fetch(TEST_DOCUMENT_URL).then(response =>
        response.text()
      ),
      "tb-logo.png": await getImageArrayBuffer(),
    },
    manifest: {
      applications: {
        gecko: {
          id: "browsercontext@mochi.test",
        },
      },
      browser_action: {
        default_popup: "sampleContent.html",
      },
    },
  });

  await extension.startup();

  let { panel, browser } = await openExtensionPopup(
    window,
    "ext-browsercontext\\@mochi.test"
  );
  await TestUtils.waitForCondition(
    () => browser.clientWidth > 100,
    "waiting for browser to resize"
  );
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
      "tb-logo.png": await getImageArrayBuffer(),
    },
    manifest: {
      applications: {
        gecko: {
          id: "browsercontext@mochi.test",
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

  let { panel, browser } = await openExtensionPopup(
    composeWindow,
    "browsercontext_mochi_test-composeAction-toolbarbutton"
  );
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
      "tb-logo.png": await getImageArrayBuffer(),
    },
    manifest: {
      applications: {
        gecko: {
          id: "browsercontext@mochi.test",
        },
      },
      message_display_action: {
        default_popup: "sampleContent.html",
      },
    },
  });

  await extension.startup();

  let messageWindowPromise = BrowserTestUtils.domWindowOpened();
  window.MsgOpenNewWindowForMessage([...testFolder.messages][0]);
  let messageWindow = await messageWindowPromise;
  let { target: aboutMessage } = await BrowserTestUtils.waitForEvent(
    messageWindow,
    "aboutMessageLoaded"
  );

  let { panel, browser } = await openExtensionPopup(
    aboutMessage,
    "browsercontext_mochi_test-messageDisplayAction-toolbarbutton"
  );
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
  await BrowserTestUtils.closeWindow(messageWindow);
});
