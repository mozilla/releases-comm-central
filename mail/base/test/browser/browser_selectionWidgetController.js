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

var selectionModels = ["focus", "browse", "browse-multi"];

/**
 * The selection widget.
 *
 * @type {HTMLElement}
 */
var widget;
/**
 * A focusable item before the widget.
 *
 * @type {HTMLElement}
 */
var before;
/**
 * A focusable item after the widget.
 *
 * @type {HTMLElement}
 */
var after;

/**
 * Reset the page and create a new widget.
 *
 * The "widget", "before" and "after" variables will be reset to the new
 * elements.
 *
 * @param {object} options - Options to set.
 * @param {string} options.model - The selection model to use.
 * @param {string} [options.direction="right-to-left"] - The direction of the
 *   widget.  Choosing "top-to-bottom" will layout items from top to bottom.
 *   Choosing "right-to-left" or "left-to-right" will set the page's direction
 *   to "rtl" or "ltr", respectively, and will layout items in the writing
 *   direction.
 * @param {boolean} [options.draggable=false] - Whether to make the items
 *   draggable.
 */
function reset(options) {
  function createTabStop(text) {
    const el = win.document.createElement("span");
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
  widget.toggleAttribute("items-draggable", options.draggable);

  win.document.body.replaceChildren(before, widget, after);

  win.document.dir = direction == "left-to-right" ? "ltr" : "rtl";

  before.focus();
}

/**
 * Create an array of sequential integers.
 *
 * @param {number} start - The starting integer.
 * @param {number} num - The number of integers.
 *
 * @returns {number[]} - Array of integers between start and (start + num - 1).
 */
function range(start, num) {
  return Array.from({ length: num }, (_, i) => start + i);
}

/**
 * Assert that the specified items are selected in the widget, and nothing else.
 *
 * @param {number[]} indices - The indices of the selected items.
 * @param {string} msg - A message to use for the assertion.
 */
function assertSelection(indices, msg) {
  const selected = widget.selectedIndices();
  Assert.deepEqual(selected, indices, `Selected indices should match: ${msg}`);
  // Test that the return of getSelectionRanges is as expected.
  const expectRanges = [];
  let lastIndex = -2;
  let rangeIndex = -1;
  for (const index of indices) {
    if (index == lastIndex + 1) {
      expectRanges[rangeIndex].end++;
    } else {
      rangeIndex++;
      expectRanges.push({ start: index, end: index + 1 });
    }
    lastIndex = index;
  }
  Assert.deepEqual(
    widget.getSelectionRanges(),
    expectRanges,
    `Selection ranges should match expected: ${msg}`
  );
}

/**
 * Assert that the given element is focused.
 *
 * @param {object} expect - The expected focused element.
 * @param {HTMLElement} [expect.element] - The expected element that will
 *   have focus.
 * @param {number} [expect.index] - If the `element` property is not given, this
 *   specifies the index of the item widget we expect to have focus.
 * @param {string} [expect.text] - Optionally test that the element also has the
 *   given text content.
 * @param {string} msg - A message to use for the assertion.
 */
function assertFocus(expect, msg) {
  let expectElement;
  let name;
  if (expect.element != undefined) {
    expectElement = expect.element;
    name = `Element #${expectElement.id}`;
  } else {
    expectElement = widget.items[expect.index].element;
    name = `Item ${expect.index}`;
  }
  let active = win.document.activeElement;
  const activeIndex = widget.items.findIndex(i => i.element == active);
  if (activeIndex >= 0) {
    active = `"${active.textContent}", index: ${activeIndex}`;
  } else if (active.id) {
    active = `#${active.id}`;
  } else {
    active = `<${active.localName}>`;
  }
  Assert.ok(
    expectElement.matches(":focus"),
    `${name} should have focus (active: ${active}): ${msg}`
  );
}

/**
 * Shift the focus by one step by pressing Tab and assert the new focused
 * element.
 *
 * @param {boolean} forward - Whether to move the focus forward.
 * @param {object} expect - The expected focused element after pressing tab.
 *   Same as passed to {@link assertFocus}.
 * @param {string} msg - A message to use for the assertion.
 */
function stepFocus(forward, expect, msg) {
  EventUtils.synthesizeKey("KEY_Tab", { shiftKey: !forward }, win);
  assertFocus(
    expect,
    `After moving ${forward ? "forward" : "backward"}: ${msg}`
  );
}

/**
 * @typedef {object} ItemState
 * @property {string} text - The text content of the item.
 * @property {boolean} [selected=false] - Whether the item is selected.
 * @property {boolean} [focused=false] - Whether the item is focused.
 */

/**
 * Assert the text order, selection state and focus of the widget items.
 *
 * @param {ItemState[]} expected - The expected state of the widget items, in
 *   the expected order of the items.
 * @param {string} msg - A message to use for the assertion.
 */
function assertState(expected, msg) {
  const textOrder = [];
  let focusIndex;
  const selectedIndices = [];
  for (const [index, state] of expected.entries()) {
    textOrder.push(state.text);
    if (state.selected) {
      selectedIndices.push(index);
    }
    if (state.focused) {
      if (focusIndex != undefined) {
        throw new Error("More than one item specified as having focus");
      }
      focusIndex = index;
    }
  }
  Assert.deepEqual(
    Array.from(widget.items, i => i.element.textContent),
    textOrder,
    `Text order should match: ${msg}`
  );
  assertSelection(selectedIndices, msg);
  if (focusIndex != undefined) {
    assertFocus({ index: focusIndex }, msg);
  } else {
    Assert.ok(
      !widget.querySelector(":focus"),
      `Widget should not contain any focus: ${msg}`
    );
  }
}

/**
 * Click the empty space of the widget.
 *
 * @param {object} mouseEvent - Properties for the click event.
 */
function clickWidgetEmptySpace(mouseEvent) {
  const widgetRect = widget.getBoundingClientRect();
  if (widget.getAttribute("layout-direction") == "vertical") {
    // Try click end, which we assume is empty.
    EventUtils.synthesizeMouse(
      widget,
      widgetRect.width / 2,
      widgetRect.height - 5,
      mouseEvent,
      win
    );
  } else if (widget.matches(":dir(rtl)")) {
    // Try click the left, which we assume is empty.
    EventUtils.synthesizeMouse(
      widget,
      5,
      widgetRect.height / 2,
      mouseEvent,
      win
    );
  } else {
    // Try click the right, which we assume is empty.
    EventUtils.synthesizeMouse(
      widget,
      widgetRect.width - 5,
      widgetRect.height / 2,
      mouseEvent,
      win
    );
  }
}

/**
 * Click the specified widget item.
 *
 * @param {number} index - The index of the item to click.
 * @param {object} mouseEvent - Properties for the click event.
 */
function clickWidgetItem(index, mouseEvent) {
  EventUtils.synthesizeMouseAtCenter(
    widget.items[index].element,
    mouseEvent,
    win
  );
}

/**
 * Trigger the select-all shortcut.
 */
function selectAllShortcut() {
  EventUtils.synthesizeKey(
    "a",
    AppConstants.platform == "macosx" ? { metaKey: true } : { ctrlKey: true },
    win
  );
}

// If the widget is empty, it receives focus on itself.
add_task(function test_empty_widget_focus() {
  for (const model of selectionModels) {
    reset({ model });

    assertFocus({ element: before }, "Initial");

    // Move focus forward.
    stepFocus(true, { element: widget }, "Move into widget");
    stepFocus(true, { element: after }, "Move out of widget");

    // Move focus backward.
    stepFocus(false, { element: widget }, "Move back to widget");
    stepFocus(false, { element: before }, "Move back out of widget");

    // Clicking also gives focus.
    for (const shiftKey of [false, true]) {
      for (const ctrlKey of [false, true]) {
        info(
          `Clicking empty widget: ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`
        );
        clickWidgetEmptySpace({ shiftKey, ctrlKey });
        assertFocus({ element: widget }, "Widget receives focus after click");
        // Move focus for the next loop.
        stepFocus(true, { element: after }, "Move back out");
      }
    }
  }
});

/**
 * Test that the initial focus is as expected.
 *
 * @param {string} model - The selection model to use.
 * @param {Function} setup - A callback to set up the widget.
 * @param {number} clickIndex - The index of an item to click.
 * @param {object} expect - The expected states.
 * @param {number} expect.focusIndex - The expected focus index.
 * @param {number[]} expect.selection - The expected initial selection.
 * @param {boolean} expect.selectFocus - Whether we expect the focused item to
 *   become selected.
 */
function subtest_initial_focus(model, setup, expect) {
  const { focusIndex: index, selection, selectFocus } = expect;

  reset({ model });
  setup();

  assertFocus({ element: before }, "Forward start");
  assertSelection(selection, "Initial selection");

  stepFocus(true, { index }, "Move onto selected item");
  if (selectFocus) {
    assertSelection([index], "Focus becomes selected");
  } else {
    assertSelection(selection, "Selection remains when focussing");
  }
  stepFocus(true, { element: after }, "Move out of widget");

  // Reverse.
  reset({ model });
  after.focus();
  setup();

  assertFocus({ element: after }, "Reverse start");
  assertSelection(selection, "Reverse start");

  stepFocus(false, { index }, "Move backward to selected item");
  if (selectFocus) {
    assertSelection([index], "Focus becomes selected");
  } else {
    assertSelection(selection, "Selection remains when focussing");
  }
  stepFocus(false, { element: before }, "Move out of widget");

  // With mouse click.
  for (const shiftKey of [false, true]) {
    for (const ctrlKey of [false, true]) {
      info(`Clicking widget: ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`);

      reset({ model });
      setup();

      assertFocus({ element: before }, "Click empty start");
      assertSelection(selection, "Click empty start");
      clickWidgetEmptySpace({ ctrlKey, shiftKey });
      assertFocus(
        { index },
        "Selected item becomes focused with click on empty"
      );
      if (selectFocus) {
        assertSelection([index], "Focus becomes selected on click on empty");
      } else {
        assertSelection(selection, "Selection remains when click on empty");
      }

      // With mouse click on item focus moves to the clicked item instead.
      for (const clickIndex of [
        (index || widget.items.length) - 1,
        index,
        index + 1,
      ]) {
        reset({ model });
        setup();

        assertFocus({ element: before }, "Click first item start");
        assertSelection(selection, "Click first item start");

        clickWidgetItem(clickIndex, { shiftKey, ctrlKey });

        if (
          (shiftKey && ctrlKey) ||
          ((shiftKey || ctrlKey) && (model == "focus" || model == "browse"))
        ) {
          // Both modifiers, or multi-selection not supported, so acts the
          // same as clicking empty.
          assertFocus(
            { index },
            "Selected item becomes focused with click on item"
          );
          if (selectFocus) {
            assertSelection([index], "Focus becomes selected on click on item");
          } else {
            assertSelection(selection, "Selection remains when click on item");
          }
        } else {
          assertFocus(
            { index: clickIndex },
            "Clicked item becomes focused with click on item"
          );
          let clickSelection;
          if (ctrlKey) {
            if (selection.includes(clickIndex)) {
              // Toggle off clicked item.
              clickSelection = selection.filter(index => index != clickIndex);
            } else {
              clickSelection = selection.concat([clickIndex]).sort();
            }
          } else if (shiftKey) {
            // Range selection is always from 0, regardless of the selection
            // before the click.
            clickSelection = range(0, clickIndex + 1);
          } else {
            clickSelection = [clickIndex];
          }
          assertSelection(clickSelection, "Selection after click on item");
        }
      }
    }
  }
}

// If the widget has a selection when we move into it, the selected item is
// focused.
add_task(function test_initial_focus() {
  for (const model of selectionModels) {
    // With no initial selection.
    subtest_initial_focus(
      model,
      () => {
        widget.addItems(0, ["First", "Second", "Third", "Fourth"]);
      },
      { focusIndex: 0, selection: [], selectFocus: true }
    );
    // With call to selectSingleItem
    subtest_initial_focus(
      model,
      () => {
        widget.addItems(0, ["First", "Second", "Third", "Fourth"]);
        widget.selectSingleItem(2);
      },
      { focusIndex: 2, selection: [2], selectFocus: false }
    );

    // Using the setItemSelected API
    if (model == "focus" || model == "browse") {
      continue;
    }

    subtest_initial_focus(
      model,
      () => {
        widget.addItems(0, ["First", "Second", "Third", "Fourth"]);
        widget.setItemSelected(2, true);
      },
      { focusIndex: 2, selection: [2], selectFocus: false }
    );

    // With multiple selected, we move focus to the first selected.
    subtest_initial_focus(
      model,
      () => {
        widget.addItems(0, ["First", "Second", "Third", "Fourth"]);
        widget.setItemSelected(2, true);
        widget.setItemSelected(1, true);
      },
      { focusIndex: 1, selection: [1, 2], selectFocus: false }
    );

    // If we use both methods.
    subtest_initial_focus(
      model,
      () => {
        widget.addItems(0, ["First", "Second", "Third", "Fourth"]);
        widget.selectSingleItem(2, true);
        widget.setItemSelected(1, true);
      },
      { focusIndex: 1, selection: [1, 2], selectFocus: false }
    );

    // If we call selectSingleItem and then unselect it, we act same as the
    // default case.
    subtest_initial_focus(
      model,
      () => {
        widget.addItems(0, ["First", "Second", "Third", "Fourth"]);
        widget.selectSingleItem(2, true);
        widget.setItemSelected(2, false);
      },
      { focusIndex: 0, selection: [], selectFocus: true }
    );
  }
});

// If selectSingleItem API method is called, we select an item and make it the
// focus.
add_task(function test_select_single_item_method() {
  function subTestSelectSingleItem(outside, index) {
    if (outside) {
      stepFocus(true, { element: after }, "Moving focus to outside widget");
    }

    widget.selectSingleItem(index);
    assertSelection([index], "Item becomes selected after call");

    if (outside) {
      assertFocus({ element: after }, "Focus remains outside the widget");
      // Return.
      stepFocus(false, { index }, "Focus moves to selected item on return");
      assertSelection([index], "Item remains selected on return");
    } else {
      assertFocus({ index }, "Focus force moved to selected item");
    }
  }

  for (const model of selectionModels) {
    reset({ model });
    widget.addItems(0, ["First", "Second", "Third", "Fourth"]);

    stepFocus(true, { index: 0 }, "Move onto first item");

    for (const outside of [false, true]) {
      info(`Testing selecting item${outside ? " with focus outside" : ""}`);

      EventUtils.synthesizeKey("KEY_Home", {}, win);
      assertFocus({ index: 0 }, "Focus initially on first item");
      assertSelection([0], "Initial selection on first item");

      subTestSelectSingleItem(outside, 1);
      // Selecting again.
      subTestSelectSingleItem(outside, 1);

      if (model == "focus") {
        continue;
      }

      // Split focus from selection
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Third item has focus");
      assertSelection([1], "Second item remains selected");

      // Select focused item.
      subTestSelectSingleItem(outside, 2);

      // Split again.
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus({ index: 1 }, "Second item has focus");
      assertSelection([2], "Third item remains selected");

      // Selecting selected item will still move focus.
      subTestSelectSingleItem(outside, 2);

      // Split again.
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus({ index: 0 }, "First item has focus");
      assertSelection([2], "Third item remains selected");

      // Select neither focused nor selected.
      subTestSelectSingleItem(outside, 1);
    }

    // With mouse click to focus.
    for (const shiftKey of [false, true]) {
      for (const ctrlKey of [false, true]) {
        info(`Clicking widget: ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`);

        reset({ model });
        widget.addItems(0, ["First", "Second", "Third"]);
        stepFocus(true, { index: 0 }, "Move onto first item");
        assertSelection([0], "First item becomes selected");

        // Move focus outside widget.
        stepFocus(true, { element: after }, "Move focus outside");

        // Select an item.
        widget.selectSingleItem(1);

        // Click empty space will focus the selected item.
        clickWidgetEmptySpace({});
        assertFocus(
          { index: 1 },
          "Selected item becomes focused with click on empty"
        );
        assertSelection(
          [1],
          "Second item remains selected with click on empty"
        );

        // With mouse click on selected item.
        stepFocus(false, { element: before }, "Move focus outside");
        widget.selectSingleItem(2);

        clickWidgetItem(2, { shiftKey, ctrlKey });
        assertFocus(
          { index: 2 },
          "Selected item becomes focused with click on selected"
        );
        if (ctrlKey && !shiftKey && model == "browse-multi") {
          assertSelection(
            [],
            "Item becomes unselected with Ctrl+click on selected"
          );
        } else {
          // NOTE: Shift+Click will select from the item to itself.
          assertSelection(
            [2],
            "Selected item remains selected with click on selected"
          );
        }

        // With mouse click on non-selected item.
        stepFocus(false, { element: before }, "Move focus outside");
        widget.selectSingleItem(1);

        clickWidgetItem(2, { shiftKey, ctrlKey });
        if (
          (shiftKey && ctrlKey) ||
          ((shiftKey || ctrlKey) && (model == "focus" || model == "browse"))
        ) {
          // Both modifiers, or multi-selection not supported, so acts the
          // same as clicking empty.
          assertFocus(
            { index: 1 },
            "Selected item becomes focused with click on item"
          );
          assertSelection(
            [1],
            "Selected item remains selected with click on item"
          );
        } else {
          assertFocus(
            { index: 2 },
            "Third item becomes focused with click on item"
          );
          if (ctrlKey) {
            assertSelection(
              [1, 2],
              "Third item becomes selected with Ctrl+click"
            );
          } else if (shiftKey) {
            assertSelection(
              [1, 2],
              "Second to third item become selected with Shift+click"
            );
          } else {
            assertSelection(
              [2],
              "Third item becomes selected with click on item"
            );
          }
        }
      }
    }
  }
});

// If setItemSelected API method is called, we set the selection state of an
// item but do not change anything else.
add_task(function test_set_item_selected_method() {
  for (const model of selectionModels) {
    reset({ model });
    widget.addItems(0, ["First", "Second", "Third", "Fourth", "Fifth"]);
    stepFocus(true, { index: 0 }, "Initial focus on first item");
    assertSelection([0], "Initial selection on first item");

    if (model == "focus" || model == "browse") {
      // This method always throws.
      Assert.throws(
        () => widget.setItemSelected(2, true),
        /Widget does not support multi-selection/
      );
      // Even if it would not change the single selection state.
      Assert.throws(
        () => widget.setItemSelected(2, false),
        /Widget does not support multi-selection/
      );
      Assert.throws(
        () => widget.setItemSelected(0, true),
        /Widget does not support multi-selection/
      );
      continue;
    }

    // Can select.
    widget.setItemSelected(2, true);
    assertFocus({ index: 0 }, "Same focus");
    assertSelection([0, 2], "Item 2 becomes selected");

    // And unselect.
    widget.setItemSelected(0, false);
    assertFocus({ index: 0 }, "Same focus");
    assertSelection([2], "Item 0 is unselected");

    // Does nothing extra if already selected/unselected.
    widget.setItemSelected(2, true);
    assertFocus({ index: 0 }, "Same focus");
    assertSelection([2], "Same selected");

    widget.setItemSelected(0, false);
    assertFocus({ index: 0 }, "Same focus");
    assertSelection([2], "Same selected");

    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);

    // Select the focused item.
    assertFocus({ index: 3 }, "Focus on item 3");
    assertSelection([2], "Same selected");

    widget.setItemSelected(3, true);
    assertFocus({ index: 3 }, "Same focus");
    assertSelection([2, 3], "Item 3 selected");

    widget.setItemSelected(2, false);
    assertFocus({ index: 3 }, "Same focus");
    assertSelection([3], "Item 2 unselected");

    // Can select none this way.
    widget.setItemSelected(3, false);
    assertFocus({ index: 3 }, "Same focus");
    assertSelection([], "None selected");
  }
});

/**
 * Test navigation for the given direction.
 *
 * @param {string} model - The selection model to use.
 * @param {string} direction - The layout direction of the widget.
 * @param {object} keys - Navigation keys.
 * @param {string} keys.forward - The key to move forward.
 * @param {string} keys.backward - The key to move backward.
 */
