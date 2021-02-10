/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test things of a visual nature.
 *
 * Note: this test requires a screen resolution of 1280 x 1024 which is standard on
 * the unit test machines (see also testing/machine-configuration.json).
 */

"use strict";

var { collapse_panes } = ChromeUtils.import(
  "resource://testing-common/mozmill/DOMHelpers.jsm"
);
var {
  assert_default_window_size,
  assert_pane_layout,
  be_in_folder,
  create_folder,
  gDefaultWindowHeight,
  gDefaultWindowWidth,
  kClassicMailLayout,
  kVerticalMailLayout,
  mark_action,
  mc,
  open_folder_in_new_window,
  restore_default_window_size,
  set_pane_layout,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  assert_quick_filter_bar_visible,
  clear_constraints,
  toggle_quick_filter_bar,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/QuickFilterBarHelpers.jsm"
);
var { close_window, resize_to } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var folder;
var setUnstarred, setStarred;
var gOriginalPaneWidth;

var gEnlargedWindowWidth = 1260;
var gShrunkenWindowWidth = 600;

var gTodayPane;

add_task(function setupModule(module) {
  folder = create_folder("QuickFilterBarDisplayIssues");
  be_in_folder(folder);

  // Let's check window dimensions so we can enlarge from them.
  restore_default_window_size();
  Assert.ok(
    gEnlargedWindowWidth > gDefaultWindowWidth,
    "Main window too large for the test logic"
  );

  // Store folder pane width that we will change temporarily.
  let folderPaneBox = mc.e("folderPaneBox");
  gOriginalPaneWidth = folderPaneBox.width;

  // Hide Lightning's Today pane as it takes up too much room in the
  // small TB window our tests run in.
  gTodayPane = mc.e("today-pane-panel");
  if (gTodayPane) {
    if (!gTodayPane.collapsed) {
      EventUtils.synthesizeKey("VK_F11", {});
    } else {
      gTodayPane = null;
    }
  }
});

/**
 * When the window gets too narrow the collapsible button labels need to get
 *  gone.  Then they need to come back when we get large enough again.
 *
 * Because the mozmill window sizing is weird and confusing, we force our size
 *  in both cases but do save/restore around our test.
 */
add_task(function test_buttons_collapse_and_expand() {
  assert_quick_filter_bar_visible(true); // precondition

  let qfbCollapsy = mc.e("quick-filter-bar-collapsible-buttons");
  let qfbExemplarButton = mc.e("qfb-unread"); // (arbitrary labeled button)
  let qfbExemplarLabel = qfbExemplarButton.querySelector(".toolbarbutton-text");

  function logState(aWhen) {
    mark_action("test", "log_window_state", [
      aWhen,
      "location:",
      mc.window.screenX,
      mc.window.screenY,
      "dims:",
      mc.window.outerWidth,
      mc.window.outerHeight,
      "Collapsy bar width:",
      qfbCollapsy.clientWidth,
      "shrunk?",
      qfbCollapsy.getAttribute("shrink"),
    ]);
  }

  function assertCollapsed() {
    // The bar should be shrunken and the button should be the same size as its
    // image!
    if (qfbCollapsy.getAttribute("shrink") != "true") {
      throw new Error("The collapsy bar should be shrunk!");
    }
    if (qfbExemplarLabel.clientWidth != 0) {
      throw new Error("The exemplar label should be collapsed!");
    }
  }
  function assertExpanded() {
    // The bar should not be shrunken and the button should be smaller than its
    // label!
    if (qfbCollapsy.hasAttribute("shrink")) {
      throw new Error("The collapsy bar should not be shrunk!");
    }
    if (qfbExemplarLabel.clientWidth == 0) {
      throw new Error("The exemplar label should not be collapsed!");
    }
  }

  logState("entry");

  // -- GIANT!
  resize_to(mc, gEnlargedWindowWidth, gDefaultWindowHeight);
  // Right, so resizeTo caps us at the display size limit, so we may end up
  // smaller than we want.  So let's turn off the folder pane too.
  collapse_panes(mc.e("folderpane_splitter"), true);
  logState("giant");
  assertExpanded();
  // NOTE! 1260 is actually not much above what's needed to get the
  // expanded qfb.

  // -- tiny.
  collapse_panes(mc.e("folderpane_splitter"), false);
  resize_to(mc, gShrunkenWindowWidth, gDefaultWindowHeight);
  logState("tiny");
  assertCollapsed();

  // -- GIANT again!
  resize_to(mc, gEnlargedWindowWidth, gDefaultWindowHeight);
  collapse_panes(mc.e("folderpane_splitter"), true);
  logState("giant again!");
  assertExpanded();
  teardownTest();
});

add_task(function test_buttons_collapse_and_expand_on_spawn_in_vertical_mode() {
  // Assume we're in classic layout to start - since this is where we'll
  // reset to once we're done.
  assert_pane_layout(kClassicMailLayout);

  // Put us in vertical mode
  set_pane_layout(kVerticalMailLayout);

  // Make our window nice and wide.
  resize_to(mc, gEnlargedWindowWidth, gDefaultWindowHeight);

  // Now expand the folder pane to cause the QFB buttons to shrink
  let folderPaneBox = mc.e("folderPaneBox");
  folderPaneBox.width = 600;

  // Now spawn a new 3pane...
  let mc2 = open_folder_in_new_window(folder);
  let qfb = mc2.e("quick-filter-bar-collapsible-buttons");
  mc2.waitFor(
    () => qfb.getAttribute("shrink") == "true",
    "New 3pane should have had a collapsed QFB"
  );
  close_window(mc2);

  set_pane_layout(kClassicMailLayout);
  teardownTest();
});

function teardownTest() {
  clear_constraints();
  // make it visible if it's not
  if (mc.e("quick-filter-bar").collapsed) {
    toggle_quick_filter_bar();
  }
}

registerCleanupFunction(function teardownModule() {
  // Restore the window to original layout.
  restore_default_window_size();
  collapse_panes(mc.e("folderpane_splitter"), false);
  let folderPaneBox = mc.e("folderPaneBox");
  folderPaneBox.width = gOriginalPaneWidth;

  if (gTodayPane && gTodayPane.collapsed) {
    EventUtils.synthesizeKey("VK_F11", {});
  }

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );

  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  window.gFolderDisplay.tree.focus();
});
