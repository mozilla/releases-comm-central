/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { content_tab_e, wait_for_content_tab_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  click_through_appmenu,
  plan_for_modal_dialog,
  wait_for_browser_load,
  wait_for_modal_dialog,
  wait_for_window_close,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

add_task(async function test_open_addons_with_url() {
  mc.window.openAddonsMgr("addons://list/theme");
  await new Promise(resolve => setTimeout(resolve));

  let tab = mc.window.document.getElementById("tabmail").currentTabInfo;
  wait_for_content_tab_load(tab, "about:addons", 10000);
  let categoriesBox = tab.browser.contentDocument.getElementById("categories");
  Assert.equal(
    categoriesBox.selectedChild.getAttribute("viewid"),
    "addons://list/theme",
    "Themes category should be selected!"
  );

  mc.window.document.getElementById("tabmail").switchToTab(0); // switch to 3pane
  mc.window.document.getElementById("tabmail").closeTab(tab);
});

/**
 * Bug 1462923
 * Check if the "Tools->Add-on Options" menu item works and shows our add-on.
 * This relies on the MozMill extension having optionsURL defined in install.rdf,
 * however simplistic the preferences XUL document may be.
 */
add_task(function test_addon_prefs() {
  // Open Add-on Options.
  const subview = click_through_appmenu(
    [{ id: "appmenu_addons" }],
    null,
    mc.window
  );

  plan_for_modal_dialog("mozmill-prefs", function (controller) {
    // Add | await new Promise(resolve => setTimeout(resolve, 1000));|
    // here to see the popup dialog.
    controller.window.close();
  });

  // MozMill add-on should be somewhere in the list. When found, click it.
  let foundAddon = false;
  for (let item of subview.children) {
    if (
      item.tagName == "toolbarbutton" &&
      item.getAttribute("collapsed") != "true" &&
      item.label == "MozMill"
    ) {
      foundAddon = true;
      EventUtils.synthesizeMouseAtCenter(item, { clickCount: 1 }, mc.window);
      break;
    }
  }
  Assert.ok(foundAddon);

  // Wait for the options dialog to open and close.
  wait_for_modal_dialog();
  wait_for_window_close();
}).skip();