function subtest_keyboard_navigation(model, direction, keys) {
  const { forward: forwardKey, backward: backwardKey } = keys;
  reset({ model, direction });
  widget.addItems(0, ["First", "Second", "Third"]);

  stepFocus(true, { index: 0 }, "Initially on first item");

  // Without Ctrl, selection follows focus.

  // Forward.
  EventUtils.synthesizeKey(forwardKey, {}, win);
  assertFocus({ index: 1 }, "Forward to second item");
  assertSelection([1], "Second item becomes selected on focus");
  EventUtils.synthesizeKey(forwardKey, {}, win);
  assertFocus({ index: 2 }, "Forward to third item");
  assertSelection([2], "Third item becomes selected on focus");
  EventUtils.synthesizeKey(forwardKey, {}, win);
  assertFocus({ index: 2 }, "Forward at end remains on third item");
  assertSelection([2], "Third item remains selected");

  // Backward.
  EventUtils.synthesizeKey(backwardKey, {}, win);
  assertFocus({ index: 1 }, "Backward to second item");
  assertSelection([1], "Second item becomes selected on focus");
  EventUtils.synthesizeKey(backwardKey, {}, win);
  assertFocus({ index: 0 }, "Backward to first item");
  assertSelection([0], "First item becomes selected on focus");
  EventUtils.synthesizeKey(backwardKey, {}, win);
  assertFocus({ index: 0 }, "Backward at end remains on first item");
  assertSelection([0], "First item remains selected");

  // End.
  EventUtils.synthesizeKey("KEY_End", {}, win);
  assertFocus({ index: 2 }, "Third becomes focused on End");
  assertSelection([2], "Third becomes selected on End");
  // Move to middle.
  EventUtils.synthesizeKey(backwardKey, {}, win);
  EventUtils.synthesizeKey("KEY_End", {}, win);
  assertFocus({ index: 2 }, "Third becomes focused on End from second");
  assertSelection([2], "Third becomes selected on End from second");
  EventUtils.synthesizeKey("KEY_End", {}, win);
  assertFocus({ index: 2 }, "Third remains focused on End from third");
  assertSelection([2], "Third becomes selected on End from third");

  // Home.
  EventUtils.synthesizeKey("KEY_Home", {}, win);
  assertFocus({ index: 0 }, "First becomes focused on Home");
  assertSelection([0], "First becomes selected on Home");
  // Move to middle.
  EventUtils.synthesizeKey(forwardKey, {}, win);
  EventUtils.synthesizeKey("KEY_Home", {}, win);
  assertFocus({ index: 0 }, "First becomes focused on Home from second");
  assertSelection([0], "First becomes selected on Home from second");
  EventUtils.synthesizeKey("KEY_Home", {}, win);
  assertFocus({ index: 0 }, "First remains focused on Home from first");
  assertSelection([0], "First becomes selected on Home from first");

  // With Ctrl key, selection does not follow focus.
  if (model == "focus") {
    // Disabled in "focus" model.
    // Move to middle item.
    EventUtils.synthesizeKey(forwardKey, {}, win);
    assertFocus({ index: 1 }, "Second item is focused");
    assertFocus({ index: 1 }, "Second item is selected");

    for (const key of [backwardKey, forwardKey, "KEY_Home", "KEY_End"]) {
      for (const shiftKey of [false, true]) {
        info(
          `Pressing Ctrl+${
            shiftKey ? "Shift+" : ""
          }${key} on "focus" model widget`
        );
        EventUtils.synthesizeKey(key, { ctrlKey: true, shiftKey }, win);
        assertFocus({ index: 1 }, "Second item is still focused");
        assertSelection([1], "Second item is still selected");
      }
    }
  } else {
    EventUtils.synthesizeKey(forwardKey, { ctrlKey: true }, win);
    assertFocus({ index: 1 }, "Ctrl+Forward to second item");
    assertSelection([0], "First item remains selected on Ctrl+Forward");

    EventUtils.synthesizeKey(forwardKey, { ctrlKey: true }, win);
    assertFocus({ index: 2 }, "Ctrl+Forward to third item");
    assertSelection([0], "First item remains selected on Ctrl+Forward");

    EventUtils.synthesizeKey(backwardKey, { ctrlKey: true }, win);
    assertFocus({ index: 1 }, "Ctrl+Backward to second item");
    assertSelection([0], "First item remains selected on Ctrl+Backward");

    EventUtils.synthesizeKey(backwardKey, { ctrlKey: true }, win);
    assertFocus({ index: 0 }, "Ctrl+Backward to first item");
    assertSelection([0], "First item remains selected on Ctrl+Backward");

    EventUtils.synthesizeKey("KEY_End", { ctrlKey: true }, win);
    assertFocus({ index: 2 }, "Ctrl+End to third item");
    assertSelection([0], "First item remains selected on Ctrl+End");

    EventUtils.synthesizeKey(backwardKey, {}, win);
    assertFocus({ index: 1 }, "Backward to second item");
    assertSelection([1], "Selection moves with focus when not pressing Ctrl");

    EventUtils.synthesizeKey("KEY_Home", { ctrlKey: true }, win);
    assertFocus({ index: 0 }, "Ctrl+Home to first item");
    assertSelection([1], "Second item remains selected on Ctrl+Home");

    // Does nothing if combined with Shift.
    for (const key of [backwardKey, forwardKey, "KEY_Home", "KEY_End"]) {
      info(`Pressing Ctrl+Shift+${key} on "${model}" model widget`);
      EventUtils.synthesizeKey(key, { ctrlKey: true, shiftKey: true }, win);
      assertFocus({ index: 0 }, "First item is still focused");
      assertSelection([1], "Second item is still selected");
    }

    // Even if focus remains the same, the selection is still updated if we
    // don't press Ctrl.
    EventUtils.synthesizeKey(backwardKey, {}, win);
    assertFocus({ index: 0 }, "Focus remains on first item");
    assertSelection(
      [0],
      "Selection moves to the first item since Ctrl was not pressed"
    );
  }
}

// Navigating with keyboard will move focus, and possibly selection.
add_task(function test_keyboard_navigation() {
  for (const model of selectionModels) {
    subtest_keyboard_navigation(model, "top-to-bottom", {
      forward: "KEY_ArrowDown",
      backward: "KEY_ArrowUp",
    });
    subtest_keyboard_navigation(model, "right-to-left", {
      forward: "KEY_ArrowLeft",
      backward: "KEY_ArrowRight",
    });
    subtest_keyboard_navigation(model, "left-to-right", {
      forward: "KEY_ArrowRight",
      backward: "KEY_ArrowLeft",
    });
  }
});

/**
 * A method to scroll the widget.
 *
 * @callback ScrollMethod
 * @param {number} pos - The position/offset to scroll to.
 */
/**
 * The position of an element, relative to the layout of the widget.
 *
 * @typedef {object} StartEndPositions
 * @property {number} start - The starting position of the element in the
 *   direction of the widget's layout. The value should be a pixel offset
 *   from some fixed point, such that a higher value indicates an element
 *   further from the start of the widget.
 * @property {number} end - The ending position of the element in the
 *   direction of the widget's layout. This should use the same fixed point
 *   as the start.
 * @property {number} xStart - An X position in the client coordinates that
 *   points to the inside of the element, close to the starting corner. I.e.
 *   the block-start and inline-start.
 * @property {number} yStart - A Y position in the client coordinates that
 *   points to the inside of the element, close to the starting corner.
 * @property {number} xEnd - An X position in the client coordinates that
 *   points to the inside of the element, close to the ending corner. I.e.
 *   the block-end and inline-end.
 * @property {number} yEnd - A Y position in the client coordinates that
 *   points to the inside of the element, close to the ending corner.
 */
/**
 * A method to return the starting and ending positions of the bounding
 * client rectangle of an element.
 *
 * @callback GetStartEndMethod
 * @param {DOMRect} rect - The rectangle to get the positions of.
 * @returns {object} positions
/**
 * Test page navigation for the given direction.
 *
 * @param {string} model - The selection model to use on the widget.
 * @param {string} direction - The direction of the widget layout.
 * @param {object} details - Details about the direction.
 * @param {string} details.sizeName - The CSS style name that controls the
 *   widget size in the direction of widget layout.
 * @param {string} details.forwardKey - The key to press to move forward one
 *   item.
 * @param {string} details.backwardKey - The key to press to move backward
 *   one item.
 * @param {ScrollMethod} details.scrollTo - A method to call to scroll the
 *   widget.
 * @param {GetStartEndMethod} details.getStartEnd - A method to get the
 *   positioning of an element.
 */
