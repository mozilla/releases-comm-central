/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/* globals checkABrowser */
Services.scriptloader.loadSubScript(
  new URL("head_formPickers.js", getRootDirectory(gTestPath)).href,
  this
);

const TEST_DOCUMENT_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/browser/widgets/files/formContent.html";

const tabmail = document.getElementById("tabmail");
let testFolder;

add_setup(async () => {
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

add_task(async function testMessagePaneMessageBrowser() {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });
  const { gDBView, messageBrowser, threadTree } = about3Pane;
  const messagePaneBrowser =
    messageBrowser.contentWindow.getMessagePaneBrowser();

  const loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(0))
  );
  threadTree.selectedIndex = 0;
  threadTree.scrollToIndex(0, true);
  await loadedPromise;

  Assert.ok(BrowserTestUtils.isVisible(about3Pane.messageBrowser));
  Assert.ok(BrowserTestUtils.isVisible(messagePaneBrowser));
  await checkABrowser(messagePaneBrowser);
});

add_task(async function testMessagePaneWebBrowser() {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  about3Pane.messagePane.displayWebPage(TEST_DOCUMENT_URL);
  Assert.ok(BrowserTestUtils.isVisible(about3Pane.webBrowser));
  await checkABrowser(about3Pane.webBrowser);
});

add_task(async function testContentTab() {
  const tab = window.openContentTab(TEST_DOCUMENT_URL);
  await checkABrowser(tab.browser);

  tabmail.closeTab(tab);
});

add_task(async function testMessageTab() {
  const tabPromise = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  window.OpenMessageInNewTab([...testFolder.messages][0], {
    background: false,
  });
  await tabPromise;
  await new Promise(resolve => setTimeout(resolve));

  const aboutMessage = tabmail.currentAboutMessage;
  await checkABrowser(aboutMessage.getMessagePaneBrowser());

  tabmail.closeOtherTabs(0);
});

add_task(async function testMessageWindow() {
  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.MsgOpenNewWindowForMessage([...testFolder.messages][0]);
  const win = await winPromise;
  await BrowserTestUtils.waitForEvent(win, "MsgLoaded");
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);

  const aboutMessage = win.messageBrowser.contentWindow;
  await checkABrowser(aboutMessage.getMessagePaneBrowser());

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function testBrowserRequestWindow() {
  const requestWindow = await new Promise(resolve => {
    Services.ww.openWindow(
      null,
      "chrome://messenger/content/browserRequest.xhtml",
      null,
      "chrome,private,centerscreen,width=980,height=750",
      {
        url: TEST_DOCUMENT_URL,
        cancelled() {},
        loaded(window) {
          resolve(window);
        },
      }
    );
  });

  await checkABrowser(requestWindow.document.getElementById("requestFrame"));
  await BrowserTestUtils.closeWindow(requestWindow);
});
