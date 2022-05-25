/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var tabInfo;
var win;

add_setup(async () => {
  tabInfo = window.openContentTab(
    "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/selectionWidget.xhtml"
  );
  await BrowserTestUtils.browserLoaded(tabInfo.browser);

  tabInfo.browser.focus();
  win = tabInfo.browser.contentWindow;
});

registerCleanupFunction(() => {
  window.tabmail.closeTab(tabInfo);
});

var selectionModels = ["focus", "browse"];

/**
 * The selection widget.
 * @type {HTMLElement}
 */
var widget;
/**
 * A focusable item before the widget.
 * @type {HTMLElement}
 */
var before;
/**
 * A focusable item after the widget.
 * @type {HTMLElement}
 */
var after;

/**
 * Reset the page and create a new widget.
 *
 * The "widget", "before" and "after" variables will be reset to the new
 * elements.
 *
 * @param {Object} options - Options to set.
 * @param {string} options.model - The selection model to use.
 * @param {string} [options.direction="right-to-left"] - The direction of the
 *   widget.  Choosing "top-to-bottom" will layout items from top to bottom.
 *   Choosing "right-to-left" or "left-to-right" will set the page's direction
 *   to "rtl" or "ltr", respectively, and will layout items in the writing
 *   direction.
 */
function reset(options) {
  function createTabStop(text) {
    let el = win.document.createElement("span");
    el.tabIndex = 0;
    el.id = text;
    el.textContent = text;
    return el;
  }
  before = createTabStop("before");
  after = createTabStop("after");

  let { model, direction } = options;
  if (!direction) {
    // Default to a less-common format.
    direction = "right-to-left";
  }
  info(`Creating ${direction} widget with "${model}" model`);

  widget = win.document.createElement("test-selection-widget");
  widget.id = "widget";
  widget.setAttribute("selection-model", model);
  widget.setAttribute(
    "layout-direction",
    direction == "top-to-bottom" ? "vertical" : "horizontal"
  );

  win.document.body.replaceChildren(before, widget, after);

  win.document.dir = direction == "left-to-right" ? "ltr" : "rtl";

  before.focus();
}

/**
 * Assert the order of the widget's items.
 *
 * @param {string[]} textOrder - The expected textContent of the widget's
 *   items, in the expected order.
 * @param {string} msg - A message to use for the assertion.
 */
function assertOrder(textOrder, msg) {
  Assert.deepEqual(
    Array.from(widget.items, i => i.element.textContent),
    textOrder,
    msg
  );
}

/**
 * Assert that no item is selected in the widget.
 *
 * @param {string} msg - A message to use for the assertion.
 */
function assertNoSelection(msg) {
  Assert.equal(
    widget.selectedIndicies().length,
    0,
    `No item should be selected: ${msg}`
  );
}

/**
 * Assert that exactly one item is selected in the widget.
 *
 * @param {number} index - The index of the selected item.
 * @param {string} msg - A message to use for the assertion.
 */
function assertSingleSelection(index, msg) {
  let selected = widget.selectedIndicies();
  Assert.equal(selected.length, 1, `One item should be selected: ${msg}`);
  Assert.equal(selected[0], index, `Selected index should match: ${msg}`);
}

/**
 * Assert that the given element is focused.
 *
 * @param {HTMLElement} expectElement - The expected focused element.
 * @param {string} msg - A message to use for the assertion.
 */
function assertFocus(expectElement, msg) {
  Assert.ok(
    expectElement.matches(":focus"),
    `${expectElement.id} should have focus (active element: ${win.document.activeElement?.id}): ${msg}`
  );
}

/**
 * Shift the focus by one step by pressing Tab and assert the new focused
 * element.
 *
 * @param {boolean} forward - Whether to move the focus forward.
 * @param {HTMLElement} expectElement - The expected focused element after
 *   pressing tab.
 * @param {string} msg - A message to use for the assertion.
 */
function stepFocus(forward, expectElement, msg) {
  EventUtils.synthesizeKey("KEY_Tab", { shiftKey: !forward }, win);
  msg = (msg && `: ${msg}`) || "";
  assertFocus(
    expectElement,
    `After moving ${forward ? "forward" : "backward"}${msg}`
  );
}

// If the widget is empty, it receives focus on itself.
add_task(async function test_empty_widget_focus() {
  for (let model of selectionModels) {
    reset({ model });

    assertFocus(before, "Initial");

    // Move focus forward.
    stepFocus(true, widget);
    stepFocus(true, after);

    // Move focus backward.
    stepFocus(false, widget);
    stepFocus(false, before);

    // Clicking also gives focus.
    for (let shiftKey of [false, true]) {
      for (let ctrlKey of [false, true]) {
        info(
          `Clicking empty widget: ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`
        );
        EventUtils.synthesizeMouseAtCenter(widget, { shiftKey, ctrlKey }, win);
        assertFocus(widget, "Widget receives focus after click");
        // Move focus for the next loop.
        stepFocus(true, after);
      }
    }
  }
});