function subtest_page_navigation(model, direction, details) {
  const { sizeName, forwardKey, backwardKey, scrollTo, getStartEnd } = details;
  function getStartEndBoundary(element) {
    return getStartEnd(element.getBoundingClientRect());
  }
  function assertInView(expect, msg) {
    let { first, firstClipped, last, lastClipped } = expect;
    if (!firstClipped) {
      firstClipped = 0;
    }
    if (!lastClipped) {
      lastClipped = 0;
    }
    let { start: viewStart, end: viewEnd } = getStartEndBoundary(widget);
    // The widget has a 1px border that should not contribute to the view
    // size.
    viewStart += 1;
    viewEnd -= 1;
    const firstStart = getStartEndBoundary(
      widget.items[expect.first].element
    ).start;
    Assert.equal(
      firstStart,
      viewStart - firstClipped,
      `Item ${first} should be at the start of the view (${viewStart}) clipped by ${firstClipped}: ${msg}`
    );
    if (expect.first > 0) {
      Assert.lessOrEqual(
        getStartEndBoundary(widget.items[expect.first - 1].element).end,
        viewStart,
        `Item ${expect.first - 1} should be out of view: ${msg}`
      );
    }
    const lastEnd = getStartEndBoundary(widget.items[expect.last].element).end;
    Assert.equal(
      lastEnd,
      viewEnd + lastClipped,
      `Item ${last} should be at the end of the view (${viewEnd}) clipped by ${lastClipped}: ${msg}`
    );
    if (expect.last < widget.items.length - 1) {
      Assert.greaterOrEqual(
        getStartEndBoundary(widget.items[expect.last + 1].element).start,
        viewEnd,
        `Item ${expect.last + 1} should be out of view: ${msg}`
      );
    }
  }
  reset({ model, direction });
  widget.addItems(
    0,
    range(0, 70).map(i => `add-${i}`)
  );
  const { start: itemStart, end: itemEnd } = getStartEndBoundary(
    widget.items[0].element
  );
  Assert.equal(itemEnd - itemStart, 30, "Expected item size");

  assertInView({ first: 0, last: 19 }, "First 20 items in view");
  stepFocus(true, { index: 0 }, "Move into widget");
  assertSelection([0], "Fist item selected");
  assertInView({ first: 0, last: 19 }, "First 20 items still in view");

  // PageDown goes to the end of the current page.
  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  assertInView({ first: 0, last: 19 }, "First 20 item still in view");
  assertFocus({ index: 19 }, "Focus moves to end of the page");
  assertSelection([19], "Selection at end of the page");

  // Pressing forward key will scroll the next item into view.
  EventUtils.synthesizeKey(forwardKey, {}, win);
  assertInView({ first: 1, last: 20 }, "Items 1 to 20 in view");
  assertFocus({ index: 20 }, "Focus at end of the page");
  assertSelection([20], "Selection at end of the page");

  // Pressing backward will not change the view.
  EventUtils.synthesizeKey(backwardKey, {}, win);
  assertInView({ first: 1, last: 20 }, "Items 1 to 20 still in view");
  assertFocus({ index: 19 }, "Focus moves up to 19");
  assertSelection([19], "Selection moves up to 19");

  // PageDown goes to the end of the current page.
  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  assertInView({ first: 1, last: 20 }, "Items 1 to 20 still in view");
  assertFocus({ index: 20 }, "Focus moves to end of page");
  assertSelection([20], "Selection moves to end of page");

  // PageDown when already at the end of the page will move to the next
  // page.
  // The last index from the previous page (20) should still be visible at
  // the top.
  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  assertInView({ first: 20, last: 39 }, "Items 20 to 39 in view");
  assertFocus({ index: 39 }, "Focus moves to end of new page");
  assertSelection([39], "Selection moves to end of new page");

  // Another PageDown will do the same.
  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  assertInView({ first: 39, last: 58 }, "Items 39 to 58 in view");
  assertFocus({ index: 58 }, "Focus moves to end of new page");
  assertSelection([58], "Selection moves to end of new page");

  // Last PageDown will take us to the end.
  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  assertInView({ first: 50, last: 69 }, "Last 20 items in view");
  assertFocus({ index: 69 }, "Focus moves to end");
  assertSelection([69], "Selection moves to end");

  // Same thing in reverse with PageUp.
  // PageUp goes to the start of the current page.
  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  assertInView({ first: 50, last: 69 }, "Last 20 item still in view");
  assertFocus({ index: 50 }, "Focus moves to start of the page");
  assertSelection([50], "Selection at end of the page");

  // Pressing backward will scroll the previous item into view.
  EventUtils.synthesizeKey(backwardKey, {}, win);
  assertInView({ first: 49, last: 68 }, "Items 49 to 68 in view");
  assertFocus({ index: 49 }, "Focus at start of the page");
  assertSelection([49], "Selection at start of the page");

  // Pressing forward will not change the view.
  EventUtils.synthesizeKey(forwardKey, {}, win);
  assertInView({ first: 49, last: 68 }, "Items 49 to 68 still in view");
  assertFocus({ index: 50 }, "Focus moves up to 50");
  assertSelection([50], "Selection moves up to 50");

  // PageUp goes to the start of the current page.
  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  assertInView({ first: 49, last: 68 }, "Items 49 to 68 still in view");
  assertFocus({ index: 49 }, "Focus moves to start of page");
  assertSelection([49], "Selection moves to start of page");

  // PageUp when already at the start of the page will move one page up.
  // The first index from the previously shown page (49) should still be
  // visible at the bottom.
  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  assertInView({ first: 30, last: 49 }, "Items 30 to 49 in view");
  assertFocus({ index: 30 }, "Focus moves to start of new page");
  assertSelection([30], "Selection moves to start of new page");

  // Another PageUp will do the same.
  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  assertInView({ first: 11, last: 30 }, "Items 11 to 30 in view");
  assertFocus({ index: 11 }, "Focus moves to start of new page");
  assertSelection([11], "Selection moves to start of new page");

  // Last PageUp will take us to the start.
  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  assertInView({ first: 0, last: 19 }, "Items 0 to 19 in view");
  assertFocus({ index: 0 }, "Focus moves to start");
  assertSelection([0], "Selection moves to start");

  // PageDown with focus above the view. Focus should move to the end of the
  // visible page.
  scrollTo(120);
  assertInView({ first: 4, last: 23 }, "Items 4 to 23 in view");
  assertFocus({ index: 0 }, "Focus remains above the view");
  assertSelection([0], "Selection remains above the view");

  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  assertInView({ first: 4, last: 23 }, "Same items in view");
  assertFocus({ index: 23 }, "Focus moves to the end of the visible page");
  assertSelection([23], "Selection moves to the end of the visible page");

  // PageDown with focus below the view. Focus should shift by one page,
  // with the previous focus at the top of the page.
  scrollTo(60);
  assertInView({ first: 2, last: 21 }, "Items 2 to 21 in view");
  assertFocus({ index: 23 }, "Focus remains below the view");
  assertSelection([23], "Selection remains below the view");

  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  assertInView(
    { first: 23, last: 42 },
    "View shifts by a page relative to focus"
  );
  assertFocus({ index: 42 }, "Focus moves to end of new page");
  assertSelection([42], "Selection moves to end of new page");

  // PageUp with focus below the view. Focus should move to the start of the
  // visible page.
  scrollTo(630);
  assertInView({ first: 21, last: 40 }, "Items 21 to 40 in view");
  assertFocus({ index: 42 }, "Focus remains below the view");
  assertSelection([42], "Selection remains below the view");

  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  assertInView({ first: 21, last: 40 }, "Same items in view");
  assertFocus({ index: 21 }, "Focus moves to the start of the visible page");
  assertSelection([21], "Selection moves to the start of the visible page");

  // PageUp with focus above the view. Focus should shift by one page, with
  // the previous focus at the bottom of the page.
  scrollTo(750);
  assertInView({ first: 25, last: 44 }, "Items 25 to 44 in view");
  assertFocus({ index: 21 }, "Focus remains above the view");
  assertSelection([21], "Selection remains above the view");

  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  assertInView(
    { first: 2, last: 21 },
    "View shifts by a page relative to focus"
  );
  assertFocus({ index: 2 }, "Focus moves to start of new page");
  assertSelection([2], "Selection moves to start of new page");

  // Test when view does not exactly fit items.
  for (const sizeDiff of [0, 10, 15, 20]) {
    info(`Reducing widget size by ${sizeDiff}px`);
    widget.style[sizeName] = `${600 - sizeDiff}px`;

    // When we reduce the size of the view by half an item or more, we
    // reduce the page size from 20 to 19.
    // NOTE: At each sizeDiff still fits strictly more than 19 items in its
    // view.
    const pageSize = sizeDiff < 15 ? 20 : 19;

    // Make sure that Home and End keys scroll the view and clip the items
    // as expected.
    EventUtils.synthesizeKey("KEY_Home", {}, win);
    assertInView(
      { first: 0, last: 19, lastClipped: sizeDiff },
      `Start of view with last item clipped by ${sizeDiff}px`
    );
    assertFocus({ index: 0 }, "First item has focus");
    assertSelection([0], "First item is selected");

    EventUtils.synthesizeKey("KEY_End", {}, win);
    assertInView(
      { first: 50, firstClipped: sizeDiff, last: 69 },
      `End of view with first item clipped by ${sizeDiff}px`
    );
    assertFocus({ index: 69 }, "Last item has focus");
    assertSelection([69], "Last item is selected");

    for (const lastClipped of [0, 10, 15, 20]) {
      info(`Testing PageDown with last item clipped by ${lastClipped}px`);
      // Across all sizeDiff and lastClipped values we still want the last
      // item to be index 21 clipped by lastClipped.
      // E.g. when sizeDiff is 10 and lastClipped is 10, then the scroll
      // will be 60px and the first item will be index 2 with no clipping.
      // But when the sizeDiff is 10 and the lastClipped is 20, then the
      // scroll will be 50px and the first item will be index 1 with 20px
      // clipping.
      const scroll = 60 + sizeDiff - lastClipped;
      scrollTo(scroll);
      let first = Math.floor(scroll / 30);
      let firstClipped = scroll % 30;
      clickWidgetItem(3, {});
      assertInView(
        { first, firstClipped, last: 21, lastClipped },
        `Last item 21 in view clipped by ${lastClipped}px`
      );
      assertFocus({ index: 3 }, "Focus on item 3");
      assertSelection([3], "Selection on item 3");

      EventUtils.synthesizeKey("KEY_PageDown", {}, win);
      let pageEnd;
      if (lastClipped < 15) {
        // The last item is more than half in view, so counts as part of the
        // page.
        // NOTE: Index of the first item is always "2", even if it was "1"
        // before the scroll, because the view fits (19, 20] items.
        assertInView(
          { first: 2, firstClipped: sizeDiff, last: 21 },
          "Scrolls down to fully include the last item 21"
        );
        pageEnd = 21;
      } else {
        // The last item is half or less in view, so only the one before it
        // counts as being part of the page.
        assertInView(
          { first, firstClipped, last: 21, lastClipped },
          "Same view"
        );
        pageEnd = 20;
      }
      assertFocus({ index: pageEnd }, "Focus moves to pageEnd");
      assertSelection([pageEnd], "Selection moves to pageEnd");

      // Reset scroll to test scrolling when the focus is already at the
      // pageEnd.
      scrollTo(scroll);
      assertInView(
        { first, firstClipped, last: 21, lastClipped },
        `Last item 21 in view clipped by ${lastClipped}px`
      );

      // PageDown again will move by a page. The new end of the page will be
      // scrolled just into view at the bottom.
      EventUtils.synthesizeKey("KEY_PageDown", {}, win);
      const newPageEnd = pageEnd + pageSize - 1;
      // NOTE: If the previous pageEnd would fit mostly in view, then we
      // expect the first item in the view to be this item. Otherwise, we
      // expect it to be the one before, which will ensure the previous
      // pageEnd is fully visible.
      firstClipped = sizeDiff;
      first = sizeDiff < 15 ? pageEnd : pageEnd - 1;
      assertInView(
        { first, firstClipped, last: newPageEnd },
        "New page end scrolled into view, previous page end mostly visible"
      );
      assertFocus({ index: newPageEnd }, "Focus moves to end of new page");
      assertSelection([newPageEnd], "Selection moves to end of new page");

      // PageUp reverses the focus.
      // We don't test the the view since that is handled lower down.
      EventUtils.synthesizeKey("KEY_PageUp", {}, win);
      assertFocus({ index: pageEnd }, "Focus returns to pageEnd");
      assertSelection([pageEnd], "Selection returns to pageEnd");
    }

    for (const firstClipped of [0, 10, 15, 20]) {
      // Across all sizeDiff and firstClipped values we still want the first
      // item to be index 24 clipped by firstClipped.
      // E.g. when sizeDiff is 10 and firstClipped is 10, then the scroll
      // will be 730px and the last item will be index 44 with no clipping.
      // But when the sizeDiff is 10 and the firstClipped is 0, then the
      // scroll will be 720px and the last item will be index 43 with 10px
      // clipping.
      info(`Testing PageUp with first item clipped by ${firstClipped}px`);
      scrollTo(720 + firstClipped);
      const viewEnd = 720 + firstClipped + 600 - sizeDiff;
      let last = Math.floor(viewEnd / 30);
      let lastClipped = 30 - (viewEnd % 30);
      clickWidgetItem(42, {});
      assertInView(
        { first: 24, firstClipped, last, lastClipped },
        `First item 24 in view clipped by ${firstClipped}px`
      );
      assertFocus({ index: 42 }, "Focus on item 42");
      assertSelection([42], "Selection on item 42");

      EventUtils.synthesizeKey("KEY_PageUp", {}, win);
      let pageStart;
      if (firstClipped < 15) {
        // The first item is more than half in view, so counts as part of
        // the page.
        // NOTE: Index of the last item is always "43", even if it was "44"
        // before the scroll, because the view fits (19, 20] items.
        assertInView(
          { first: 24, last: 43, lastClipped: sizeDiff },
          "Scrolls up to fully include the first item 24"
        );
        pageStart = 24;
      } else {
        // The first item is half or less in view, so only the one after it
        // counts as being part of the page.
        assertInView(
          { first: 24, firstClipped, last, lastClipped },
          "Same view"
        );
        pageStart = 25;
      }
      assertFocus({ index: pageStart }, "Focus moves to pageStart");
      assertSelection([pageStart], "Selection moves to pageStart");

      // Reset scroll.
      scrollTo(720 + firstClipped);
      assertInView(
        { first: 24, firstClipped, last, lastClipped },
        `First item 24 in view clipped by ${firstClipped}px`
      );

      // PageUp again will move by a page. The new start of the page will be
      // scrolled just into view at the top.
      EventUtils.synthesizeKey("KEY_PageUp", {}, win);
      const newPageStart = pageStart - pageSize + 1;
      // NOTE: If the previous pageStart would fit mostly in view, then we
      // expect the last item in the view to be this item. Otherwise, we
      // expect it to be the one after, which will ensure the previous
      // pageStart is fully visible.
      lastClipped = sizeDiff;
      last = sizeDiff < 15 ? pageStart : pageStart + 1;
      assertInView(
        { first: newPageStart, last, lastClipped },
        "New page end scrolled into view, previous page end mostly visible"
      );
      assertFocus({ index: newPageStart }, "Focus moves to start of new page");
      assertSelection([newPageStart], "Selection moves to start of new page");

      // PageDown reverses the focus.
      // We don't test the the view since that is handled further up.
      EventUtils.synthesizeKey("KEY_PageDown", {}, win);
      assertFocus({ index: pageStart }, "Focus returns to pageStart");
      assertSelection([pageStart], "Selection returns to pageStart");
    }
  }

  // When widget only fits 1 visible item or less.
  for (const size of [10, 20, 30, 45, 50]) {
    info(`Resizing widget to ${size}px`);
    widget.style[sizeName] = `${size}px`;

    scrollTo(600);
    // When the view size is less than the size of an item, we cannot always
    // click the center of the item, so we need to click the start instead.
    const { xStart, yStart } = getStartEndBoundary(widget.items[20].element);
    EventUtils.synthesizeMouseAtPoint(xStart, yStart, {}, win);
    const last = size > 30 ? 21 : 20;
    const lastClipped = size > 30 ? 60 - size : 30 - size;
    assertInView({ first: 20, last, lastClipped }, "Small number of items");
    assertFocus({ index: 20 }, "Focus on item 20");
    assertSelection([20], "Item 20 selected");

    EventUtils.synthesizeKey("KEY_PageDown", {}, win);
    if (size <= 45) {
      // Only 1 or 0 items fit on the page, so does nothing.
      assertInView({ first: 20, last, lastClipped }, "Same view");
      assertFocus({ index: 20 }, "Same focus");
      assertSelection([20], "Same selected");
    } else {
      // 2 items fit visibly on the page, so acts as normal.
      assertInView(
        { first: 20, firstClipped: lastClipped, last: 21 },
        "Last item scrolled into view"
      );
      assertFocus({ index: 21 }, "Focus increases by one");
      assertSelection([21], "Selected moves to focus");
    }

    scrollTo(660 - size);
    const { xEnd, yEnd } = getStartEndBoundary(widget.items[21].element);
    EventUtils.synthesizeMouseAtPoint(xEnd, yEnd, {}, win);
    const first = size > 30 ? 20 : 21;
    const firstClipped = size > 30 ? 60 - size : 30 - size;
    assertInView({ first, firstClipped, last: 21 }, "Small number of items");
    assertFocus({ index: 21 }, "Focus on item 21");
    assertSelection([21], "Item 21 selected");

    EventUtils.synthesizeKey("KEY_PageUp", {}, win);
    if (size <= 45) {
      // Only 1 or 0 items fit on the page, so does nothing.
      assertInView({ first, firstClipped, last: 21 }, "Same view");
      assertFocus({ index: 21 }, "Same focus");
      assertSelection([21], "Same selected");
    } else {
      // 2 items fit visibly on the page, so acts as normal.
      assertInView(
        { first: 20, last: 21, lastClipped: firstClipped },
        "First item scrolled into view"
      );
      assertFocus({ index: 20 }, "Focus decreases by one");
      assertSelection([20], "Selected moves to focus");
    }
  }
  widget.style[sizeName] = null;

  // Disable page navigation.
  // This would be used when the item sizes or the page layout do not allow
  // for page navigation, or if PageUp and PageDown should be used for something
  // else.
  widget.toggleAttribute("no-pages", true);

  let gotKeys = [];
  const keydownListener = event => {
    gotKeys.push(event.key);
  };
  win.document.body.addEventListener("keydown", keydownListener);
  scrollTo(600);
  clickWidgetItem(20, {});
  assertInView({ first: 20, last: 39 }, "Items 20 to 39 in view");
  assertFocus({ index: 20 }, "First item focused");
  assertSelection([20], "First item selected");

  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  assertInView({ first: 20, last: 39 }, "Same view");
  assertFocus({ index: 20 }, "Same focus");
  assertSelection([20], "Same selected");
  Assert.deepEqual(gotKeys, ["PageUp"], "PageUp reaches document body");
  gotKeys = [];
  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  assertInView({ first: 20, last: 39 }, "Same view");
  assertFocus({ index: 20 }, "Same focus");
  assertSelection([20], "Same selected");
  Assert.deepEqual(gotKeys, ["PageDown"], "PageDown reaches document body");
  gotKeys = [];

  clickWidgetItem(39, {});
  assertInView({ first: 20, last: 39 }, "Items 20 to 39 in view");
  assertFocus({ index: 39 }, "Last item focused");
  assertSelection([39], "Last item selected");

  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  assertInView({ first: 20, last: 39 }, "Same view");
  assertFocus({ index: 39 }, "Same focus");
  assertSelection([39], "Same selected");
  Assert.deepEqual(gotKeys, ["PageUp"], "PageUp reaches document body");
  gotKeys = [];
  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  assertInView({ first: 20, last: 39 }, "Same view");
  assertFocus({ index: 39 }, "Same focus");
  assertSelection([39], "Same selected");
  Assert.deepEqual(gotKeys, ["PageDown"], "PageDown reaches document body");
  gotKeys = [];

  widget.removeAttribute("no-pages");

  // With page navigation enabled key-presses do not reach the document body.
  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  Assert.deepEqual(gotKeys, [], "No key reaches document body");
  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  Assert.deepEqual(gotKeys, [], "No key reaches document body");

  win.document.body.removeEventListener("keydown", keydownListener);

  // Test with modifiers.
  for (const { shiftKey, ctrlKey } of [
    { shiftKey: true, ctrlKey: true },
    { shiftKey: false, ctrlKey: true },
    { shiftKey: true, ctrlKey: false },
  ]) {
    info(
      `Pressing ${ctrlKey ? "Ctrl+" : ""}${shiftKey ? "Shift+" : ""}PageUp/Down`
    );
    EventUtils.synthesizeKey("KEY_Home", {}, win);
    EventUtils.synthesizeKey(forwardKey, {}, win);
    assertInView({ first: 0, last: 19 }, "First 20 items in view");
    assertFocus({ index: 1 }, "Item 1 has focus");
    assertSelection([1], "Item 1 is selected");

    EventUtils.synthesizeKey("KEY_PageDown", { ctrlKey, shiftKey }, win);
    assertInView({ first: 0, last: 19 }, "Same view");
    if (
      (ctrlKey && shiftKey) ||
      model == "focus" ||
      (model == "browse" && shiftKey)
    ) {
      // Does nothing.
      assertFocus({ index: 1 }, "Same focus");
      assertSelection([1], "Same selected");
      // Move focus to the end of the view.
      clickWidgetItem(19, {});
      assertFocus({ index: 19 }, "Focus at end of page");
      assertSelection([19], "Selected at end of page");
    } else {
      assertFocus({ index: 19 }, "Focus moves to end of page");
      if (ctrlKey) {
        // Splits focus from selected.
        assertSelection([1], "Same selected");
      } else {
        assertSelection(range(1, 19), "Range selection from 1 to 19");
      }
    }
    // And again, with focus at the end of the page.
    EventUtils.synthesizeKey("KEY_PageDown", { ctrlKey, shiftKey }, win);
    if (
      (ctrlKey && shiftKey) ||
      model == "focus" ||
      (model == "browse" && shiftKey)
    ) {
      // Does nothing.
      assertInView({ first: 0, last: 19 }, "Same view");
      assertFocus({ index: 19 }, "Same focus");
      assertSelection([19], "Same selected");
    } else {
      assertInView({ first: 19, last: 38 }, "View scrolls to focus");
      assertFocus({ index: 38 }, "Focus moves to end of new page");
      if (ctrlKey) {
        // Splits focus from selected.
        assertSelection([1], "Same selected");
      } else {
        assertSelection(range(1, 38), "Range selection from 1 to 38");
      }
    }

    EventUtils.synthesizeKey("KEY_End", {}, win);
    EventUtils.synthesizeKey(backwardKey, {}, win);
    assertInView({ first: 50, last: 69 }, "Last 20 items in view");
    assertFocus({ index: 68 }, "Item 68 has focus");
    assertSelection([68], "Item 68 is selected");

    EventUtils.synthesizeKey("KEY_PageUp", { ctrlKey, shiftKey }, win);
    assertInView({ first: 50, last: 69 }, "Same view");
    if (
      (ctrlKey && shiftKey) ||
      model == "focus" ||
      (model == "browse" && shiftKey)
    ) {
      // Does nothing.
      assertFocus({ index: 68 }, "Same focus");
      assertSelection([68], "Same selected");
      // Move focus to the end of the view.
      clickWidgetItem(50, {});
      assertFocus({ index: 50 }, "Focus at start of page");
      assertSelection([50], "Selected at start of page");
    } else {
      assertFocus({ index: 50 }, "Focus moves to start of page");
      if (ctrlKey) {
        // Splits focus from selected.
        assertSelection([68], "Same selected");
      } else {
        assertSelection(range(50, 19), "Range selection from 50 to 68");
      }
    }
    // And again, with focus at the start of the page.
    EventUtils.synthesizeKey("KEY_PageUp", { ctrlKey, shiftKey }, win);
    if (
      (ctrlKey && shiftKey) ||
      model == "focus" ||
      (model == "browse" && shiftKey)
    ) {
      // Does nothing.
      assertInView({ first: 50, last: 69 }, "Same view");
      assertFocus({ index: 50 }, "Same focus");
      assertSelection([50], "Same selected");
    } else {
      assertInView({ first: 31, last: 50 }, "View scrolls to focus");
      assertFocus({ index: 31 }, "Focus moves to start of new page");
      if (ctrlKey) {
        // Splits focus from selected.
        assertSelection([68], "Same selected");
      } else {
        assertSelection(range(31, 38), "Range selection from 31 to 68");
      }
    }
  }

  // Does nothing with an empty widget.
  reset({ model, direction });
  stepFocus(true, { element: widget }, "Focus on empty widget");
  assertState([], "Empty");
  EventUtils.synthesizeKey("KEY_PageDown", {}, win);
  assertFocus({ element: widget }, "No change in focus");
  assertState([], "Empty");
  EventUtils.synthesizeKey("KEY_PageUp", {}, win);
  assertFocus({ element: widget }, "No change in focus");
  assertState([], "Empty");
}

// Test that pressing PageUp or PageDown shifts the view according to the
// visible items.
add_task(function test_page_navigation() {
  for (const model of selectionModels) {
    subtest_page_navigation(model, "top-to-bottom", {
      sizeName: "height",
      forwardKey: "KEY_ArrowDown",
      backwardKey: "KEY_ArrowUp",
      scrollTo: pos => {
        widget.scrollTop = pos;
      },
      getStartEnd: rect => {
        return {
          start: rect.top,
          end: rect.bottom,
          xStart: rect.right - 1,
          xEnd: rect.left + 1,
          yStart: rect.top + 1,
          yEnd: rect.bottom - 1,
        };
      },
    });
    subtest_page_navigation(model, "right-to-left", {
      sizeName: "width",
      forwardKey: "KEY_ArrowLeft",
      backwardKey: "KEY_ArrowRight",
      scrollTo: pos => {
        widget.scrollLeft = -pos;
      },
      getStartEnd: rect => {
        return {
          start: -rect.right,
          end: -rect.left,
          xStart: rect.right - 1,
          xEnd: rect.left + 1,
          yStart: rect.top + 1,
          yEnd: rect.bottom - 1,
        };
      },
    });
    subtest_page_navigation(model, "left-to-right", {
      sizeName: "width",
      forwardKey: "KEY_ArrowRight",
      backwardKey: "KEY_ArrowLeft",
      scrollTo: pos => {
        widget.scrollLeft = pos;
      },
      getStartEnd: rect => {
        return {
          start: rect.left,
          end: rect.right,
          xStart: rect.left + 1,
          xEnd: rect.right - 1,
          yStart: rect.top + 1,
          yEnd: rect.bottom - 1,
        };
      },
    });
  }
});

// Using Space to select items.
add_task(function test_space_selection() {
  for (const model of selectionModels) {
    reset({ model, direction: "right-to-left" });
    widget.addItems(0, ["First", "Second", "Third", "Fourth"]);

    stepFocus(true, { index: 0 }, "Move focus to first item");
    assertSelection([0], "First item is selected");

    // Selecting an already selected item does nothing.
    EventUtils.synthesizeKey(" ", {}, win);
    assertFocus({ index: 0 }, "First item still has focus");
    assertSelection([0], "First item is still selected");

    if (model == "focus") {
      // Just move to second item as set up for the loop.
      EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    } else {
      // Selecting a non-selected item will move selection to it.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus({ index: 1 }, "Second item has focus");
      assertSelection([0], "First item is still selected");
      EventUtils.synthesizeKey(" ", {}, win);
      assertFocus({ index: 1 }, "Second item still has focus");
      assertSelection([1], "Second item becomes selected");
    }

    // Ctrl + Space will toggle the selection if multi-selection is supported.
    EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
    if (model == "focus") {
      // Did nothing.
      assertFocus({ index: 1 }, "Second item still has focus");
      assertSelection([1], "Second item is still selected");
    } else if (model == "browse") {
      // Did nothing.
      assertFocus({ index: 1 }, "Second item still has focus");
      assertSelection([1], "Second item is still selected");
      // Make sure nothing happens when on a non-selected item as well.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Third item has focus");
      assertSelection([1], "Second item is still selected");
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Third item still has focus");
      assertSelection([1], "Second item is still selected");
      // Restore the previous state.
      EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    } else {
      // Unselected the item.
      assertFocus({ index: 1 }, "Second item still has focus");
      assertSelection([], "Second item was un-selected");
      // Toggle again.
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 1 }, "Second item still has focus");
      assertSelection([1], "Second item was re-selected");

      // Do on another index.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus({ index: 3 }, "Fourth item has focus");
      assertSelection([1], "Second item is still selected");
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 3 }, "Fourth item still has focus");
      assertSelection([1, 3], "Fourth item becomes selected as well");

      // Move to third without clearing.
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Third item has focus");
      assertSelection([1, 3], "Fourth and second item remain selected");

      // Merge the two ranges together.
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Third item still has focus");
      assertSelection([1, 2, 3], "Third item becomes selected");

      // Shrink the range at the end.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus({ index: 3 }, "Fourth item has focus");
      assertSelection([1, 2, 3], "Same selection");
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 3 }, "Fourth item still has focus");
      assertSelection([1, 2], "Fourth item unselected");

      // Shrink the range at the start.
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus({ index: 1 }, "Second item has focus");
      assertSelection([1, 2], "Same selection");
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 1 }, "Second item still has focus");
      assertSelection([2], "Second item unselected");

      // No selection.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Third item has focus");
      assertSelection([2], "Same selection");
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Third item still has focus");
      assertSelection([], "Third item unselected");

      // Using arrow keys without modifier will re-introduce a single selection.
      EventUtils.synthesizeKey("KEY_ArrowRight");
      assertFocus({ index: 1 }, "Second item has focus");
      assertSelection([1], "Second item becomes selected");

      // Grow range at the start.
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus({ index: 0 }, "First item has focus");
      assertSelection([1], "Same selection");
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 0 }, "First item still has focus");
      assertSelection([0, 1], "First item becomes selected");

      // Grow range at the end.
      EventUtils.synthesizeKey("KEY_End", { ctrlKey: true }, win);
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Third item has focus");
      assertSelection([0, 1], "Same selection");
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Third item still has focus");
      assertSelection([0, 1, 2], "Third item becomes selected");

      // Split the range in half.
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus({ index: 1 }, "Second item has focus");
      assertSelection([0, 1, 2], "Same selection");
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 1 }, "Second item still has focus");
      assertSelection([0, 2], "Second item unselected");

      // Pressing Space without a modifier clears the multi-selection.
      EventUtils.synthesizeKey(" ", {}, win);
    }

    // Make sure we are in the expected shared state between models.
    assertFocus({ index: 1 }, "Second item has focus");
    assertSelection([1], "Second item is selected");

    // Shift + Space will do nothing.
    for (const ctrlKey of [false, true]) {
      info(`Pressing ${ctrlKey ? "Ctrl+" : ""}Shift+space on item`);
      // On selected item.
      EventUtils.synthesizeKey(" ", { ctrlKey, shiftKey: true }, win);
      assertFocus({ index: 1 }, "Second item still has focus");
      assertSelection([1], "Second item is still selected");

      if (model == "focus") {
        continue;
      }

      // On non-selected item.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Third item has focus");
      assertSelection([1], "Second item is still selected");
      EventUtils.synthesizeKey(" ", { ctrlKey, shiftKey: true }, win);
      assertFocus({ index: 2 }, "Third item still has focus");
      assertSelection([1], "Second item is still selected");

      // Restore for next loop.
      EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
      assertFocus({ index: 1 }, "Second item has focus");
      assertSelection([1], "Second item is selected");
    }
  }
});

