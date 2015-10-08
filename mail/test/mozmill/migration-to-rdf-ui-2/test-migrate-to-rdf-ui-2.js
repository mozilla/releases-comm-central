/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * When moving from ui-rdf 0 to 1, we ensure that we've removed the collapsed
 * property from the folderPaneBox, but that we still persist width.
 */

// make SOLO_TEST=migration-to-rdf-ui-2/test-migrate-to-rdf-ui-2.js mozmill-one

var MODULE_NAME = "test-migrate-to-rdf-ui-2";
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
 * Test that the "collapsed" property for the folderPaneBox resource was
 * successfully unasserted.
 */
function test_collapsed_removed() {
  // We can't actually detect this visually (at least, not deterministically)
  // so we'll use xulStore to see if the collapsed property has been
  // excised from folderPaneBox.
  const MESSENGER_DOCURL = "chrome://messenger/content/messenger.xul";

  let xulStore = Cc["@mozilla.org/xul/xulstore;1"].getService(Ci.nsIXULStore);
  if (xulStore.hasValue(MESSENGER_DOCURL, "folderPaneBox", "collapsed"))
    throw Error("The collapsed property still seems to exist for folderPaneBox.");
}

/**
 * Test that the "width" property of the folderPaneBox resource was persisted.
 * We do this simply be checking that the width of the folderPaneBox matches
 * the width defined in localstore.rdf (which, in this case, is 500px).
 * localstore.rdf was converted to XULStore.json in bug 559505
 */
function test_width_persisted() {
  const EXPECTED_WIDTH = 500; // Set in localstore.rdf, found in this directory
  let fpbWidth = mc.e("folderPaneBox").width;
  assert_equals(EXPECTED_WIDTH, fpbWidth,
                "The width of the folderPaneBox was not persisted.");
}

/**
 * Test that the throbber in the main menu (or the mailbar on OSX) was removed.
 */
function test_throbber_removed() {
  let currentSet;

  if (mc.mozmillModule.isMac)
    currentSet = mc.e("mail-bar3").getAttribute("currentset");
  else
    currentSet = mc.e("mail-toolbar-menubar2").getAttribute("currentset");

  assert_false(currentSet.includes("throbber-box"),
               "We found a throbber-box where we shouldn't have.");
}