// If the widget has no selection when we move into it, the first item is
// focused and selected.
add_task(function test_initial_no_select_focus() {
  for (let model of selectionModels) {
    // Forward.
    reset({ model });
    widget.addItems(0, ["First", "Second"]);

    assertFocus(before, "Forward start");
    assertNoSelection("Initial");

    stepFocus(true, widget.items[0].element, "Move onto first item");
    assertSingleSelection(0, "First item becomes selected");
    stepFocus(true, after);

    // Reverse.
    reset({ model });
    after.focus();
    widget.addItems(0, ["First", "Second"]);

    assertFocus(after, "Reverse start");
    assertNoSelection("Reverse start");

    stepFocus(false, widget.items[0].element, "Move backward to first item");
    assertSingleSelection(0, "First item becomes selected on reverse");
    stepFocus(false, before);

    // With mouse click.
    for (let shiftKey of [false, true]) {
      for (let ctrlKey of [false, true]) {
        info(`Clicking widget: ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`);

        reset({ model });
        widget.addItems(0, ["First", "Second"]);

        assertFocus(before, "Click empty start");
        assertNoSelection("Click empty start");
        // Assume the center does not include an item.
        EventUtils.synthesizeMouseAtCenter(widget, { shiftKey, ctrlKey }, win);
        assertFocus(
          widget.items[0].element,
          "First item becomes focused with click on empty"
        );
        assertSingleSelection(
          0,
          "First item becomes selected with click on empty"
        );

        // With mouse click on item.
        reset({ model });
        widget.addItems(0, ["First", "Second"]);

        assertFocus(before, "Click second item start");
        assertNoSelection("Click second item start");
        EventUtils.synthesizeMouseAtCenter(
          widget.items[1].element,
          { shiftKey, ctrlKey },
          win
        );
        if (shiftKey || ctrlKey) {
          // Multi-selection not supported, so acts the same as clicking empty.
          assertFocus(
            widget.items[0].element,
            "First item becomes focused with click on item"
          );
          assertSingleSelection(
            0,
            "First item becomes selected with click on item"
          );
        } else {
          assertFocus(
            widget.items[1].element,
            "Second item becomes focused with click on item"
          );
          assertSingleSelection(
            1,
            "Second item becomes selected with click on item"
          );
        }
      }
    }
  }
});

// If the widget has a selection when we move into it, the selected item is
// focused.
add_task(function test_initial_select_focus() {
  for (let model of selectionModels) {
    reset({ model });
    widget.addItems(0, ["First", "Second", "Third"]);
    widget.selectItem(1);

    assertFocus(before, "Forward start");
    assertSingleSelection(1, "Initial selection on second item");

    stepFocus(true, widget.items[1].element, "Move onto selected item");
    assertSingleSelection(1, "Second item remains selected");
    stepFocus(true, after);

    // Reverse.
    reset({ model });
    after.focus();
    widget.addItems(0, ["First", "Second", "Third"]);
    widget.selectItem(1);

    assertFocus(after, "Reverse start");
    assertSingleSelection(1, "Reverse start");

    stepFocus(false, widget.items[1].element, "Move backward to selected item");
    assertSingleSelection(1, "Second item remains selected on reverse");
    stepFocus(false, before);

    // With mouse click.
    for (let shiftKey of [false, true]) {
      for (let ctrlKey of [false, true]) {
        info(`Clicking widget: ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`);

        reset({ model });
        widget.addItems(0, ["First", "Second", "Third"]);
        widget.selectItem(1);

        assertFocus(before, "Click empty start");
        assertSingleSelection(1, "Click empty start");
        // Assume the center does not include an item.
        EventUtils.synthesizeMouseAtCenter(widget, { shiftKey, ctrlKey }, win);
        assertFocus(
          widget.items[1].element,
          "Selected item becomes focused with click on empty"
        );
        assertSingleSelection(
          1,
          "Second item remains selected with click on empty"
        );

        // With mouse click on item.
        reset({ model });
        widget.addItems(0, ["First", "Second", "Third"]);
        widget.selectItem(1);

        assertFocus(before, "Click first item start");
        assertSingleSelection(1, "Click first item start");

        EventUtils.synthesizeMouseAtCenter(
          widget.items[0].element,
          { shiftKey, ctrlKey },
          win
        );
        if (shiftKey || ctrlKey) {
          // Multi-selection not supported, so acts the same as clicking empty.
          assertFocus(
            widget.items[1].element,
            "Selected item becomes focused with click on item"
          );
          assertSingleSelection(
            1,
            "Second item remains selected with click on item"
          );
        } else {
          assertFocus(
            widget.items[0].element,
            "First item becomes focused with click on item"
          );
          assertSingleSelection(
            0,
            "First item becomes selected with click on item"
          );
        }
      }
    }
  }
});

