/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the menubar can be set to "autohide".
 */

"use strict";

var {
  be_in_folder,
  close_message_window,
  create_folder,
  inboxFolder,
  make_new_sets_in_folder,
  mc,
  open_selected_message_in_new_window,
  select_click_row,
  toggle_main_menu,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var menuFolder;
var menuState;

add_task(function setup() {
  menuFolder = create_folder("menuFolder");
  make_new_sets_in_folder(menuFolder, [{ count: 1 }]);

  // Make the menubar not autohide by default.
  menuState = toggle_main_menu(true);
});

/**
 * Set the autohide attribute of the menubar. That is, make the menubar not
 * shown by default - but pressing Alt will toggle it open/closed.
 *
 * @param controller the mozmill controller for the window
 * @param elem the element to click on (usually the menubar)
 * @param hide true to hide, false otherwise
 */
async function set_autohide_menubar(controller, elem, hide) {
  let contextMenu = controller.window.document.getElementById(
    "toolbar-context-menu"
  );
  let popupshown = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popupshown",
    controller.window
  );
  EventUtils.synthesizeMouseAtCenter(
    elem,
    { type: "contextmenu" },
    controller.window
  );
  await popupshown;
  let menuitem = controller.window.document.querySelector(
    `menuitem[toolbarid="${elem.id}"]`
  );
  if (menuitem.getAttribute("checked") == hide + "") {
    EventUtils.synthesizeMouseAtCenter(menuitem, {}, controller.window);
    await new Promise(resolve => controller.window.setTimeout(resolve, 50));
  }
}

/**
 * Ensure that the autohide attribute of the menubar can be set properly.
 *
 * @param controller the mozmill controller for the window
 * @param menubar the menubar to test
 */
async function help_test_autohide(controller, menubar) {
  function hiddenChecker(aHidden) {
    // The hidden attribute isn't what is set, so it's useless here -- use
    // information from the box model instead.
    return () => {
      return (menubar.getBoundingClientRect().height != 0) != aHidden;
    };
  }
  await set_autohide_menubar(controller, menubar, true);
  controller.waitFor(hiddenChecker(true), "Menubar should be hidden");

  menubar.focus();
  EventUtils.synthesizeKey("VK_ALT", {}, controller.window);
  controller.waitFor(
    hiddenChecker(false),
    "Menubar should be shown after pressing ALT!"
  );

  info("Menubar showing or not should toggle for ALT.");
  await set_autohide_menubar(controller, menubar, false);
  controller.waitFor(hiddenChecker(false), "Menubar should be shown");
  Assert.ok("help_test_autohide success");
}

add_task(async function test_autohidden_menubar_3pane() {
  let menubar = mc.e("mail-toolbar-menubar2");
  await help_test_autohide(mc, menubar);
});

add_task(async function test_autohidden_menubar_message_window() {
  be_in_folder(menuFolder);
  select_click_row(0);
  let msgc = await open_selected_message_in_new_window();
  msgc.window.focus();
  let menubar = msgc.e("mail-toolbar-menubar2");

  await help_test_autohide(msgc, menubar);
  close_message_window(msgc);
});

// We don't have an autohidable menu bar item for compose nor for address book:
// compose-toolbar-menubar2 and addrbook-toolbar-menubar2.
/*
add_task(async function test_autohidden_menubar_compose_window() {
  let cwc = open_compose_new_mail();
  let menubar = cwc.e("compose-toolbar-menubar2");

  await help_test_autohide(cwc, menubar);
  close_compose_window(cwc);
});

add_task(function async test_autohidden_menubar_address_book() {
  let abc = open_address_book_window();
  let menubar = abc.e("addrbook-toolbar-menubar2");

  await help_test_autohide(abc, menubar);
});
*/

registerCleanupFunction(function teardownModule() {
  toggle_main_menu(menuState);
  be_in_folder(inboxFolder);
  menuFolder.deleteSelf(null);
});
