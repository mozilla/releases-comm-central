/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

let folderA, messagesA, folderB, messagesB;

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");
  Assert.equal(tabmail.tabInfo.length, 1, "should be set up with one tab");
  tabmail.closeOtherTabs(0);

  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  folderA = rootFolder
    .createLocalSubfolder("mailTabsA")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderA.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  messagesA = [...folderA.messages];

  folderB = rootFolder
    .createLocalSubfolder("mailTabsB")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderB.addMessageBatch(
    generator
      .makeMessages({ count: 2 })
      .map(message => message.toMessageString())
  );
  messagesB = [...folderB.messages];

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mail.tabs.loadInBackground");
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testTabs() {
  const tabmail = document.getElementById("tabmail");
  Assert.equal(tabmail.tabInfo.length, 1, "should start off with one tab open");
  Assert.deepEqual(
    tabmail.tabInfo.map(t => t.selected),
    [true]
  );
  Assert.equal(tabmail.currentTabInfo, tabmail.tabInfo[0], "should show tab 0");

  info("Check the first tab.");

  const firstTab = tabmail.currentTabInfo;
  Assert.equal(firstTab.mode.name, "mail3PaneTab");
  Assert.equal(firstTab.mode.tabType.name, "mailTab");

  const firstChromeBrowser = firstTab.chromeBrowser;
  Assert.equal(firstChromeBrowser.currentURI.spec, "about:3pane");
  Assert.equal(tabmail.currentAbout3Pane, firstChromeBrowser.contentWindow);

  const firstWebBrowser =
    firstChromeBrowser.contentDocument.getElementById("webBrowser");
  const firstMultiMessageBrowser =
    firstChromeBrowser.contentDocument.getElementById("multiMessageBrowser");
  const firstMessageBrowser =
    firstChromeBrowser.contentDocument.getElementById("messageBrowser");
  Assert.equal(firstMessageBrowser.currentURI.spec, "about:message");

  const firstMessagePane =
    firstMessageBrowser.contentDocument.getElementById("messagepane");
  Assert.equal(firstMessagePane.currentURI.spec, "about:blank");
  Assert.equal(
    tabmail.currentAboutMessage,
    null,
    "currentAboutMessage should be null with no message selected"
  );
  Assert.equal(firstTab.browser, null);
  Assert.equal(firstTab.linkedBrowser, null);

  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    !firstMessagePane.docShellIsActive,
    "first message browser should NOT be visible"
  );

  const { folderTree, threadTree, messagePane, paneLayout } =
    firstChromeBrowser.contentWindow;

  firstTab.folder = folderA;
  Assert.equal(firstTab.folder, folderA);
  Assert.equal(
    folderTree.querySelector(".selected .name").textContent,
    "mailTabsA"
  );
  Assert.equal(threadTree.view.rowCount, 5);
  Assert.equal(threadTree.selectedIndex, -1);

  Assert.equal(firstTab.message, null);
  threadTree.selectedIndex = 0;
  Assert.equal(
    tabmail.currentAboutMessage,
    firstMessageBrowser.contentWindow,
    "currentAboutMessage should have a value with a message selected"
  );
  Assert.equal(firstTab.message, messagesA[0]);
  Assert.equal(firstTab.browser, firstMessagePane);
  Assert.equal(firstTab.linkedBrowser, firstMessagePane);
  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    firstMessagePane.docShellIsActive,
    "first message browser should be visible"
  );

  Assert.ok(BrowserTestUtils.isVisible(folderTree));
  Assert.ok(BrowserTestUtils.isVisible(firstMessageBrowser));

  paneLayout.folderPaneVisible = false;
  Assert.ok(BrowserTestUtils.isHidden(folderTree));
  Assert.ok(BrowserTestUtils.isVisible(firstMessageBrowser));

  paneLayout.messagePaneVisible = false;
  Assert.ok(BrowserTestUtils.isHidden(folderTree));
  Assert.ok(BrowserTestUtils.isHidden(firstMessageBrowser));
  Assert.equal(
    tabmail.currentAboutMessage,
    null,
    "currentAboutMessage should be null with the message pane hidden"
  );
  Assert.equal(firstTab.browser, null);
  Assert.equal(firstTab.linkedBrowser, null);

  paneLayout.folderPaneVisible = true;
  Assert.ok(BrowserTestUtils.isVisible(folderTree));
  Assert.ok(BrowserTestUtils.isHidden(firstMessageBrowser));

  paneLayout.messagePaneVisible = true;
  Assert.ok(BrowserTestUtils.isVisible(folderTree));
  Assert.ok(BrowserTestUtils.isVisible(firstMessageBrowser));
  Assert.equal(
    tabmail.currentAboutMessage,
    firstMessageBrowser.contentWindow,
    "currentAboutMessage should have a value with the message pane shown"
  );
  Assert.equal(firstTab.browser, firstMessagePane);
  Assert.equal(firstTab.linkedBrowser, firstMessagePane);

  Assert.equal(firstChromeBrowser.contentWindow.tabOrWindow, firstTab);
  Assert.equal(firstMessageBrowser.contentWindow.tabOrWindow, firstTab);

  info("Select multiple messages.");

  threadTree.selectedIndices = [1, 2];
  Assert.ok(BrowserTestUtils.isHidden(firstWebBrowser));
  Assert.ok(BrowserTestUtils.isHidden(firstMessageBrowser));
  Assert.ok(BrowserTestUtils.isVisible(firstMultiMessageBrowser));
  Assert.equal(
    tabmail.currentAboutMessage,
    null,
    "currentAboutMessage should be null with multiple messages selected"
  );
  Assert.equal(firstTab.browser, null);
  Assert.equal(firstTab.linkedBrowser, null);
  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    !firstMessagePane.docShellIsActive,
    "first message browser should NOT be visible"
  );

  info("Load a web page.");

  const loadedPromise = BrowserTestUtils.browserLoaded(
    firstWebBrowser,
    false,
    "http://mochi.test:8888/"
  );
  messagePane.displayWebPage("http://mochi.test:8888/");
  await loadedPromise;
  Assert.ok(BrowserTestUtils.isVisible(firstWebBrowser));
  Assert.ok(BrowserTestUtils.isHidden(firstMessageBrowser));
  Assert.ok(BrowserTestUtils.isHidden(firstMultiMessageBrowser));
  Assert.equal(firstWebBrowser.currentURI.spec, "http://mochi.test:8888/");
  Assert.equal(
    tabmail.currentAboutMessage,
    null,
    "currentAboutMessage should be null with a web page loaded"
  );
  Assert.equal(firstTab.browser, firstWebBrowser);
  Assert.equal(firstTab.linkedBrowser, firstWebBrowser);
  Assert.ok(
    firstWebBrowser.docShellIsActive,
    "first web browser should be visible"
  );
  Assert.ok(
    !firstMessagePane.docShellIsActive,
    "first message browser should NOT be visible"
  );

  info("Go back to a single selection.");

  threadTree.selectedIndex = 0;
  Assert.ok(BrowserTestUtils.isHidden(firstWebBrowser));
  Assert.ok(BrowserTestUtils.isVisible(firstMessageBrowser));
  Assert.ok(BrowserTestUtils.isHidden(firstMultiMessageBrowser));
  Assert.equal(
    tabmail.currentAboutMessage,
    firstMessageBrowser.contentWindow,
    "currentAboutMessage should have a value with a single message selected"
  );
  Assert.equal(firstTab.browser, firstMessagePane);
  Assert.equal(firstTab.linkedBrowser, firstMessagePane);
  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    firstMessagePane.docShellIsActive,
    "first message browser should be visible"
  );

  Services.prefs.setBoolPref("mail.tabs.loadInBackground", true);
  info("Open some more tabs. These should open in the background.");

  window.MsgOpenNewTabForFolders([folderB], {
    folderPaneVisible: true,
    messagePaneVisible: true,
  });

  for (const message of messagesB) {
    window.OpenMessageInNewTab(message, {});
  }

  Assert.equal(tabmail.tabInfo.length, 4);
  Assert.deepEqual(
    tabmail.tabInfo.map(t => t.selected),
    [true, false, false, false]
  );
  Assert.equal(tabmail.currentTabInfo, firstTab);
  Assert.equal(tabmail.currentAbout3Pane, firstChromeBrowser.contentWindow);
  Assert.equal(tabmail.currentAboutMessage, firstMessageBrowser.contentWindow);

  info("Check the second tab.");

  const secondTab = tabmail.tabInfo[1];
  Assert.equal(secondTab.mode.name, "mail3PaneTab");
  Assert.equal(secondTab.mode.tabType.name, "mailTab");

  const secondChromeBrowser = secondTab.chromeBrowser;
  await ensureBrowserLoaded(secondChromeBrowser);
  Assert.equal(secondChromeBrowser.currentURI.spec, "about:3pane");

  const secondWebBrowser =
    secondChromeBrowser.contentDocument.getElementById("webBrowser");
  const secondMessageBrowser =
    secondChromeBrowser.contentDocument.getElementById("messageBrowser");
  await ensureBrowserLoaded(secondMessageBrowser);
  Assert.equal(secondMessageBrowser.currentURI.spec, "about:message");

  const secondMessagePane =
    secondMessageBrowser.contentDocument.getElementById("messagepane");
  Assert.equal(secondMessagePane.currentURI.spec, "about:blank");
  Assert.equal(secondTab.browser, null);
  Assert.equal(secondTab.linkedBrowser, null);
  Assert.equal(secondTab.folder, folderB);

  Assert.ok(
    !secondWebBrowser.docShellIsActive,
    "second web browser should NOT be visible"
  );
  Assert.ok(
    !secondMessagePane.docShellIsActive,
    "second message browser should NOT be visible"
  );

  tabmail.switchToTab(1);
  Assert.deepEqual(
    tabmail.tabInfo.map(t => t.selected),
    [false, true, false, false]
  );
  Assert.equal(tabmail.currentTabInfo, tabmail.tabInfo[1]);
  Assert.equal(tabmail.currentAbout3Pane, secondChromeBrowser.contentWindow);
  Assert.equal(
    tabmail.currentAboutMessage,
    null,
    "currentAboutMessage should be null with no message selected"
  );

  Assert.ok(
    !secondWebBrowser.docShellIsActive,
    "second web browser should NOT be visible"
  );
  Assert.ok(
    !secondMessagePane.docShellIsActive,
    "second message browser should NOT be visible"
  );
  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    !firstMessagePane.docShellIsActive,
    "first message browser should NOT be visible"
  );

  secondChromeBrowser.contentWindow.threadTree.selectedIndex = 0;
  Assert.equal(
    tabmail.currentAboutMessage,
    secondMessageBrowser.contentWindow,
    "currentAboutMessage should have a value with a message selected"
  );
  Assert.ok(
    !secondWebBrowser.docShellIsActive,
    "second web browser should NOT be visible"
  );
  Assert.ok(
    secondMessagePane.docShellIsActive,
    "second message browser should be visible"
  );

  Assert.equal(secondChromeBrowser.contentWindow.tabOrWindow, secondTab);
  Assert.equal(secondMessageBrowser.contentWindow.tabOrWindow, secondTab);

  info("Check the third tab.");

  const thirdTab = tabmail.tabInfo[2];
  Assert.equal(thirdTab.mode.name, "mailMessageTab");
  Assert.equal(thirdTab.mode.tabType.name, "mailTab");

  const thirdChromeBrowser = thirdTab.chromeBrowser;
  await ensureBrowserLoaded(thirdChromeBrowser);
  Assert.equal(thirdChromeBrowser.currentURI.spec, "about:message");

  const thirdMessagePane =
    thirdChromeBrowser.contentDocument.getElementById("messagepane");
  Assert.equal(thirdMessagePane.currentURI.spec, messageToURL(messagesB[0]));
  Assert.equal(thirdTab.browser, thirdMessagePane);
  Assert.equal(thirdTab.linkedBrowser, thirdMessagePane);

  Assert.ok(
    !thirdMessagePane.docShellIsActive,
    "third message browser should NOT be visible"
  );

  tabmail.switchToTab(2);
  Assert.deepEqual(
    tabmail.tabInfo.map(t => t.selected),
    [false, false, true, false]
  );
  Assert.equal(tabmail.currentTabInfo, tabmail.tabInfo[2]);
  Assert.equal(tabmail.currentAbout3Pane, null);
  Assert.equal(tabmail.currentAboutMessage, thirdChromeBrowser.contentWindow);

  Assert.ok(
    thirdMessagePane.docShellIsActive,
    "third message browser should be visible"
  );
  Assert.ok(
    !secondWebBrowser.docShellIsActive,
    "second web browser should NOT be visible"
  );
  Assert.ok(
    !secondMessagePane.docShellIsActive,
    "second message browser should NOT be visible"
  );

  Assert.equal(thirdTab.folder, folderB);
  Assert.equal(thirdTab.message, messagesB[0]);

  Assert.equal(thirdChromeBrowser.contentWindow.tabOrWindow, thirdTab);

  info("Check the fourth tab.");

  const fourthTab = tabmail.tabInfo[3];
  Assert.equal(fourthTab.mode.name, "mailMessageTab");
  Assert.equal(fourthTab.mode.tabType.name, "mailTab");

  const fourthChromeBrowser = fourthTab.chromeBrowser;
  await ensureBrowserLoaded(fourthChromeBrowser);
  Assert.equal(fourthChromeBrowser.currentURI.spec, "about:message");

  const fourthMessagePane =
    fourthChromeBrowser.contentDocument.getElementById("messagepane");
  Assert.equal(fourthMessagePane.currentURI.spec, messageToURL(messagesB[1]));
  Assert.equal(fourthTab.browser, fourthMessagePane);
  Assert.equal(fourthTab.linkedBrowser, fourthMessagePane);
  Assert.equal(fourthTab.folder, folderB);
  Assert.equal(fourthTab.message, messagesB[1]);

  Assert.ok(
    !fourthMessagePane.docShellIsActive,
    "fourth message browser should NOT be visible"
  );

  tabmail.switchToTab(3);
  Assert.deepEqual(
    tabmail.tabInfo.map(t => t.selected),
    [false, false, false, true]
  );
  Assert.equal(tabmail.currentTabInfo, tabmail.tabInfo[3]);
  Assert.equal(tabmail.currentAbout3Pane, null);
  Assert.equal(tabmail.currentAboutMessage, fourthChromeBrowser.contentWindow);

  Assert.ok(
    fourthMessagePane.docShellIsActive,
    "fourth message browser should be visible"
  );
  Assert.ok(
    !thirdMessagePane.docShellIsActive,
    "third message browser should NOT be visible"
  );

  Assert.equal(fourthChromeBrowser.contentWindow.tabOrWindow, fourthTab);

  info("Close tabs.");

  tabmail.closeTab(3);
  Assert.deepEqual(
    tabmail.tabInfo.map(t => t.selected),
    [false, false, true]
  );
  Assert.equal(tabmail.currentTabInfo, thirdTab);
  Assert.equal(tabmail.currentAbout3Pane, null);
  Assert.equal(tabmail.currentAboutMessage, thirdChromeBrowser.contentWindow);

  tabmail.closeTab(2);
  Assert.deepEqual(
    tabmail.tabInfo.map(t => t.selected),
    [false, true]
  );
  Assert.equal(tabmail.currentTabInfo, secondTab);
  Assert.equal(tabmail.currentAbout3Pane, secondChromeBrowser.contentWindow);
  Assert.equal(tabmail.currentAboutMessage, secondMessageBrowser.contentWindow);

  tabmail.closeTab(1);
  Assert.deepEqual(
    tabmail.tabInfo.map(t => t.selected),
    [true]
  );
  Assert.equal(tabmail.currentTabInfo, firstTab);
  Assert.equal(tabmail.currentAbout3Pane, firstChromeBrowser.contentWindow);
  Assert.equal(tabmail.currentAboutMessage, firstMessageBrowser.contentWindow);
  Assert.equal(firstTab.browser, firstMessagePane);
  Assert.equal(firstTab.linkedBrowser, firstMessagePane);
  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    firstMessagePane.docShellIsActive,
    "first message browser should be visible"
  );

  Services.prefs.setBoolPref("mail.tabs.loadInBackground", false);
  info("Open a new mail tab. Focus should switch to the new tab.");

  window.OpenMessageInNewTab(messagesB[0], {});

  Assert.equal(tabmail.tabInfo.length, 2);
  Assert.deepEqual(
    tabmail.tabInfo.map(t => t.selected),
    [false, true]
  );

  const secondOpenedTab = tabmail.tabInfo[1];
  Assert.equal(secondOpenedTab.mode.name, "mailMessageTab");
  Assert.equal(secondOpenedTab.mode.tabType.name, "mailTab");

  const secondOpenedChromeBrowser = secondOpenedTab.chromeBrowser;
  await ensureBrowserLoaded(secondOpenedChromeBrowser);
  Assert.equal(secondOpenedChromeBrowser.currentURI.spec, "about:message");

  const secondOpenedMessagePane =
    secondOpenedChromeBrowser.contentDocument.getElementById("messagepane");
  Assert.equal(
    secondOpenedMessagePane.currentURI.spec,
    messageToURL(messagesB[0])
  );
  Assert.equal(secondOpenedTab.browser, secondOpenedMessagePane);
  Assert.equal(secondOpenedTab.linkedBrowser, secondOpenedMessagePane);

  tabmail.closeTab(1);
  Assert.equal(tabmail.tabInfo.length, 1);
  Assert.deepEqual(
    tabmail.tabInfo.map(t => t.selected),
    [true]
  );

  info("Open a content tab.");
  // This test isn't about content tabs, but we're testing docShell visibility
  // for everything else, and we need another tab to test about:3pane, so this
  // seemed like a good place to test docShell visibility for content tabs.

  const contentTab = tabmail.openTab("contentTab", {
    background: true,
    url: "https://example.org/browser/comm/mail/base/test/browser/files/sampleContent.html",
  });
  const contentTabBrowser = contentTab.browser;
  Assert.ok(
    !contentTabBrowser.docShellIsActive,
    "content tab browser should NOT be visible"
  );

  tabmail.switchToTab(contentTab);
  Assert.ok(
    contentTabBrowser.docShellIsActive,
    "content tab browser should be visible"
  );
  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    !firstMessagePane.docShellIsActive,
    "first message browser should NOT be visible"
  );

  info("While in the background, load a web page.");

  messagePane.displayWebPage("https://example.org/");
  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    !firstMessagePane.docShellIsActive,
    "first message browser should NOT be visible"
  );

  tabmail.switchToTab(firstTab);
  Assert.ok(
    !contentTabBrowser.docShellIsActive,
    "content tab browser should NOT be visible"
  );
  Assert.ok(
    firstWebBrowser.docShellIsActive,
    "first web browser should be visible"
  );
  Assert.ok(
    !firstMessagePane.docShellIsActive,
    "first message browser should NOT be visible"
  );

  tabmail.switchToTab(contentTab);
  Assert.ok(
    contentTabBrowser.docShellIsActive,
    "content tab browser should be visible"
  );
  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    !firstMessagePane.docShellIsActive,
    "first message browser should NOT be visible"
  );

  info("While in the background, load a message.");

  threadTree.selectedIndex = 1;
  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    !firstMessagePane.docShellIsActive,
    "first message browser should NOT be visible"
  );

  tabmail.closeTab(contentTab);
  Assert.ok(
    !firstWebBrowser.docShellIsActive,
    "first web browser should NOT be visible"
  );
  Assert.ok(
    firstMessagePane.docShellIsActive,
    "first message browser should be visible"
  );

  threadTree.selectedIndex = -1;
  Assert.ok(
    !firstMessagePane.docShellIsActive,
    "first message browser should NOT be visible"
  );
});

add_task(async function testMessageWindow() {
  const messageWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    async win =>
      win.document.documentURI ==
      "chrome://messenger/content/messageWindow.xhtml"
  );
  MailUtils.openMessageInNewWindow(messagesB[0]);

  const messageWindow = await messageWindowPromise;
  const messageBrowser = messageWindow.messageBrowser;
  await ensureBrowserLoaded(messageBrowser);
  Assert.equal(messageBrowser.contentWindow.tabOrWindow, messageWindow);

  await BrowserTestUtils.closeWindow(messageWindow);
});

async function ensureBrowserLoaded(browser) {
  await TestUtils.waitForCondition(
    () =>
      browser.currentURI.spec != "about:blank" &&
      browser.contentDocument.readyState == "complete",
    "waiting for browser to finish loading"
  );
}

function messageToURL(message) {
  const messageService =
    MailServices.messageServiceFromURI("mailbox-message://");
  const uri = message.folder.getUriForMsg(message);
  return messageService.getUrlForUri(uri).spec;
}