// Navigating with keyboard will move focus, and possibly selection.
add_task(function test_keyboard_navigation() {
  for (let model of selectionModels) {
    for (let { direction, forwardKey, backwardKey } of [
      {
        direction: "top-to-bottom",
        forwardKey: "KEY_ArrowDown",
        backwardKey: "KEY_ArrowUp",
      },
      {
        direction: "right-to-left",
        forwardKey: "KEY_ArrowLeft",
        backwardKey: "KEY_ArrowRight",
      },
      {
        direction: "left-to-right",
        forwardKey: "KEY_ArrowRight",
        backwardKey: "KEY_ArrowLeft",
      },
    ]) {
      reset({ model, direction });
      widget.addItems(0, ["First", "Second", "Third"]);

      stepFocus(true, widget.items[0].element, "Initially on first item");

      // Without Ctrl, selection follows focus.

      // Forward.
      EventUtils.synthesizeKey(forwardKey, {}, win);
      assertFocus(widget.items[1].element, "Forward to second item");
      assertSingleSelection(1, "Second item becomes selected on focus");
      EventUtils.synthesizeKey(forwardKey, {}, win);
      assertFocus(widget.items[2].element, "Forward to third item");
      assertSingleSelection(2, "Third item becomes selected on focus");
      EventUtils.synthesizeKey(forwardKey, {}, win);
      assertFocus(
        widget.items[2].element,
        "Forward at end remains on third item"
      );
      assertSingleSelection(2, "Third item remains selected");

      // Backward.
      EventUtils.synthesizeKey(backwardKey, {}, win);
      assertFocus(widget.items[1].element, "Backward to second item");
      assertSingleSelection(1, "Second item becomes selected on focus");
      EventUtils.synthesizeKey(backwardKey, {}, win);
      assertFocus(widget.items[0].element, "Backward to first item");
      assertSingleSelection(0, "First item becomes selected on focus");
      EventUtils.synthesizeKey(backwardKey, {}, win);
      assertFocus(
        widget.items[0].element,
        "Backward at end remains on first item"
      );
      assertSingleSelection(0, "First item remains selected");

      // End.
      EventUtils.synthesizeKey("KEY_End", {}, win);
      assertFocus(widget.items[2].element, "Third becomes focused on End");
      assertSingleSelection(2, "Third becomes selected on End");
      // Move to middle.
      EventUtils.synthesizeKey(backwardKey, {}, win);
      EventUtils.synthesizeKey("KEY_End", {}, win);
      assertFocus(
        widget.items[2].element,
        "Third becomes focused on End from second"
      );
      assertSingleSelection(2, "Third becomes selected on End from second");
      EventUtils.synthesizeKey("KEY_End", {}, win);
      assertFocus(
        widget.items[2].element,
        "Third remains focused on End from third"
      );
      assertSingleSelection(2, "Third becomes selected on End from third");

      // Home.
      EventUtils.synthesizeKey("KEY_Home", {}, win);
      assertFocus(widget.items[0].element, "First becomes focused on Home");
      assertSingleSelection(0, "First becomes selected on Home");
      // Move to middle.
      EventUtils.synthesizeKey(forwardKey, {}, win);
      EventUtils.synthesizeKey("KEY_Home", {}, win);
      assertFocus(
        widget.items[0].element,
        "First becomes focused on Home from second"
      );
      assertSingleSelection(0, "First becomes selected on Home from second");
      EventUtils.synthesizeKey("KEY_Home", {}, win);
      assertFocus(
        widget.items[0].element,
        "First remains focused on Home from first"
      );
      assertSingleSelection(0, "First becomes selected on Home from first");

      let focusIndex;
      let selectedIndex;
      // With Ctrl key, selection does not follow focus.
      if (model == "focus") {
        // Disabled in "focus" model.
        // Move to middle item.
        EventUtils.synthesizeKey(forwardKey, {}, win);
        assertFocus(widget.items[1].element, "Second item is focused");
        assertFocus(widget.items[1].element, "Second item is selected");

        for (let key of [backwardKey, forwardKey, "KEY_Home", "KEY_End"]) {
          info(`Pressing Ctrl+${key} on "focus" model widget`);
          EventUtils.synthesizeKey(key, { ctrlKey: true }, win);
          assertFocus(widget.items[1].element, "Second item is still focused");
          assertFocus(widget.items[1].element, "Second item is still selected");
        }
        focusIndex = 1;
        selectedIndex = 1;
      } else {
        EventUtils.synthesizeKey(forwardKey, { ctrlKey: true }, win);
        assertFocus(widget.items[1].element, "Ctrl+Forward to second item");
        assertSingleSelection(0, "First item remains selected on Ctrl+Forward");

        EventUtils.synthesizeKey(forwardKey, { ctrlKey: true }, win);
        assertFocus(widget.items[2].element, "Ctrl+Forward to third item");
        assertSingleSelection(0, "First item remains selected on Ctrl+Forward");

        EventUtils.synthesizeKey(backwardKey, { ctrlKey: true }, win);
        assertFocus(widget.items[1].element, "Ctrl+Backward to second item");
        assertSingleSelection(
          0,
          "First item remains selected on Ctrl+Backward"
        );

        EventUtils.synthesizeKey(backwardKey, { ctrlKey: true }, win);
        assertFocus(widget.items[0].element, "Ctrl+Backward to first item");
        assertSingleSelection(
          0,
          "First item remains selected on Ctrl+Backward"
        );

        EventUtils.synthesizeKey("KEY_End", { ctrlKey: true }, win);
        assertFocus(widget.items[2].element, "Ctrl+End to third item");
        assertSingleSelection(0, "First item remains selected on Ctrl+End");

        EventUtils.synthesizeKey(backwardKey, {}, win);
        assertFocus(widget.items[1].element, "Backward to second item");
        assertSingleSelection(
          1,
          "Selection moves with focus when not pressing Ctrl"
        );

        EventUtils.synthesizeKey("KEY_Home", { ctrlKey: true }, win);
        assertFocus(widget.items[0].element, "Ctrl+Home to first item");
        assertSingleSelection(1, "Second item remains selected on Ctrl+Home");

        // Even if focus remains the same, the selection is still updated if we
        // don't press Ctrl.
        EventUtils.synthesizeKey(backwardKey, {}, win);
        assertFocus(widget.items[0].element, "Focus remains on first item");
        assertSingleSelection(
          0,
          "Selection moves to the first item since Ctrl was not pressed"
        );

        // Get into a state where focus does not match selection.
        EventUtils.synthesizeKey(forwardKey, { ctrlKey: true }, win);
        assertFocus(widget.items[1].element, "Focus on second item");
        assertSingleSelection(0, "Selection on first item");

        focusIndex = 1;
        selectedIndex = 0;
      }

      // With Shift key.
      // We don't have multi-selection so should do nothing.
      for (let key of [forwardKey, backwardKey, "KEY_Home", "KEY_End"]) {
        for (let ctrlKey of [false, true]) {
          info(
            `Pressing ${
              ctrlKey ? "Ctrl+" : ""
            }Shift+${key} on "${model}" model widget`
          );
          EventUtils.synthesizeKey(key, { shiftKey: true, ctrlKey }, win);
          assertFocus(
            widget.items[focusIndex].element,
            "Focus still on same item"
          );
          assertSingleSelection(selectedIndex, "Selection still on same item");
        }
      }
    }
  }
});