// Clicking an item will focus and select it.
add_task(function test_clicking_items() {
  for (const model of selectionModels) {
    reset({ model, direction: "right-to-left" });
    widget.addItems(0, [
      "First",
      "Second",
      "Third",
      "Fourth",
      "Fifth",
      "Sixth",
      "Seventh",
      "Eighth",
    ]);

    assertFocus({ element: before }, "Focus initially outside widget");
    assertSelection([], "No initial selection");

    // Focus moves into widget, onto the clicked item.
    clickWidgetItem(1, {});
    assertFocus({ index: 1 }, "Focus clicked second item");
    assertSelection([1], "Selected clicked second item");

    // Focus moves to different item.
    clickWidgetItem(2, {});
    assertFocus({ index: 2 }, "Focus clicked third item");
    assertSelection([2], "Selected clicked third item");

    // Click same item.
    clickWidgetItem(2, {});
    assertFocus({ index: 2 }, "Focus remains on third item");
    assertSelection([2], "Selected remains on third item");

    // Focus outside widget, focus moves but selection remains.
    before.focus();
    assertFocus({ element: before }, "Focus outside widget");
    assertSelection([2], "Selected remains on third item");

    // Clicking same item will return focus to it.
    clickWidgetItem(2, {});
    assertFocus({ index: 2 }, "Focus returns to third item");
    assertSelection([2], "Selected remains on third item");

    // Do the same, but return to a different item.
    before.focus();
    assertFocus({ element: before }, "Focus outside widget");
    assertSelection([2], "Selected remains on third item");

    // Clicking same item will return focus to it.
    clickWidgetItem(1, {});
    assertFocus({ index: 1 }, "Focus moves to second item");
    assertSelection([1], "Selected moves to second item");

    // Switching to keyboard works.
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    assertFocus({ index: 0 }, "Focus moves to first item");
    assertSelection([0], "Selected moves to first item");

    // Returning to mouse works.
    clickWidgetItem(1, {});
    assertFocus({ index: 1 }, "Focus moves to second item");
    assertSelection([1], "Selected moves to second item");

    // Toggle selection with Ctrl+Click.
    clickWidgetItem(3, { ctrlKey: true });
    if (model == "browse-multi") {
      assertFocus({ index: 3 }, "Focus moves to fourth item");
      assertSelection([1, 3], "Fourth item is selected");

      clickWidgetItem(7, { ctrlKey: true });
      assertFocus({ index: 7 }, "Focus moves to eighth item");
      assertSelection([1, 3, 7], "Eighth item selected");

      // Extend selection range by one after.
      clickWidgetItem(4, { ctrlKey: true });
      assertFocus({ index: 4 }, "Focus moves to fifth item");
      assertSelection([1, 3, 4, 7], "Fifth item is selected");

      // Extend selection range by one before.
      clickWidgetItem(6, { ctrlKey: true });
      assertFocus({ index: 6 }, "Focus moves to seventh item");
      assertSelection([1, 3, 4, 6, 7], "Seventh item is selected");

      // Merge the two ranges together.
      clickWidgetItem(5, { ctrlKey: true });
      assertFocus({ index: 5 }, "Focus moves to sixth item");
      assertSelection([1, 3, 4, 5, 6, 7], "Sixth item is selected");

      // Reverse by unselecting.
      clickWidgetItem(7, { ctrlKey: true });
      assertFocus({ index: 7 }, "Focus moves to eight item");
      assertSelection([1, 3, 4, 5, 6], "Eight item is unselected");

      clickWidgetItem(3, { ctrlKey: true });
      assertFocus({ index: 3 }, "Focus moves to fourth item");
      assertSelection([1, 4, 5, 6], "Fourth item is unselected");

      // Split a range.
      clickWidgetItem(5, { ctrlKey: true });
      assertFocus({ index: 5 }, "Focus moves to sixth item");
      assertSelection([1, 4, 6], "Sixth item is unselected");

      clickWidgetItem(1, { ctrlKey: true });
      assertFocus({ index: 1 }, "Focus moves to second item");
      assertSelection([4, 6], "Second item is unselected");

      clickWidgetItem(6, { ctrlKey: true });
      assertFocus({ index: 6 }, "Focus moves to seventh item");
      assertSelection([4], "Seventh item is unselected");

      // Can get zero-selection.
      clickWidgetItem(4, { ctrlKey: true });
      assertFocus({ index: 4 }, "Focus moves to fifth item");
      assertSelection([], "None selected");

      // Get into the same state as the other case.
      clickWidgetItem(1, { ctrlKey: true });
      assertFocus({ index: 1 }, "Focus moves to second item");
      assertSelection([1], "Second item is selected");
    } else {
      // No multi-selection, so does nothing.
      assertFocus({ index: 1 }, "Focus remains on second item");
      assertSelection([1], "Second item remains selected");
    }

    // Ctrl+Shift+Click does nothing in all models.
    clickWidgetItem(2, { ctrlKey: true, shiftKey: true });
    assertFocus({ index: 1 }, "Focus remains on second item");
    assertSelection([1], "Second item remains selected");
  }
});

add_task(function test_select_all() {
  for (const model of selectionModels) {
    reset({ model, direction: "right-to-left" });
    widget.addItems(0, ["First", "Second", "Third", "Fourth", "Fifth"]);

    stepFocus(true, { index: 0 }, "Move focus to first item");
    assertSelection([0], "First item is selected");

    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    assertFocus({ index: 1 }, "Focus on second item");
    assertSelection([1], "Second item is selected");

    selectAllShortcut();

    assertFocus({ index: 1 }, "Focus remains on second item");
    if (model == "browse-multi") {
      assertSelection([0, 1, 2, 3, 4], "All items are selected");
      // Can insert a hole.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Focus moves to third item");
      assertSelection([0, 1, 2, 3, 4], "All items are still selected");
      EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
      assertFocus({ index: 2 }, "Focus remains on third item");
      assertSelection([0, 1, 3, 4], "Third item was unselected");
      EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
      assertFocus({ index: 1 }, "Focus moves to the second item");
      assertSelection([0, 1, 3, 4], "Selection remains the same");
      EventUtils.synthesizeKey(" ", {}, win);
      assertFocus({ index: 1 }, "Focus remains on the second item");
      assertSelection([1], "Only the second item is selected");
    } else {
      // Did nothing.
      assertSelection([1], "Second item is still selected");
    }

    // Wrong platform modifier does nothing.
    EventUtils.synthesizeKey(
      "a",
      AppConstants.platform == "macosx" ? { ctrlKey: true } : { metaKey: true },
      win
    );
    assertFocus({ index: 1 }, "Focus remains on second item");
    assertSelection([1], "Second item still selected");
  }
});

// Holding the shift key should perform a range selection if multi-selection is
// supported by the model.
add_task(function test_range_selection() {
  for (const model of selectionModels) {
    reset({ model, direction: "right-to-left" });
    widget.addItems(0, ["First", "Second", "Third", "Fourth", "Fifth"]);

    stepFocus(true, { index: 0 }, "Move focus to first item");
    assertSelection([0], "First item is selected");

    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);

    assertFocus({ index: 2 }, "Focus on third item");
    assertSelection([2], "Third item is selected");

    // Nothing happens with Ctrl+Shift in any model.
    EventUtils.synthesizeKey(
      "KEY_ArrowLeft",
      { shiftKey: true, ctrlKey: true },
      win
    );
    assertFocus({ index: 2 }, "Focus remains on third item");
    assertSelection([2], "Only second item is selected");
    EventUtils.synthesizeKey(
      "KEY_ArrowRight",
      { shiftKey: true, ctrlKey: true },
      win
    );
    assertFocus({ index: 2 }, "Focus remains on third item");
    assertSelection([2], "Only second item is selected");

    // With just Shift modifier.
    if (model == "focus" || model == "browse") {
      // No range selection.
      EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
      assertFocus({ index: 2 }, "Focus remains on third item");
      assertSelection([2], "Only second item is selected");

      EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
      assertFocus({ index: 2 }, "Focus remains on third item");
      assertSelection([2], "Only second item is selected");

      clickWidgetItem(3, { shiftKey: true });
      assertFocus({ index: 2 }, "Focus remains on third item");
      assertSelection([2], "Only second item is selected");

      clickWidgetItem(1, { shiftKey: true });
      assertFocus({ index: 2 }, "Focus remains on third item");
      assertSelection([2], "Only second item is selected");
      continue;
    }

    // Range selection with shift key.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertFocus({ index: 3 }, "Focus on fourth item");
    assertSelection([2, 3], "Select from third to fourth item");

    // Reverse
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertFocus({ index: 2 }, "Focus on third item");
    assertSelection([2], "Select from third to same item");

    // Go back another step.
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertFocus({ index: 1 }, "Focus on second item");
    assertSelection([1, 2], "Third to second items are selected");

    // Split focus from selection.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertFocus({ index: 2 }, "Focus on third item");
    assertSelection([1, 2], "Third to second items are still selected");

    // Back to range selection.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertFocus({ index: 3 }, "Focus on fourth item");
    assertSelection([2, 3], "Third to fourth items are selected");

    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertFocus({ index: 4 }, "Focus on fifth item");
    assertSelection([2, 3, 4], "Third to fifth items are selected");

    // Moving without a modifier breaks the range.
    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    assertFocus({ index: 4 }, "Focus remains on final fifth item");
    assertSelection([4], "Fifth item is selected");

    // Again at the middle.
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertFocus({ index: 3 }, "Focus moves to fourth item");
    assertSelection([3, 4], "Fifth to fourth items are selected");
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    assertFocus({ index: 2 }, "Focus moves to third item");
    assertSelection([2], "Only third item is selected");

    // Home and End also work.
    EventUtils.synthesizeKey("KEY_Home", { shiftKey: true }, win);
    assertFocus({ index: 0 }, "Focus moves to first item");
    assertSelection([0, 1, 2], "Up to third item is selected");

    EventUtils.synthesizeKey("KEY_End", { shiftKey: true }, win);
    assertFocus({ index: 4 }, "Focus moves to last item");
    assertSelection([2, 3, 4], "Third item and above is selected");

    // Ctrl+A breaks range selection sequence, so we no longer select around the
    // third item when we go back to using Shift+Arrow.
    selectAllShortcut();
    assertFocus({ index: 4 }, "Focus remains on last item");
    assertSelection([0, 1, 2, 3, 4], "All items are selected");
    // The new shift+range will be from the focus index (the fifth item) rather
    // than the third item used for the previous range.
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertFocus({ index: 3 }, "Focus moves to fourth item");
    assertSelection([3, 4], "Fifth to fourth item are selected");

    // Ctrl+Space also breaks range selection sequence.
    EventUtils.synthesizeKey("KEY_Home", { ctrlKey: true }, win);
    assertFocus({ index: 0 }, "Focus moves to first item");
    assertSelection([3, 4], "Range selection remains");
    EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
    assertFocus({ index: 0 }, "Focus still on first item");
    assertSelection([0, 3, 4], "First item added to selection");
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertFocus({ index: 1 }, "Focus moves to second item");
    assertSelection([0, 1], "First to second item are selected");

    // Same when unselecting.
    EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
    assertFocus({ index: 1 }, "Focus remains on second item");
    assertSelection([0], "Second item is no longer selected");

    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertFocus({ index: 2 }, "Focus moves to third item");
    assertSelection([1, 2], "Second to third item are selected");

    // Same when using setItemSelected API
    widget.setItemSelected(4, true);
    assertFocus({ index: 2 }, "Focus remains on third item");
    assertSelection([1, 2, 4], "Fifth item becomes selected");

    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertFocus({ index: 3 }, "Focus moves to fourth item");
    assertSelection([2, 3], "Third to fourth item are selected");
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertFocus({ index: 4 }, "Focus moves to fifth item");
    assertSelection([2, 3, 4], "Third to fifth item are selected");

    widget.setItemSelected(3, false);
    assertFocus({ index: 4 }, "Focus remains on fifth item");
    assertSelection([2, 4], "Fourth item becomes unselected");

    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertFocus({ index: 3 }, "Focus moves to fourth item");
    assertSelection([3, 4], "Fifth to fourth item are selected");

    // Even when the selection state does not change.
    widget.setItemSelected(3, true);
    assertFocus({ index: 3 }, "Focus remains on fourth item");
    assertSelection([3, 4], "Same selection");
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertFocus({ index: 2 }, "Focus moves to third item");
    assertSelection([2, 3], "Fourth to third item are selected");
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertFocus({ index: 1 }, "Focus moves to second item");
    assertSelection([1, 2, 3], "Fourth to second item are selected");

    widget.setItemSelected(4, false);
    assertFocus({ index: 1 }, "Focus remains on second item");
    assertSelection([1, 2, 3], "Same selection");
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertFocus({ index: 2 }, "Focus moves to third item");
    assertSelection([1, 2], "Second to third item are selected");

    // Same when selecting with space (no modifier).
    EventUtils.synthesizeKey(" ", {}, win);
    assertFocus({ index: 2 }, "Focus remains on third item");
    assertSelection([2], "Third item is selected");

    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertFocus({ index: 3 }, "Focus moves to fourth item");
    assertSelection([2, 3], "Third to fourth item are selected");

    // Same when using the selectSingleItem API.
    widget.selectSingleItem(1);
    assertFocus({ index: 1 }, "Focus moves to second item");
    assertSelection([1], "Second item is selected");

    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertFocus({ index: 0 }, "Focus moves to first item");
    assertSelection([0, 1], "Second to first item are selected");

    // If focus goes out and we return, the range origin is remembered.
    stepFocus(true, { element: after }, "Move focus outside the widget");
    assertSelection([0, 1], "Second to first item are still selected");
    stepFocus(false, { index: 0 }, "Focus returns to the widget");
    assertSelection([0, 1], "Second to first item are still selected");

    EventUtils.synthesizeKey("KEY_End", { shiftKey: true }, win);
    assertFocus({ index: 4 }, "Focus moves to last item");
    assertSelection([1, 2, 3, 4], "Second to fifth item are selected");

    // Clicking empty space does not clear it.
    clickWidgetEmptySpace({});
    assertFocus({ index: 4 }, "Focus remains on last item");
    assertSelection([1, 2, 3, 4], "Second to fifth item are still selected");

    // Shift+Click an item will use the same range origin established by the
    // current selection.
    clickWidgetItem(3, { shiftKey: true });
    assertFocus({ index: 3 }, "Focus moves to fourth item");
    assertSelection([1, 2, 3], "Second to fourth item are selected");

    // Clicking without the modifier breaks the range selection sequence.
    clickWidgetItem(2, {});
    assertFocus({ index: 2 }, "Focus moves to third item");
    assertSelection([2], "Only the third item is selected");

    // Shift click will select between the third item and the the clicked item.
    clickWidgetItem(4, { shiftKey: true });
    assertFocus({ index: 4 }, "Focus moves to fifth item");
    assertSelection([2, 3, 4], "Third to fifth item are selected");

    // Reverse direction about the same point.
    clickWidgetItem(0, { shiftKey: true });
    assertFocus({ index: 0 }, "Focus moves to first item");
    assertSelection([0, 1, 2], "Third to first item are selected");

    // Ctrl+Click breaks the range selection sequence.
    clickWidgetItem(1, { ctrlKey: true });
    assertFocus({ index: 1 }, "Focus moves to second item");
    assertSelection([0, 2], "Second item is unselected");
    clickWidgetItem(3, { shiftKey: true });
    assertFocus({ index: 3 }, "Focus moves to fourth item");
    assertSelection([1, 2, 3], "Second to fourth item are selected");

    // Same when Ctrl+Click on non-selected.
    clickWidgetItem(4, { ctrlKey: true });
    assertFocus({ index: 4 }, "Focus moves to fifth item");
    assertSelection([1, 2, 3, 4], "Fifth item is selected");
    clickWidgetItem(3, { shiftKey: true });
    assertFocus({ index: 3 }, "Focus moves to fourth item");
    assertSelection([3, 4], "Fifth to fourth item are selected");

    // Selecting-all also breaks range selection sequence.
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    assertFocus({ index: 2 }, "Focus moves to third item");
    assertSelection([3, 4], "Same selection");

    selectAllShortcut();
    assertFocus({ index: 2 }, "Focus remains on third item");
    assertSelection([0, 1, 2, 3, 4], "All items selected");

    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertFocus({ index: 1 }, "Focus moves to second item");
    assertSelection([1, 2], "Third to second item selected");
  }
});

