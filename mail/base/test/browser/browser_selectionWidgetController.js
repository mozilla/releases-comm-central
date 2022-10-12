/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

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
 * Assert that the specified items are selected in the widget, and nothing else.
 *
 * @param {number[]} indices - The indices of the selected items.
 * @param {string} msg - A message to use for the assertion.
 */
function assertSelection(indices, msg) {
  let selected = widget.selectedIndices();
  Assert.deepEqual(selected, indices, `Selected indices should match: ${msg}`);
}

/**
 * Assert that the given element is focused.
 *
 * @param {Object} expect - The expected focused element.
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
  let activeIndex = widget.items.findIndex(i => i.element == active);
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
 * @param {Object} expect - The expected focused element after pressing tab.
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
 * @typedef {Object} ItemState
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
  let textOrder = [];
  let focusIndex;
  let selectedIndices = [];
  for (let [index, state] of expected.entries()) {
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
 * @param {Object} mouseEvent - Properties for the click event.
 */
function clickWidgetEmptySpace(mouseEvent) {
  let widgetRect = widget.getBoundingClientRect();
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
 * @param {Object} mouseEvent - Properties for the click event.
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
  for (let model of selectionModels) {
    reset({ model });

    assertFocus({ element: before }, "Initial");

    // Move focus forward.
    stepFocus(true, { element: widget }, "Move into widget");
    stepFocus(true, { element: after }, "Move out of widget");

    // Move focus backward.
    stepFocus(false, { element: widget }, "Move back to widget");
    stepFocus(false, { element: before }, "Move back out of widget");

    // Clicking also gives focus.
    for (let shiftKey of [false, true]) {
      for (let ctrlKey of [false, true]) {
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

// If the widget has no selection when we move into it, the first item is
// focused and selected.
add_task(function test_initial_no_select_focus() {
  for (let model of selectionModels) {
    // Forward.
    reset({ model });
    widget.addItems(0, ["First", "Second"]);

    assertFocus({ element: before }, "Forward start");
    assertSelection([], "Initial");

    stepFocus(true, { index: 0 }, "Move onto first item");
    assertSelection([0], "First item becomes selected");
    stepFocus(true, { element: after }, "Move out of widget");

    // Reverse.
    reset({ model });
    after.focus();
    widget.addItems(0, ["First", "Second"]);

    assertFocus({ element: after }, "Reverse start");
    assertSelection([], "Reverse start");

    stepFocus(false, { index: 0 }, "Move backward to first item");
    assertSelection([0], "First item becomes selected on reverse");
    stepFocus(false, { element: before }, "Move out of widget");

    // With mouse click.
    for (let shiftKey of [false, true]) {
      for (let ctrlKey of [false, true]) {
        info(`Clicking widget: ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`);

        reset({ model });
        widget.addItems(0, ["First", "Second"]);

        assertFocus({ element: before }, "Click empty start");
        assertSelection([], "Click empty start");
        clickWidgetEmptySpace({});
        assertFocus(
          { index: 0 },
          "First item becomes focused with click on empty"
        );
        assertSelection([0], "First item becomes selected with click on empty");

        // With mouse click on item.
        reset({ model });
        widget.addItems(0, ["First", "Second", "Third", "Fourth"]);

        assertFocus({ element: before }, "Click third item start");
        assertSelection([], "Click third item start");
        clickWidgetItem(2, { shiftKey, ctrlKey });
        if (
          (shiftKey && ctrlKey) ||
          ((shiftKey || ctrlKey) && (model == "focus" || model == "browse"))
        ) {
          // Both modifiers, or multi-selection not supported, so acts the
          // same as clicking empty.
          assertFocus(
            { index: 0 },
            "First item becomes focused with click on item"
          );
          assertSelection(
            [0],
            "First item becomes selected with click on item"
          );
        } else {
          assertFocus(
            { index: 2 },
            "Third item becomes focused with click on item"
          );
          if (ctrlKey) {
            // Ctrl key toggles the clicked index to be selected.
            assertSelection(
              [2],
              "Third item becomes selected with Ctrl+click on item"
            );
          } else if (shiftKey) {
            // Shift key selects from the first index to the clicked index.
            assertSelection(
              [0, 1, 2],
              "First to third item become selected with Shift+click on item"
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

// If the widget has a selection when we move into it, the selected item is
// focused.
add_task(function test_initial_select_focus() {
  for (let model of selectionModels) {
    reset({ model });
    widget.addItems(0, ["First", "Second", "Third"]);
    widget.selectSingleItem(1);

    assertFocus({ element: before }, "Forward start");
    assertSelection([1], "Initial selection on second item");

    stepFocus(true, { index: 1 }, "Move onto selected item");
    assertSelection([1], "Second item remains selected");
    stepFocus(true, { element: after }, "Move out of widget");

    // Reverse.
    reset({ model });
    after.focus();
    widget.addItems(0, ["First", "Second", "Third"]);
    widget.selectSingleItem(1);

    assertFocus({ element: after }, "Reverse start");
    assertSelection([1], "Reverse start");

    stepFocus(false, { index: 1 }, "Move backward to selected item");
    assertSelection([1], "Second item remains selected on reverse");
    stepFocus(false, { element: before }, "Move out of widget");

    // With mouse click.
    for (let shiftKey of [false, true]) {
      for (let ctrlKey of [false, true]) {
        info(`Clicking widget: ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`);

        reset({ model });
        widget.addItems(0, ["First", "Second", "Third"]);
        widget.selectSingleItem(1);

        assertFocus({ element: before }, "Click empty start");
        assertSelection([1], "Click empty start");
        clickWidgetEmptySpace({});
        assertFocus(
          { index: 1 },
          "Selected item becomes focused with click on empty"
        );
        assertSelection(
          [1],
          "Second item remains selected with click on empty"
        );

        // With mouse click on item.
        reset({ model });
        widget.addItems(0, ["First", "Second", "Third", "Fourth"]);
        widget.selectSingleItem(2);

        assertFocus({ element: before }, "Click first item start");
        assertSelection([2], "Click first item start");

        clickWidgetItem(0, { shiftKey, ctrlKey });
        if (
          (shiftKey && ctrlKey) ||
          ((shiftKey || ctrlKey) && (model == "focus" || model == "browse"))
        ) {
          // Both modifiers, or multi-selection not supported, so acts the
          // same as clicking empty.
          assertFocus(
            { index: 2 },
            "Selected item becomes focused with click on item"
          );
          assertSelection(
            [2],
            "Third item remains selected with click on item"
          );
        } else {
          assertFocus(
            { index: 0 },
            "First item becomes focused with click on item"
          );
          if (ctrlKey) {
            // We toggle the first item to be selected, and the third item
            // remains selected.
            assertSelection(
              [0, 2],
              "First item becomes selected with Ctrl+click on item"
            );
          } else if (shiftKey) {
            // We select between the previous focus item and the clicked item.
            // I.e. between the third and the first.
            assertSelection(
              [0, 1, 2],
              "First to third items are selected with Shift+click on item"
            );
          } else {
            assertSelection(
              [0],
              "First item becomes selected with click on item"
            );
          }
        }
      }
    }
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

  for (let model of selectionModels) {
    reset({ model });
    widget.addItems(0, ["First", "Second", "Third", "Fourth"]);

    stepFocus(true, { index: 0 }, "Move onto first item");

    for (let outside of [false, true]) {
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
    for (let shiftKey of [false, true]) {
      for (let ctrlKey of [false, true]) {
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

        for (let key of [backwardKey, forwardKey, "KEY_Home", "KEY_End"]) {
          for (let shiftKey of [false, true]) {
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
        assertSelection(
          [1],
          "Selection moves with focus when not pressing Ctrl"
        );

        EventUtils.synthesizeKey("KEY_Home", { ctrlKey: true }, win);
        assertFocus({ index: 0 }, "Ctrl+Home to first item");
        assertSelection([1], "Second item remains selected on Ctrl+Home");

        // Does nothing if combined with Shift.
        for (let key of [backwardKey, forwardKey, "KEY_Home", "KEY_End"]) {
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
  }
});

// Using Space to select items.
add_task(function test_space_selection() {
  for (let model of selectionModels) {
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
    for (let ctrlKey of [false, true]) {
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
  for (let model of selectionModels) {
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
  for (let model of selectionModels) {
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
  for (let model of selectionModels) {
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
    EventUtils.synthesizeKey("Home", { shiftKey: true }, win);
    assertFocus({ index: 0 }, "Focus moves to first item");
    assertSelection([0, 1, 2], "Up to third item is selected");

    EventUtils.synthesizeKey("End", { shiftKey: true }, win);
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
    EventUtils.synthesizeKey("Home", { ctrlKey: true }, win);
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

    EventUtils.synthesizeKey("End", { shiftKey: true }, win);
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
  for (let model of selectionModels) {
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
        for (let shiftKey of [false, true]) {
          info(
            `Adding items to empty ${direction} widget and then pressing ${
              ctrlKey ? "Ctrl+" : ""
            }${shiftKey ? "Shift+" : ""}${key}`
          );
          reset({ model, direction });

          stepFocus(true, { element: widget }, "Move focus onto empty widget");
          widget.addItems(0, ["First", "Second", "Third"]);

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
            let selection = [];
            for (let i = 0; i <= index; i++) {
              selection.push(i);
            }
            assertSelection(
              selection,
              `Range selection from 0 to ${index} if pressing Shift+${key}`
            );
          } else {
            assertSelection([index], `Item selected after ${key}`);
          }
        }
      }
    }

    // Arrow keys in other directions do nothing.
    reset({ model, direction: "top-to-bottom" });
    stepFocus(true, { element: widget }, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second"]);
    for (let key of ["KEY_ArrowRight", "KEY_ArrowLeft"]) {
      EventUtils.synthesizeKey(key, {}, win);
      assertFocus({ element: widget }, `Focus remains on widget after ${key}`);
      assertSelection([], `No items become selected after ${key}`);
    }

    reset({ model, direction: "right-to-left" });
    stepFocus(true, { element: widget }, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second"]);
    for (let key of ["KEY_ArrowUp", "KEY_ArrowDown"]) {
      EventUtils.synthesizeKey(key, {}, win);
      assertFocus({ element: widget }, `Focus remains on widget after ${key}`);
      assertSelection([], `No items become selected after ${key}`);
    }

    // Pressing Space does nothing.
    reset({ model });
    stepFocus(true, { element: widget }, "Move focus onto empty widget");
    widget.addItems(0, ["First", "Second"]);
    for (let ctrlKey of [false, true]) {
      for (let shiftKey of [false, true]) {
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

    // This does not effect clicking.
    // NOTE: case where widget does not initially have focus on clicking is
    // handled by test_initial_no_select_focus
    for (let ctrlKey of [false, true]) {
      for (let shiftKey of [false, true]) {
        info(
          `Adding items to empty focused widget and then ${
            ctrlKey ? "Ctrl+" : ""
          }${shiftKey ? "Shift+" : ""}+Click`
        );
        reset({ model });
        stepFocus(true, { element: widget }, "Move focus onto empty widget");
        widget.addItems(0, ["First", "Second", "Third"]);
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
  for (let model of selectionModels) {
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
  for (let model of selectionModels) {
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
