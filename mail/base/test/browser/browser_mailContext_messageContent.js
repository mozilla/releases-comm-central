/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that message content items on the mail context menu work.
 */

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

const TEST_MESSAGE_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/browser/files/sampleContent.eml";

const tabmail = document.getElementById("tabmail");
let testMessage;
let webSearchCount = 0;

async function subtest(aboutMessage, mailContext) {
  async function openAndCheck(selector, expectedItems) {
    BrowserTestUtils.synthesizeMouseAtCenter(
      selector,
      { type: "contextmenu" },
      browser
    );
    await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
    checkContentMenuitems(expectedItems);
    mailContext.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");
  }

  function checkContentMenuitems(expectedItems) {
    const actualItems = [];
    for (const item of mailContext.children) {
      if (["menu", "menuitem"].includes(item.localName) && !item.hidden) {
        actualItems.push(item.id);
      }
      if (item.id == "mailContext-searchTheWeb") {
        // We're only interested in items at the top of the menu. Stop.
        break;
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
  }

  async function openAndActivate(selector, itemId) {
    browser.focus();
    BrowserTestUtils.synthesizeMouseAtCenter(
      selector,
      { type: "contextmenu" },
      browser
    );
    await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
    mailContext.activateItem(mailContext.querySelector("#" + itemId));
    await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");
  }

  const browser = aboutMessage.getMessagePaneBrowser();

  // Just some text.

  await openAndCheck("p", ["mailContext-selectall"]);
  await openAndActivate("p", "mailContext-selectall");
  await SpecialPowers.spawn(browser, [], () => {
    const selection = content.document.getSelection();
    Assert.equal(selection.anchorNode, content.document.body);
    Assert.equal(selection.anchorOffset, 0);
    Assert.equal(selection.focusNode, content.document.body);
    Assert.equal(
      selection.focusOffset,
      content.document.body.childNodes.length
    );
    selection.collapseToStart();
  });

  // A link.

  await openAndCheck("a", [
    "mailContext-openLinkInBrowser",
    "mailContext-copylink",
    "mailContext-savelink",
    "mailContext-reportPhishingURL",
    "mailContext-selectall",
  ]);

  const openedLinkPromise = mockExternalProtocolService.promiseEvent();
  await openAndActivate("a", "mailContext-openLinkInBrowser");
  Assert.equal(
    await openedLinkPromise,
    "https://example.com/",
    "should have tried to open the browser"
  );

  await SimpleTest.promiseClipboardChange("https://example.com/", () =>
    openAndActivate("a", "mailContext-copylink")
  );
  Assert.equal(
    await getClipboardText(),
    "https://example.com/",
    "should have copied the URL"
  );

  let pickerPromise = new Promise(resolve => {
    SpecialPowers.MockFilePicker.init(window);
    SpecialPowers.MockFilePicker.useAnyFile();
    SpecialPowers.MockFilePicker.showCallback = picker => {
      resolve(picker);
      return Ci.nsIFilePicker.returnOk;
    };
  });
  openAndActivate("a", "mailContext-savelink");
  let picker = await pickerPromise;
  Assert.ok(picker, "should have opened the file picker");
  await TestUtils.waitForCondition(
    () => picker.file.exists() && picker.file.fileSize,
    "waiting for url to be saved to file"
  );
  let fileContents = await IOUtils.readUTF8(picker.file.path);
  Assert.stringContains(
    fileContents.substring(0, 60),
    "<title>mochitest index /</title>",
    "file contents should be from the URL"
  ); // This is the title of the page.
  picker.file.remove(false);
  SpecialPowers.MockFilePicker.cleanup();

  const phishingLinkPromise = mockExternalProtocolService.promiseEvent();
  await openAndActivate("a", "mailContext-reportPhishingURL");
  Assert.equal(
    await phishingLinkPromise,
    "https://phish.invalid/?a=b&url=https%3A%2F%2Fexample.com%2F",
    "should have tried to open the browser"
  );

  // An email link.

  await openAndCheck(`a[href^="mailto:"]`, [
    "mailContext-addemail",
    "mailContext-composeemailto",
    "mailContext-copyemail",
    "mailContext-selectall",
  ]);

  const tabOpenPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  await openAndActivate(`a[href^="mailto:"]`, "mailContext-addemail");
  const {
    detail: { tabInfo },
  } = await tabOpenPromise;
  if (tabInfo.browser.webProgress?.isLoadingDocument) {
    await BrowserTestUtils.browserLoaded(tabInfo.browser);
  }
  Assert.equal(
    tabInfo.mode.name,
    "addressBookTab",
    "should have opened the Address Book"
  );
  const aboutAddressBook = tabInfo.browser.contentWindow;
  await TestUtils.waitForCondition(
    () => aboutAddressBook.detailsPane.isEditing
  );
  Assert.equal(
    aboutAddressBook.document.querySelector(
      `#vcard-email tr:nth-child(1) input[type="email"]`
    ).value,
    "kate@kurtz.invalid",
    "should have pre-filled the email address"
  );
  tabmail.closeTab(tabInfo);
  if (mailContext.ownerGlobal.top != window) {
    await SimpleTest.promiseFocus(mailContext.ownerGlobal.top);
  }

  const composeWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  await openAndActivate(`a[href^="mailto:"]`, "mailContext-composeemailto");
  const composeWindow = await composeWindowPromise;
  await TestUtils.waitForCondition(
    () => composeWindow.gLoadingComplete,
    "waiting for the compose window to be ready"
  );

  const pills = composeWindow.document.querySelectorAll("mail-address-pill");
  Assert.equal(pills.length, 1, "should be one recipient");
  Assert.equal(
    pills[0].label,
    "kate@kurtz.invalid",
    "should have the right email address"
  );
  Assert.ok(pills[0].closest("#addressRowTo"), "should be a To recipient");
  await BrowserTestUtils.closeWindow(composeWindow);
  await SimpleTest.promiseFocus(mailContext.ownerGlobal.top);

  await SimpleTest.promiseClipboardChange("kate@kurtz.invalid", () =>
    openAndActivate(`a[href^="mailto:"]`, "mailContext-copyemail")
  );
  Assert.equal(
    await getClipboardText(),
    "kate@kurtz.invalid",
    "should have copied the email address"
  );

  // A text input widget.

  await BrowserTestUtils.synthesizeMouseAtCenter("input", {}, browser);
  await openAndCheck("input", ["mailContext-selectall"]);

  // An image.

  await openAndCheck("img", [
    "mailContext-copyimage",
    "mailContext-saveimage",
    "mailContext-selectall",
  ]);

  await SimpleTest.promiseClipboardChange("", () =>
    openAndActivate("img", "mailContext-copyimage")
  );
  Assert.equal(
    (await getClipboardFile()).type,
    "image/png",
    "should have copied the image"
  );

  pickerPromise = new Promise(resolve => {
    SpecialPowers.MockFilePicker.init(window);
    SpecialPowers.MockFilePicker.useAnyFile();
    SpecialPowers.MockFilePicker.showCallback = picker => {
      resolve(picker);
      return Ci.nsIFilePicker.returnOk;
    };
  });
  openAndActivate("img", "mailContext-saveimage");
  picker = await pickerPromise;
  Assert.equal(
    picker.defaultString,
    "tb-logo.png",
    "should have opened the file picker"
  );
  await TestUtils.waitForCondition(
    () => picker.file.exists() && picker.file.fileSize,
    "waiting for url to be saved to file"
  );
  fileContents = await IOUtils.read(picker.file.path, { maxBytes: 8 });
  Assert.deepEqual(
    Array.from(fileContents),
    [137, 80, 78, 71, 13, 10, 26, 10],
    "file contents should be the image"
  ); // These are the magic bytes for a PNG image.
  picker.file.remove(false);
  SpecialPowers.MockFilePicker.cleanup();

  // A selection.

  await SpecialPowers.spawn(browser, [], () => {
    content.document.querySelector("input").blur();
    const selection = content.document.getSelection();
    const range = content.document.createRange();
    const paragraph = content.document.querySelector("p");
    range.setStart(paragraph.firstChild, 18);
    range.setEnd(paragraph.firstChild, 32);
    selection.addRange(range);
    EventUtils.synthesizeMouseAtCenter(
      paragraph,
      { type: "contextmenu" },
      content
    );
  });
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  checkContentMenuitems([
    "mailContext-copy",
    "mailContext-selectall",
    "mailContext-searchTheWeb",
  ]);
  const searchItem = mailContext.querySelector("#mailContext-searchTheWeb");
  Assert.stringContains(
    searchItem.label,
    "Google",
    "search item label contains the search engine name"
  );
  Assert.stringContains(
    searchItem.label,
    `"sample content"`,
    "search item label contains the text to search"
  );
  mailContext.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");

  // This does not work in a test on Mac. Something to do with focus.
  if (AppConstants.platform != "macosx") {
    await SimpleTest.promiseClipboardChange("sample content", () =>
      openAndActivate("p", "mailContext-copy")
    );
    Assert.equal(
      await getClipboardText(),
      "sample content",
      "should have copied the selected text"
    );
  }

  let openedSearchPromise = mockExternalProtocolService.promiseEvent();
  await openAndActivate("p", "mailContext-searchTheWeb");
  Assert.equal(
    await openedSearchPromise,
    "https://www.google.com/search?q=sample+content",
    "should have tried to open the browser"
  );
  webSearchCount++;

  // A bigger selection. Check that the menu item is truncated but the search isn't.

  await SpecialPowers.spawn(browser, [], () => {
    content.document.querySelector("input").blur();
    const selection = content.document.getSelection();
    const range = content.document.createRange();
    const paragraph = content.document.querySelector("p");
    range.setStart(paragraph.firstChild, 18);
    range.setEnd(paragraph.firstChild, 42);
    selection.addRange(range);
    EventUtils.synthesizeMouseAtCenter(
      paragraph,
      { type: "contextmenu" },
      content
    );
  });
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  Assert.stringContains(
    searchItem.label,
    "Google",
    "search item label contains the search engine name"
  );
  Assert.stringContains(
    searchItem.label,
    `"sample content …"`,
    "search item label contains the truncated text to search"
  );
  mailContext.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");

  openedSearchPromise = mockExternalProtocolService.promiseEvent();
  await openAndActivate("p", "mailContext-searchTheWeb");
  Assert.equal(
    await openedSearchPromise,
    "https://www.google.com/search?q=sample+content+for+tests",
    "should have tried to open the browser"
  );
  webSearchCount++;
}

add_setup(async function () {
  Services.telemetry.clearScalars();
  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );
  Services.prefs.setStringPref(
    "browser.safebrowsing.reportPhishURL",
    "https://phish.invalid/?a=b"
  );

  MailServices.accounts.createLocalMailAccount();
  const account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const testFolder = rootFolder
    .createLocalSubfolder("mailContext messageContent")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const message = await fetch(TEST_MESSAGE_URL).then(response =>
    response.text()
  );
  testFolder.addMessage(message);
  testMessage = testFolder.messages.getNext();

  tabmail.currentAbout3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
    Services.prefs.clearUserPref("browser.safebrowsing.reportPhishURL");

    const scalars = TelemetryTestUtils.getProcessScalars("parent", true);
    Assert.equal(
      scalars["tb.websearch.usage"]?.google,
      webSearchCount,
      "count of web searches should be correct"
    );
  });
});

