/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the manager for attachment storage services
 */

"use strict";

/* import-globals-from ../shared-modules/test-content-tab-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-pref-window-helpers.js */

var MODULE_NAME = "test-attachments-pane";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "pref-window-helpers", "content-tab-helpers"];

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
}

/**
 * Test that if we come back to the Attachment pane, then
 * we'll automatically be viewing the same tab we were viewing
 * last time.
 */
function test_persist_tabs() {
  let prefTab = open_pref_tab("paneApplications");
  let tabbox = content_tab_e(prefTab, "attachmentPrefs");

  // We should default to be viewing the "Outgoing" tab, which is the
  // second tab, with index 1.
  assert_equals(1, tabbox.selectedIndex,
                "The second tab should have been selected");
  // Switch to the first tab.
  tabbox.selectedIndex = 0;
  close_pref_tab(prefTab);

  prefTab = open_pref_tab("paneApplications");
  tabbox = content_tab_e(prefTab, "attachmentPrefs");

  // We should default to be viewing the first tab now.
  assert_equals(0, tabbox.selectedIndex,
                "The first tab selection should have been persisted");
  // Switch back to the second tab.
  tabbox.selectedIndex = 1;
  close_pref_tab(prefTab);

  prefTab = open_pref_tab("paneApplications");
  tabbox = content_tab_e(prefTab, "attachmentPrefs");

  // We should default to be viewing the second tab.
  assert_equals(1, tabbox.selectedIndex,
                  "The second tab selection should have been persisted");
  close_pref_tab(prefTab);
}
