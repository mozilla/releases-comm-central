/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

const manager = Cc["@mozilla.org/memory-reporter-manager;1"].getService(
  Ci.nsIMemoryReporterManager
);

const tabmail = document.getElementById("tabmail");
let testFolder;
let testMessages;

add_setup(async function () {
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
    .createLocalSubfolder("detachedWindows")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  testMessages = [...testFolder.messages];

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });

  info("Initial state:");
  await getWindows();
});

add_task(async function test3PaneTab() {
  info("Opening a new 3-pane tab");
  window.MsgOpenNewTabForFolders([testFolder], {
    background: false,
    folderPaneVisible: true,
    messagePaneVisible: true,
  });
  let tab = tabmail.tabInfo[1];
  await BrowserTestUtils.waitForEvent(
    tab.chromeBrowser,
    "aboutMessageLoaded",
    true
  );
  await new Promise(resolve =>
    tab.chromeBrowser.contentWindow.setTimeout(resolve, 500)
  );

  tab.chromeBrowser.contentWindow.threadTree.selectedIndex = 0;
  await BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded");
  await new Promise(resolve =>
    tab.chromeBrowser.contentWindow.setTimeout(resolve, 500)
  );

  info("Closing the tab");
  tabmail.closeOtherTabs(0);
  tab = null;

  await assertNoDetachedWindows();
});

add_task(async function testMessageTab() {
  info("Opening a new message tab");
  window.OpenMessageInNewTab(testMessages[0], { background: false });
  let tab = tabmail.tabInfo[1];
  await BrowserTestUtils.waitForEvent(
    tab.chromeBrowser,
    "aboutMessageLoaded",
    true
  );
  let aboutMessage = tab.chromeBrowser.contentWindow;
  await BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  await new Promise(resolve => aboutMessage.setTimeout(resolve, 500));

  aboutMessage.ReloadMessage();
  await BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  await new Promise(resolve => aboutMessage.setTimeout(resolve, 500));

  info("Closing the tab");
  tabmail.closeOtherTabs(0);
  tab = null;
  aboutMessage = null;

  await assertNoDetachedWindows();
});

add_task(async function testMessageWindow() {
  info("Opening a standalone message window");
  let win = await openMessageFromFile(
    new FileUtils.File(getTestFilePath("files/sampleContent.eml"))
  );
  let aboutMessage = win.messageBrowser.contentWindow;
  await new Promise(resolve => aboutMessage.setTimeout(resolve, 500));

  aboutMessage.ReloadMessage();
  await BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  await new Promise(resolve => aboutMessage.setTimeout(resolve, 500));

  info("Closing the window");
  await BrowserTestUtils.closeWindow(win);
  win = null;
  aboutMessage = null;

  await assertNoDetachedWindows();
});

add_task(async function testSearchMessagesDialog() {
  info("Opening the search messages dialog");
  const about3Pane = tabmail.currentAbout3Pane;
  const context = about3Pane.document.getElementById("folderPaneContext");
  const searchMessagesItem = about3Pane.document.getElementById(
    "folderPaneContext-searchMessages"
  );

  const shownPromise = BrowserTestUtils.waitForEvent(context, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(testFolder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  let searchWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    w =>
      w.document.documentURI == "chrome://messenger/content/SearchDialog.xhtml"
  );
  context.activateItem(searchMessagesItem);
  let searchWindow = await searchWindowPromise;

  await new Promise(resolve => searchWindow.setTimeout(resolve, 500));

  info("Closing the dialog");
  await BrowserTestUtils.closeWindow(searchWindow);
  searchWindowPromise = null;
  searchWindow = null;

  await assertNoDetachedWindows();
});

add_task(async function testAddressBookTab() {
  info("Opening the Address Book");
  window.toAddressBook();
  let tab = tabmail.tabInfo[1];
  await BrowserTestUtils.waitForEvent(
    tab.browser,
    "about-addressbook-ready",
    true
  );
  await new Promise(resolve =>
    tab.browser.contentWindow.setTimeout(resolve, 500)
  );

  info("Closing the tab");
  tabmail.closeOtherTabs(0);
  tab = null;

  await assertNoDetachedWindows();
});

async function getWindows() {
  await new Promise(resolve => manager.minimizeMemoryUsage(resolve));

  const windows = new Set();
  await new Promise(resolve =>
    manager.getReports(
      (process, path, kind, units, amount, description) => {
        if (path.startsWith("explicit/window-objects/top")) {
          path = path.replace("top(none)", "top");
          path = path.substring(0, path.indexOf(")") + 1);
          path = path.replace(/\\/g, "/");
          windows.add(path);
        }
      },
      null,
      resolve,
      null,
      false
    )
  );

  for (const win of windows) {
    info(win);
  }

  return [...windows];
}

async function assertNoDetachedWindows() {
  info("Remaining windows:");
  const windows = await getWindows();

  let noDetachedWindows = true;
  for (const win of windows) {
    if (win.includes("detached")) {
      noDetachedWindows = false;
      const url = win.substring(win.indexOf("(") + 1, win.indexOf(")"));
      Assert.report(true, undefined, undefined, `detached window: ${url}`);
    }
  }

  if (noDetachedWindows) {
    Assert.report(false, undefined, undefined, "no detached windows");
  }
}

async function openMessageFromFile(file) {
  const fileURL = Services.io
    .newFileURI(file)
    .mutate()
    .setQuery("type=application/x-message-display")
    .finalize();

  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.openDialog(
    "chrome://messenger/content/messageWindow.xhtml",
    "_blank",
    "all,chrome,dialog=no,status,toolbar",
    fileURL
  );
  const win = await winPromise;
  await BrowserTestUtils.waitForEvent(win, "MsgLoaded");
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);
  return win;
}
