/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var GlodaTestHelper = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var { ConversationOpener } = ChromeUtils.importESModule(
  "resource:///modules/ConversationOpener.sys.mjs"
);
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/Gloda.sys.mjs"
);
var { GlodaIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaIndexer.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let testFolder, testMessages;

add_setup(async function () {
  const generator = new MessageGenerator();
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  testFolder = rootFolder
    .createLocalSubfolder("mailContextFolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const messages = generator.makeMessages({ count: 8, msgsPerThread: 3 });
  const messageStrings = messages.map(message => message.toMessageString());
  testFolder.addMessageBatch(messageStrings);
  testMessages = [...testFolder.messages];

  // Fool Gloda into thinking the user is always idle. This makes it index
  // changes straight away and we don't have to wait ages for it.
  GlodaTestHelper.prepareIndexerForTesting();

  // Clear persisted position/size possibly left from earlier tests.
  Services.xulStore.removeDocument(
    "chrome://messenger/content/messageWindow.xhtml"
  );

  registerCleanupFunction(() => {
    for (const folder of MailServices.accounts.allFolders) {
      Gloda.setFolderIndexingPriority(folder, -1);
    }
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function () {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({ messagePaneVisible: true, folderURI: testFolder });

  const { gDBView, messageBrowser, threadTree } = about3Pane;
  const aboutMessage = messageBrowser.contentWindow;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  const loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(0))
  );
  threadTree.selectedIndex = 0;
  await loadedPromise;

  await TestUtils.waitForCondition(
    () =>
      ConversationOpener.isMessageIndexed(testMessages[0]) &&
      !GlodaIndexer.indexing,
    "waiting for Gloda to finish indexing"
  );

  let mainPopup = await openHeaderPopup(aboutMessage);
  checkHeaderPopup(mainPopup, true, true, true);

  // Open in new window. Test the menu in the new window.

  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  mainPopup.activateItem(
    mainPopup.querySelector("#otherActionsOpenInNewWindow")
  );
  await BrowserTestUtils.waitForPopupEvent(mainPopup, "hidden");
  const win = await winPromise;
  await messageLoadedIn(win.messageBrowser);
  await SimpleTest.promiseFocus(win);
  const aboutMessage2 = win.messageBrowser.contentWindow;

  const popup2 = await openHeaderPopup(aboutMessage2);
  checkHeaderPopup(popup2, false, false, false);
  popup2.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(popup2, "hidden");
  await BrowserTestUtils.closeWindow(win);

  // Open in new tab. Test the menu in the new tab.

  mainPopup = await openHeaderPopup(aboutMessage);
  let tabPromise = BrowserTestUtils.waitForEvent(window, "aboutMessageLoaded");
  mainPopup.activateItem(mainPopup.querySelector("#otherActionsOpenInNewTab"));
  const { target: aboutMessage3 } = await tabPromise;
  Assert.equal(tabmail.currentTabInfo.mode.name, "mailMessageTab");

  await SimpleTest.promiseFocus(aboutMessage3);
  await new Promise(resolve => aboutMessage3.requestAnimationFrame(resolve));
  const popup3 = await openHeaderPopup(aboutMessage3);
  checkHeaderPopup(popup3, true, false, false);
  popup3.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(popup3, "hidden");

  tabmail.closeOtherTabs(0);

  // Open conversation.

  mainPopup = await openHeaderPopup(aboutMessage);
  tabPromise = BrowserTestUtils.waitForEvent(window, "aboutMessageLoaded");
  mainPopup.activateItem(
    mainPopup.querySelector("#otherActionsOpenConversation")
  );
  await tabPromise;
  Assert.equal(tabmail.currentTabInfo.mode.name, "mail3PaneTab");

  tabmail.closeOtherTabs(0);
});

async function openHeaderPopup(aboutMessage) {
  const button = aboutMessage.document.getElementById("otherActionsButton");
  const popup = aboutMessage.document.getElementById("otherActionsPopup");
  EventUtils.synthesizeMouseAtCenter(button, {}, aboutMessage);
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
  await TestUtils.waitForTick();
  return popup;
}

function checkHeaderPopup(popup, expectConversation, expectWindow, expectTab) {
  const openConversation = popup.querySelector("#otherActionsOpenConversation");
  const openInNewWindow = popup.querySelector("#otherActionsOpenInNewWindow");
  const openInNewTab = popup.querySelector("#otherActionsOpenInNewTab");
  Assert.equal(
    BrowserTestUtils.isVisible(openConversation),
    expectConversation
  );
  Assert.equal(BrowserTestUtils.isVisible(openInNewWindow), expectWindow);
  Assert.equal(BrowserTestUtils.isVisible(openInNewTab), expectTab);
}
