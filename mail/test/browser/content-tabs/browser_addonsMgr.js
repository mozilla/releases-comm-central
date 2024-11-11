/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { promise_content_tab_load } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);
var { click_through_appmenu, promise_modal_dialog } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/WindowHelpers.sys.mjs"
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