// Adding items to widget with existing items, should not change the selected
// item.
add_task(function test_add_items_to_nonempty() {
  for (const model of selectionModels) {
    reset({ model, direction: "right-to-left" });
    assertState([], "Empty");

    widget.addItems(0, ["0-add"]);
    stepFocus(true, { index: 0, text: "0-add" }, "Move focus to 0-add");
    assertState([{ text: "0-add", selected: true, focused: true }], "One item");

    // Add item after.
    widget.addItems(1, ["1-add"]);
    assertState(
      [{ text: "0-add", selected: true, focused: true }, { text: "1-add" }],
      "0-add still focused and selected"
    );

    // Add item before. 0-add moves to index 1.
    widget.addItems(0, ["2-add"]);
    assertState(
      [
        { text: "2-add" },
        { text: "0-add", selected: true, focused: true },
        { text: "1-add" },
      ],
      "0-add still focused and selected"
    );

    // Add several before.
    widget.addItems(1, ["3-add", "4-add", "5-add"]);
    assertState(
      [
        { text: "2-add" },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
        { text: "0-add", selected: true, focused: true },
        { text: "1-add" },
      ],
      "0-add still focused and selected"
    );

    // Key navigation works.
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    assertState(
      [
        { text: "2-add" },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add", selected: true, focused: true },
        { text: "0-add" },
        { text: "1-add" },
      ],
      "5-add becomes focused and selected"
    );

    // With focus outside the widget.
    reset({ model, direction: "right-to-left" });
    assertState([], "Empty");

    widget.addItems(0, ["0-add"]);
    stepFocus(true, { index: 0 }, "Move focus to 0-add");
    assertState([{ text: "0-add", selected: true, focused: true }], "One item");

    stepFocus(true, { element: after }, "Move focus to after widget");
    // Add after.
    widget.addItems(1, ["1-add", "2-add"]);
    assertState(
      [{ text: "0-add", selected: true }, { text: "1-add" }, { text: "2-add" }],
      "0-add still selected but not focused"
    );
    stepFocus(false, { index: 0 }, "Move focus back to 0-add");
    assertState(
      [
        { text: "0-add", selected: true, focused: true },
        { text: "1-add" },
        { text: "2-add" },
      ],
      "0-add selected and focused"
    );

    stepFocus(false, { element: before }, "Move focus to before widget");
    // Add before.
    widget.addItems(0, ["3-add", "4-add"]);
    assertState(
      [
        { text: "3-add" },
        { text: "4-add" },
        { text: "0-add", selected: true },
        { text: "1-add" },
        { text: "2-add" },
      ],
      "0-add selected but not focused"
    );
    stepFocus(true, { index: 2 }, "Move focus back to 0-add");
    assertState(
      [
        { text: "3-add" },
        { text: "4-add" },
        { text: "0-add", selected: true, focused: true },
        { text: "1-add" },
        { text: "2-add" },
      ],
      "0-add selected and focused"
    );

    // With focus separate from selection.
    if (model == "focus") {
      continue;
    }

    reset({ model, direction: "right-to-left" });
    assertState([], "Empty");

    widget.addItems(0, ["0-add", "1-add", "2-add"]);
    assertState(
      [{ text: "0-add" }, { text: "1-add" }, { text: "2-add" }],
      "None selected or focused"
    );
    stepFocus(true, { index: 0 }, "Move focus to 0-add");

    // With selection after focus.
    EventUtils.synthesizeKey("KEY_End", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    assertState(
      [
        { text: "0-add" },
        { text: "1-add", focused: true },
        { text: "2-add", selected: true },
      ],
      "Selection after focus"
    );

    // Add after both selection and focus.
    widget.addItems(3, ["3-add"]);
    assertState(
      [
        { text: "0-add" },
        { text: "1-add", focused: true },
        { text: "2-add", selected: true },
        { text: "3-add" },
      ],
      "Same items selected and focused"
    );

    // Add before both selection and focus.
    widget.addItems(1, ["4-add"]);
    assertState(
      [
        { text: "0-add" },
        { text: "4-add" },
        { text: "1-add", focused: true },
        { text: "2-add", selected: true },
        { text: "3-add" },
      ],
      "Same items selected and focused"
    );

    // Before selection, after focus.
    widget.addItems(3, ["5-add"]);
    assertState(
      [
        { text: "0-add" },
        { text: "4-add" },
        { text: "1-add", focused: true },
        { text: "5-add" },
        { text: "2-add", selected: true },
        { text: "3-add" },
      ],
      "Same items selected and focused"
    );

    // Swap selection to be before focus.
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertState(
      [
        { text: "0-add" },
        { text: "4-add", selected: true },
        { text: "1-add" },
        { text: "5-add", focused: true },
        { text: "2-add" },
        { text: "3-add" },
      ],
      "Selection before focus"
    );

    // After selection, before focus.
    widget.addItems(2, ["6-add", "7-add", "8-add"]);
    assertState(
      [
        { text: "0-add" },
        { text: "4-add", selected: true },
        { text: "6-add" },
        { text: "7-add" },
        { text: "8-add" },
        { text: "1-add" },
        { text: "5-add", focused: true },
        { text: "2-add" },
        { text: "3-add" },
      ],
      "Same items selected and focused"
    );

    // With multi-selection.
    if (model == "browse") {
      continue;
    }

    reset({ model, direction: "right-to-left" });
    assertState([], "Empty");

    widget.addItems(0, ["0-add", "1-add", "2-add"]);
    assertState(
      [{ text: "0-add" }, { text: "1-add" }, { text: "2-add" }],
      "None selected"
    );
    stepFocus(true, { index: 0 }, "Move focus to 0-add");

    // Select all.
    EventUtils.synthesizeKey("KEY_End", { shiftKey: true }, win);
    assertState(
      [
        { text: "0-add", selected: true },
        { text: "1-add", selected: true },
        { text: "2-add", selected: true, focused: true },
      ],
      "All selected"
    );

    // Add after all.
    widget.addItems(3, ["3-add", "4-add", "5-add"]);
    assertState(
      [
        { text: "0-add", selected: true },
        { text: "1-add", selected: true },
        { text: "2-add", selected: true, focused: true },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Same range selected"
    );

    // Can continue shift selection to newly added item
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertState(
      [
        { text: "0-add", selected: true },
        { text: "1-add", selected: true },
        { text: "2-add", selected: true },
        { text: "3-add", selected: true, focused: true },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Range extended to new item"
    );

    // Add before all.
    widget.addItems(0, ["6-add", "7-add"]);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "0-add", selected: true },
        { text: "1-add", selected: true },
        { text: "2-add", selected: true },
        { text: "3-add", selected: true, focused: true },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Same range selected"
    );

    // Can continue shift selection about the "0-add" item.
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "0-add", selected: true },
        { text: "1-add", selected: true },
        { text: "2-add", selected: true, focused: true },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Range extended backward"
    );

    // And change direction of shift selection range.
    EventUtils.synthesizeKey("KEY_Home", { ctrlKey: true }, win);
    assertState(
      [
        { text: "6-add", focused: true },
        { text: "7-add" },
        { text: "0-add", selected: true },
        { text: "1-add", selected: true },
        { text: "2-add", selected: true },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Focus moves to first item"
    );
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add", selected: true, focused: true },
        { text: "0-add", selected: true },
        { text: "1-add" },
        { text: "2-add" },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Selection pivoted about 0-add"
    );

    // Add items in the middle of the range. Selection in the range is not added
    // initially.
    widget.addItems(2, ["8-add", "9-add", "10-add"]);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add", selected: true, focused: true },
        { text: "8-add" },
        { text: "9-add" },
        { text: "10-add" },
        { text: "0-add", selected: true },
        { text: "1-add" },
        { text: "2-add" },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Backward range selection with single gap"
    );

    // But continuing the shift selection will fill in the holes again.
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertState(
      [
        { text: "6-add", selected: true, focused: true },
        { text: "7-add", selected: true },
        { text: "8-add", selected: true },
        { text: "9-add", selected: true },
        { text: "10-add", selected: true },
        { text: "0-add", selected: true },
        { text: "1-add" },
        { text: "2-add" },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Backward range selection with no gap"
    );

    // Do the same but with a selection range moving forward and two holes.
    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "8-add", selected: true },
        { text: "9-add", selected: true },
        { text: "10-add", selected: true, focused: true },
        { text: "0-add" },
        { text: "1-add" },
        { text: "2-add" },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Forward range selection"
    );

    widget.addItems(3, ["11-add"]);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "8-add", selected: true },
        { text: "11-add" },
        { text: "9-add", selected: true },
        { text: "10-add", selected: true, focused: true },
        { text: "0-add" },
        { text: "1-add" },
        { text: "2-add" },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Forward range selection with one gap"
    );

    widget.addItems(5, ["12-add", "13-add"]);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "8-add", selected: true },
        { text: "11-add" },
        { text: "9-add", selected: true },
        { text: "12-add" },
        { text: "13-add" },
        { text: "10-add", selected: true, focused: true },
        { text: "0-add" },
        { text: "1-add" },
        { text: "2-add" },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Forward range selection with two gaps"
    );

    // Continuing the shift selection will fill in the holes.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "8-add", selected: true },
        { text: "11-add", selected: true },
        { text: "9-add", selected: true },
        { text: "12-add", selected: true },
        { text: "13-add", selected: true },
        { text: "10-add", selected: true },
        { text: "0-add", selected: true, focused: true },
        { text: "1-add" },
        { text: "2-add" },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Extended range forward with no gaps"
    );

    // With multi-selection via toggling.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "8-add", selected: true },
        { text: "11-add", selected: true },
        { text: "9-add", selected: true },
        { text: "12-add", selected: true },
        { text: "13-add", selected: true },
        { text: "10-add", selected: true },
        { text: "0-add", selected: true },
        { text: "1-add" },
        { text: "2-add", selected: true, focused: true },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Selected 2-add"
    );
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "8-add", selected: true },
        { text: "11-add", selected: true },
        { text: "9-add", selected: true },
        { text: "12-add", selected: true },
        { text: "13-add", focused: true },
        { text: "10-add", selected: true },
        { text: "0-add", selected: true },
        { text: "1-add" },
        { text: "2-add", selected: true },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "De-selected 13-add"
    );

    widget.addItems(6, ["14-add", "15-add"]);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "8-add", selected: true },
        { text: "11-add", selected: true },
        { text: "9-add", selected: true },
        { text: "12-add", selected: true },
        { text: "14-add" },
        { text: "15-add" },
        { text: "13-add", focused: true },
        { text: "10-add", selected: true },
        { text: "0-add", selected: true },
        { text: "1-add" },
        { text: "2-add", selected: true },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Same selected items"
    );

    widget.addItems(3, ["16-add"]);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "8-add", selected: true },
        { text: "16-add" },
        { text: "11-add", selected: true },
        { text: "9-add", selected: true },
        { text: "12-add", selected: true },
        { text: "14-add" },
        { text: "15-add" },
        { text: "13-add", focused: true },
        { text: "10-add", selected: true },
        { text: "0-add", selected: true },
        { text: "1-add" },
        { text: "2-add", selected: true },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "Same selected items"
    );

    // With select-all
    selectAllShortcut();
    assertState(
      [
        { text: "6-add", selected: true },
        { text: "7-add", selected: true },
        { text: "8-add", selected: true },
        { text: "16-add", selected: true },
        { text: "11-add", selected: true },
        { text: "9-add", selected: true },
        { text: "12-add", selected: true },
        { text: "14-add", selected: true },
        { text: "15-add", selected: true },
        { text: "13-add", selected: true, focused: true },
        { text: "10-add", selected: true },
        { text: "0-add", selected: true },
        { text: "1-add", selected: true },
        { text: "2-add", selected: true },
        { text: "3-add", selected: true },
        { text: "4-add", selected: true },
        { text: "5-add", selected: true },
      ],
      "All items selected"
    );

    // Added items do not become selected.
    widget.addItems(4, ["17-add", "18-add"]);
    assertState(
      [
        { text: "6-add", selected: true },
        { text: "7-add", selected: true },
        { text: "8-add", selected: true },
        { text: "16-add", selected: true },
        { text: "17-add" },
        { text: "18-add" },
        { text: "11-add", selected: true },
        { text: "9-add", selected: true },
        { text: "12-add", selected: true },
        { text: "14-add", selected: true },
        { text: "15-add", selected: true },
        { text: "13-add", selected: true, focused: true },
        { text: "10-add", selected: true },
        { text: "0-add", selected: true },
        { text: "1-add", selected: true },
        { text: "2-add", selected: true },
        { text: "3-add", selected: true },
        { text: "4-add", selected: true },
        { text: "5-add", selected: true },
      ],
      "Added items not selected"
    );

    // Added items will be selected if we select-all again.
    selectAllShortcut();
    assertState(
      [
        { text: "6-add", selected: true },
        { text: "7-add", selected: true },
        { text: "8-add", selected: true },
        { text: "16-add", selected: true },
        { text: "17-add", selected: true },
        { text: "18-add", selected: true },
        { text: "11-add", selected: true },
        { text: "9-add", selected: true },
        { text: "12-add", selected: true },
        { text: "14-add", selected: true },
        { text: "15-add", selected: true },
        { text: "13-add", selected: true, focused: true },
        { text: "10-add", selected: true },
        { text: "0-add", selected: true },
        { text: "1-add", selected: true },
        { text: "2-add", selected: true },
        { text: "3-add", selected: true },
        { text: "4-add", selected: true },
        { text: "5-add", selected: true },
      ],
      "All items selected"
    );
  }
});

/**
 * Test that pressing a key on a non-empty widget that has focus on itself will
 * move to the expected index.
 *
 * @param {object} initialState - The initial state of the widget to set up.
 * @param {string} initialState.model - The selection model to use.
 * @param {string} initialState.direction - The layout direction of the widget.
 * @param {number} initialState.numItems - The number of items in the widget.
 * @param {Function} [initialState.scroll] - A method to call to scroll the
 *   widget.
 * @param {string} key - The key to press once the widget is set up.
 * @param {number} index - The expected index for the item that will receive
 *   focus after the key press.
 */
function subtest_keypress_on_focused_widget(initialState, key, index) {
  const { model, direction, numItems, scroll } = initialState;
  for (const ctrlKey of [false, true]) {
    for (const shiftKey of [false, true]) {
      info(
        `Adding items to empty ${direction} widget and then pressing ${
          ctrlKey ? "Ctrl+" : ""
        }${shiftKey ? "Shift+" : ""}${key}`
      );
      reset({ model, direction });

      stepFocus(true, { element: widget }, "Move focus onto empty widget");
      widget.addItems(
        0,
        range(0, numItems).map(i => `add-${i}`)
      );
      scroll?.();

      assertFocus(
        { element: widget },
        "Focus remains on the widget after adding items"
      );
      assertSelection([], "No items are selected yet");

      EventUtils.synthesizeKey(key, { ctrlKey, shiftKey }, win);
      if (
        (ctrlKey && shiftKey) ||
        (model == "browse" && shiftKey) ||
        (model == "focus" && (ctrlKey || shiftKey))
      ) {
        // Does nothing.
        assertFocus({ element: widget }, "Focus remains on widget");
        assertSelection([], "No change in selection");
        continue;
      }

      assertFocus({ index }, `Focus moves to ${index} after ${key}`);
      if (ctrlKey) {
        assertSelection([], `No selection if pressing Ctrl+${key}`);
      } else if (shiftKey) {
        assertSelection(
          range(0, index + 1),
          `Range selection from 0 to ${index} if pressing Shift+${key}`
        );
      } else {
        assertSelection([index], `Item selected after ${key}`);
      }
    }
  }
}