/**
 * Tests the mailContext menu on the message pane.
 */
add_task(async function testSingleMessage() {
  const about3Pane = tabmail.currentAbout3Pane;
  const mailContext = about3Pane.document.getElementById("mailContext");
  const { messageBrowser, threadTree } = about3Pane;

  threadTree.selectedIndex = 0;
  threadTree.scrollToIndex(0, true);
  await messageLoadedIn(messageBrowser);

  const aboutMessage = messageBrowser.contentWindow;
  await subtest(aboutMessage, mailContext);
});

/**
 * Tests the mailContext menu on the message pane of a message in a tab.
 */
add_task(async function testMessageTab() {
  const tabPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  window.OpenMessageInNewTab(testMessage, { background: false });
  const {
    detail: { tabInfo },
  } = await tabPromise;
  await messageLoadedIn(tabInfo.chromeBrowser);

  const aboutMessage = tabmail.currentAboutMessage;
  const mailContext = aboutMessage.document.getElementById("mailContext");

  await subtest(aboutMessage, mailContext);

  tabmail.closeTab(tabInfo);
});

/**
 * Tests the mailContext menu on the message pane of a message in a window.
 */
add_task(async function testMessageWindow() {
  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.MsgOpenNewWindowForMessage(testMessage);
  const win = await winPromise;
  await messageLoadedIn(win.messageBrowser);
  await SimpleTest.promiseFocus(win);

  const aboutMessage = win.messageBrowser.contentWindow;
  const mailContext = aboutMessage.document.getElementById("mailContext");

  await subtest(aboutMessage, mailContext);

  await BrowserTestUtils.closeWindow(win);
});

