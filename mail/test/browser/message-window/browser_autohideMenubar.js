/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Test that the menubar can be set to "autohide". This should only have an
   effect on Windows. */

"use strict";

var elib = ChromeUtils.import(
  "resource://testing-common/mozmill/elementslib.jsm"
);

var { open_address_book_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
);
var { close_compose_window, open_compose_new_mail } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var {
  be_in_folder,
  close_message_window,
  create_folder,
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

add_task(function setupModule(module) {
  menuFolder = create_folder("menuFolder");
  make_new_sets_in_folder(menuFolder, [{ count: 1 }]);

  // Make the menubar not autohide by default.
  menuState = toggle_main_menu(true);
});

/**
 * Set the autohide attribute of the menubar.
 *
 * @param controller the mozmill controller for the window
 * @param elem the element to click on (usually the menubar)
 * @param hide true to hide, false otherwise
 */
function set_autohide_menubar(controller, elem, hide) {
  let contextMenu = controller.getMenu("#toolbar-context-menu");
  contextMenu.open(new elib.Elem(elem));
  let menuitem = contextMenu.getItem('menuitem[toolbarid="' + elem.id + '"]');
  if (menuitem.getNode().hasAttribute("checked") == hide) {
    // XXX Hack around the fact that calling click doesn't toggle the checked
    // state (bug 670829, bug 670830).
    controller.mouseEvent(menuitem, undefined, undefined, {});
  }
}

/**
 * Ensure that the autohide attribute of the menubar can be set properly.
 *
 * @param controller the mozmill controller for the window
 * @param menubar the menubar to test
 */
function help_test_autohide(controller, menubar) {
  function hiddenChecker(aHidden) {
    // The XUL hidden attribute isn't what is set, so it's useless here -- use
    // information from the box model instead.
    return () => (menubar.getBoundingClientRect().height != 0) != aHidden;
  }
  set_autohide_menubar(controller, menubar, true);
  controller.waitFor(hiddenChecker(true), "Menubar should be hidden!");

  document.getElementById(menubar).focus();
  EventUtils.synthesizeKey("VK_ALT", {}, controller.window);
  controller.waitFor(
    hiddenChecker(false),
    "Menubar should be shown after pressing alt!"
  );

  set_autohide_menubar(controller, menubar, false);
  controller.waitFor(hiddenChecker(false), "Menubar should be shown!");
}

add_task(function test_autohidden_menubar_3pane() {
  let menubar = mc.e("mail-toolbar-menubar2");
  help_test_autohide(mc, menubar);
});

add_task(async function test_autohidden_menubar_message_window() {
  be_in_folder(menuFolder);
  select_click_row(0);
  let msgc = await open_selected_message_in_new_window();
  msgc.window.focus();
  let menubar = msgc.e("mail-toolbar-menubar2");

  help_test_autohide(msgc, menubar);
  close_message_window(msgc);
});

add_task(function test_autohidden_menubar_compose_window() {
  let cwc = open_compose_new_mail();
  let menubar = cwc.e("compose-toolbar-menubar2");

  help_test_autohide(cwc, menubar);
  close_compose_window(cwc);
});

add_task(function test_autohidden_menubar_address_book() {
  let abc = open_address_book_window();
  let menubar = abc.e("addrbook-toolbar-menubar2");

  help_test_autohide(abc, menubar);
});

registerCleanupFunction(function teardownModule() {
  toggle_main_menu(menuState);
});