// Using Space to select items.
add_task(function test_space_selection() {
  for (let model of selectionModels) {
    reset({ model, direction: "right-to-left" });
    widget.addItems(0, ["First", "Second", "Third"]);

    stepFocus(true, widget.items[0].element, "Move focus to first item");
    assertSingleSelection(0, "First item is selected");

    // Selecting an already selected item does nothing.
    EventUtils.synthesizeKey(" ", {}, win);
    assertFocus(widget.items[0].element, "First item still has focus");
    assertSingleSelection(0, "First item is still selected");

    if (model == "focus") {
      // Just move to second item as set up for the loop.
      EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    } else {
      // Selecting a non-selected item will move selection to it.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus(widget.items[1].element, "Second item has focus");
      assertSingleSelection(0, "First item is still selected");
      EventUtils.synthesizeKey(" ", {}, win);
      assertFocus(widget.items[1].element, "Second item still has focus");
      assertSingleSelection(1, "Second item becomes selected");
    }

    // Ctrl or Shift + Space will do nothing.
    for (let { shiftKey, ctrlKey } of [
      { shiftKey: false, ctrlKey: true },
      { shiftKey: true, ctrlKey: false },
      { shiftKey: true, ctrlKey: true },
    ]) {
      info(
        `Pressing space on item: ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`
      );
      // On selected item.
      EventUtils.synthesizeKey(" ", { ctrlKey, shiftKey }, win);
      assertFocus(widget.items[1].element, "Second item still has focus");
      assertSingleSelection(1, "Second item is still selected");

      if (model == "focus") {
        continue;
      }

      // On non-selected item.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus(widget.items[2].element, "Third item has focus");
      assertSingleSelection(1, "Second item is still selected");
      EventUtils.synthesizeKey(" ", { ctrlKey, shiftKey }, win);
      assertFocus(widget.items[2].element, "Third item still has focus");
      assertSingleSelection(1, "Second item is still selected");

      // Restore for next loop.
      EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
      assertFocus(widget.items[1].element, "Second item has focus");
      assertSingleSelection(1, "Second item is selected");
    }
  }
});

