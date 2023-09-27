/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

/** @type MenuData */
const toolsMenuData = {
  tasksMenuMail: { hidden: true },
  addressBook: {},
  menu_openSavedFilesWnd: {},
  addonsManager: {},
  activityManager: {},
  imAccountsStatus: { disabled: true },
  imStatusAvailable: {},
  imStatusUnavailable: {},
  imStatusOffline: {},
  imStatusShowAccounts: {},
  joinChatMenuItem: { disabled: true },
  filtersCmd: {},
  applyFilters: { disabled: ["mail3PaneTab", "contentTab"] },
  applyFiltersToSelection: { disabled: ["mail3PaneTab", "contentTab"] },
  runJunkControls: { disabled: true },
  deleteJunk: { disabled: true },
  menu_import: {},
  menu_export: {},
  manageKeysOpenPGP: {},
  devtoolsMenu: {},
  devtoolsToolbox: {},
  addonDebugging: {},
  javascriptConsole: {},
  sanitizeHistory: {},
};
if (AppConstants.platform == "win") {
  toolsMenuData.menu_preferences = {};
  toolsMenuData.menu_accountmgr = {};
}
const helper = new MenuTestHelper("tasksMenu", toolsMenuData);

const tabmail = document.getElementById("tabmail");
let rootFolder, testFolder, testMessages;

add_setup(async function () {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  const generator = new MessageGenerator();

  MailServices.accounts.createLocalMailAccount();
  const account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("tools menu", null);
  testFolder = rootFolder
    .getChildNamed("tools menu")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  testMessages = [...testFolder.messages];

  window.OpenMessageInNewTab(testMessages[0], { background: true });
  await BrowserTestUtils.waitForEvent(
    tabmail.tabInfo[1].chromeBrowser,
    "MsgLoaded"
  );

  window.openTab("contentTab", {
    url: "https://example.com/",
    background: true,
  });

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(0);
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function test3PaneTab() {
  tabmail.currentAbout3Pane.displayFolder(rootFolder);
  await helper.testAllItems("mail3PaneTab");

  tabmail.currentAbout3Pane.displayFolder(testFolder);
  await helper.testItems({
    applyFilters: {},
    runJunkControls: {},
    deleteJunk: {},
  });

  tabmail.currentAbout3Pane.threadTree.selectedIndex = 1;
  await helper.testItems({
    applyFilters: {},
    applyFiltersToSelection: {},
    runJunkControls: {},
    deleteJunk: {},
  });
});

add_task(async function testMessageTab() {
  tabmail.switchToTab(1);
  await helper.testAllItems("mailMessageTab");
});

add_task(async function testContentTab() {
  tabmail.switchToTab(2);
  await helper.testAllItems("contentTab");
});
