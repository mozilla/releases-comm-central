/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { promise_content_tab_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);
var { click_through_appmenu, promise_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

add_task(async function test_open_addons_with_url() {
  window.openAddonsMgr("addons://list/theme");
  await new Promise(resolve => setTimeout(resolve));

  const tab = document.getElementById("tabmail").currentTabInfo;
  await promise_content_tab_load(tab, "about:addons", 10000);
  const categoriesBox =
    tab.browser.contentDocument.getElementById("categories");
  Assert.equal(
    categoriesBox.selectedChild.getAttribute("viewid"),
    "addons://list/theme",
    "Themes category should be selected!"
  );

  document.getElementById("tabmail").switchToTab(0); // switch to 3pane
  document.getElementById("tabmail").closeTab(tab);
});

/**
 * Bug 1462923
 * Check if the "Tools->Add-on Options" menu item works and shows our add-on.
 * This relies on the MozMill extension having optionsURL defined in install.rdf,
 * however simplistic the preferences XUL document may be.
 */
add_task(async function test_addon_prefs() {
  // Open Add-on Options.
  const subview = await click_through_appmenu(
    [{ id: "appmenu_addons" }],
    null,
    window
  );

  const dialogPromise = promise_modal_dialog("mozmill-prefs", function (win) {
    // Add | await new Promise(resolve => setTimeout(resolve, 1000));|
    // here to see the popup dialog.
    win.close();
  });

  // MozMill add-on should be somewhere in the list. When found, click it.
  let foundAddon = false;
  for (const item of subview.children) {
    if (
      item.tagName == "toolbarbutton" &&
      item.getAttribute("collapsed") != "true" &&
      item.label == "MozMill"
    ) {
      foundAddon = true;
      EventUtils.synthesizeMouseAtCenter(item, { clickCount: 1 }, window);
      break;
    }
  }
  Assert.ok(foundAddon);

  // Wait for the options dialog to open and close.
  await dialogPromise;
}).skip();
