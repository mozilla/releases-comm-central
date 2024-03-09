/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests keyboard stuff that doesn't fall under some other test's heading.
 * Namely, control-shift-k toggling the bar into existence happens in
 * test-toggle-bar.js, but we test that repeatedly hitting control-shift-k
 * selects the text entered in the quick filter bar.
 */

"use strict";

var {
  be_in_folder,
  create_folder,
  get_about_3pane,
  make_message_sets_in_folders,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var {
  assert_constraints_expressed,
  assert_filter_text,
  assert_quick_filter_bar_visible,
  clear_constraints,
  set_filter_text,
  toggle_boolean_constraints,
  toggle_quick_filter_bar,
  cleanup_qfb_button,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/QuickFilterBarHelpers.sys.mjs"
);

var folder;

add_setup(async function () {
  folder = await create_folder("QuickFilterBarKeyboardInterface");
  // We need a message so we can select it so we can find in message.
  await make_message_sets_in_folders([folder], [{ count: 1 }]);
  await be_in_folder(folder);
  await ensure_table_view();

  // Quick filter bar is hidden by default, need to toggle it on.
  await toggle_quick_filter_bar();

  registerCleanupFunction(async () => {
    await ensure_cards_view();
    await cleanup_qfb_button();
    // Quick filter bar is hidden by default, need to toggle it off.
    await toggle_quick_filter_bar();
  });
});

/**
 * The rules for pressing escape:
 * - If there are any applied constraints:
 *   - If there is a 'most recent' constraint, it is relaxed and the 'most
 *     recent' field gets cleared, so that if escape gets hit again...
 *   - If there is no 'most recent' constraint, all constraints are cleared.
 * - If there are no applied constraints, we close the filter bar.
 *
 * We test these rules two ways:
 * 1) With the focus in the thread pane.
 * 2) With our focus in our text-box.
 */
add_task(async function test_escape_rules() {
  assert_quick_filter_bar_visible(true); // (precondition)

  // the common logic for each bit...
  async function legwork() {
    // apply two...
    await toggle_boolean_constraints("unread", "starred", "addrbook");
    assert_constraints_expressed({
      unread: true,
      starred: true,
      addrbook: true,
    });
    assert_quick_filter_bar_visible(true);

    // hit escape, should clear addrbook
    EventUtils.synthesizeKey("VK_ESCAPE", {});
    assert_quick_filter_bar_visible(true);
    assert_constraints_expressed({ unread: true, starred: true });

    // hit escape, should clear both remaining ones
    EventUtils.synthesizeKey("VK_ESCAPE", {});
    assert_quick_filter_bar_visible(true);
    assert_constraints_expressed({});

    // hit escape, bar should disappear
    EventUtils.synthesizeKey("VK_ESCAPE", {});
    assert_quick_filter_bar_visible(false);

    // bring the bar back for the next dude
    await toggle_quick_filter_bar();
  }

  const about3Pane = get_about_3pane();

  // 1) focus in the thread pane
  about3Pane.document.getElementById("threadTree").focus();
  await legwork();

  // 2) focus in the text box
  about3Pane.document.getElementById("qfb-qs-textbox").focus();
  await legwork();

  // 3) focus in the text box and pretend to type stuff...
  about3Pane.document.getElementById("qfb-qs-textbox").focus();
  await set_filter_text("qxqxqxqx");

  // Escape should clear the text constraint but the bar should still be
  //  visible.  The trick here is that escape is clearing the text widget
  //  and is not falling through to the cmd_popQuickFilterBarStack case so we
  //  end up with a situation where the _lastFilterAttr is the textbox but the
  //  textbox does not actually have any active filter.
  EventUtils.synthesizeKey("VK_ESCAPE", {});
  assert_quick_filter_bar_visible(true);
  assert_constraints_expressed({});
  assert_filter_text("");

  // Next escape should close the box
  EventUtils.synthesizeKey("VK_ESCAPE", {});
  assert_quick_filter_bar_visible(false);
  teardownTest();
});

/**
 * Control-shift-k expands the quick filter bar when it's collapsed. When
 * already expanded, it focuses the text box and selects its text.
 */
add_task(async function test_control_shift_k_shows_quick_filter_bar() {
  const about3Pane = get_about_3pane();

  const qfbTextbox = about3Pane.document.getElementById("qfb-qs-textbox");

  // focus explicitly on the thread pane so we know where the focus is.
  about3Pane.document.getElementById("threadTree").focus();
  // select a message so we can find in message
  await select_click_row(0);

  // hit control-shift-k to get in the quick filter box
  EventUtils.synthesizeKey("k", { accelKey: true, shiftKey: true });
  Assert.strictEqual(
    about3Pane.document.activeElement,
    qfbTextbox,
    "control-shift-k did not focus quick filter textbox"
  );

  await set_filter_text("search string");

  // hit control-shift-k to select the text in the quick filter box
  EventUtils.synthesizeKey("k", { accelKey: true, shiftKey: true });
  Assert.strictEqual(
    about3Pane.document.activeElement,
    qfbTextbox,
    "second control-shift-k did not keep focus on filter textbox"
  );
  const input = qfbTextbox.shadowRoot.querySelector("input");
  Assert.equal(
    input.selectionStart,
    0,
    "Selection starts at the beginning of the input"
  );
  Assert.equal(
    input.selectionEnd,
    "search string".length,
    "Selection ends at the end of the input"
  );

  // hit escape and make sure the text is cleared, but the quick filter bar is
  // still open.
  EventUtils.synthesizeKey("KEY_Escape", {});
  assert_quick_filter_bar_visible(true);
  assert_filter_text("");

  // hit escape one more time and make sure we finally collapsed the quick
  // filter bar.
  EventUtils.synthesizeKey("KEY_Escape", {});
  assert_quick_filter_bar_visible(false);
  teardownTest();
});

function teardownTest() {
  clear_constraints();
}
