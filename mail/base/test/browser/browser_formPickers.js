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
    await BrowserTestUtils.browserLoaded(
      browser,
      undefined,
      url => url != "about:blank"
    );
  }

  let win = browser.ownerGlobal;
  let doc = browser.ownerDocument;

  // Date picker

  let picker = win.top.document.getElementById("DateTimePickerPanel");
  Assert.ok(picker, "date/time picker exists");

  // Open the popup.
  let shownPromise = BrowserTestUtils.waitForEvent(picker, "popupshown");
  await SpecialPowers.spawn(browser, [], function () {
    content.document.notifyUserGestureActivation();
    content.document.querySelector(`input[type="date"]`).showPicker();
  });
  await shownPromise;

  // Allow the picker time to initialise.
  await new Promise(r => win.setTimeout(r, 500));

  // Click in the middle of the picker. This should always land on a date and
  // close the picker.
  let hiddenPromise = BrowserTestUtils.waitForEvent(picker, "popuphidden");
  let frame = picker.querySelector("#dateTimePopupFrame");
  EventUtils.synthesizeMouseAtCenter(
    frame.contentDocument.querySelector(".days-view td"),
    {},
    frame.contentWindow
  );
  await hiddenPromise;

  // Check the date was assigned to the input.
  await SpecialPowers.spawn(browser, [], () => {
    Assert.ok(content.document.querySelector(`input[type="date"]`).value);
  });

  // Select drop-down

  let menulist = win.top.document.getElementById("ContentSelectDropdown");
  Assert.ok(menulist, "select menulist exists");
  let menupopup = menulist.menupopup;

  // Click on the select control to open the popup.
  shownPromise = BrowserTestUtils.waitForEvent(menulist, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter("select", {}, browser);
  await shownPromise;

  // Allow the menulist time to initialise.
  await new Promise(r => win.setTimeout(r, 500));

  Assert.equal(menulist.value, "0");
  Assert.equal(menupopup.childElementCount, 3);
  // Item values do not match the content document, but are 0-indexed.
  Assert.equal(menupopup.children[0].label, "");
  Assert.equal(menupopup.children[0].value, "0");
  Assert.equal(menupopup.children[1].label, "π");
  Assert.equal(menupopup.children[1].value, "1");
  Assert.equal(menupopup.children[2].label, "τ");
  Assert.equal(menupopup.children[2].value, "2");

  // Click the second option. This sets the value and closes the menulist.
  hiddenPromise = BrowserTestUtils.waitForEvent(menulist, "popuphidden");
  menupopup.activateItem(menupopup.children[1]);
  await hiddenPromise;

  // Sometimes the next change doesn't happen soon enough.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 1000));

  // Check the value was assigned to the control.
  await SpecialPowers.spawn(browser, [], () => {
    Assert.equal(content.document.querySelector("select").value, "3.141592654");
  });

  // Input auto-complete

  browser.focus();

  let popup = doc.getElementById(browser.getAttribute("autocompletepopup"));
  Assert.ok(popup, "auto-complete popup exists");

  // Click on the input box and type some letters to open the popup.
  shownPromise = BrowserTestUtils.waitForEvent(popup, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    `input[list="letters"]`,
    {},
    browser
  );
  await BrowserTestUtils.synthesizeKey("e", {}, browser);
  await BrowserTestUtils.synthesizeKey("t", {}, browser);
  await BrowserTestUtils.synthesizeKey("a", {}, browser);
  await shownPromise;

  // Allow the popup time to initialise.
  await new Promise(r => win.setTimeout(r, 500));

  let list = popup.querySelector("richlistbox");
  Assert.ok(list, "list added to popup");
  Assert.equal(list.itemCount, 4);
  Assert.equal(list.itemChildren[0].getAttribute("title"), "beta");
  Assert.equal(list.itemChildren[1].getAttribute("title"), "zeta");
  Assert.equal(list.itemChildren[2].getAttribute("title"), "eta");
  Assert.equal(list.itemChildren[3].getAttribute("title"), "theta");

  // Click the second option. This sets the value and closes the popup.
  hiddenPromise = BrowserTestUtils.waitForEvent(popup, "popuphidden");
  EventUtils.synthesizeMouseAtCenter(list.itemChildren[1], {}, win);
  await hiddenPromise;

  // Check the value was assigned to the input.
  await SpecialPowers.spawn(browser, [], () => {
    Assert.equal(
      content.document.querySelector(`input[list="letters"]`).value,
      "zeta"
    );
  });
}

add_setup(async function () {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("formPickerFolder", null);
  testFolder = rootFolder
    .getChildNamed("formPickerFolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  let messages = new MessageGenerator().makeMessages({ count: 5 });
  let messageStrings = messages.map(message => message.toMboxString());
  testFolder.addMessageBatch(messageStrings);

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testMessagePane() {
  let about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  about3Pane.messagePane.displayWebPage(TEST_DOCUMENT_URL);
  await checkABrowser(about3Pane.webBrowser);
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

  let { panel, browser } = await openExtensionPopup(
    window,
    "ext-formpickers\\@mochi.test"
  );
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

  let { panel, browser } = await openExtensionPopup(
    composeWindow,
    "formpickers_mochi_test-composeAction-toolbarbutton"
  );
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
  window.MsgOpenNewWindowForMessage([...testFolder.messages][0]);
  let messageWindow = await messageWindowPromise;
  let { target: aboutMessage } = await BrowserTestUtils.waitForEvent(
    messageWindow,
    "aboutMessageLoaded"
  );

  let { panel, browser } = await openExtensionPopup(
    aboutMessage,
    "formpickers_mochi_test-messageDisplayAction-toolbarbutton"
  );
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
  await BrowserTestUtils.closeWindow(messageWindow);
});

add_task(async function testBrowserRequestWindow() {
  let requestWindow = await new Promise(resolve => {
    Services.ww.openWindow(
      null,
      "chrome://messenger/content/browserRequest.xhtml",
      null,
      "chrome,private,centerscreen,width=980,height=750",
      {
        url: TEST_DOCUMENT_URL,
        cancelled() {},
        loaded(window, webProgress) {
          resolve(window);
        },
      }
    );
  });

  await checkABrowser(requestWindow.document.getElementById("requestFrame"));
  await BrowserTestUtils.closeWindow(requestWindow);
});
