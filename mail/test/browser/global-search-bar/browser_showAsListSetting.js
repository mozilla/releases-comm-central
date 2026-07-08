/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * The preference that controls whether a global search opens the faceted
 * search view or the thread-list view. Defined here once so that both the
 * UI test and the functional tests always reference the same name.
 */
const PREF_SHOW_AS_LIST = "gloda.show_as_list_by_default";

/**
 * Tests that PREF_SHOW_AS_LIST controls whether a global search opens the
 * faceted search view or a mail3PaneTab list view.
 */

/**
 * Simulates a global search by typing the given term into the search bar.
 *
 * @param {string} term - The search string to enter.
 */
function performGlobalSearch(term) {
  const searchInput = document.querySelector(
    "#unifiedToolbarContent .search-bar global-search-bar"
  );
  searchInput.reset();
  searchInput.focus();
  EventUtils.sendString(term, searchInput.documentGlobal);
  EventUtils.synthesizeKey("KEY_Enter", {}, searchInput.documentGlobal);
}

add_task(async function testShowAsListSettingFalse() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_SHOW_AS_LIST, false]],
  });
  const tabmail = document.getElementById("tabmail");
  performGlobalSearch("testfacet");
  await TestUtils.waitForCondition(
    () =>
      tabmail.tabInfo.length === 2 &&
      tabmail.tabInfo[1].mode.name === "glodaFacet",
    "glodaFacet tab should open when " + PREF_SHOW_AS_LIST + " is false"
  );
  tabmail.closeTab(1);
  await SpecialPowers.popPrefEnv();
});

add_task(async function testShowAsListSettingTrue() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_SHOW_AS_LIST, true]],
  });
  const tabmail = document.getElementById("tabmail");
  performGlobalSearch("testlistview");
  await TestUtils.waitForCondition(
    () =>
      tabmail.tabInfo.length === 2 &&
      tabmail.tabInfo[1].mode.name === "mail3PaneTab",
    "mail3PaneTab should open when " + PREF_SHOW_AS_LIST + " is true"
  );
  await TestUtils.waitForCondition(
    () =>
      tabmail.tabInfo[1]?.chromeBrowser?.contentWindow?.gViewWrapper
        ?.isSynthetic,
    "tab should contain a synthetic Gloda view"
  );
  tabmail.closeTab(1);
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that the "Show results as list" checkbox in General preferences
 * actually sets PREF_SHOW_AS_LIST.
 */
add_task(async function testShowAsListPrefCheckbox() {
  const tabmail = document.getElementById("tabmail");

  await SpecialPowers.pushPrefEnv({
    set: [[PREF_SHOW_AS_LIST, false]],
  });

  const prefsWindow = await window.openPreferencesTab(
    "paneGeneral",
    "glodaFacetShowAsList"
  );
  const prefsDocument =
    tabmail.tabModes.preferencesTab.tabs[0].browser.contentDocument;
  const checkbox = prefsDocument.getElementById("glodaFacetShowAsList");
  checkbox.scrollIntoView({ block: "end", behavior: "instant" });

  Assert.equal(checkbox.checked, false, "checkbox reflects pref value (false)");

  EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
  Assert.equal(
    Services.prefs.getBoolPref(PREF_SHOW_AS_LIST),
    true,
    `${PREF_SHOW_AS_LIST} set to true after click`
  );

  tabmail.closeTab(tabmail.tabModes.preferencesTab.tabs[0]);
  await SpecialPowers.popPrefEnv();
});

registerCleanupFunction(function () {
  const tabmail = document.getElementById("tabmail");
  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(1);
  }
});