// If items are added to an empty widget that has focus, nothing happens
// initially. Arrow keys will focus the first item.
add_task(function test_add_items_to_empty_with_focus() {
  for (const model of selectionModels) {
    // Step navigation always takes us to the first item.
    subtest_keypress_on_focused_widget(
      { model, direction: "top-to-bottom", numItems: 3 },
      "KEY_ArrowUp",
      0
    );
    subtest_keypress_on_focused_widget(
      { model, direction: "top-to-bottom", numItems: 3 },
      "KEY_ArrowDown",
      0
    );
    subtest_keypress_on_focused_widget(
      { model, direction: "right-to-left", numItems: 3 },
      "KEY_ArrowRight",
      0
    );
    subtest_keypress_on_focused_widget(
      { model, direction: "right-to-left", numItems: 3 },
      "KEY_ArrowLeft",
      0
    );
    subtest_keypress_on_focused_widget(
      { model, direction: "left-to-right", numItems: 3 },
      "KEY_ArrowLeft",
      0
    );
    subtest_keypress_on_focused_widget(
      { model, direction: "left-to-right", numItems: 3 },
      "KEY_ArrowRight",
      0
    );
    // Home also takes us to the first item.
    subtest_keypress_on_focused_widget(
      { model, direction: "top-to-bottom", numItems: 3 },
      "KEY_Home",
      0
    );
    subtest_keypress_on_focused_widget(
      { model, direction: "right-to-left", numItems: 3 },
      "KEY_Home",
      0
    );
    subtest_keypress_on_focused_widget(
      { model, direction: "left-to-right", numItems: 3 },
      "KEY_Home",
      0
    );
    // End takes us to the last item.
    subtest_keypress_on_focused_widget(
      { model, direction: "top-to-bottom", numItems: 3 },
      "KEY_End",
      2
    );
    subtest_keypress_on_focused_widget(
      { model, direction: "right-to-left", numItems: 3 },
      "KEY_End",
      2
    );
    subtest_keypress_on_focused_widget(
      { model, direction: "left-to-right", numItems: 3 },
      "KEY_End",
      2
    );
    // PageUp and PageDown take us to the start or end of the visible page.
    subtest_keypress_on_focused_widget(
      { model, direction: "top-to-bottom", numItems: 3 },
      "KEY_PageUp",
      0
    );
    subtest_keypress_on_focused_widget(
      { model, direction: "top-to-bottom", numItems: 3 },
      "KEY_PageDown",
      2
    );
    subtest_keypress_on_focused_widget(
      {
        model,
        direction: "top-to-bottom",
        numItems: 30,
        scroll: () => {
          widget.scrollTop = 270;
        },
      },
      "KEY_PageUp",
      9
    );
    subtest_keypress_on_focused_widget(
      {
        model,
        direction: "top-to-bottom",
        numItems: 30,
        scroll: () => {
          widget.scrollTop = 60;
        },
      },
      "KEY_PageDown",
      21
    );

    // Arrow keys in other directions do nothing.
    reset({ model, direction: "top-to-bottom" });
    stepFocus(true, { element: widget }, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second"]);
    for (const key of ["KEY_ArrowRight", "KEY_ArrowLeft"]) {
      EventUtils.synthesizeKey(key, {}, win);
      assertFocus({ element: widget }, `Focus remains on widget after ${key}`);
      assertSelection([], `No items become selected after ${key}`);
    }

    reset({ model, direction: "right-to-left" });
    stepFocus(true, { element: widget }, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second"]);
    for (const key of ["KEY_ArrowUp", "KEY_ArrowDown"]) {
      EventUtils.synthesizeKey(key, {}, win);
      assertFocus({ element: widget }, `Focus remains on widget after ${key}`);
      assertSelection([], `No items become selected after ${key}`);
    }

    // Pressing Space does nothing.
    reset({ model });
    stepFocus(true, { element: widget }, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second"]);
    for (const ctrlKey of [false, true]) {
      for (const shiftKey of [false, true]) {
        info(
          `Pressing ${ctrlKey ? "Ctrl+" : ""}${shiftKey ? "Shift+" : ""}Space`
        );
        EventUtils.synthesizeKey(" ", {}, win);
        assertFocus({ element: widget }, "Focus remains on widget after Space");
        assertSelection([], "No items become selected after Space");
      }
    }

    // Selecting all
    reset({ model });
    stepFocus(true, { element: widget }, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second", "Third"]);

    selectAllShortcut();
    assertFocus({ element: widget }, "Focus remains on the widget");
    if (model == "browse-multi") {
      assertSelection([0, 1, 2], "All items selected");
    } else {
      assertSelection([], "still no selection");
    }

    // Adding and then removing items does not set focus.
    reset({ model });
    stepFocus(true, { element: widget }, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second", "Third", "Fourth"]);
    widget.removeItems(2, 2);
    assertState(
      [{ text: "First" }, { text: "Second" }],
      "No item focused or selected"
    );
    assertFocus({ element: widget }, "Focus remains on the widget");
    widget.removeItems(0, 1);
    assertState([{ text: "Second" }], "No item focused or selected");
    assertFocus({ element: widget }, "Focus remains on the widget");

    // Moving items does not set focus.
    reset({ model });
    stepFocus(true, { element: widget }, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second", "Third", "Fourth"]);
    widget.moveItems(1, 0, 2, false);
    assertState(
      [
        { text: "Second" },
        { text: "Third" },
        { text: "First" },
        { text: "Fourth" },
      ],
      "No item focused or selected"
    );
    assertFocus({ element: widget }, "Focus remains on the widget");
    widget.moveItems(0, 1, 3, true);
    assertState(
      [
        { text: "Fourth" },
        { text: "Second" },
        { text: "Third" },
        { text: "First" },
      ],
      "No item focused or selected"
    );
    assertFocus({ element: widget }, "Focus remains on the widget");

    // This does not effect clicking.
    // NOTE: case where widget does not initially have focus on clicking is
    // handled by test_initial_no_select_focus
    for (const ctrlKey of [false, true]) {
      for (const shiftKey of [false, true]) {
        info(
          `Adding items to empty focused widget and then ${
            ctrlKey ? "Ctrl+" : ""
          }${shiftKey ? "Shift+" : ""}Click`
        );
        reset({ model });
        stepFocus(true, { element: widget }, "Move focus onto empty widget");
        widget.addItems(0, ["First", "Second", "Third"]);

        // Clicking empty space does nothing.
        clickWidgetEmptySpace({ ctrlKey, shiftKey });
        assertFocus({ element: widget }, "Focus remains on widget");
        assertSelection([], "No item selected");

        // Clicking an item can change focus and selection.
        clickWidgetItem(1, { ctrlKey, shiftKey });
        if (
          (ctrlKey && shiftKey) ||
          ((model == "focus" || model == "browse") && (ctrlKey || shiftKey))
        ) {
          assertFocus({ element: widget }, "Focus remains on widget");
          assertSelection([], "No selection");
          continue;
        }
        assertFocus({ index: 1 }, "Focus moves to second item");
        if (shiftKey) {
          assertSelection([0, 1], "First and second item selected");
        } else {
          assertSelection([1], "Second item selected");
        }
      }
    }
  }
});

// Removing items from the widget with existing items, may change focus or
// selection if the corresponding item was removed.
add_task(function test_remove_items_nonempty() {
  for (const model of selectionModels) {
    reset({ model, direction: "right-to-left" });

    widget.addItems(0, ["0-add", "1-add", "2-add", "3-add", "4-add", "5-add"]);
    assertState(
      [
        { text: "0-add" },
        { text: "1-add" },
        { text: "2-add" },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "No initial focus or selection"
    );

    clickWidgetItem(2, {});
    assertState(
      [
        { text: "0-add" },
        { text: "1-add" },
        { text: "2-add", selected: true, focused: true },
        { text: "3-add" },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "2-add focused and selected"
    );

    // Remove one after.
    widget.removeItems(3, 1);
    assertState(
      [
        { text: "0-add" },
        { text: "1-add" },
        { text: "2-add", selected: true, focused: true },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "2-add still focused and selected"
    );

    // Remove one before.
    widget.removeItems(0, 1);
    assertState(
      [
        { text: "1-add" },
        { text: "2-add", selected: true, focused: true },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "2-add still focused and selected"
    );

    widget.addItems(0, ["6-add", "7-add"]);
    assertState(
      [
        { text: "6-add" },
        { text: "7-add" },
        { text: "1-add" },
        { text: "2-add", selected: true, focused: true },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "2-add still focused and selected"
    );

    // Remove several before.
    widget.removeItems(1, 2);
    assertState(
      [
        { text: "6-add" },
        { text: "2-add", selected: true, focused: true },
        { text: "4-add" },
        { text: "5-add" },
      ],
      "2-add still focused and selected"
    );

    // Remove selected and focused. Focus should move to the next item.
    widget.removeItems(1, 1);
    assertState(
      [
        { text: "6-add" },
        { text: "4-add", selected: true, focused: true },
        { text: "5-add" },
      ],
      "Selection and focus move to 4-add"
    );

    widget.addItems(0, ["8-add"]);
    widget.addItems(3, ["9-add", "10-add"]);
    assertState(
      [
        { text: "8-add" },
        { text: "6-add" },
        { text: "4-add", selected: true, focused: true },
        { text: "9-add" },
        { text: "10-add" },
        { text: "5-add" },
      ],
      "Selection and focus still on 4-add"
    );

    // Remove selected and focused, not at boundary.
    widget.removeItems(1, 3);
    assertState(
      [
        { text: "8-add" },
        { text: "10-add", selected: true, focused: true },
        { text: "5-add" },
      ],
      "Selection and focus move to 10-add"
    );

    // Remove last item whilst it has focus. Focus should move to the new last
    // item.
    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    assertState(
      [
        { text: "8-add" },
        { text: "10-add" },
        { text: "5-add", selected: true, focused: true },
      ],
      "Last item is focused and selected"
    );

    widget.removeItems(2, 1);
    assertState(
      [{ text: "8-add" }, { text: "10-add", selected: true, focused: true }],
      "New last item is focused and selected"
    );

    // Delete focused whilst outside widget.
    widget.addItems(2, ["11-add"]);
    assertState(
      [
        { text: "8-add" },
        { text: "10-add", selected: true, focused: true },
        { text: "11-add" },
      ],
      "10-add is focused and selected"
    );
    stepFocus(false, { element: before });

    widget.removeItems(1, 1);
    assertFocus({ element: before }, "Focus remains outside widget");
    assertState(
      [{ text: "8-add" }, { text: "11-add", selected: true }],
      "11-add becomes selected"
    );

    stepFocus(true, { index: 1 }, "11-add becomes focused");
    assertState(
      [{ text: "8-add" }, { text: "11-add", selected: true, focused: true }],
      "11-add is selected"
    );

    // With focus separate from selected.
    if (model == "focus") {
      continue;
    }

    // Move selection to be before focus.
    widget.addItems(2, ["12-add", "13-add", "14-add"]);
    assertState(
      [
        { text: "8-add" },
        { text: "11-add", selected: true, focused: true },
        { text: "12-add" },
        { text: "13-add" },
        { text: "14-add" },
      ],
      "11-add is selected and focused"
    );

    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertState(
      [
        { text: "8-add" },
        { text: "11-add", selected: true },
        { text: "12-add", focused: true },
        { text: "13-add" },
        { text: "14-add" },
      ],
      "Selection before focus"
    );

    // Remove focused, but not selected.
    widget.removeItems(2, 1);
    assertState(
      [
        { text: "8-add" },
        { text: "11-add", selected: true },
        { text: "13-add", focused: true },
        { text: "14-add" },
      ],
      "Focus moves to 13-add, but selection is the same"
    );

    // Remove focused and selected.
    widget.removeItems(1, 2);
    assertState(
      [{ text: "8-add" }, { text: "14-add", selected: true, focused: true }],
      "Focus moves to 14-add and becomes selected"
    );

    // Restore selection before focus.
    widget.addItems(0, ["15-add"]);
    assertState(
      [
        { text: "15-add" },
        { text: "8-add" },
        { text: "14-add", selected: true, focused: true },
      ],
      "14-add has focus and selection"
    );
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    assertState(
      [
        { text: "15-add" },
        { text: "8-add", selected: true, focused: true },
        { text: "14-add" },
      ],
      "8-add is focused and selected"
    );
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertState(
      [
        { text: "15-add" },
        { text: "8-add", selected: true },
        { text: "14-add", focused: true },
      ],
      "Selection before focus again"
    );

    // Remove selected, but not focused.
    widget.removeItems(1, 1);
    assertState(
      [{ text: "15-add" }, { text: "14-add", focused: true }],
      "14-add still has focus, but selection is lost"
    );

    // Move selection to be after focus.
    widget.addItems(1, ["16-add", "17-add"]);
    widget.addItems(4, ["18-add"]);
    assertState(
      [
        { text: "15-add" },
        { text: "16-add" },
        { text: "17-add" },
        { text: "14-add", focused: true },
        { text: "18-add" },
      ],
      "Still no selection"
    );
    // Select focused.
    EventUtils.synthesizeKey(" ", {}, win);
    assertFocus({ index: 3 }, "14-add has focus");
    assertSelection([3], "14-add is selected");
    assertState(
      [
        { text: "15-add" },
        { text: "16-add" },
        { text: "17-add" },
        { text: "14-add", selected: true, focused: true },
        { text: "18-add" },
      ],
      "14-add is selected and focused"
    );
    // Move focus.
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    assertState(
      [
        { text: "15-add" },
        { text: "16-add", focused: true },
        { text: "17-add" },
        { text: "14-add", selected: true },
        { text: "18-add" },
      ],
      "Selection after focus"
    );

    // Remove focused, but not selected.
    widget.removeItems(1, 1);
    assertState(
      [
        { text: "15-add" },
        { text: "17-add", focused: true },
        { text: "14-add", selected: true },
        { text: "18-add" },
      ],
      "Focus moves to 17-add, selection stays on 14-add"
    );

    // Remove focused and selected.
    widget.removeItems(1, 2);
    assertState(
      [{ text: "15-add" }, { text: "18-add", selected: true, focused: true }],
      "Focus and selection moves to 18-add"
    );

    // Restore selection after focus.
    widget.addItems(2, ["19-add", "20-add"]);
    assertState(
      [
        { text: "15-add" },
        { text: "18-add", selected: true, focused: true },
        { text: "19-add" },
        { text: "20-add" },
      ],
      "Still no selection"
    );
    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    assertState(
      [
        { text: "15-add" },
        { text: "18-add" },
        { text: "19-add", selected: true, focused: true },
        { text: "20-add" },
      ],
      "19-add focused and selected"
    );
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    assertState(
      [
        { text: "15-add" },
        { text: "18-add", focused: true },
        { text: "19-add", selected: true },
        { text: "20-add" },
      ],
      "Selection after focus again"
    );

    // Remove selected, but not focused.
    widget.removeItems(2, 2);
    assertState(
      [{ text: "15-add" }, { text: "18-add", focused: true }],
      "18-add still has focus, but selection is lost"
    );

    // With multi-selection
    if (model == "browse") {
      continue;
    }

    widget.addItems(0, ["21-add", "22-add", "23-add"]);
    assertState(
      [
        { text: "21-add" },
        { text: "22-add" },
        { text: "23-add" },
        { text: "15-add" },
        { text: "18-add", focused: true },
      ],
      "18-add focused, no selection yet"
    );
    widget.addItems(5, [
      "24-add",
      "25-add",
      "26-add",
      "27-add",
      "28-add",
      "29-add",
      "30-add",
      "31-add",
    ]);
    assertState(
      [
        { text: "21-add" },
        { text: "22-add" },
        { text: "23-add" },
        { text: "15-add" },
        { text: "18-add", focused: true },
        { text: "24-add" },
        { text: "25-add" },
        { text: "26-add" },
        { text: "27-add" },
        { text: "28-add" },
        { text: "29-add" },
        { text: "30-add" },
        { text: "31-add" },
      ],
      "18-add focused, no selection yet"
    );

    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);

    assertState(
      [
        { text: "21-add" },
        { text: "22-add" },
        { text: "23-add" },
        { text: "15-add" },
        { text: "18-add", selected: true },
        { text: "24-add", selected: true },
        { text: "25-add", selected: true },
        { text: "26-add", selected: true, focused: true },
        { text: "27-add" },
        { text: "28-add" },
        { text: "29-add" },
        { text: "30-add" },
        { text: "31-add" },
      ],
      "Forward range selection from 18-add to 26-add"
    );

    // Delete after the selection range
    widget.removeItems(10, 1);
    assertState(
      [
        { text: "21-add" },
        { text: "22-add" },
        { text: "23-add" },
        { text: "15-add" },
        { text: "18-add", selected: true },
        { text: "24-add", selected: true },
        { text: "25-add", selected: true },
        { text: "26-add", selected: true, focused: true },
        { text: "27-add" },
        { text: "28-add" },
        { text: "30-add" },
        { text: "31-add" },
      ],
      "Same range selection"
    );

    // Delete before the selection range.
    widget.removeItems(1, 1);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "15-add" },
        { text: "18-add", selected: true },
        { text: "24-add", selected: true },
        { text: "25-add", selected: true },
        { text: "26-add", selected: true, focused: true },
        { text: "27-add" },
        { text: "28-add" },
        { text: "30-add" },
        { text: "31-add" },
      ],
      "Same range selection"
    );

    // Delete the start of the selection range.
    widget.removeItems(2, 3);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "26-add", selected: true, focused: true },
        { text: "27-add" },
        { text: "28-add" },
        { text: "30-add" },
        { text: "31-add" },
      ],
      "Selection range from 25-add to 26-add"
    );

    // Selection pivot is now around 25-add.
    EventUtils.synthesizeKey("KEY_Home", { shiftKey: true }, win);
    assertState(
      [
        { text: "21-add", selected: true, focused: true },
        { text: "23-add", selected: true },
        { text: "25-add", selected: true },
        { text: "26-add" },
        { text: "27-add" },
        { text: "28-add" },
        { text: "30-add" },
        { text: "31-add" },
      ],
      "Selection range from 25-add to 21-add"
    );
    EventUtils.synthesizeKey("KEY_End", { shiftKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "26-add", selected: true },
        { text: "27-add", selected: true },
        { text: "28-add", selected: true },
        { text: "30-add", selected: true },
        { text: "31-add", selected: true, focused: true },
      ],
      "Selection range from 25-add to 31-add"
    );
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "26-add", selected: true },
        { text: "27-add", selected: true },
        { text: "28-add", selected: true, focused: true },
        { text: "30-add" },
        { text: "31-add" },
      ],
      "Selection range from 25-add to 28-add"
    );

    // Delete the end of the selection.
    // As a special case, the focus moves to the end of the selection, rather
    // than to the next item.
    widget.removeItems(4, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "26-add", selected: true, focused: true },
        { text: "30-add" },
        { text: "31-add" },
      ],
      "Selection range from 25-add to 26-add"
    );

    // Do same with a gap.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "26-add", selected: true },
        { text: "30-add", selected: true, focused: true },
        { text: "31-add" },
      ],
      "Continue selection range from 25-add to 30-add"
    );

    widget.addItems(3, ["32-add"]);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "32-add" },
        { text: "26-add", selected: true },
        { text: "30-add", selected: true, focused: true },
        { text: "31-add" },
      ],
      "Selection range from 25-add to 30-add with gap"
    );

    widget.removeItems(5, 1);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "32-add" },
        { text: "26-add", selected: true, focused: true },
        { text: "31-add" },
      ],
      "Focus moves to the end of the range, after the gap"
    );

    // Do the same with a gap and all items after the gap are removed.
    widget.addItems(6, ["33-add", "34-add"]);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "32-add" },
        { text: "26-add", selected: true, focused: true },
        { text: "31-add" },
        { text: "33-add" },
        { text: "34-add" },
      ],
      "Added 33-add and 34-add"
    );

    clickWidgetItem(5, { shiftKey: true });
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "32-add", selected: true },
        { text: "26-add", selected: true },
        { text: "31-add", selected: true, focused: true },
        { text: "33-add" },
        { text: "34-add" },
      ],
      "Selection extended to 31-add and gap filled"
    );

    widget.addItems(4, ["35-add", "36-add", "37-add"]);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "32-add", selected: true },
        { text: "35-add" },
        { text: "36-add" },
        { text: "37-add" },
        { text: "26-add", selected: true },
        { text: "31-add", selected: true, focused: true },
        { text: "33-add" },
        { text: "34-add" },
      ],
      "Selection from 25-add to 31-add with gap"
    );

    widget.removeItems(6, 3);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "32-add", selected: true, focused: true },
        { text: "35-add" },
        { text: "36-add" },
        { text: "33-add" },
        { text: "34-add" },
      ],
      "Focus jumps gap to what is left of the selection range"
    );

    // Same, with entire gap also removed.
    clickWidgetItem(6, { shiftKey: true });
    widget.addItems(5, ["38-add"]);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "32-add", selected: true },
        { text: "35-add", selected: true },
        { text: "38-add" },
        { text: "36-add", selected: true },
        { text: "33-add", selected: true, focused: true },
        { text: "34-add" },
      ],
      "Selection from 25-add to 33-add with gap"
    );

    widget.removeItems(4, 4);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "32-add", selected: true, focused: true },
        { text: "34-add" },
      ],
      "Focus moves to end of what is left of the selection range"
    );

    // Test deleting the end of the selection with focus in a gap.
    // We don't expect to follow the special treatment because the user has
    // explicitly moved the focus "outside" of the selected range.
    widget.addItems(3, ["39-add"]);
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "39-add", focused: true },
        { text: "32-add", selected: true },
        { text: "34-add" },
      ],
      "Focus in range gap"
    );

    widget.removeItems(3, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "34-add", focused: true },
      ],
      "Focus moves from gap to 34-add, outside the selection range"
    );

    // Same, but deleting the start of the range.
    widget.addItems(4, ["40-add", "41-add", "42-add"]);
    clickWidgetItem(5, { shiftKey: true });
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "34-add", selected: true },
        { text: "40-add", selected: true },
        { text: "41-add", selected: true, focused: true },
        { text: "42-add" },
      ],
      "Selection from 25-add to 41-add"
    );

    widget.addItems(3, ["43-add", "44-add", "45-add"]);
    EventUtils.synthesizeKey("KEY_Home", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "23-add" },
        { text: "25-add", selected: true },
        { text: "43-add", focused: true },
        { text: "44-add" },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "40-add", selected: true },
        { text: "41-add", selected: true },
        { text: "42-add" },
      ],
      "Focus in gap"
    );

    widget.removeItems(1, 3);
    assertState(
      [
        { text: "21-add" },
        { text: "44-add", focused: true },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "40-add", selected: true },
        { text: "41-add", selected: true },
        { text: "42-add" },
      ],
      "Focus moves to next item, rather than the selection start"
    );

    // Test deleting the end of the selection with the focus towards the end of
    // the range.
    widget.addItems(7, ["46-add", "47-add", "48-add", "49-add", "50-add"]);
    clickWidgetItem(7, { shiftKey: true });
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "44-add" },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "40-add", selected: true },
        { text: "41-add", selected: true },
        { text: "42-add", selected: true, focused: true },
        { text: "46-add", selected: true },
        { text: "47-add" },
        { text: "48-add" },
        { text: "49-add" },
        { text: "50-add" },
      ],
      "Range selection from 34-add to 46-add, with focus on 42-add"
    );

    widget.removeItems(6, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "44-add" },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "40-add", selected: true },
        { text: "41-add", selected: true, focused: true },
        { text: "47-add" },
        { text: "48-add" },
        { text: "49-add" },
        { text: "50-add" },
      ],
      "Focus still moves to the end of the selection"
    );

    // Test deleting with focus after the end of the range.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true });
    assertState(
      [
        { text: "21-add" },
        { text: "44-add" },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "40-add", selected: true },
        { text: "41-add", selected: true },
        { text: "47-add", focused: true },
        { text: "48-add" },
        { text: "49-add" },
        { text: "50-add" },
      ],
      "Focus still moves to the end of the selection"
    );

    widget.removeItems(5, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "44-add" },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "40-add", selected: true },
        { text: "48-add", focused: true },
        { text: "49-add" },
        { text: "50-add" },
      ],
      "Focus remains outside the range"
    );

    // Test deleting with focus in the middle of the range, and end of the range
    // is not deleted.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true });
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true });
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true });
    assertState(
      [
        { text: "21-add" },
        { text: "44-add" },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "40-add", selected: true, focused: true },
        { text: "48-add", selected: true },
        { text: "49-add", selected: true },
        { text: "50-add" },
      ],
      "Focus in the middle of the range"
    );

    widget.removeItems(4, 1);
    assertState(
      [
        { text: "21-add" },
        { text: "44-add" },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "48-add", selected: true, focused: true },
        { text: "49-add", selected: true },
        { text: "50-add" },
      ],
      "Focus moves to next item, rather than the end of the range"
    );

    // With focus just before a gap.
    widget.addItems(5, ["51-add", "52-add"]);
    assertState(
      [
        { text: "21-add" },
        { text: "44-add" },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "48-add", selected: true, focused: true },
        { text: "51-add" },
        { text: "52-add" },
        { text: "49-add", selected: true },
        { text: "50-add" },
      ],
      "Focus just before a gap"
    );

    widget.removeItems(4, 1);
    assertState(
      [
        { text: "21-add" },
        { text: "44-add" },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "51-add", focused: true },
        { text: "52-add" },
        { text: "49-add", selected: true },
        { text: "50-add" },
      ],
      "Focus moves forward into the gap"
    );

    // Selection pivot is about 34-add
    clickWidgetItem(1, { shiftKey: true });
    assertState(
      [
        { text: "21-add" },
        { text: "44-add", selected: true, focused: true },
        { text: "45-add", selected: true },
        { text: "34-add", selected: true },
        { text: "51-add" },
        { text: "52-add" },
        { text: "49-add" },
        { text: "50-add" },
      ],
      "Selection from 34-add backward to 44-add"
    );
    clickWidgetItem(5, { shiftKey: true });
    assertState(
      [
        { text: "21-add" },
        { text: "44-add" },
        { text: "45-add" },
        { text: "34-add", selected: true },
        { text: "51-add", selected: true },
        { text: "52-add", selected: true, focused: true },
        { text: "49-add" },
        { text: "50-add" },
      ],
      "Selection from 34-add forward to 52-add"
    );

    // Delete the whole range.
    widget.removeItems(3, 3);
    assertState(
      [
        { text: "21-add" },
        { text: "44-add" },
        { text: "45-add" },
        { text: "49-add", selected: true, focused: true },
        { text: "50-add" },
      ],
      "Focus and selection moves to after the selection range"
    );

    // Do the same with focus outside the range.
    widget.addItems(5, ["53-add", "54-add", "55-add"]);
    EventUtils.synthesizeKey("KEY_Home", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    clickWidgetItem(2, { shiftKey: true });
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "44-add", selected: true },
        { text: "45-add", selected: true },
        { text: "49-add", focused: true },
        { text: "50-add" },
        { text: "53-add" },
        { text: "54-add" },
        { text: "55-add" },
      ],
      "Focus outside selection"
    );

    widget.removeItems(1, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "49-add", focused: true },
        { text: "50-add" },
        { text: "53-add" },
        { text: "54-add" },
        { text: "55-add" },
      ],
      "Focus remains on same item and unselected"
    );

    // Do the same, but the focus is also removed.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "49-add", selected: true },
        { text: "50-add", selected: true },
        { text: "53-add", focused: true },
        { text: "54-add" },
        { text: "55-add" },
      ],
      "Focus outside selection"
    );

    widget.removeItems(1, 3);
    assertState(
      [
        { text: "21-add" },
        { text: "54-add", selected: true, focused: true },
        { text: "55-add" },
      ],
      "Focus and selection moves to 49-add"
    );

    // * Do the same tests but with selection travelling backwards. *
    widget.addItems(3, [
      "56-add",
      "57-add",
      "58-add",
      "59-add",
      "60-add",
      "61-add",
      "62-add",
      "63-add",
      "64-add",
      "65-add",
      "66-add",
    ]);
    assertState(
      [
        { text: "21-add" },
        { text: "54-add", selected: true, focused: true },
        { text: "55-add" },
        { text: "56-add" },
        { text: "57-add" },
        { text: "58-add" },
        { text: "59-add" },
        { text: "60-add" },
        { text: "61-add" },
        { text: "62-add" },
        { text: "63-add" },
        { text: "64-add" },
        { text: "65-add" },
        { text: "66-add" },
      ],
      "Same selection and focus"
    );
    EventUtils.synthesizeKey("KEY_End", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "54-add" },
        { text: "55-add" },
        { text: "56-add" },
        { text: "57-add", selected: true, focused: true },
        { text: "58-add", selected: true },
        { text: "59-add", selected: true },
        { text: "60-add", selected: true },
        { text: "61-add", selected: true },
        { text: "62-add", selected: true },
        { text: "63-add" },
        { text: "64-add" },
        { text: "65-add" },
        { text: "66-add" },
      ],
      "Backward range selection from 62-add to 57-add"
    );

    // Delete after the selection range
    widget.removeItems(11, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "54-add" },
        { text: "55-add" },
        { text: "56-add" },
        { text: "57-add", selected: true, focused: true },
        { text: "58-add", selected: true },
        { text: "59-add", selected: true },
        { text: "60-add", selected: true },
        { text: "61-add", selected: true },
        { text: "62-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Same range selection"
    );

    // Delete before the selection range.
    widget.removeItems(2, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "54-add" },
        { text: "57-add", selected: true, focused: true },
        { text: "58-add", selected: true },
        { text: "59-add", selected: true },
        { text: "60-add", selected: true },
        { text: "61-add", selected: true },
        { text: "62-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Same range selection"
    );

    // Delete the end of the selection range.
    widget.removeItems(7, 1);
    assertState(
      [
        { text: "21-add" },
        { text: "54-add" },
        { text: "57-add", selected: true, focused: true },
        { text: "58-add", selected: true },
        { text: "59-add", selected: true },
        { text: "60-add", selected: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range backwards from 61-add to 57-add"
    );

    // Selection pivot is now around 61-add.
    EventUtils.synthesizeKey("KEY_End", { shiftKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "54-add" },
        { text: "57-add" },
        { text: "58-add" },
        { text: "59-add" },
        { text: "60-add" },
        { text: "61-add", selected: true },
        { text: "63-add", selected: true },
        { text: "66-add", selected: true, focused: true },
      ],
      "Selection range forwards from 61-add to 66-add"
    );
    EventUtils.synthesizeKey("KEY_Home", { shiftKey: true }, win);
    assertState(
      [
        { text: "21-add", selected: true, focused: true },
        { text: "54-add", selected: true },
        { text: "57-add", selected: true },
        { text: "58-add", selected: true },
        { text: "59-add", selected: true },
        { text: "60-add", selected: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range backwards from 61-add to 21-add"
    );
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "54-add" },
        { text: "57-add", selected: true, focused: true },
        { text: "58-add", selected: true },
        { text: "59-add", selected: true },
        { text: "60-add", selected: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range backwards from 61-add to 57-add"
    );

    // Delete the start of the selection.
    widget.removeItems(1, 3);
    assertState(
      [
        { text: "21-add" },
        { text: "59-add", selected: true, focused: true },
        { text: "60-add", selected: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range shrinks to 59-add"
    );

    // Do the same with a gap after the focus and its next item.
    widget.addItems(3, ["67-add", "68-add", "69-add"]);
    assertState(
      [
        { text: "21-add" },
        { text: "59-add", selected: true, focused: true },
        { text: "60-add", selected: true },
        { text: "67-add" },
        { text: "68-add" },
        { text: "69-add" },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range backwards from 61-add to 59-add with gap"
    );

    widget.removeItems(1, 1);
    assertState(
      [
        { text: "21-add" },
        { text: "60-add", selected: true, focused: true },
        { text: "67-add" },
        { text: "68-add" },
        { text: "69-add" },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus moves to the next item, before gap"
    );

    // Do the same with a gap and all items before the gap are removed.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "60-add" },
        { text: "67-add", selected: true, focused: true },
        { text: "68-add", selected: true },
        { text: "69-add", selected: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range backward reduced to 67-add with gap filled"
    );
    widget.addItems(4, ["70-add", "71-add"]);
    assertState(
      [
        { text: "21-add" },
        { text: "60-add" },
        { text: "67-add", selected: true, focused: true },
        { text: "68-add", selected: true },
        { text: "70-add" },
        { text: "71-add" },
        { text: "69-add", selected: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range backward from 61-add to 67-add with gap"
    );

    widget.removeItems(2, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "60-add" },
        { text: "70-add" },
        { text: "71-add" },
        { text: "69-add", selected: true, focused: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus jumps gap to selection range"
    );

    // Same, with entire gap also removed.
    clickWidgetItem(1, { shiftKey: true });
    widget.addItems(2, ["72-add"]);
    assertState(
      [
        { text: "21-add" },
        { text: "60-add", selected: true, focused: true },
        { text: "72-add" },
        { text: "70-add", selected: true },
        { text: "71-add", selected: true },
        { text: "69-add", selected: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range backwards from 60-add to 70-add"
    );

    widget.removeItems(1, 3);
    assertState(
      [
        { text: "21-add" },
        { text: "71-add", selected: true, focused: true },
        { text: "69-add", selected: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus moves to the start of what is left of the selection range"
    );

    // Test deleting the start of the selection with focus in a gap.
    // We don't expect to follow the special treatment because the user has
    // explicitly moved the focus "outside" of the selected range.
    widget.addItems(2, ["73-add", "74-add", "75-add"]);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "71-add", selected: true },
        { text: "73-add", focused: true },
        { text: "74-add" },
        { text: "75-add" },
        { text: "69-add", selected: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus in range gap"
    );

    widget.removeItems(1, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "74-add", focused: true },
        { text: "75-add" },
        { text: "69-add", selected: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus moves to the next item, rather than the selection range"
    );

    // Same, but deleting the end of the range.
    clickWidgetItem(1, { shiftKey: true });
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "74-add", selected: true },
        { text: "75-add", selected: true },
        { text: "69-add", selected: true, focused: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range backward from 61-add to 74-add, with focus shifted"
    );
    widget.addItems(3, ["76-add", "77-add"]);
    assertState(
      [
        { text: "21-add" },
        { text: "74-add", selected: true },
        { text: "75-add", selected: true },
        { text: "76-add" },
        { text: "77-add" },
        { text: "69-add", selected: true, focused: true },
        { text: "61-add", selected: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus in gap"
    );

    widget.removeItems(5, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "74-add", selected: true },
        { text: "75-add", selected: true },
        { text: "76-add" },
        { text: "77-add" },
        { text: "63-add", focused: true },
        { text: "66-add" },
      ],
      "Focus moves to next item, rather than selection range end"
    );

    // Selection pivot now about 75-add.
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "74-add" },
        { text: "75-add", selected: true },
        { text: "76-add", selected: true },
        { text: "77-add", selected: true, focused: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range forward from 75-add to 77-add"
    );

    widget.addItems(1, ["78-add", "79-add", "80-add"]);
    clickWidgetItem(2, { shiftKey: true });
    assertState(
      [
        { text: "21-add" },
        { text: "78-add" },
        { text: "79-add", selected: true, focused: true },
        { text: "80-add", selected: true },
        { text: "74-add", selected: true },
        { text: "75-add", selected: true },
        { text: "76-add" },
        { text: "77-add" },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range backward from 75-add to 79-add"
    );

    // Move focus to the end of the range and delete again, but with no gap this
    // time.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertState(
      [
        { text: "21-add" },
        { text: "78-add" },
        { text: "79-add", selected: true },
        { text: "80-add", selected: true },
        { text: "74-add", selected: true },
        { text: "75-add", selected: true, focused: true },
        { text: "76-add" },
        { text: "77-add" },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus moved to the end of the selection"
    );

    widget.removeItems(5, 2);
    assertState(
      [
        { text: "21-add" },
        { text: "78-add" },
        { text: "79-add", selected: true },
        { text: "80-add", selected: true },
        { text: "74-add", selected: true },
        { text: "77-add", focused: true },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus moved to the next item rather than the selection start"
    );

    // Deleting with focus before the selection start.
    EventUtils.synthesizeKey("KEY_Home", { ctrlKey: true });
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true });
    assertState(
      [
        { text: "21-add" },
        { text: "78-add", focused: true },
        { text: "79-add", selected: true },
        { text: "80-add", selected: true },
        { text: "74-add", selected: true },
        { text: "77-add" },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus before the selection start"
    );

    widget.removeItems(1, 1);
    assertState(
      [
        { text: "21-add" },
        { text: "79-add", selected: true, focused: true },
        { text: "80-add", selected: true },
        { text: "74-add", selected: true },
        { text: "77-add" },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus moves to the next item, which happens to be in the selection range"
    );

    // Test deleting with focus in the middle of the range.
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true });
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true });
    assertState(
      [
        { text: "21-add", selected: true },
        { text: "79-add", selected: true, focused: true },
        { text: "80-add", selected: true },
        { text: "74-add", selected: true },
        { text: "77-add" },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Selection range backwards from 74-add to 21-add, with focus in middle"
    );

    widget.removeItems(1, 1);
    assertState(
      [
        { text: "21-add", selected: true },
        { text: "80-add", selected: true, focused: true },
        { text: "74-add", selected: true },
        { text: "77-add" },
        { text: "63-add" },
        { text: "66-add" },
      ],
      "Focus moves to the next item, rather than the selection start or end"
    );

    // Delete the whole range.
    widget.removeItems(0, 4);
    assertState(
      [{ text: "63-add", selected: true, focused: true }, { text: "66-add" }],
      "Focus and selection move to the next remaining item"
    );

    // Do the same with focus outside the range.
    widget.addItems(0, ["81-add", "82-add", "83-add", "84-add", "85-add"]);
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    assertState(
      [
        { text: "81-add" },
        { text: "82-add" },
        { text: "83-add" },
        { text: "84-add", focused: true },
        { text: "85-add", selected: true },
        { text: "63-add", selected: true },
        { text: "66-add" },
      ],
      "Focus outside backward selection range"
    );

    widget.removeItems(4, 2);
    assertState(
      [
        { text: "81-add" },
        { text: "82-add" },
        { text: "83-add" },
        { text: "84-add", focused: true },
        { text: "66-add" },
      ],
      "Focus remains the same and is not selected"
    );

    // Same, but with focus also removed.
    widget.addItems(5, ["86-add"]);
    EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    assertState(
      [
        { text: "81-add" },
        { text: "82-add", focused: true },
        { text: "83-add", selected: true },
        { text: "84-add", selected: true },
        { text: "66-add" },
        { text: "86-add" },
      ],
      "Focus outside backwards selection range"
    );

    widget.removeItems(1, 3);
    assertState(
      [
        { text: "81-add" },
        { text: "66-add", selected: true, focused: true },
        { text: "86-add" },
      ],
      "Focus moves to next item and selected"
    );

    // With multi-selection via toggling.

    widget.addItems(3, [
      "87-add",
      "88-add",
      "89-add",
      "90-add",
      "91-add",
      "92-add",
      "93-add",
      "94-add",
    ]);
    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true }, win);
    assertState(
      [
        { text: "81-add" },
        { text: "66-add" },
        { text: "86-add" },
        { text: "87-add", selected: true },
        { text: "88-add", selected: true },
        { text: "89-add", selected: true },
        { text: "90-add", selected: true, focused: true },
        { text: "91-add" },
        { text: "92-add" },
        { text: "93-add" },
        { text: "94-add" },
      ],
      "Start with range selection forward from 87-add to 90-add"
    );

    clickWidgetItem(4, { ctrlKey: true });
    clickWidgetItem(5, { ctrlKey: true });
    assertState(
      [
        { text: "81-add" },
        { text: "66-add" },
        { text: "86-add" },
        { text: "87-add", selected: true },
        { text: "88-add" },
        { text: "89-add", focused: true },
        { text: "90-add", selected: true },
        { text: "91-add" },
        { text: "92-add" },
        { text: "93-add" },
        { text: "94-add" },
      ],
      "Range selection from 87-add to 90-add, with 88-add and 89-add unselected"
    );

    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true });
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true });
    EventUtils.synthesizeKey(" ", { ctrlKey: true });
    assertState(
      [
        { text: "81-add" },
        { text: "66-add" },
        { text: "86-add" },
        { text: "87-add", selected: true },
        { text: "88-add" },
        { text: "89-add" },
        { text: "90-add", selected: true },
        { text: "91-add", selected: true, focused: true },
        { text: "92-add" },
        { text: "93-add" },
        { text: "94-add" },
      ],
      "Mixed selection"
    );

    // Remove before the selected items
    widget.removeItems(0, 2);
    assertState(
      [
        { text: "86-add" },
        { text: "87-add", selected: true },
        { text: "88-add" },
        { text: "89-add" },
        { text: "90-add", selected: true },
        { text: "91-add", selected: true, focused: true },
        { text: "92-add" },
        { text: "93-add" },
        { text: "94-add" },
      ],
      "Same selection and focus"
    );

    // Remove after
    widget.removeItems(6, 1);
    assertState(
      [
        { text: "86-add" },
        { text: "87-add", selected: true },
        { text: "88-add" },
        { text: "89-add" },
        { text: "90-add", selected: true },
        { text: "91-add", selected: true, focused: true },
        { text: "93-add" },
        { text: "94-add" },
      ],
      "Same selection and focus"
    );

    // Removed the focused item, unlike a simple range selection, the focused
    // item is not bound to stay within the selected items.
    widget.removeItems(5, 1);
    assertState(
      [
        { text: "86-add" },
        { text: "87-add", selected: true },
        { text: "88-add" },
        { text: "89-add" },
        { text: "90-add", selected: true },
        { text: "93-add", focused: true },
        { text: "94-add" },
      ],
      "Focus moves to next item and not selected"
    );

    // Remove the unselected items, merging the two ranges together.
    widget.removeItems(2, 2);
    assertState(
      [
        { text: "86-add" },
        { text: "87-add", selected: true },
        { text: "90-add", selected: true },
        { text: "93-add", focused: true },
        { text: "94-add" },
      ],
      "Focus remains the same"
    );

    // Remove the selected items.
    widget.removeItems(1, 2);
    assertState(
      [
        { text: "86-add" },
        { text: "93-add", focused: true },
        { text: "94-add" },
      ],
      "Focus remains the same, and not selected"
    );

    // Remove all selected items, including the focused item.
    widget.addItems(0, [
      "95-add",
      "96-add",
      "97-add",
      "98-add",
      "99-add",
      "100-add",
      "101-add",
    ]);
    EventUtils.synthesizeKey(" ", {}, win);
    assertState(
      [
        { text: "95-add" },
        { text: "96-add" },
        { text: "97-add" },
        { text: "98-add" },
        { text: "99-add" },
        { text: "100-add" },
        { text: "101-add" },
        { text: "86-add" },
        { text: "93-add", selected: true, focused: true },
        { text: "94-add" },
      ],
      "Single selection"
    );

    clickWidgetItem(6, { ctrlKey: true });
    clickWidgetItem(5, { ctrlKey: true });
    assertState(
      [
        { text: "95-add" },
        { text: "96-add" },
        { text: "97-add" },
        { text: "98-add" },
        { text: "99-add" },
        { text: "100-add", selected: true, focused: true },
        { text: "101-add", selected: true },
        { text: "86-add" },
        { text: "93-add", selected: true },
        { text: "94-add" },
      ],
      "Mixed selection with focus selected"
    );

    widget.removeItems(5, 4);
    assertState(
      [
        { text: "95-add" },
        { text: "96-add" },
        { text: "97-add" },
        { text: "98-add" },
        { text: "99-add" },
        { text: "94-add", selected: true, focused: true },
      ],
      "Focus moves to next item and selected"
    );

    // Remove all selected, with focus outside the selection
    clickWidgetItem(1, {});
    clickWidgetItem(3, { ctrlKey: true });
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true });
    assertState(
      [
        { text: "95-add" },
        { text: "96-add", selected: true },
        { text: "97-add", focused: true },
        { text: "98-add", selected: true },
        { text: "99-add" },
        { text: "94-add" },
      ],
      "Mixed selection with focus not selected"
    );

    widget.removeItems(1, 3);
    assertState(
      [
        { text: "95-add" },
        { text: "99-add", selected: true, focused: true },
        { text: "94-add" },
      ],
      "Focus moves to next item and selected"
    );

    // With select all.
    widget.addItems(0, ["102-add", "103-add", "104-add"]);
    widget.addItems(6, ["105-add", "106-add"]);
    selectAllShortcut();
    assertState(
      [
        { text: "102-add", selected: true },
        { text: "103-add", selected: true },
        { text: "104-add", selected: true },
        { text: "95-add", selected: true },
        { text: "99-add", selected: true, focused: true },
        { text: "94-add", selected: true },
        { text: "105-add", selected: true },
        { text: "106-add", selected: true },
      ],
      "All selected"
    );

    // Remove middle and focused.
    widget.removeItems(4, 1);
    assertState(
      [
        { text: "102-add", selected: true },
        { text: "103-add", selected: true },
        { text: "104-add", selected: true },
        { text: "95-add", selected: true },
        { text: "94-add", selected: true, focused: true },
        { text: "105-add", selected: true },
        { text: "106-add", selected: true },
      ],
      "Focus moves to the next item, selections remain"
    );

    // Remove before focused.
    widget.removeItems(1, 1);
    assertState(
      [
        { text: "102-add", selected: true },
        { text: "104-add", selected: true },
        { text: "95-add", selected: true },
        { text: "94-add", selected: true, focused: true },
        { text: "105-add", selected: true },
        { text: "106-add", selected: true },
      ],
      "Focus and selection remain"
    );

    // Remove after the focus.
    widget.removeItems(4, 2);
    assertState(
      [
        { text: "102-add", selected: true },
        { text: "104-add", selected: true },
        { text: "95-add", selected: true },
        { text: "94-add", selected: true, focused: true },
      ],
      "Focus and selection remain"
    );

    // Remove end and focused.
    widget.removeItems(3, 1);
    assertState(
      [
        { text: "102-add", selected: true },
        { text: "104-add", selected: true },
        { text: "95-add", selected: true, focused: true },
      ],
      "Focus moves to the last item, selection remains"
    );

    // Remove start and focused.
    EventUtils.synthesizeKey("KEY_Home", { ctrlKey: true }, win);
    assertState(
      [
        { text: "102-add", selected: true, focused: true },
        { text: "104-add", selected: true },
        { text: "95-add", selected: true },
      ],
      "Focus on first item"
    );

    widget.removeItems(0, 1);
    assertState(
      [
        { text: "104-add", selected: true, focused: true },
        { text: "95-add", selected: true },
      ],
      "Focus moves to next item"
    );

    // Remove items to cause two distinct ranges to merge together, with
    // in-between ranges removed.
    widget.addItems(2, [
      "107-add",
      "108-add",
      "109-add",
      "110-add",
      "111-add",
      "112-add",
      "113-add",
    ]);
    clickWidgetItem(0, { ctrlKey: true });
    assertState(
      [
        { text: "104-add", focused: true },
        { text: "95-add", selected: true },
        { text: "107-add" },
        { text: "108-add" },
        { text: "109-add" },
        { text: "110-add" },
        { text: "111-add" },
        { text: "112-add" },
        { text: "113-add" },
      ],
      "Added items and de-selected 104-add"
    );

    clickWidgetItem(3, { ctrlKey: true });
    clickWidgetItem(4, { ctrlKey: true });
    clickWidgetItem(6, { ctrlKey: true });
    clickWidgetItem(8, { ctrlKey: true });
    assertState(
      [
        { text: "104-add" },
        { text: "95-add", selected: true },
        { text: "107-add" },
        { text: "108-add", selected: true },
        { text: "109-add", selected: true },
        { text: "110-add" },
        { text: "111-add", selected: true },
        { text: "112-add" },
        { text: "113-add", selected: true, focused: true },
      ],
      "Several selection ranges"
    );

    widget.removeItems(2, 6);
    assertState(
      [
        { text: "104-add" },
        { text: "95-add", selected: true },
        { text: "113-add", selected: true, focused: true },
      ],
      "End ranges merged together"
    );

    // Do the same, but where parts of the end ranges are also removed.
    widget.addItems(3, [
      "114-add",
      "115-add",
      "116-add",
      "117-add",
      "118-add",
      "119-add",
      "120-add",
      "121-add",
      "122-add",
      "123-add",
      "124-add",
      "125-add",
      "126-add",
      "127-add",
    ]);
    clickWidgetItem(4, { ctrlKey: true });
    clickWidgetItem(5, { ctrlKey: true });
    clickWidgetItem(7, { ctrlKey: true });
    clickWidgetItem(10, { ctrlKey: true });
    clickWidgetItem(12, { ctrlKey: true });
    clickWidgetItem(13, { ctrlKey: true });
    clickWidgetItem(14, { ctrlKey: true });
    clickWidgetItem(16, { ctrlKey: true });

    clickWidgetItem(9, { ctrlKey: true });
    assertState(
      [
        { text: "104-add" },
        { text: "95-add", selected: true },
        { text: "113-add", selected: true },
        { text: "114-add" },
        { text: "115-add", selected: true },
        { text: "116-add", selected: true },
        { text: "117-add" },
        { text: "118-add", selected: true },
        { text: "119-add" },
        { text: "120-add", selected: true, focused: true },
        { text: "121-add", selected: true },
        { text: "122-add" },
        { text: "123-add", selected: true },
        { text: "124-add", selected: true },
        { text: "125-add", selected: true },
        { text: "126-add" },
        { text: "127-add", selected: true },
      ],
      "Several ranges"
    );

    widget.removeItems(5, 8);
    assertState(
      [
        { text: "104-add" },
        { text: "95-add", selected: true },
        { text: "113-add", selected: true },
        { text: "114-add" },
        { text: "115-add", selected: true },
        { text: "124-add", selected: true, focused: true },
        { text: "125-add", selected: true },
        { text: "126-add" },
        { text: "127-add", selected: true },
      ],
      "Two ranges merged and rest removed, focus moves to next item"
    );
  }
});

