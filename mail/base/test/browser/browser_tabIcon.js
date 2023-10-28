/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { GlodaIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaIndexer.jsm"
);
const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

const TEST_DOCUMENT_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/browser/files/sampleContent.html";

const tabmail = document.getElementById("tabmail");
let rootFolder, testFolder, testMessages;

add_setup(async function () {
  MailServices.accounts.createLocalMailAccount();
  const account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("tabIcon", null);
  testFolder = rootFolder
    .getChildNamed("tabIcon")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  const messageFile = new FileUtils.File(
    getTestFilePath("files/sampleContent.eml")
  );
  Assert.ok(messageFile.exists(), "test data file should exist");
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  // Copy gIncomingMailFile into the Inbox.
  MailServices.copy.copyFileMessage(
    messageFile,
    testFolder,
    null,
    false,
    0,
    "",
    promiseCopyListener,
    null
  );
  await promiseCopyListener.promise;
  testMessages = [...testFolder.messages];
  tabmail.currentAbout3Pane.displayFolder(testFolder);

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(0);
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testMsgInFolder() {
  tabmail.currentAbout3Pane.threadTree.selectedIndex = 0;
  await BrowserTestUtils.browserLoaded(
    tabmail.currentAboutMessage.getMessagePaneBrowser()
  );
  const icon = tabmail.tabInfo[0].tabNode.querySelector(".tab-icon-image");
  await TestUtils.waitForCondition(() => icon.complete, "Icon loaded");
  Assert.equal(
    icon.src,
    "chrome://messenger/skin/icons/new/compact/folder.svg"
  );
});

add_task(async function testMsgInTab() {
  window.OpenMessageInNewTab(testMessages[0], { background: false });
  await BrowserTestUtils.waitForEvent(
    tabmail.tabInfo[1].chromeBrowser,
    "MsgLoaded"
  );
  const tab = tabmail.tabInfo[1];
  const icon = tab.tabNode.querySelector(".tab-icon-image");
  await TestUtils.waitForCondition(() => icon.complete, "Icon loaded");
  Assert.equal(icon.src, "chrome://messenger/skin/icons/new/compact/draft.svg");
});

add_task(async function testContentTab() {
  const tab = window.openTab("contentTab", {
    url: TEST_DOCUMENT_URL,
    background: false,
  });
  await BrowserTestUtils.browserLoaded(tab.browser);

  const icon = tab.tabNode.querySelector(".tab-icon-image");
  // Start of TEST_IMAGE_URL as data url.
  await BrowserTestUtils.waitForMutationCondition(
    icon,
    { attributes: true, attributeFilter: ["src"] },
    () => icon.src.startsWith("data:image/png;base64,iVBORw0KGgoAAAANSUhEU")
  );
});
