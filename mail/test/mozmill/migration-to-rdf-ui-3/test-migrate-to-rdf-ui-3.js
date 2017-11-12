/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * When moving from ui-rdf 0 to 1, we ensure that we've removed the collapsed
 * property from the folderPaneBox, but that we still persist width.
 */

var MODULE_NAME = "test-migrate-to-rdf-ui-3";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers"];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

function setupModule(module) {
  collector.getModule("folder-display-helpers").installInto(module);
}

/**
 * Test that the QFB toggle was moved from the tabbar-toolbar to the
 * mail-bar3.
 */
function test_qfb_button_moved() {
  let currentSet = mc.e("tabbar-toolbar").currentSet;
  assert_false(currentSet.includes("qfb-show-filter-bar"),
                "We found the QFB filter toggle where we shouldn't have.");

  // Now make sure that we've got the QFB filter toggle in the mail bar,
  // and that it is placed before the gloda-search and any spring, spacer,
  // or separator items.
  currentSet = mc.e("mail-bar3").currentSet;
  assert_true(currentSet.includes("button-tag,qfb-show-filter-bar,spring"),
                "We didn't find the QFB filter toggle where we should have.");
}