// If widget is emptied whilst focused, focus moves to widget.
add_task(function test_emptying_widget() {
  for (const model of selectionModels) {
    // Empty with focused widget.
    reset({ model });
    stepFocus(true, { element: widget }, "Initial");
    widget.addItems(0, ["First", "Second"]);
    assertFocus({ element: widget }, "Focus still on widget after adding");
    widget.removeItems(0, 2);
    assertFocus({ element: widget }, "Focus still on widget after removing");

    // Empty with focused item.
    widget.addItems(0, ["First", "Second"]);
    EventUtils.synthesizeKey("KEY_Home", {}, win);
    assertFocus({ index: 0 }, "Focus on first item");
    widget.removeItems(0, 2);
    assertFocus({ element: widget }, "Focus moves to widget after removing");

    // Empty with focus elsewhere.
    widget.addItems(0, ["First", "Second"]);
    stepFocus(false, { element: before }, "Focus elsewhere");
    widget.removeItems(0, 2);
    assertFocus({ element: before }, "Focus still elsewhere after removing");
    stepFocus(true, { element: widget }, "Widget becomes focused");

    // Empty with focus elsewhere, but active item.
    widget.addItems(0, ["First", "Second"]);
    // Move away from and back to widget to focus second item.
    stepFocus(true, { element: after }, "Focus elsewhere");
    widget.selectSingleItem(1);
    stepFocus(false, { index: 1 }, "Focus on second item");
    stepFocus(false, { element: before }, "Return focus to elsewhere");
    widget.removeItems(0, 2);
    assertFocus({ element: before }, "Focus still elsewhere after removing");
    stepFocus(true, { element: widget }, "Widget becomes focused");
  }
});

