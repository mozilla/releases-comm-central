/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env webextensions */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const TEST_DOCUMENT_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/widgets/files/formContent.html";

const tabmail = document.getElementById("tabmail");
let testFolder;

async function checkABrowser(browser) {
  if (
    browser.ownerDocument.readyState != "complete" ||
    !browser.currentURI ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(
      browser,
      false,
      url => url != "about:blank"
    );
  }

  const win = browser.ownerGlobal;
  const doc = browser.ownerDocument;

  // Date picker

  // Open the popup. Sometimes the click to open the date picker is ignored and
  // the test runs into a timeout. Adding a small delay here helps to prevent that.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 250));
  info("Preparing to open the date picker.");
  const pickerPromise = BrowserTestUtils.waitForDateTimePickerPanelShown(
    win.top
  );

  await SpecialPowers.spawn(browser, [], function () {
    const input = content.document.querySelector(`input[type="date"]`);
    if (content.location.protocol == "mailbox:") {
      // Clicking doesn't open the pop-up in messages. Bug 1854293.
      content.document.notifyUserGestureActivation();
      input.showPicker();
    } else {
      EventUtils.synthesizeMouseAtCenter(
        input.openOrClosedShadowRoot.getElementById("calendar-button"),
        {},
        content
      );
    }
  });
  const picker = await pickerPromise;
  Assert.ok(!!picker, "Date picker was successfully opened");

  // Click in the middle of the picker. This should always land on a date and
  // close the picker.
  const frame = picker.querySelector("#dateTimePopupFrame");
  EventUtils.synthesizeMouseAtCenter(
    frame.contentDocument.querySelector(".days-view td"),
    {},
    frame.contentWindow
  );
  await BrowserTestUtils.waitForPopupEvent(picker, "hidden");

  // Check the date was assigned to the input.
  await SpecialPowers.spawn(browser, [], () => {
    Assert.ok(
      content.document.querySelector(`input[type="date"]`).value,
      "date input should have a date value"
    );
  });

  // Select drop-down

  const menulist = win.top.document.getElementById("ContentSelectDropdown");

  // Click on the select control to open the popup.
  const selectPromise = BrowserTestUtils.waitForSelectPopupShown(win.top);
  await BrowserTestUtils.synthesizeMouseAtCenter("select", {}, browser);
  const menupopup = await selectPromise;

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
  menupopup.activateItem(menupopup.children[1]);
  await BrowserTestUtils.waitForPopupEvent(menulist, "hidden");

  // Sometimes the next change doesn't happen soon enough.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 1000));

  // Check the value was assigned to the control.
  await SpecialPowers.spawn(browser, [], () => {
    Assert.equal(content.document.querySelector("select").value, "3.141592654");
  });

  // Input auto-complete

  const popup = doc.getElementById(browser.getAttribute("autocompletepopup"));
  Assert.ok(popup, "auto-complete popup exists");

  // Click on the input box and type some letters to open the popup.
  const shownPromise = BrowserTestUtils.waitForPopupEvent(popup, "shown");
  browser.focus();
  await SimpleTest.promiseFocus(browser);
  await SpecialPowers.spawn(browser, [], () => {
    const input = content.document.querySelector(`input[list="letters"]`);
    input.focus();
    EventUtils.synthesizeKey("e", {}, content);
    EventUtils.synthesizeKey("t", {}, content);
    EventUtils.synthesizeKey("a", {}, content);
    Assert.equal(input.value, "eta");
  });
  await shownPromise;

  // Allow the popup time to initialise.
  await new Promise(r => win.setTimeout(r, 500));

  const list = popup.querySelector("richlistbox");
  Assert.ok(list, "list added to popup");
  Assert.equal(list.itemCount, 4);
  Assert.equal(list.itemChildren[0].getAttribute("title"), "beta");
  Assert.equal(list.itemChildren[1].getAttribute("title"), "zeta");
  Assert.equal(list.itemChildren[2].getAttribute("title"), "eta");
  Assert.equal(list.itemChildren[3].getAttribute("title"), "theta");

  // Click the second option. This sets the value and closes the popup.
  EventUtils.synthesizeMouseAtCenter(list.itemChildren[1], {}, win);
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");

  await SpecialPowers.spawn(browser, [], () => {
    // Check the value was assigned to the input.
    const input = content.document.querySelector(`input[list="letters"]`);
    Assert.equal(content.document.activeElement, input, "input has focus");
    Assert.equal(input.value, "zeta");

    // Type some more characters.
    // Check the space character isn't consumed by cmd_space.
    EventUtils.sendString(" function", content);
    Assert.equal(input.value, "zeta function");
  });

  // Check that a <details> element can be opened and closed by clicking or
  // pressing enter/space on its <summary>.
  await SpecialPowers.spawn(browser, [], () => {
    const details = content.document.querySelector("details");
    const summary = details.querySelector("summary");

    Assert.ok(!details.open, "details element should be closed initially");
    EventUtils.synthesizeMouseAtCenter(summary, {}, content);
    Assert.ok(details.open, "details element should open on click");
    EventUtils.synthesizeKey("VK_SPACE", {}, content);
    Assert.ok(!details.open, "details element should close on space key press");
    EventUtils.synthesizeKey("VK_RETURN", {}, content);
    Assert.ok(details.open, "details element should open on return key press");
  });
}