// Clicking an item will focus and select it.
add_task(function test_clicking_items() {
  for (let model of selectionModels) {
    reset({ model, direction: "right-to-left" });
    widget.addItems(0, ["First", "Second", "Third"]);

    assertFocus(before, "Focus initially outside widget");
    assertNoSelection("No initial selection");

    // Focus moves into widget, onto the clicked item.
    EventUtils.synthesizeMouseAtCenter(widget.items[1].element, {}, win);
    assertFocus(widget.items[1].element, "Focus clicked second item");
    assertSingleSelection(1, "Selected clicked second item");

    // Focus moves to different item.
    EventUtils.synthesizeMouseAtCenter(widget.items[2].element, {}, win);
    assertFocus(widget.items[2].element, "Focus clicked third item");
    assertSingleSelection(2, "Selected clicked third item");

    // Click same item.
    EventUtils.synthesizeMouseAtCenter(widget.items[2].element, {}, win);
    assertFocus(widget.items[2].element, "Focus remains on third item");
    assertSingleSelection(2, "Selected remains on third item");

    // Focus outside widget, focus moves but selection remains.
    before.focus();
    assertFocus(before, "Focus outside widget");
    assertSingleSelection(2, "Selected remains on third item");

    // Clicking same item will return focus to it.
    EventUtils.synthesizeMouseAtCenter(widget.items[2].element, {}, win);
    assertFocus(widget.items[2].element, "Focus returns to third item");
    assertSingleSelection(2, "Selected remains on third item");

    // Do the same, but return to a different item.
    before.focus();
    assertFocus(before, "Focus outside widget");
    assertSingleSelection(2, "Selected remains on third item");

    // Clicking same item will return focus to it.
    EventUtils.synthesizeMouseAtCenter(widget.items[1].element, {}, win);
    assertFocus(widget.items[1].element, "Focus moves to second item");
    assertSingleSelection(1, "Selected moves to second item");

    // Switching to keyboard works.
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    assertFocus(widget.items[0].element, "Focus moves to first item");
    assertSingleSelection(0, "Selected moves to first item");

    // Returning to mouse works.
    EventUtils.synthesizeMouseAtCenter(widget.items[1].element, {}, win);
    assertFocus(widget.items[1].element, "Focus moves to second item");
    assertSingleSelection(1, "Selected moves to second item");

    let focusIndex = 1;
    if (model != "focus") {
      // Change selection to be different from focus.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus(widget.items[2].element, "Focus moves to third item");
      assertSingleSelection(1, "Second item remains selected");
      focusIndex = 2;
    }

    // Clicking with Shift or Ctrl does not react beyond refocusing the widget.
    for (let { shiftKey, ctrlKey } of [
      { shiftKey: false, ctrlKey: true },
      { shiftKey: true, ctrlKey: false },
      { shiftKey: true, ctrlKey: true },
    ]) {
      info(`Clicking widget item: ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`);

      // If focus outside widget, just refocuses.
      before.focus();
      assertFocus(before, "Focus outside widget");
      assertSingleSelection(1, "Selected remains on second item");

      EventUtils.synthesizeMouseAtCenter(
        widget.items[0].element,
        { ctrlKey, shiftKey },
        win
      );
      assertFocus(widget.items[focusIndex].element, "Widget item is refocused");
      assertSingleSelection(1, "Selected remains on second item");

      // If already focused, does nothing.
      EventUtils.synthesizeMouseAtCenter(
        widget.items[focusIndex - 1].element,
        { ctrlKey, shiftKey },
        win
      );
      assertFocus(widget.items[focusIndex].element, "Widget item is refocused");
      assertSingleSelection(1, "Selected remains on second item");
    }
  }
});

// Adding items to widget with existing items, should not change the selected
// item.
add_task(function test_add_items_to_nonempty() {
  for (let model of selectionModels) {
    reset({ model, direction: "right-to-left" });
    assertOrder([]);

    widget.addItems(0, ["0-add"]);
    assertOrder(["0-add"]);
    stepFocus(true, widget.items[0].element, "Move focus to 0-add");
    assertSingleSelection(0, "0-add selected");

    // Add item after.
    widget.addItems(1, ["1-add"]);
    assertOrder(["0-add", "1-add"]);
    assertFocus(widget.items[0].element, "0-add still has focus");
    assertSingleSelection(0, "0-add selected");

    // Add item before. 0-add moves to index 1.
    widget.addItems(0, ["2-add"]);
    assertOrder(["2-add", "0-add", "1-add"]);
    assertFocus(widget.items[1].element, "0-add still has focus");
    assertSingleSelection(1, "0-add selected");

    // Add several before.
    widget.addItems(1, ["3-add", "4-add", "5-add"]);
    assertOrder(["2-add", "3-add", "4-add", "5-add", "0-add", "1-add"]);
    assertFocus(widget.items[4].element, "0-add still has focus");
    assertSingleSelection(4, "0-add selected");

    // Key navigation works.
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    assertFocus(widget.items[3].element, "5-add has focus");
    assertSingleSelection(3, "5-add selected");

    if (model != "focus") {
      // With selection after focus.
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus(widget.items[2].element, "4-add has focus");
      assertSingleSelection(3, "5-add selected");

      // Add after both selection and focus.
      widget.addItems(5, ["6-add"]);
      assertOrder([
        "2-add",
        "3-add",
        "4-add",
        "5-add",
        "0-add",
        "6-add",
        "1-add",
      ]);
      assertFocus(widget.items[2].element, "4-add still has focus");
      assertSingleSelection(3, "5-add still selected");

      // Add before both selection and focus.
      widget.addItems(1, ["7-add"]);
      assertOrder([
        "2-add",
        "7-add",
        "3-add",
        "4-add",
        "5-add",
        "0-add",
        "6-add",
        "1-add",
      ]);
      assertFocus(widget.items[3].element, "4-add still has focus");
      assertSingleSelection(4, "5-add still selected");

      // Before selection, after focus.
      widget.addItems(4, ["8-add"]);
      assertOrder([
        "2-add",
        "7-add",
        "3-add",
        "4-add",
        "8-add",
        "5-add",
        "0-add",
        "6-add",
        "1-add",
      ]);
      assertFocus(widget.items[3].element, "4-add still has focus");
      assertSingleSelection(5, "5-add still selected");

      // Swap selection to be before focus.
      EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus(widget.items[5].element, "5-add has focus");
      assertSingleSelection(4, "8-add selected");

      // After selection, before focus.
      widget.addItems(5, ["9-add"]);
      assertOrder([
        "2-add",
        "7-add",
        "3-add",
        "4-add",
        "8-add",
        "9-add",
        "5-add",
        "0-add",
        "6-add",
        "1-add",
      ]);
      assertFocus(widget.items[6].element, "5-add still has focus");
      assertSingleSelection(4, "8-add still selected");
    }

    // With focus outside the widget.
    reset({ model, direction: "right-to-left" });
    assertOrder([]);

    widget.addItems(0, ["0-add"]);
    assertOrder(["0-add"]);
    stepFocus(true, widget.items[0].element, "Move focus to 0-add");
    assertSingleSelection(0, "0-add selected");

    stepFocus(true, after, "Move focus to after widget");
    // Add after.
    widget.addItems(1, ["1-add", "2-add"]);
    assertOrder(["0-add", "1-add", "2-add"]);
    assertSingleSelection(0, "0-add still selected");
    stepFocus(false, widget.items[0].element, "Move focus back to 0-add");
    assertSingleSelection(0, "0-add still selected");

    stepFocus(false, before, "Move focus to before widget");
    // Add before.
    widget.addItems(0, ["3-add", "4-add"]);
    assertOrder(["3-add", "4-add", "0-add", "1-add", "2-add"]);
    assertSingleSelection(2, "0-add still selected");
    stepFocus(true, widget.items[2].element, "Move focus back to 0-add");
    assertSingleSelection(2, "0-add still selected");
  }
});

