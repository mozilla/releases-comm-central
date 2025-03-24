/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { openAccountSettings } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
);

const ACCOUNT_HUB_ENABLED = Services.prefs.getBoolPref(
  "mail.accounthub.enabled",
  false
);

add_task(async function test_open_account_hub_menubar() {
  const initialAccount = MailServices.accounts.createAccount();

  const menubar = document.getElementById("toolbar-menubar");
  menubar.setAttribute("autohide", "false");

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

  await subtest_close_account_hub_dialog(dialog);
  MailServices.accounts.removeAccount(initialAccount, true);
  menubar.setAttribute("autohide", "true");
}).skip(!ACCOUNT_HUB_ENABLED || AppConstants.platform === "macosx");

add_task(async function test_open_account_hub_appmenu() {
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
  const initialAccount = MailServices.accounts.createAccount();

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

  await subtest_close_account_hub_dialog(dialog);
  MailServices.accounts.removeAccount(initialAccount, true);
  Services.prefs.clearUserPref("ui.prefersReducedMotion");
}).skip(!ACCOUNT_HUB_ENABLED);

add_task(async function test_open_account_hub_account_central() {
  const initialAccount = MailServices.accounts.createAccount();

  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  const accountCentral = about3Pane.document.getElementById(
    "accountCentralBrowser"
  ).contentWindow;

  EventUtils.synthesizeMouseAtCenter(
    accountCentral.document.getElementById("setupEmail"),
    {},
    accountCentral
  );

  const dialog = await subtest_wait_for_account_hub_dialog();

  await subtest_close_account_hub_dialog(dialog);
  MailServices.accounts.removeAccount(initialAccount, true);
}).skip(!ACCOUNT_HUB_ENABLED);

add_task(async function test_open_account_hub_account_settings() {
  const initialAccount = MailServices.accounts.createAccount();

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

  await subtest_close_account_hub_dialog(dialog);
  document.getElementById("tabmail").closeTab(accountSettings);
  MailServices.accounts.removeAccount(initialAccount, true);
}).skip(!ACCOUNT_HUB_ENABLED);