add_setup(async function () {
  // We'll try composing, so need an account.
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  identity.email = "mochitest@localhost";
  account.addIdentity(identity);
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test",
    "pop3"
  );
  MailServices.accounts.defaultAccount = account;
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
    .createLocalSubfolder("formPickerFolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const message = await IOUtils.readUTF8(
    getTestFilePath("files/formContent.eml")
  );
  testFolder.addMessage(message);

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testExtensionPopupWindow() {
  const extension = ExtensionTestUtils.loadExtension({
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
      "formContent.html": await IOUtils.readUTF8(
        getTestFilePath("files/formContent.html")
      ),
    },
  });

  await extension.startup();
  await extension.awaitFinish("ready");

  const extensionPopup = Services.wm.getMostRecentWindow("mail:extensionPopup");
  // extensionPopup.xhtml needs time to initialise properly.
  await new Promise(resolve => extensionPopup.setTimeout(resolve, 500));
  await checkABrowser(extensionPopup.document.getElementById("requestFrame"));
  await BrowserTestUtils.closeWindow(extensionPopup);

  await extension.unload();
});

add_task(async function testExtensionBrowserAction() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "formContent.html": await IOUtils.readUTF8(
        getTestFilePath("files/formContent.html")
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

  const { panel, browser } = await openExtensionPopup(
    window,
    "ext-formpickers@mochi.test"
  );
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
});

add_task(async function testExtensionComposeAction() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "formContent.html": await IOUtils.readUTF8(
        getTestFilePath("files/formContent.html")
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

  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  const composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "load");

  const { panel, browser } = await openExtensionPopup(
    composeWindow,
    "formpickers_mochi_test-composeAction-toolbarbutton"
  );
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
  await BrowserTestUtils.closeWindow(composeWindow);
});

add_task(async function testExtensionMessageDisplayAction() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "formContent.html": await IOUtils.readUTF8(
        getTestFilePath("files/formContent.html")
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

  const messageWindowPromise = BrowserTestUtils.domWindowOpened();
  window.MsgOpenNewWindowForMessage([...testFolder.messages][0]);
  const messageWindow = await messageWindowPromise;
  const { target: aboutMessage } = await BrowserTestUtils.waitForEvent(
    messageWindow,
    "aboutMessageLoaded"
  );

  const { panel, browser } = await openExtensionPopup(
    aboutMessage,
    "formpickers_mochi_test-messageDisplayAction-toolbarbutton"
  );
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
  await BrowserTestUtils.closeWindow(messageWindow);
});