// If items are added to an empty widget that has focus, nothing happens
// initially. Arrow keys will focus the first item.
add_task(function test_add_items_to_empty_with_focus() {
  for (let model of selectionModels) {
    for (let { direction, key, index } of [
      { direction: "top-to-bottom", key: "KEY_ArrowUp", index: 0 },
      { direction: "top-to-bottom", key: "KEY_ArrowDown", index: 0 },
      { direction: "right-to-left", key: "KEY_ArrowRight", index: 0 },
      { direction: "right-to-left", key: "KEY_ArrowLeft", index: 0 },
      { direction: "left-to-right", key: "KEY_ArrowRight", index: 0 },
      { direction: "left-to-right", key: "KEY_ArrowLeft", index: 0 },
      { direction: "top-to-bottom", key: "KEY_Home", index: 0 },
      { direction: "right-to-left", key: "KEY_Home", index: 0 },
      { direction: "left-to-right", key: "KEY_Home", index: 0 },
      { direction: "top-to-bottom", key: "KEY_End", index: 2 },
      { direction: "right-to-left", key: "KEY_End", index: 2 },
      { direction: "left-to-right", key: "KEY_End", index: 2 },
    ]) {
      for (let ctrlKey of [false, true]) {
        info(
          `Adding items to empty ${direction} widget and then pressing ${
            ctrlKey ? "Ctrl+" : ""
          }${key}`
        );
        reset({ model, direction });

        stepFocus(true, widget, "Move focus onto empty widget");
        widget.addItems(0, ["First", "Second", "Third"]);

        assertFocus(widget, "Focus remains on the widget after adding items");
        assertNoSelection("No items are selected yet");

        EventUtils.synthesizeKey(key, { ctrlKey }, win);
        if (model == "focus" && ctrlKey) {
          // Does nothing.
          assertFocus(widget, `Focus remains on widget after Ctrl+${key}`);
        } else {
          assertFocus(
            widget.items[index].element,
            `Focus moves to ${index} after ${key}`
          );
        }

        if (ctrlKey) {
          assertNoSelection(`No selection if pressing Ctrl+${key}`);
        } else {
          assertSingleSelection(index, `Item selected after ${key}`);
        }
      }
    }

    // Arrow keys in other directions do nothing.
    reset({ model, direction: "top-to-bottom" });
    stepFocus(true, widget, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second"]);
    for (let key of ["KEY_ArrowRight", "KEY_ArrowLeft"]) {
      EventUtils.synthesizeKey(key, {}, win);
      assertFocus(widget, `Focus remains on widget after ${key}`);
      assertNoSelection(`No items become selected after ${key}`);
    }

    reset({ model, direction: "right-to-left" });
    stepFocus(true, widget, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second"]);
    for (let key of ["KEY_ArrowUp", "KEY_ArrowDown"]) {
      EventUtils.synthesizeKey(key, {}, win);
      assertFocus(widget, `Focus remains on widget after ${key}`);
      assertNoSelection(`No items become selected after ${key}`);
    }

    // Pressing Space does nothing.
    reset({ model });
    stepFocus(true, widget, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second"]);
    for (let ctrlKey of [false, true]) {
      for (let shiftKey of [false, true]) {
        info(
          `Pressing ${ctrlKey ? "Ctrl+" : ""}${shiftKey ? "Shift+" : ""}Space`
        );
        EventUtils.synthesizeKey(" ", {}, win);
        assertFocus(widget, "Focus remains on widget after Space");
        assertNoSelection("No items become selected after Space");
      }
    }

    // This does not effect clicking.
    reset({ model });
    stepFocus(true, widget, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second"]);

    EventUtils.synthesizeMouseAtCenter(widget.items[1].element, {}, win);
    assertFocus(
      widget.items[1].element,
      "Focus moves to second item after click"
    );
    assertSingleSelection(1, "Second item selected after click");
  }
});

// Removing items from the widget with existing items, may change focus or
// selection if the corresponding item was removed.
add_task(function test_remove_items_nonempty() {
  for (let model of selectionModels) {
    reset({ model, direction: "right-to-left" });

    widget.addItems(0, ["0-add", "1-add", "2-add", "3-add", "4-add", "5-add"]);
    assertOrder(["0-add", "1-add", "2-add", "3-add", "4-add", "5-add"]);

    EventUtils.synthesizeMouseAtCenter(widget.items[2].element, {}, win);
    assertFocus(widget.items[2].element, "2-add has initial focus");
    assertSingleSelection(2, "2-add selected");

    // Remove one after.
    widget.removeItems(3, 1);
    assertOrder(["0-add", "1-add", "2-add", "4-add", "5-add"]);
    assertFocus(widget.items[2].element, "2-add still has focus");
    assertSingleSelection(2, "2-add still selected");

    // Remove one before.
    widget.removeItems(0, 1);
    assertOrder(["1-add", "2-add", "4-add", "5-add"]);
    assertFocus(widget.items[1].element, "2-add still has focus");
    assertSingleSelection(1, "2-add still selected");

    widget.addItems(0, ["6-add", "7-add"]);
    assertOrder(["6-add", "7-add", "1-add", "2-add", "4-add", "5-add"]);
    assertFocus(widget.items[3].element, "2-add still has focus");
    assertSingleSelection(3, "2-add still selected");

    // Remove several before.
    widget.removeItems(1, 2);
    assertOrder(["6-add", "2-add", "4-add", "5-add"]);
    assertFocus(widget.items[1].element, "2-add still has focus");
    assertSingleSelection(1, "2-add selected");

    // Remove selected and focused. Focus should move to the next item.
    widget.removeItems(1, 1);
    assertOrder(["6-add", "4-add", "5-add"]);
    assertFocus(widget.items[1].element, "Focus moves to 4-add");
    assertSingleSelection(1, "Selection moves to 4-add");

    widget.addItems(0, ["8-add"]);
    widget.addItems(3, ["9-add", "10-add"]);
    assertOrder(["8-add", "6-add", "4-add", "9-add", "10-add", "5-add"]);
    assertFocus(widget.items[2].element, "4-add still has focus");
    assertFocus(widget.items[2].element, "4-add still selected");

    // Remove selected and focused, not at boundary.
    widget.removeItems(1, 3);
    assertOrder(["8-add", "10-add", "5-add"]);
    assertFocus(widget.items[1].element, "Focus moves to 10-add");
    assertSingleSelection(1, "Selection moves to 10-add");

    // Remove last item whilst it has focus. Focus should move to the new last
    // item.
    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    assertFocus(widget.items[2].element, "Focus moves to 5-add");
    assertSingleSelection(2, "Selection moves to 5-add");

    widget.removeItems(2, 1);
    assertOrder(["8-add", "10-add"]);
    assertFocus(widget.items[1].element, "Focus moves to 10-add");
    assertSingleSelection(1, "Selection moves to 10-add");

    if (model != "focus") {
      // Move selection to be before focus.
      widget.addItems(2, ["11-add", "12-add", "13-add"]);
      assertOrder(["8-add", "10-add", "11-add", "12-add", "13-add"]);
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);

      assertFocus(widget.items[2].element, "11-add has focus");
      assertSingleSelection(1, "10-add has selection");

      // Remove focused, but not selected.
      widget.removeItems(2, 1);
      assertOrder(["8-add", "10-add", "12-add", "13-add"]);
      assertFocus(widget.items[2].element, "12-add has focus");
      assertSingleSelection(1, "10-add still has selection");

      // Remove focused and selected.
      widget.removeItems(1, 2);
      assertOrder(["8-add", "13-add"]);
      assertFocus(widget.items[1].element, "13-add has focus");
      assertNoSelection("Selection is lost");

      // Restore selection before focus.
      widget.addItems(0, ["14-add"]);
      assertOrder(["14-add", "8-add", "13-add"]);
      assertFocus(widget.items[2].element, "13-add has focus");
      assertNoSelection("Still no selection");
      // Arrow key without Ctrl will restore selection.
      EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
      assertFocus(widget.items[1].element, "8-add has focus");
      assertSingleSelection(1, "8-add is selected");
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus(widget.items[2].element, "13-add has focus");
      assertSingleSelection(1, "8-add is selected");

      // Remove selected, but not focused.
      widget.removeItems(1, 1);
      assertOrder(["14-add", "13-add"]);
      assertFocus(widget.items[1].element, "13-add still has focus");
      assertNoSelection("Selection is lost");

      // Move selection to be after focus.
      widget.addItems(1, ["15-add", "16-add"]);
      widget.addItems(4, ["17-add"]);
      assertOrder(["14-add", "15-add", "16-add", "13-add", "17-add"]);
      assertNoSelection("Still no selection");
      // Select focused.
      EventUtils.synthesizeKey(" ", {}, win);
      assertFocus(widget.items[3].element, "13-add has focus");
      assertSingleSelection(3, "13-add is selected");
      // Move focus.
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus(widget.items[1].element, "15-add has focus");
      assertSingleSelection(3, "13-add is selected");

      // Remove focused, but not selected.
      widget.removeItems(1, 1);
      assertOrder(["14-add", "16-add", "13-add", "17-add"]);
      assertFocus(widget.items[1].element, "16-add has focus");
      assertSingleSelection(2, "13-add still selected");

      // Remove focused and selected.
      widget.removeItems(1, 2);
      assertOrder(["14-add", "17-add"]);
      assertFocus(widget.items[1].element, "17-add has focus");
      assertNoSelection("Selection is lost");

      // Restore selection after focus.
      widget.addItems(2, ["18-add"]);
      assertOrder(["14-add", "17-add", "18-add"]);
      assertFocus(widget.items[1].element, "17-add has focus");
      assertNoSelection("Still no selection");
      // Arrow key without Ctrl will restore selection.
      EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
      assertFocus(widget.items[2].element, "18-add has focus");
      assertSingleSelection(2, "18-add is selected");
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus(widget.items[1].element, "17-add has focus");
      assertSingleSelection(2, "18-add is selected");

      // Remove selected, but not focused.
      widget.removeItems(2, 1);
      assertOrder(["14-add", "17-add"]);
      assertFocus(widget.items[1].element, "17-add still has focus");
      assertNoSelection("Selection is lost");

      // With focus outside the widget.
      stepFocus(true, after, "Move focus outside");
      assertNoSelection("Still no selection");
      stepFocus(false, widget.items[1].element, "17-add still has focus");
      assertNoSelection("Still no selection");
      // Select last item by trying to navigate beyond it.
      EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
      assertFocus(widget.items[1].element, "17-add still has focus");
      assertSingleSelection(1, "17-add is now selected");
    } else {
      // Set up the same widget state as above.
      widget.removeItems(0, 2);
      widget.addItems(0, ["14-add", "17-add"]);
      assertOrder(["14-add", "17-add"]);
      EventUtils.synthesizeKey("KEY_End", {}, win);
      assertFocus(widget.items[1].element, "17-add has focus");
      assertSingleSelection(1, "17-add is selected");
    }

    // Delete focused whilst outside widget.
    widget.addItems(2, ["19-add"]);
    assertOrder(["14-add", "17-add", "19-add"]);
    stepFocus(false, before);

    widget.removeItems(1, 1);
    assertFocus(before, "Focus remains outside widget");
    assertOrder(["14-add", "19-add"]);
    assertSingleSelection(1, "19-add becomes selected");

    stepFocus(true, widget.items[1].element, "19-add becomes focused");
    assertSingleSelection(1, "19-add is selected");
  }
});

// If widget is emptied whilst focused, focus moves to widget.
add_task(function test_emptying_widget() {
  for (let model of selectionModels) {
    // Empty with focused widget.
    reset({ model });
    stepFocus(true, widget, "Initial");
    widget.addItems(0, ["First", "Second"]);
    assertFocus(widget, "Focus still on widget after adding");
    widget.removeItems(0, 2);
    assertFocus(widget, "Focus still on widget after removing");

    // Empty with focused item.
    widget.addItems(0, ["First", "Second"]);
    EventUtils.synthesizeKey("KEY_Home", {}, win);
    assertFocus(widget.items[0].element, "Focus on first item");
    widget.removeItems(0, 2);
    assertFocus(widget, "Focus moves to widget after removing");

    // Empty with focus elsewhere.
    widget.addItems(0, ["First", "Second"]);
    stepFocus(false, before, "Focus elsewhere");
    widget.removeItems(0, 2);
    assertFocus(before, "Focus still elsewhere after removing");
    stepFocus(true, widget, "Widget becomes focused");

    // Empty with focus elsewhere, but active item.
    widget.addItems(0, ["First", "Second"]);
    // Move away from and back to widget to focus second item.
    stepFocus(true, after, "Focus elsewhere");
    widget.selectItem(1);
    stepFocus(false, widget.items[1].element, "Focus on second item");
    stepFocus(false, before, "Return focus to elsewhere");
    widget.removeItems(0, 2);
    assertFocus(before, "Focus still elsewhere after removing");
    stepFocus(true, widget, "Widget becomes focused");
  }
});
