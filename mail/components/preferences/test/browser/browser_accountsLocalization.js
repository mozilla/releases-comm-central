/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(function test_accountsLabels() {
  const menuItem = document.getElementById("menu_accountmgr");
  Assert.ok(
    menuItem,
    "The Accounts menu item should exist in the OS toolbar menu"
  );
  Assert.equal(
    document.l10n.getAttributes(menuItem).id,
    "menu-accounts",
    "The Accounts toolbar menu item should use the Accounts ID"
  );

  const appMenuItem = document.getElementById("appmenu_accountmgr");
  Assert.ok(
    appMenuItem,
    "The Accounts app menu item should exist in the app/hamburger menu"
  );
  Assert.equal(
    document.l10n.getAttributes(appMenuItem).id,
    "appmenu-accounts",
    "The Accounts app menu item should use the Accounts ID"
  );

  const contextMenuItem = document.getElementById(
    "settingsContextOpenAccountSettingsItem"
  );
  Assert.ok(
    contextMenuItem,
    "The Accounts menu item should exist in the settings context menu"
  );
  Assert.equal(
    document.l10n.getAttributes(contextMenuItem).id,
    "settings-context-open-accounts-item",
    "The Accounts context menu item should use the Accounts ID"
  );
});

add_task(async function test_accountsSidebarLabel() {
  const { prefsDocument } = await openNewPrefsTab();
  const label = prefsDocument.querySelector(
    "#accountButton .sidebar-footer-label"
  );
  Assert.ok(label, "The Accounts link should exist in the Settings sidenav");
  Assert.equal(
    prefsDocument.l10n.getAttributes(label).id,
    "accounts-button",
    "The Settings Accounts link should use the Accounts ID"
  );
  await closePrefsTab();
});
