/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

/** @type {MenuData} */
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
  menu_exportmobile: {},
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

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  testFolder = rootFolder
    .createLocalSubfolder("tools menu")
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

add_task(async function testDevtoolsToolboxAvailability() {
  const chromeEnabled = Services.prefs.getBoolPref("devtools.chrome.enabled");
  const remoteEnabled = Services.prefs.getBoolPref(
    "devtools.debugger.remote-enabled"
  );
  const menubarItem = document.getElementById("devtoolsToolbox");
  const appMenuButton = document.getElementById("button-appmenu");
  const appMenuPopup = document.getElementById("appMenu-popup");
  const toolsMenu = document.getElementById("appmenu_toolsMenu");
  const toolsView = document.getElementById("appMenu-toolsView");

  async function checkAvailability(expectedAvailable) {
    await TestUtils.waitForCondition(
      () => menubarItem.hidden == !expectedAvailable,
      "waiting for menubar Developer Tools item visibility"
    );
    Assert.equal(
      menubarItem.hidden,
      !expectedAvailable,
      "menubar Developer Tools item visibility"
    );

    const popupShownPromise = BrowserTestUtils.waitForPopupEvent(
      appMenuPopup,
      "shown"
    );
    EventUtils.synthesizeMouseAtCenter(appMenuButton, {}, window);
    await popupShownPromise;

    const viewShownPromise = BrowserTestUtils.waitForEvent(
      toolsView,
      "ViewShown"
    );
    EventUtils.synthesizeMouseAtCenter(toolsMenu, {}, window);
    await viewShownPromise;

    Assert.equal(
      toolsView.querySelector("#appmenu_devtoolsToolbox").hidden,
      !expectedAvailable,
      "App Menu Developer Tools item visibility"
    );
    Assert.equal(
      toolsView.querySelector("#devToolsSeparator").hidden,
      !expectedAvailable,
      "App Menu Developer Tools separator visibility"
    );

    const popupHiddenPromise = BrowserTestUtils.waitForPopupEvent(
      appMenuPopup,
      "hidden"
    );
    appMenuPopup.hidePopup();
    await popupHiddenPromise;
  }

  try {
    await checkAvailability(true);

    Services.prefs.setBoolPref("devtools.chrome.enabled", false);
    await checkAvailability(false);

    Services.prefs.setBoolPref("devtools.chrome.enabled", true);
    Services.prefs.setBoolPref("devtools.debugger.remote-enabled", false);
    await checkAvailability(false);

    Services.prefs.setBoolPref("devtools.debugger.remote-enabled", true);
    await checkAvailability(true);
  } finally {
    Services.prefs.setBoolPref("devtools.chrome.enabled", chromeEnabled);
    Services.prefs.setBoolPref(
      "devtools.debugger.remote-enabled",
      remoteEnabled
    );
    if (appMenuPopup.state != "closed") {
      appMenuPopup.hidePopup();
    }
  }
});