/** @implements {nsIExternalProtocolService} */
const mockExternalProtocolService = {
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),

  _deferred: null,

  externalProtocolHandlerExists(scheme) {
    return true;
  },

  isExposedProtocol(scheme) {
    return true;
  },

  loadURI(aURI, aWindowContext) {
    if (this._deferred) {
      const deferred = this._deferred;
      this._deferred = null;

      deferred.resolve(aURI.spec);
    } else {
      this.cancelPromise();
      Assert.ok(false, "unexpected call to external protocol service");
    }
  },

  promiseEvent() {
    this._deferred = PromiseUtils.defer();
    return this._deferred.promise;
  },

  cancelPromise() {
    this._deferred = null;
  },
};

function getClipboardText() {
  return new Promise(resolve => {
    document.onpaste = event => {
      document.onpaste = null;
      resolve(event.clipboardData.getData("text/plain"));
    };
    EventUtils.synthesizeKey("v", { accelKey: 1 });
  });
}

function getClipboardFile() {
  return new Promise(resolve => {
    document.onpaste = event => {
      document.onpaste = null;
      Assert.equal(event.clipboardData.files.length, 1);
      resolve(event.clipboardData.files[0]);
    };
    EventUtils.synthesizeKey("v", { accelKey: 1 });
  });
}