/**
 * Test moving items in the widget.
 *
 * @param {string} model - The selection model to use.
 * @param {boolean} reCreate - Whether the widget should reCreate the items when
 *   moving them.
 */
function subtest_move_items(model, reCreate) {
  reset({ model, direction: "right-to-left" });

  widget.addItems(0, [
    "0-add",
    "1-add",
    "2-add",
    "3-add",
    "4-add",
    "5-add",
    "6-add",
    "7-add",
    "8-add",
    "9-add",
    "10-add",
    "11-add",
    "12-add",
    "13-add",
  ]);
  clickWidgetItem(5, {});

  assertState(
    [
      { text: "0-add" },
      { text: "1-add" },
      { text: "2-add" },
      { text: "3-add" },
      { text: "4-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "6-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "9-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Item 5 selected and focused"
  );

  // Move items before focus.
  widget.moveItems(4, 3, 1, reCreate);
  assertState(
    [
      { text: "0-add" },
      { text: "1-add" },
      { text: "2-add" },
      { text: "4-add" },
      { text: "3-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "6-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "9-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Same focus and selection"
  );
  widget.moveItems(1, 3, 2, reCreate);
  assertState(
    [
      { text: "0-add" },
      { text: "4-add" },
      { text: "3-add" },
      { text: "1-add" },
      { text: "2-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "6-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "9-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Same focus and selection"
  );

  // Move items after focus.
  widget.moveItems(6, 8, 2, reCreate);
  assertState(
    [
      { text: "0-add" },
      { text: "4-add" },
      { text: "3-add" },
      { text: "1-add" },
      { text: "2-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "8-add" },
      { text: "9-add" },
      { text: "6-add" },
      { text: "7-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Same focus and selection"
  );
  widget.moveItems(9, 6, 1, reCreate);
  assertState(
    [
      { text: "0-add" },
      { text: "4-add" },
      { text: "3-add" },
      { text: "1-add" },
      { text: "2-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "7-add" },
      { text: "8-add" },
      { text: "9-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Same focus and selection"
  );

  // Move from before focus to after focus.
  widget.moveItems(2, 3, 3, reCreate);
  assertState(
    [
      { text: "0-add" },
      { text: "4-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "3-add" },
      { text: "1-add" },
      { text: "2-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "9-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Same focus and selection, but moved"
  );

  // Move from after focus to before focus.
  widget.moveItems(3, 2, 5, reCreate);
  assertState(
    [
      { text: "0-add" },
      { text: "4-add" },
      { text: "3-add" },
      { text: "1-add" },
      { text: "2-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "9-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Same focus and selection, but moved"
  );

  // Move selected and focused up.
  widget.moveItems(7, 3, 1, reCreate);
  assertState(
    [
      { text: "0-add" },
      { text: "4-add" },
      { text: "3-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "1-add" },
      { text: "2-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "9-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Focus and selection moved to index 3"
  );

  // Move down.
  widget.moveItems(3, 5, 1, reCreate);
  assertState(
    [
      { text: "0-add" },
      { text: "4-add" },
      { text: "3-add" },
      { text: "1-add" },
      { text: "2-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "7-add" },
      { text: "8-add" },
      { text: "9-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Focus and selection moved to index 5"
  );

  // Move in a group.
  widget.moveItems(4, 5, 3, reCreate);
  assertState(
    [
      { text: "0-add" },
      { text: "4-add" },
      { text: "3-add" },
      { text: "1-add" },
      { text: "8-add" },
      { text: "2-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "7-add" },
      { text: "9-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Focus and selection moved to index 6"
  );
  widget.moveItems(5, 4, 3, reCreate);
  assertState(
    [
      { text: "0-add" },
      { text: "4-add" },
      { text: "3-add" },
      { text: "1-add" },
      { text: "2-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "7-add" },
      { text: "8-add" },
      { text: "9-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Focus and selection moved back to index 5"
  );

  // With focus split from selection.
  if (model == "focus") {
    return;
  }

  // Focus before selection.
  EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
  assertState(
    [
      { text: "0-add" },
      { text: "4-add" },
      { text: "3-add" },
      { text: "1-add", focused: true },
      { text: "2-add" },
      { text: "5-add", selected: true },
      { text: "7-add" },
      { text: "8-add" },
      { text: "9-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Focus before selection"
  );

  // Move before both.
  widget.moveItems(0, 1, 1, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "0-add" },
      { text: "3-add" },
      { text: "1-add", focused: true },
      { text: "2-add" },
      { text: "5-add", selected: true },
      { text: "7-add" },
      { text: "8-add" },
      { text: "9-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Same focus and selection"
  );

  // Move after both.
  widget.moveItems(8, 7, 1, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "0-add" },
      { text: "3-add" },
      { text: "1-add", focused: true },
      { text: "2-add" },
      { text: "5-add", selected: true },
      { text: "7-add" },
      { text: "9-add" },
      { text: "8-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Same focus and selection"
  );

  // Move focus to after selected.
  widget.moveItems(3, 6, 2, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "0-add" },
      { text: "3-add" },
      { text: "5-add", selected: true },
      { text: "7-add" },
      { text: "9-add" },
      { text: "1-add", focused: true },
      { text: "2-add" },
      { text: "8-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Focus moved to after selection"
  );

  // Move focus before selected.
  widget.moveItems(5, 2, 3, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "0-add" },
      { text: "9-add" },
      { text: "1-add", focused: true },
      { text: "2-add" },
      { text: "3-add" },
      { text: "5-add", selected: true },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Focus moved to before selection"
  );

  // Move selection before focus.
  widget.moveItems(5, 1, 5, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "5-add", selected: true },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add" },
      { text: "0-add" },
      { text: "9-add" },
      { text: "1-add", focused: true },
      { text: "2-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Selected moved to before focus"
  );

  // Move selection after focus.
  widget.moveItems(2, 8, 1, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add" },
      { text: "0-add" },
      { text: "9-add" },
      { text: "1-add", focused: true },
      { text: "5-add", selected: true },
      { text: "2-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Selected moved to after focus"
  );

  // Navigation still works.
  EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add" },
      { text: "0-add" },
      { text: "9-add", focused: true },
      { text: "1-add" },
      { text: "5-add", selected: true },
      { text: "2-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Selected moved to after focus"
  );

  // Test with multi-selection.
  if (model == "browse") {
    return;
  }

  EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add", selected: true, focused: true },
      { text: "0-add", selected: true },
      { text: "9-add", selected: true },
      { text: "1-add" },
      { text: "5-add" },
      { text: "2-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Range selection from 9-add to 6-add"
  );

  // Move non-selected into the middle of the selected.
  widget.moveItems(8, 5, 2, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add", selected: true, focused: true },
      { text: "5-add" },
      { text: "2-add" },
      { text: "0-add", selected: true },
      { text: "9-add", selected: true },
      { text: "1-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Non-selected gap"
  );

  // Moving an item always ends a Shift range selection.
  EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "8-add", selected: true, focused: true },
      { text: "6-add", selected: true },
      { text: "5-add" },
      { text: "2-add" },
      { text: "0-add" },
      { text: "9-add" },
      { text: "1-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Range selection from 6-add to 8-add"
  );

  clickWidgetItem(9, { shiftKey: true }, win);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add", selected: true },
      { text: "5-add", selected: true },
      { text: "2-add", selected: true },
      { text: "0-add", selected: true },
      { text: "9-add", selected: true },
      { text: "1-add", selected: true, focused: true },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Range selection from 6-add to 1-add"
  );

  // Move selected to middle of selected.
  widget.moveItems(8, 6, 2, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add", selected: true },
      { text: "5-add", selected: true },
      { text: "9-add", selected: true },
      { text: "1-add", selected: true, focused: true },
      { text: "2-add", selected: true },
      { text: "0-add", selected: true },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Selection block"
  );

  // Also ends a Shift range selection.
  EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "9-add", selected: true },
      { text: "1-add", selected: true },
      { text: "2-add" },
      { text: "0-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Range selection from 1-add to 5-add"
  );

  // Move from start of selection to end.
  widget.moveItems(5, 7, 1, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add" },
      { text: "9-add", selected: true },
      { text: "1-add", selected: true },
      { text: "5-add", selected: true, focused: true },
      { text: "2-add" },
      { text: "0-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Moved to end"
  );

  // And reverse.
  widget.moveItems(7, 5, 1, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "8-add" },
      { text: "6-add" },
      { text: "5-add", selected: true, focused: true },
      { text: "9-add", selected: true },
      { text: "1-add", selected: true },
      { text: "2-add" },
      { text: "0-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Moved back to start"
  );

  // Also broke Shift range selection.
  EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { shiftKey: true }, win);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add", selected: true, focused: true },
      { text: "7-add", selected: true },
      { text: "8-add", selected: true },
      { text: "6-add", selected: true },
      { text: "5-add", selected: true },
      { text: "9-add" },
      { text: "1-add" },
      { text: "2-add" },
      { text: "0-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "13-add" },
    ],
    "Range selection from 5-add to 3-add"
  );

  EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
  EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
  EventUtils.synthesizeKey("KEY_End", { ctrlKey: true }, win);
  EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
  EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
  EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
  EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
  EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);

  assertState(
    [
      { text: "4-add" },
      { text: "3-add", selected: true },
      { text: "7-add" },
      { text: "8-add", selected: true },
      { text: "6-add", selected: true },
      { text: "5-add", selected: true },
      { text: "9-add" },
      { text: "1-add" },
      { text: "2-add", selected: true, focused: true },
      { text: "0-add", selected: true },
      { text: "10-add" },
      { text: "11-add", selected: true },
      { text: "12-add" },
      { text: "13-add", selected: true },
    ],
    "Multi-selection"
  );

  // Move selected with gap into middle of a selection block.
  widget.moveItems(8, 4, 6, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "3-add", selected: true },
      { text: "7-add" },
      { text: "8-add", selected: true },
      { text: "2-add", selected: true, focused: true },
      { text: "0-add", selected: true },
      { text: "10-add" },
      { text: "11-add", selected: true },
      { text: "12-add" },
      { text: "13-add", selected: true },
      { text: "6-add", selected: true },
      { text: "5-add", selected: true },
      { text: "9-add" },
      { text: "1-add" },
    ],
    "Merged ranges together on both sides"
  );

  // Move selected with gap to start of a selection block.
  widget.moveItems(5, 1, 5, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "0-add", selected: true },
      { text: "10-add" },
      { text: "11-add", selected: true },
      { text: "12-add" },
      { text: "13-add", selected: true },
      { text: "3-add", selected: true },
      { text: "7-add" },
      { text: "8-add", selected: true },
      { text: "2-add", selected: true, focused: true },
      { text: "6-add", selected: true },
      { text: "5-add", selected: true },
      { text: "9-add" },
      { text: "1-add" },
    ],
    "Merged ranges together at start"
  );

  // Move selected with gap to end of a selection block.
  widget.moveItems(1, 4, 8, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "2-add", selected: true, focused: true },
      { text: "6-add", selected: true },
      { text: "5-add", selected: true },
      { text: "0-add", selected: true },
      { text: "10-add" },
      { text: "11-add", selected: true },
      { text: "12-add" },
      { text: "13-add", selected: true },
      { text: "3-add", selected: true },
      { text: "7-add" },
      { text: "8-add", selected: true },
      { text: "9-add" },
      { text: "1-add" },
    ],
    "Merged ranges together at end"
  );

  // Move block with non-selected boundaries into middle of selected.
  widget.moveItems(5, 3, 6, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "2-add", selected: true, focused: true },
      { text: "6-add", selected: true },
      { text: "10-add" },
      { text: "11-add", selected: true },
      { text: "12-add" },
      { text: "13-add", selected: true },
      { text: "3-add", selected: true },
      { text: "7-add" },
      { text: "5-add", selected: true },
      { text: "0-add", selected: true },
      { text: "8-add", selected: true },
      { text: "9-add" },
      { text: "1-add" },
    ],
    "Split range block"
  );

  // Move block with selected at start into middle of selected.
  widget.moveItems(1, 6, 5, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "13-add", selected: true },
      { text: "3-add", selected: true },
      { text: "7-add" },
      { text: "5-add", selected: true },
      { text: "0-add", selected: true },
      { text: "2-add", selected: true, focused: true },
      { text: "6-add", selected: true },
      { text: "10-add" },
      { text: "11-add", selected: true },
      { text: "12-add" },
      { text: "8-add", selected: true },
      { text: "9-add" },
      { text: "1-add" },
    ],
    "Merged ranges together at start"
  );

  // Move block with selected at end into middle of selected.
  widget.moveItems(8, 6, 4, reCreate);
  assertState(
    [
      { text: "4-add" },
      { text: "13-add", selected: true },
      { text: "3-add", selected: true },
      { text: "7-add" },
      { text: "5-add", selected: true },
      { text: "0-add", selected: true },
      { text: "10-add" },
      { text: "11-add", selected: true },
      { text: "12-add" },
      { text: "8-add", selected: true },
      { text: "2-add", selected: true, focused: true },
      { text: "6-add", selected: true },
      { text: "9-add" },
      { text: "1-add" },
    ],
    "Merged ranges together at end"
  );

  // Move selected into non-selected region and move to start.
  widget.moveItems(4, 0, 6, reCreate);
  assertState(
    [
      { text: "5-add", selected: true },
      { text: "0-add", selected: true },
      { text: "10-add" },
      { text: "11-add", selected: true },
      { text: "12-add" },
      { text: "8-add", selected: true },
      { text: "4-add" },
      { text: "13-add", selected: true },
      { text: "3-add", selected: true },
      { text: "7-add" },
      { text: "2-add", selected: true, focused: true },
      { text: "6-add", selected: true },
      { text: "9-add" },
      { text: "1-add" },
    ],
    "Merged ranges together at end"
  );

  // Remove gap between two selections and move to end.
  widget.moveItems(2, 9, 5, reCreate);
  assertState(
    [
      { text: "5-add", selected: true },
      { text: "0-add", selected: true },
      { text: "13-add", selected: true },
      { text: "3-add", selected: true },
      { text: "7-add" },
      { text: "2-add", selected: true, focused: true },
      { text: "6-add", selected: true },
      { text: "9-add" },
      { text: "1-add" },
      { text: "10-add" },
      { text: "11-add", selected: true },
      { text: "12-add" },
      { text: "8-add", selected: true },
      { text: "4-add" },
    ],
    "Merged ranges together"
  );

  // Navigation still works.
  EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
  assertState(
    [
      { text: "5-add" },
      { text: "0-add" },
      { text: "13-add" },
      { text: "3-add" },
      { text: "7-add" },
      { text: "2-add" },
      { text: "6-add", selected: true, focused: true },
      { text: "9-add" },
      { text: "1-add" },
      { text: "10-add" },
      { text: "11-add" },
      { text: "12-add" },
      { text: "8-add" },
      { text: "4-add" },
    ],
    "Move by one index and single select"
  );
}

// Moving items in the widget will move focus and selection with the moved
// items.
add_task(function test_move_items() {
  for (const model of selectionModels) {
    // We want to be sure the methods work with or without re-creating the
    // item elements.
    subtest_move_items(model, false);
    subtest_move_items(model, true);
  }
});

// Test that dragging is possible.
add_task(function test_can_drag_items() {
  /**
   * Assert that dragging can occur and takes place with the expected selection.
   *
   * @param {number} index - The index of the item to start dragging on. We also
   *   expect this item to have focus during and after dragging.
   * @param {number[]} selection - The expected selection during and after
   *   dragging.
   * @param {string} msg - A message to use in assertions.
   */
  function assertDragstart(index, selection, msg) {
    const element = widget.items[index].element;
    let eventFired = false;

    const dragstartListener = event => {
      eventFired = true;
      Assert.ok(
        element.contains(event.target),
        `Item ${index} contains the dragstart target`
      );
      assertFocus({ index }, `Item ${index} has focus in dragstart: ${msg}`);
      assertSelection(selection, `Selection in dragstart: ${msg}`);
    };
    widget.addEventListener("dragstart", dragstartListener, true);

    // Synthesize the start of a drag.
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    EventUtils.synthesizeMouseAtPoint(x, y, { type: "mousedown" }, win);
    EventUtils.synthesizeMouseAtPoint(x, y, { type: "mousemove" }, win);
    EventUtils.synthesizeMouseAtPoint(x, y + 60, { type: "mousemove" }, win);
    // Don't care about ending the drag.

    Assert.ok(eventFired, `dragstart event fired: ${msg}`);
    widget.removeEventListener("dragstart", dragstartListener, true);
    assertSelection(selection, `Same selection after dragging: ${msg}`);
    assertFocus(
      { index },
      `Item ${index} still has focus after dragging: ${msg}`
    );
  }

  for (const model of selectionModels) {
    reset({ model, draggable: true });
    widget.addItems(0, ["First", "Second", "Third"]);
    assertFocus({ element: before }, "Focus outside widget");
    assertSelection([], "No initial selection");
    assertDragstart(1, [1], "First drag with no focus or selection");

    assertDragstart(1, [1], "Already selected item");
    assertDragstart(2, [2], "Non-selected item");

    reset({ model, draggable: true });
    widget.addItems(0, ["First", "Second", "Third"]);
    widget.selectSingleItem(1);
    assertFocus({ element: before }, "Focus outside widget");
    assertSelection([1], "Initial selection on item 1");
    assertDragstart(1, [1], "First drag on selected item");

    reset({ model, draggable: true });
    widget.addItems(0, ["First", "Second", "Third", "Fourth", "Fifth"]);
    widget.selectSingleItem(3);
    assertFocus({ element: before }, "Focus outside widget");
    assertSelection([3], "Initial selection on item 3");
    assertDragstart(2, [2], "First drag on non-selected item");

    // With focus split from selected.
    if (model == "focus") {
      continue;
    }
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    assertFocus({ index: 3 }, "Focus on item 3");
    assertSelection([2], "Item 2 is selected");
    assertDragstart(3, [3], "Non-selected but focused item");

    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    assertFocus({ index: 2 }, "Focus on item 2");
    assertSelection([3], "Item 3 is selected");
    assertDragstart(3, [3], "Selected but non-focused item");

    // With mutli-selection.
    if (model == "browse") {
      continue;
    }

    // Clicking a non-selected item will change to selection to the single item
    // before dragging.
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowRight", { ctrlKey: true }, win);
    EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
    assertFocus({ index: 1 }, "Focus on item 1");
    assertSelection([1, 3], "Multi selection");
    assertDragstart(2, [2], "Selection moves to item 2 before drag");

    // Clicking a selected item will keep the same selection for dragging.
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey("KEY_ArrowLeft", { ctrlKey: true }, win);
    EventUtils.synthesizeKey(" ", { ctrlKey: true }, win);
    assertFocus({ index: 4 }, "Focus on item 4");
    assertSelection([2, 4], "Multi selection");
    assertDragstart(
      4,
      [2, 4],
      "Selection same when dragging selected and focused"
    );
    assertDragstart(
      2,
      [2, 4],
      "Selection same when dragging selected and non-focussed"
    );
  }
});
