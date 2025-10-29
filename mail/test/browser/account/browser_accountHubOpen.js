/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { openAccountSettings } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

const ACCOUNT_HUB_ENABLED = Services.prefs.getBoolPref(
  "mail.accounthub.enabled",
  false
);

add_task(async function test_open_account_hub_menubar() {
  const menubar = document.getElementById("toolbar-menubar");
  menubar.removeAttribute("autohide");

  document.getElementById("menu_File").openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(
    document.getElementById("menu_FilePopup"),
    "shown"
  );
  document.getElementById("menu_New").openMenu(true);
  const newPopup = document.getElementById("menu_NewPopup");
  await BrowserTestUtils.waitForPopupEvent(newPopup, "shown");
  newPopup.activateItem(document.getElementById("newMailAccountMenuItem"));

  const dialog = await subtest_wait_for_account_hub_dialog();

  await subtest_close_account_hub_dialog(
    dialog,
    dialog.querySelector("email-auto-form")
  );
  menubar.toggleAttribute("autohide", true);
}).skip(!ACCOUNT_HUB_ENABLED || AppConstants.platform === "macosx");

add_task(async function test_open_account_hub_appmenu() {
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("button-appmenu"),
    {},
    window
  );
  await BrowserTestUtils.waitForPopupEvent(
    document.getElementById("appMenu-popup"),
    "shown"
  );
  const multiView = document.getElementById("appMenu-multiView");
  const newViewPromise = BrowserTestUtils.waitForEvent(
    multiView,
    "ViewShowing",
    false,
    event => event.target.id === "appMenu-newView"
  );
  multiView.showSubView(
    "appMenu-newView",
    document.getElementById("appmenu_new")
  );
  await newViewPromise;

  document.getElementById("appmenu_newMailAccountMenuItem").click();
  const dialog = await subtest_wait_for_account_hub_dialog();

  await subtest_close_account_hub_dialog(
    dialog,
    dialog.querySelector("email-auto-form")
  );
  Services.prefs.clearUserPref("ui.prefersReducedMotion");
}).skip(!ACCOUNT_HUB_ENABLED);

add_task(async function test_open_account_hub_account_central() {
  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.document.querySelector("[is='folder-tree-row']"),
    {},
    about3Pane
  );
  const accountCentral = about3Pane.document.getElementById(
    "accountCentralBrowser"
  ).contentWindow;

  EventUtils.synthesizeMouseAtCenter(
    accountCentral.document.getElementById("setupEmail"),
    {},
    accountCentral
  );

  const dialog = await subtest_wait_for_account_hub_dialog();

  await subtest_close_account_hub_dialog(
    dialog,
    dialog.querySelector("email-auto-form")
  );
}).skip(!ACCOUNT_HUB_ENABLED);

add_task(async function test_open_account_hub_account_settings() {
  const accountSettings = await openAccountSettings();
  const asWindow = accountSettings.browser.contentWindow;

  EventUtils.synthesizeMouseAtCenter(
    asWindow.document.getElementById("accountTreeCreateAccount"),
    {},
    asWindow
  );
  const popup = asWindow.document.getElementById("accountAddPopup");
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
  popup.activateItem(
    asWindow.document.getElementById("accountActionsAddMailAccount")
  );

  const dialog = await subtest_wait_for_account_hub_dialog();

  await subtest_close_account_hub_dialog(
    dialog,
    dialog.querySelector("email-auto-form")
  );
  document.getElementById("tabmail").closeTab(accountSettings);
}).skip(!ACCOUNT_HUB_ENABLED);

add_task(async function test_open_account_hub_message_window() {
  const generator = new MessageGenerator();

  if (MailServices.accounts.accounts.length == 0) {
    MailServices.accounts.createLocalMailAccount();
  }
  const rootFolder =
    MailServices.accounts.localFoldersServer.rootFolder.QueryInterface(
      Ci.nsIMsgLocalMailFolder
    );

  const folder = rootFolder
    .createLocalSubfolder("account hub menu")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch(
    generator
      .makeMessages({ count: 1 })
      .map(message => message.toMessageString())
  );
  const testMessages = [...folder.messages];
  const messageWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    async win =>
      win.document.documentURI ==
      "chrome://messenger/content/messageWindow.xhtml"
  );
  MailUtils.openMessageInNewWindow(testMessages[0]);

  const messageWindow = await messageWindowPromise;
  const messageDoc = messageWindow.document;
  await SimpleTest.promiseFocus(messageWindow);

  const menu = messageDoc.getElementById("menu_File");
  EventUtils.synthesizeMouseAtCenter(menu, {}, messageWindow);
  await BrowserTestUtils.waitForPopupEvent(menu.menupopup, "shown");

  const newMenu = messageDoc.getElementById("menu_New");
  newMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(newMenu.menupopup, "shown");

  newMenu.menupopup.activateItem(
    messageDoc.getElementById("newMailAccountMenuItem")
  );

  await BrowserTestUtils.waitForPopupEvent(newMenu.menupopup, "hidden");
  await BrowserTestUtils.waitForPopupEvent(menu.menupopup, "hidden");

  const dialog = await subtest_wait_for_account_hub_dialog();
  Assert.equal(
    Services.focus.activeWindow,
    window,
    "Should focus main window to open account hub"
  );

  await subtest_close_account_hub_dialog(
    dialog,
    dialog.querySelector("email-auto-form")
  );

  await BrowserTestUtils.closeWindow(messageWindow);
  const trash = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
  folder.deleteSelf(null);
  trash.emptyTrash(null);
}).skip(!ACCOUNT_HUB_ENABLED || AppConstants.platform === "macosx");

add_task(async function test_open_address_book_account_hub_appmenu() {
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
  Services.prefs.setBoolPref("mail.accounthub.addressbook.enabled", true);

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("button-appmenu"),
    {},
    window
  );
  await BrowserTestUtils.waitForPopupEvent(
    document.getElementById("appMenu-popup"),
    "shown"
  );
  const multiView = document.getElementById("appMenu-multiView");
  const newViewPromise = BrowserTestUtils.waitForEvent(
    multiView,
    "ViewShowing",
    false,
    event => event.target.id === "appMenu-newView"
  );
  multiView.showSubView(
    "appMenu-newView",
    document.getElementById("appmenu_new")
  );
  await newViewPromise;

  document.getElementById("appmenu_newAccountHubAB").click();
  const dialog = await subtest_wait_for_account_hub_dialog("ADDRESS_BOOK");

  const closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeKey("KEY_Escape", {});
  await closeEvent;

  Services.prefs.clearUserPref("mail.accounthub.addressbook.enabled");
  Services.prefs.clearUserPref("ui.prefersReducedMotion");
});

add_task(async function test_open_account_hub_address_book_tab() {
  Services.prefs.setBoolPref("mail.accounthub.addressbook.enabled", true);
  const abWindow = await new Promise(resolve => {
    window.openTab("addressBookTab", {
      onLoad(event, browser) {
        resolve(browser.contentWindow);
      },
    });
  });

  EventUtils.synthesizeMouseAtCenter(
    abWindow.document.getElementById("booksPaneCreateBook"),
    {},
    abWindow
  );

  const dialog = await subtest_wait_for_account_hub_dialog("ADDRESS_BOOK");

  const closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeKey("KEY_Escape", {});
  await closeEvent;

  const tabmail = window.document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTab);

  Services.prefs.clearUserPref("mail.accounthub.addressbook.enabled");
});
