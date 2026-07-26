/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that clicking links in the message browser works.
 */

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let testMessage;

add_setup(async function () {
  MockExternalProtocolService.init();

  MailServices.accounts.createLocalMailAccount();
  const account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const testFolder = rootFolder
    .createLocalSubfolder("clickLinks")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const message = await IOUtils.readUTF8(
    getTestFilePath("files/clickableContent.eml")
  );
  testFolder.addMessage(message);
  testMessage = testFolder.messages.getNext();

  tabmail.currentAbout3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    MockExternalProtocolService.cleanup();
  });
});

add_task(async function click_elements() {
  const about3Pane = tabmail.currentAbout3Pane;
  const { messageBrowser, threadTree } = about3Pane;

  threadTree.selectedIndex = 0;
  threadTree.scrollToIndex(0, true);
  await messageLoadedIn(messageBrowser);

  const aboutMessage = messageBrowser.contentWindow;
  const browser = aboutMessage.getMessagePaneBrowser();
  browser.focus();

  const click_element = async selector => {
    const openedLinkPromise = MockExternalProtocolService.promiseLoad();
    BrowserTestUtils.synthesizeMouseAtCenter(selector, {}, browser);
    Assert.equal(
      await openedLinkPromise,
      "https://www.example.com/",
      "should have tried to open the browser"
    );
    MockExternalProtocolService.reset();
  };

  await click_element("a#a1");
  await click_element("button#button1");
  await click_element("button#button2");
  await click_element("button#button3");
});
