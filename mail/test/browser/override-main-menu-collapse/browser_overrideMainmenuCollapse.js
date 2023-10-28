/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the main menu will NOT be collapsed by default if Thunderbird
 * starts with no accounts created, and mail.main_menu.collapse_by_default set
 * to false.
 */

"use strict";

add_task(function test_main_menu_not_collapsed() {
  const mainMenu = document.getElementById("toolbar-menubar");
  Assert.ok(
    !mainMenu.hasAttribute("autohide"),
    "The main menu should not have the autohide attribute."
  );
});
