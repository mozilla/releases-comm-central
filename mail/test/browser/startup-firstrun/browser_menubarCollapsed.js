/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the main menu will be collapsed by default if Thunderbird starts
 * with no accounts created.
 */

"use strict";

add_task(function test_main_menu_collapsed() {
  const mainMenu = document.getElementById("toolbar-menubar");
  Assert.equal(
    mainMenu.getAttribute("autohide"),
    "true",
    "The main menu should have the autohide attribute set to true."
  );
});
