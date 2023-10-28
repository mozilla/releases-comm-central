/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the menubar can be set to "autohide".
 */

"use strict";

var {
  be_in_folder,
  create_folder,
  inboxFolder,
  make_message_sets_in_folders,
  open_selected_message_in_new_window,
  select_click_row,
  toggle_main_menu,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var menuFolder;
var menuState;

add_setup(async function () {
  menuFolder = await create_folder("menuFolder");
  await make_message_sets_in_folders([menuFolder], [{ count: 1 }]);

  // Make the menubar not autohide by default.
  menuState = await toggle_main_menu(true);
});

/**
 * Set the autohide attribute of the menubar. That is, make the menubar not
 * shown by default - but pressing Alt will toggle it open/closed.
 *
 * @param {Window} win - The window.
 * @param {Element} elem - The element to click on (usually the menubar).
 * @param {boolean} hide - True to hide, false otherwise.
 */
async function set_autohide_menubar(win, elem, hide) {
  const contextMenu = win.document.getElementById("toolbar-context-menu");
  const popupshown = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popupshown",
    win
  );
  EventUtils.synthesizeMouseAtCenter(elem, { type: "contextmenu" }, win);
  await popupshown;
  const menuitem = win.document.querySelector(
    `menuitem[toolbarid="${elem.id}"]`
  );
  if (menuitem.getAttribute("checked") == hide + "") {
    EventUtils.synthesizeMouseAtCenter(menuitem, {}, win);
    await new Promise(resolve => win.setTimeout(resolve, 50));
  }
}

/**
 * Ensure that the autohide attribute of the menubar can be set properly.
 *
 * @param {Window} win - The window.
 * @param {Element} menubar - The menubar to test.
 */
async function help_test_autohide(win, menubar) {
  function hiddenChecker(aHidden) {
    // The hidden attribute isn't what is set, so it's useless here -- use
    // information from the box model instead.
    return () => {
      return (menubar.getBoundingClientRect().height != 0) != aHidden;
    };
  }
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);
  await set_autohide_menubar(win, menubar, true);
  await TestUtils.waitForCondition(
    hiddenChecker(true),
    "Menubar should be hidden"
  );

  menubar.focus();
  EventUtils.synthesizeKey("VK_ALT", {}, win);
  await TestUtils.waitForCondition(
    hiddenChecker(false),
    "Menubar should be shown after pressing ALT!"
  );

  info("Menubar showing or not should toggle for ALT.");
  await set_autohide_menubar(win, menubar, false);
  await TestUtils.waitForCondition(
    hiddenChecker(false),
    "Menubar should be shown"
  );
  Assert.ok("help_test_autohide success");
}

add_task(async function test_autohidden_menubar_3pane() {
  const menubar = document.getElementById("toolbar-menubar");
  await help_test_autohide(window, menubar);
});

add_task(async function test_autohidden_menubar_message_window() {
  await be_in_folder(menuFolder);
  await select_click_row(0);
  const msgc = await open_selected_message_in_new_window();
  const menubar = msgc.document.getElementById("toolbar-menubar");

  await help_test_autohide(msgc, menubar);
  await BrowserTestUtils.closeWindow(msgc);
});

registerCleanupFunction(async function () {
  await toggle_main_menu(menuState);
  await be_in_folder(inboxFolder);
  menuFolder.deleteSelf(null);
});
