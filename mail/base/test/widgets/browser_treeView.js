/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

// We wish to run several variants of each test with minor differences, based on
// changes in the source file, in order to verify that certain variables don't
// impact behavior.
const TEST_VARIANTS = ["header", "no-header"];

/**
 * Run a given test in a new tab and script sandbox.
 *
 * @param {Function} test - The test function to run in the sandbox.
 * @param {string} filenameFragment - The fragment of the filename representing
 *   the test variant to run.
 * @param {object[]} sandboxArgs - Arguments to the sandbox spawner to pass to
 *   the test function.
 */
async function runTestInSandbox(test, filenameFragment, sandboxArgs = []) {
  // Create a new tab with our custom content.
  const tab = tabmail.openTab("contentTab", {
    url: `${getRootDirectory(
      gTestPath
    )}files/tree-element-test-${filenameFragment}.xhtml`,
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  // Spawn a new JavaScript sandbox for the tab and run the test function inside
  // of it.
  await SpecialPowers.spawn(tab.browser, sandboxArgs, test);

  tabmail.closeTab(tab);
}

/**
 * Checks that interactions with the widget do as expected.
 */
add_task(async function testKeyboardAndMouse() {
  for (const variant of TEST_VARIANTS) {
    info(`Running keyboard and mouse test for ${variant}`);
    await runTestInSandbox(subtestKeyboardAndMouse, variant, [variant]);
  }
});

async function subtestKeyboardAndMouse(variant) {
  const doc = content.document;

  const list = doc.getElementById("testTree");
  Assert.ok(!!list, "the list exists");

  async function doListActionAndWaitForRowBuffer(actionFn) {
    // Filling the row buffer is fiddly timing, so provide an event to indicate
    // that actions which may trigger changes in the row buffer have finished.
    const eventName = "_treerowbufferfill";
    list._rowBufferReadyEvent = new content.CustomEvent(eventName);

    const promise = new Promise(resolve =>
      list.addEventListener(eventName, resolve, { once: true })
    );

    await actionFn();
    await promise;

    list._rowBufferReadyEvent = null;
  }

  async function scrollListToPosition(topOfScroll) {
    await doListActionAndWaitForRowBuffer(() => {
      list.scrollTo(0, topOfScroll);
    });
  }

  Assert.equal(list._rowElementName, "test-row");
  Assert.equal(list._rowElementClass, content.customElements.get("test-row"));
  Assert.equal(
    list._toleranceSize,
    26,
    "list should have tolerance twice the number of visible rows"
  );

  // We should be scrolled to the top already, but this will ensure we get an
  // event fire one way or another.
  await scrollListToPosition(0);

  let rows = list.querySelectorAll(`tr[is="test-row"]`);
  // Count is calculated from the height of `list` divided by
  // TestCardRow.ROW_HEIGHT, plus list._toleranceSize.
  Assert.equal(rows.length, 13 + 26, "the list has the right number of rows");

  Assert.equal(doc.activeElement, doc.body);

  // Verify the tab order of list elements by tabbing both forward and backward
  // through them.
  EventUtils.synthesizeKey("VK_TAB", {}, content);
  Assert.equal(
    doc.activeElement.id,
    "before",
    "the element before the list should have focus"
  );

  if (variant == "header") {
    // Tab order changes slightly if the table has a header versus if it
    // doesn't, so we need to account for that variation.
    EventUtils.synthesizeKey("VK_TAB", {}, content);
    Assert.equal(
      doc.activeElement.id,
      "testColButton",
      "the list header button should have focus"
    );
  }

  EventUtils.synthesizeKey("VK_TAB", {}, content);
  Assert.equal(doc.activeElement.id, "testBody", "the list should have focus");

  EventUtils.synthesizeKey("VK_TAB", {}, content);
  Assert.equal(
    doc.activeElement.id,
    "after",
    "the element after the list should have focus"
  );

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, content);
  Assert.equal(doc.activeElement.id, "testBody", "the list should have focus");

  if (variant == "header") {
    // Tab order changes slightly if the table has a header versus if it
    // doesn't, so we need to account for that variation.
    EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, content);
    Assert.equal(
      doc.activeElement.id,
      "testColButton",
      "the list header button should have focus"
    );
  }

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, content);
  Assert.equal(
    doc.activeElement.id,
    "before",
    "the element before the list should have focus"
  );

  // Check initial selection.

  const selectHandler = {
    seenEvent: null,
    currentAtEvent: null,
    selectedAtEvent: null,
    t0: Date.now(),
    time: 0,

    reset() {
      this.seenEvent = null;
      this.currentAtEvent = null;
      this.selectedAtEvent = null;
      this.t0 = Date.now();
    },
    handleEvent(event) {
      this.seenEvent = event;
      this.currentAtEvent = list.currentIndex;
      this.selectedAtEvent = list.selectedIndices;
      this.time = Date.now() - this.t0;
    },
  };

  /**
   * Check if the spacerTop TBODY of the TreeViewTable is properly allocating
   * the height of non existing rows.
   *
   * @param {int} nbrOfRows - The number of rows that the spacerTop should be
   *   simulating their height allocation.
   */
  function checkTopSpacerHeight(nbrOfRows) {
    const table = doc.querySelector(`[is="tree-view-table"]`);
    // -26 to account for the tolerance buffer.
    Assert.equal(
      table.spacerTop.clientHeight,
      list.getRowAtIndex(nbrOfRows).clientHeight * (nbrOfRows - 26),
      "The top spacer has the correct height"
    );
  }

  function checkCurrent(expectedIndex) {
    Assert.equal(list.currentIndex, expectedIndex, "currentIndex is correct");
    if (selectHandler.currentAtEvent !== null) {
      Assert.equal(
        selectHandler.currentAtEvent,
        expectedIndex,
        "currentIndex was correct at the last 'select' event"
      );
    }

    const current = list.querySelectorAll(".current");
    if (expectedIndex == -1) {
      Assert.equal(current.length, 0, "no rows have the 'current' class");
    } else {
      Assert.equal(current.length, 1, "only one row has the 'current' class");
      Assert.equal(
        current[0].index,
        expectedIndex,
        "correct row has the 'current' class"
      );
    }
  }

  function checkSelected(...expectedIndices) {
    Assert.deepEqual(
      list.selectedIndices,
      expectedIndices,
      "selectedIndices are correct"
    );

    if (selectHandler.selectedAtEvent !== null) {
      // Check the value was already set when the select event fired.
      Assert.deepEqual(
        selectHandler.selectedAtEvent,
        expectedIndices,
        "selectedIndices were correct at the last 'select' event"
      );
    }

    const selected = [...list.querySelectorAll(".selected")].map(
      row => row.index
    );
    expectedIndices.sort((a, b) => a - b);
    Assert.deepEqual(
      selected,
      expectedIndices,
      "correct rows have the 'selected' class"
    );
  }

  checkCurrent(0);
  checkSelected();

  // Click on some individual rows.

  const { TestUtils } = ChromeUtils.importESModule(
    "resource://testing-common/TestUtils.sys.mjs"
  );
  const { AppConstants } = ChromeUtils.importESModule(
    "resource://gre/modules/AppConstants.sys.mjs"
  );

  async function clickOnRow(index, modifiers = {}, expectEvent = true) {
    if (modifiers.shiftKey) {
      info(`clicking on row ${index} with shift key`);
    } else if (modifiers.accelKey) {
      info(`clicking on row ${index} with ctrl key`);
    } else {
      info(`clicking on row ${index}`);
    }

    const x = list.clientWidth / 2;
    const y = list.table.header.clientHeight + index * 50 + 25;

    selectHandler.reset();
    list.addEventListener("select", selectHandler, { once: true });

    let row = list.ownerDocument.elementFromPoint(x, y);
    if (!row) {
      // Happens for some cases with --headless at least.
      info(`Found no row ${index} at ${x},${y}`);
      row = list.querySelectorAll(`tr[is="test-row"]`)[index];
      row.click();
    } else {
      EventUtils.synthesizeMouse(list, x, y, modifiers, content);
    }

    await TestUtils.waitForCondition(
      () => !!selectHandler.seenEvent == expectEvent,
      `'select' event should ${expectEvent ? "" : "not "}get fired`
    );
  }

  await clickOnRow(0);
  checkCurrent(0);
  checkSelected(0);

  await clickOnRow(1);
  checkCurrent(1);
  checkSelected(1);

  await clickOnRow(2);
  checkCurrent(2);
  checkSelected(2);

  // Select multiple rows by shift-clicking.

  await clickOnRow(4, { shiftKey: true });
  checkCurrent(4);
  checkSelected(2, 3, 4);

  // Holding ctrl and shift should always produce a range selection.
  await clickOnRow(6, { accelKey: true, shiftKey: true });
  checkCurrent(6);
  checkSelected(2, 3, 4, 5, 6);

  await clickOnRow(0, { shiftKey: true });
  checkCurrent(0);
  checkSelected(0, 1, 2);

  await clickOnRow(2, { shiftKey: true });
  checkCurrent(2);
  checkSelected(2);

  // Select multiple rows by ctrl-clicking.

  await clickOnRow(5, { accelKey: true });
  checkCurrent(5);
  checkSelected(2, 5);

  await clickOnRow(1, { accelKey: true });
  checkCurrent(1);
  checkSelected(1, 2, 5);

  await clickOnRow(5, { accelKey: true });
  checkCurrent(5);
  checkSelected(1, 2);

  await clickOnRow(1, { accelKey: true });
  checkCurrent(1);
  checkSelected(2);

  await clickOnRow(2, { accelKey: true });
  checkCurrent(2);
  checkSelected();

  // Move around by pressing keys.

  async function pressKey(key, modifiers = {}, expectEvent = true) {
    if (modifiers.shiftKey) {
      info(`pressing ${key} with shift key`);
    } else if (modifiers.accelKey) {
      info(`pressing ${key} with accel key`);
    } else {
      info(`pressing ${key}`);
    }

    selectHandler.reset();
    list.addEventListener("select", selectHandler, { once: true });
    EventUtils.synthesizeKey(key, modifiers, content);
    await TestUtils.waitForCondition(
      () => !!selectHandler.seenEvent == expectEvent,
      `'select' event should ${expectEvent ? "" : "not "}get fired`
    );
    // We don't enforce any delay on multiselection.
    const multiselect =
      (AppConstants.platform == "macosx" && key == " ") ||
      modifiers.shiftKey ||
      modifiers.accelKey;
    if (expectEvent && !multiselect) {
      // We have data-select-delay="250" in treeView.xhtml
      Assert.greater(selectHandler.time, 240, "should select only after delay");
    }
  }

  await pressKey("VK_UP");
  checkCurrent(1);
  checkSelected(1);

  await pressKey("VK_UP", { accelKey: true }, false);
  checkCurrent(0);
  checkSelected(1);

  // Without Ctrl selection moves with focus again.
  await pressKey("VK_UP");
  checkCurrent(0);
  checkSelected(0);

  // Does nothing.
  await pressKey("VK_UP", {}, false);
  checkCurrent(0);
  checkSelected(0);

  await pressKey("VK_DOWN", { accelKey: true }, false);
  checkCurrent(1);
  checkSelected(0);

  await pressKey("VK_DOWN", { accelKey: true }, false);
  checkCurrent(2);
  checkSelected(0);

  // Multi select with only Space on macOS on a focused row, since Cmd+Space is
  // captured by the OS.
  if (AppConstants.platform == "macosx") {
    await pressKey(" ");
  } else {
    // Multi select with Ctrl+Space for Windows and Linux.
    await pressKey(" ", { accelKey: true });
  }
  checkCurrent(2);
  checkSelected(0, 2);

  await pressKey("VK_DOWN", { accelKey: true }, false);
  checkCurrent(3);
  checkSelected(0, 2);

  await pressKey("VK_DOWN", { accelKey: true }, false);
  checkCurrent(4);
  checkSelected(0, 2);

  if (AppConstants.platform == "macosx") {
    await pressKey(" ");
  } else {
    await pressKey(" ", { accelKey: true });
  }
  checkCurrent(4);
  checkSelected(0, 2, 4);

  // Single selection restored with normal navigation.
  await pressKey("VK_UP");
  checkCurrent(3);
  checkSelected(3);

  // We don't allow unselecting a selected row with Space on macOS due to
  // conflict with the `mail.advance_on_spacebar` pref.
  if (AppConstants.platform != "macosx") {
    // Can select none using Ctrl+Space.
    await pressKey(" ", { accelKey: true });
    checkCurrent(3);
    checkSelected();
  }

  await pressKey("VK_DOWN");
  checkCurrent(4);
  checkSelected(4);

  await pressKey("VK_HOME", { accelKey: true }, false);
  checkCurrent(0);
  checkSelected(4);

  if (AppConstants.platform == "macosx") {
    // We can't clear the selection with only Space on macOS, simulate a Arrow
    // Up to force clear selection and only select the top most row.
    await pressKey("VK_UP");
  } else {
    // Select only the current item with Space (no modifier).
    await pressKey(" ");
  }
  checkCurrent(0);
  checkSelected(0);

  // The list is 630px high, so rows 0-12 are fully or partly visible.

  await doListActionAndWaitForRowBuffer(async () => {
    await pressKey("VK_PAGE_DOWN");
  });
  checkCurrent(13);
  checkSelected(13);
  Assert.equal(
    list.getFirstVisibleIndex(),
    1,
    "should have scrolled down a page"
  );

  await doListActionAndWaitForRowBuffer(async () => {
    await pressKey("VK_PAGE_UP", { shiftKey: true });
  });
  checkCurrent(0);
  checkSelected(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);
  Assert.equal(
    list.getFirstVisibleIndex(),
    0,
    "should have scrolled up a page"
  );

  // Shrink shift selection.
  await pressKey("VK_DOWN", { shiftKey: true });
  checkCurrent(1);
  checkSelected(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);

  await pressKey("VK_DOWN", { accelKey: true }, false);
  checkCurrent(2);
  checkSelected(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);

  await pressKey("VK_DOWN", { accelKey: true }, false);
  checkCurrent(3);
  checkSelected(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);

  if (AppConstants.platform == "macosx") {
    // We don't allow unselecting a selected row with Space on macOS due to
    // conflict with the `mail.advance_on_spacebar` pref, so simulate a
    // CMD+click to unselect it.
    await clickOnRow(3, { accelKey: true });
  } else {
    // Break the shift sequence by Ctrl+Space.
    await pressKey(" ", { accelKey: true });
  }
  checkCurrent(3);
  checkSelected(1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);

  await pressKey("VK_DOWN", { shiftKey: true });
  checkCurrent(4);
  checkSelected(3, 4);

  // Reverse selection direction.
  await pressKey("VK_HOME", { shiftKey: true });
  checkCurrent(0);
  checkSelected(0, 1, 2, 3);

  // Now rows 138-149 are fully visible.

  await doListActionAndWaitForRowBuffer(async () => {
    await pressKey("VK_END");
  });
  checkCurrent(149);
  checkSelected(149);
  Assert.equal(
    list.getFirstVisibleIndex(),
    137,
    "should have scrolled to the end"
  );
  checkTopSpacerHeight(137);

  // Does nothing.
  await pressKey("VK_DOWN", {}, false);
  checkCurrent(149);
  checkSelected(149);
  Assert.equal(
    list.getFirstVisibleIndex(),
    137,
    "should not have changed view"
  );
  checkTopSpacerHeight(137);

  await doListActionAndWaitForRowBuffer(async () => {
    await pressKey("VK_PAGE_UP");
  });
  checkCurrent(136);
  checkSelected(136);
  Assert.equal(
    list.getFirstVisibleIndex(),
    136,
    "should have scrolled up a page"
  );

  await doListActionAndWaitForRowBuffer(async () => {
    await pressKey("VK_PAGE_DOWN", { shiftKey: true });
  });
  checkCurrent(149);
  checkSelected(
    136,
    137,
    138,
    139,
    140,
    141,
    142,
    143,
    144,
    145,
    146,
    147,
    148,
    149
  );
  Assert.equal(
    list.getFirstVisibleIndex(),
    137,
    "should have scrolled down a page"
  );
  checkTopSpacerHeight(137);

  await doListActionAndWaitForRowBuffer(async () => {
    await pressKey("VK_HOME");
  });
  checkCurrent(0);
  checkSelected(0);
  Assert.equal(
    list.getFirstVisibleIndex(),
    0,
    "should have scrolled to the beginning"
  );

  // Scroll around. Which rows are current and selected should be remembered
  // even if the row element itself disappears.

  selectHandler.reset();
  await scrollListToPosition(125);
  checkCurrent(0);
  checkSelected(0);
  Assert.equal(
    list.getFirstVisibleIndex(),
    2,
    "getFirstVisibleIndex is correct"
  );

  await scrollListToPosition(2525);
  Assert.equal(list.currentIndex, 0, "currentIndex is still set");
  Assert.ok(
    !list.querySelector(".current"),
    "no visible rows have the 'current' class"
  );
  Assert.deepEqual(list.selectedIndices, [0], "selectedIndices are still set");
  Assert.ok(
    !list.querySelector(".selected"),
    "no visible rows have the 'selected' class"
  );
  Assert.equal(
    list.getFirstVisibleIndex(),
    50,
    "getFirstVisibleIndex is correct"
  );
  Assert.ok(!selectHandler.seenEvent, "should not have fired 'select' event");
  checkTopSpacerHeight(50);

  await doListActionAndWaitForRowBuffer(async () => {
    await pressKey("VK_DOWN");
  });
  checkCurrent(1);
  checkSelected(1);
  Assert.equal(
    list.getFirstVisibleIndex(),
    1,
    "should have scrolled so that the second row is in view"
  );

  selectHandler.reset();
  await scrollListToPosition(0);
  checkCurrent(1);
  checkSelected(1);
  Assert.equal(
    list.getFirstVisibleIndex(),
    0,
    "getFirstVisibleIndex is correct"
  );
  Assert.ok(
    !selectHandler.seenEvent,
    "'select' event did not fire as expected"
  );

  await pressKey("VK_UP");
  checkCurrent(0);
  checkSelected(0);
  Assert.equal(
    list.getFirstVisibleIndex(),
    0,
    "should have scrolled so that the first row is in view"
  );

  // Some literal edge cases. Clicking on a partially visible row should
  // scroll it into view.

  // Calculate the visible area in order to verify that rows appear where they
  // are intended to appear.
  const listRect = list.getBoundingClientRect();
  const headerHeight = list.table.header.clientHeight;

  const visibleRect = new content.DOMRect(
    listRect.x,
    listRect.y + headerHeight,
    listRect.width,
    listRect.height - headerHeight
  );

  Assert.equal(visibleRect.height, 630, "the table body should be 630px tall");

  rows = list.querySelectorAll(`tr[is="test-row"]`);
  let bcr = rows[12].getBoundingClientRect();
  Assert.less(
    Math.round(bcr.top),
    Math.round(visibleRect.bottom),
    "top of row 12 is visible"
  );
  Assert.greater(
    Math.round(bcr.bottom),
    Math.round(visibleRect.bottom),
    "bottom of row 12 is not visible"
  );

  await doListActionAndWaitForRowBuffer(async () => {
    await clickOnRow(12);
  });
  rows = list.querySelectorAll(`tr[is="test-row"]`);
  bcr = rows[12].getBoundingClientRect();
  Assert.less(
    Math.round(bcr.top),
    Math.round(visibleRect.bottom),
    "the top of row 12 should be visible"
  );
  Assert.equal(
    Math.round(bcr.bottom),
    Math.round(visibleRect.bottom),
    "row 12 should be at the bottom of the visible area"
  );

  bcr = rows[0].getBoundingClientRect();
  Assert.less(
    Math.round(bcr.top),
    Math.round(visibleRect.top),
    "top of row 0 is not visible"
  );
  Assert.greater(
    Math.round(bcr.bottom),
    Math.round(visibleRect.top),
    "bottom of row 0 is visible"
  );

  await doListActionAndWaitForRowBuffer(async () => {
    await clickOnRow(0);
  });
  rows = list.querySelectorAll(`tr[is="test-row"]`);
  bcr = rows[0].getBoundingClientRect();
  Assert.equal(
    Math.round(bcr.top),
    Math.round(visibleRect.top),
    "row 0 should be at the top of the visible area"
  );
  Assert.greater(
    Math.round(bcr.bottom),
    Math.round(visibleRect.top),
    "the bottom of row 0 should be visible"
  );
}

/**
 * Checks that changes in the view are propagated to the list.
 */
add_task(async function testRowCountChange() {
  for (const variant of TEST_VARIANTS) {
    info(`Running row count change test for ${variant}`);
    await runTestInSandbox(subtestRowCountChange, variant);
  }
});

async function subtestRowCountChange() {
  const doc = content.document;

  const ROW_HEIGHT = 50;
  const list = doc.getElementById("testTree");

  async function doListActionAndWaitForRowBuffer(actionFn) {
    // Filling the row buffer is fiddly timing, so provide an event to indicate
    // that actions which may trigger changes in the row buffer have finished.
    const eventName = "_treerowbufferfill";
    list._rowBufferReadyEvent = new content.CustomEvent(eventName);

    const promise = new Promise(resolve =>
      list.addEventListener(eventName, resolve, { once: true })
    );

    await actionFn();
    await promise;

    list._rowBufferReadyEvent = null;
  }

  const view = list.view;
  let rows;

  // Check the initial state.

  function checkRows(first, last) {
    const expectedIndices = [];
    for (let i = first; i <= last; i++) {
      expectedIndices.push(i);
    }
    rows = list.querySelectorAll(`tr[is="test-row"]`);
    Assert.deepEqual(
      Array.from(rows, r => r.index),
      expectedIndices,
      "the list has the right rows"
    );
    Assert.deepEqual(
      Array.from(rows, r => r.dataset.value),
      view.values.slice(first, last + 1),
      "the list has the right rows"
    );
  }

  function checkSelected(indices, existingIndices) {
    Assert.deepEqual(list.selectedIndices, indices);
    const selectedRows = list.querySelectorAll(`tr[is="test-row"].selected`);
    Assert.deepEqual(
      Array.from(selectedRows, r => r.index),
      existingIndices
    );
  }

  let expectedCount = 150;

  // Select every tenth row. We'll check what is selected remains selected.

  list.selectedIndices = [4, 14, 24, 34, 44];

  function getRowsHeight() {
    return list.scrollHeight - list.table.header.clientHeight;
  }

  async function addValues(index, values) {
    view.values.splice(index, 0, ...values);
    info(`Added ${values.join(", ")} at ${index}`);
    info(view.values);

    expectedCount += values.length;
    Assert.equal(
      view.rowCount,
      expectedCount,
      "the view has the right number of rows"
    );

    await doListActionAndWaitForRowBuffer(() => {
      list.rowCountChanged(index, values.length);
    });

    Assert.equal(
      getRowsHeight(),
      expectedCount * ROW_HEIGHT,
      "space for all rows is allocated"
    );
  }

  async function removeValues(index, count, expectedRemoved) {
    const values = view.values.splice(index, count);
    info(`Removed ${values.join(", ")} from ${index}`);
    info(view.values);

    Assert.deepEqual(values, expectedRemoved);

    expectedCount -= values.length;
    Assert.equal(
      view.rowCount,
      expectedCount,
      "the view has the right number of rows"
    );

    await doListActionAndWaitForRowBuffer(() => {
      list.rowCountChanged(index, -count);
    });

    Assert.equal(
      getRowsHeight(),
      expectedCount * ROW_HEIGHT,
      "space for all rows is allocated"
    );
  }

  async function scrollListToPosition(topOfScroll) {
    await doListActionAndWaitForRowBuffer(() => {
      list.scrollTo(0, topOfScroll);
    });
  }

  Assert.equal(
    view.rowCount,
    expectedCount,
    "the view has the right number of rows"
  );
  Assert.equal(list.scrollTop, 0, "the list is scrolled to the top");
  Assert.equal(
    getRowsHeight(),
    expectedCount * ROW_HEIGHT,
    "space for all rows is allocated"
  );

  // We should be scrolled to the top already, but this will ensure we get an
  // event fire one way or another.
  await scrollListToPosition(0);

  checkRows(0, 38);
  checkSelected([4, 14, 24, 34, 44], [4, 14, 24, 34]);
  Assert.equal(getRowsHeight(), 150 * 50);

  // Add a value at the end. Only the scroll height should change.

  await addValues(150, [150]);
  checkRows(0, 38);
  checkSelected([4, 14, 24, 34, 44], [4, 14, 24, 34]);
  Assert.equal(getRowsHeight(), 151 * 50);

  // Add more values at the end. Only the scroll height should change.

  await addValues(151, [151, 152, 153]);
  checkRows(0, 38);
  checkSelected([4, 14, 24, 34, 44], [4, 14, 24, 34]);
  Assert.equal(getRowsHeight(), 154 * 50);

  // Add values between the last row and the end.
  // Only the scroll height should change.

  await addValues(40, ["39a", "39b"]);
  checkRows(0, 38);
  checkSelected([4, 14, 24, 34, 46], [4, 14, 24, 34]);
  Assert.equal(getRowsHeight(), 156 * 50);

  // Add values between the last visible row and the last row.
  // The changed rows and those below them should be updated.

  await addValues(18, ["17a", "17b", "17c"]);
  checkRows(0, 38);
  // Hard-coded sanity checks to prove checkRows is working as intended.
  Assert.equal(rows[17].dataset.value, "17");
  Assert.equal(rows[18].dataset.value, "17a");
  Assert.equal(rows[19].dataset.value, "17b");
  Assert.equal(rows[20].dataset.value, "17c");
  Assert.equal(rows[21].dataset.value, "18");
  checkSelected([4, 14, 27, 37, 49], [4, 14, 27, 37]);
  Assert.equal(getRowsHeight(), 159 * 50);

  // Add values in the visible rows.
  // The changed rows and those below them should be updated.

  await addValues(8, ["7a", "7b"]);
  checkRows(0, 38);
  Assert.equal(rows[7].dataset.value, "7");
  Assert.equal(rows[8].dataset.value, "7a");
  Assert.equal(rows[9].dataset.value, "7b");
  Assert.equal(rows[10].dataset.value, "8");
  Assert.equal(rows[22].dataset.value, "17c");
  checkSelected([4, 16, 29, 39, 51], [4, 16, 29]);
  Assert.equal(getRowsHeight(), 161 * 50);

  // Add a value at the start. All rows should be updated.

  await addValues(0, [-1]);
  checkRows(0, 38);
  Assert.equal(rows[0].dataset.value, "-1");
  Assert.equal(rows[1].dataset.value, "0");
  Assert.equal(rows[22].dataset.value, "17b");
  checkSelected([5, 17, 30, 40, 52], [5, 17, 30]);
  Assert.equal(getRowsHeight(), 162 * 50);

  // Add more values at the start. All rows should be updated.

  await addValues(0, [-3, -2]);
  checkRows(0, 38);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[1].dataset.value, "-2");
  Assert.equal(rows[2].dataset.value, "-1");
  Assert.equal(rows[22].dataset.value, "17");
  checkSelected([7, 19, 32, 42, 54], [7, 19, 32]);
  Assert.equal(getRowsHeight(), 164 * 50);

  Assert.equal(list.scrollTop, 0, "the list is still scrolled to the top");

  // Remove values in the order we added them.

  await removeValues(160, 1, [150]);
  checkRows(0, 38);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[22].dataset.value, "17");
  checkSelected([7, 19, 32, 42, 54], [7, 19, 32]);
  Assert.equal(getRowsHeight(), 163 * 50);

  await removeValues(160, 3, [151, 152, 153]);
  checkRows(0, 38);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[22].dataset.value, "17");
  checkSelected([7, 19, 32, 42, 54], [7, 19, 32]);
  Assert.equal(getRowsHeight(), 160 * 50);

  await removeValues(48, 2, ["39a", "39b"]);
  checkRows(0, 38);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[22].dataset.value, "17");
  checkSelected([7, 19, 32, 42, 52], [7, 19, 32]);
  Assert.equal(getRowsHeight(), 158 * 50);

  await removeValues(23, 3, ["17a", "17b", "17c"]);
  checkRows(0, 38);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[22].dataset.value, "17");
  checkSelected([7, 19, 29, 39, 49], [7, 19, 29]);
  Assert.equal(getRowsHeight(), 155 * 50);

  await removeValues(11, 2, ["7a", "7b"]);
  checkRows(0, 38);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[10].dataset.value, "7");
  Assert.equal(rows[11].dataset.value, "8");
  Assert.equal(rows[22].dataset.value, "19");
  checkSelected([7, 17, 27, 37, 47], [7, 17, 27, 37]);
  Assert.equal(getRowsHeight(), 153 * 50);

  await removeValues(2, 1, [-1]);
  checkRows(0, 38);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[1].dataset.value, "-2");
  Assert.equal(rows[2].dataset.value, "0");
  Assert.equal(rows[22].dataset.value, "20");
  checkSelected([6, 16, 26, 36, 46], [6, 16, 26, 36]);
  Assert.equal(getRowsHeight(), 152 * 50);

  await removeValues(0, 2, [-3, -2]);
  checkRows(0, 38);
  Assert.equal(rows[0].dataset.value, "0");
  Assert.equal(rows[1].dataset.value, "1");
  Assert.equal(rows[22].dataset.value, "22");
  checkSelected([4, 14, 24, 34, 44], [4, 14, 24, 34]);
  Assert.equal(getRowsHeight(), 150 * 50);

  Assert.equal(list.scrollTop, 0, "the list is still scrolled to the top");

  // Now scroll to the middle and repeat.

  await scrollListToPosition(1735);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[65].dataset.value, "73");
  checkSelected([4, 14, 24, 34, 44], [14, 24, 34, 44]);

  await addValues(150, [150]);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[65].dataset.value, "73");
  checkSelected([4, 14, 24, 34, 44], [14, 24, 34, 44]);

  await addValues(38, ["37a"]);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[29].dataset.value, "37");
  Assert.equal(rows[30].dataset.value, "37a");
  Assert.equal(rows[31].dataset.value, "38");
  Assert.equal(rows[65].dataset.value, "72");
  checkSelected([4, 14, 24, 34, 45], [14, 24, 34, 45]);

  await addValues(25, ["24a"]);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[16].dataset.value, "24");
  Assert.equal(rows[17].dataset.value, "24a");
  Assert.equal(rows[18].dataset.value, "25");
  Assert.equal(rows[65].dataset.value, "71");
  checkSelected([4, 14, 24, 35, 46], [14, 24, 35, 46]);

  await addValues(11, ["10a"]);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[2].dataset.value, "10");
  Assert.equal(rows[3].dataset.value, "10a");
  Assert.equal(rows[4].dataset.value, "11");
  Assert.equal(rows[65].dataset.value, "70");
  checkSelected([4, 15, 25, 36, 47], [15, 25, 36, 47]);

  await addValues(0, ["-1"]);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "7");
  Assert.equal(rows[65].dataset.value, "69");
  checkSelected([5, 16, 26, 37, 48], [16, 26, 37, 48]);

  Assert.equal(
    list.scrollTop,
    1735,
    "the list is still scrolled to the middle"
  );

  await removeValues(154, 1, [150]);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "7");
  Assert.equal(rows[65].dataset.value, "69");
  checkSelected([5, 16, 26, 37, 48], [16, 26, 37, 48]);

  await removeValues(41, 1, ["37a"]);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "7");
  Assert.equal(rows[65].dataset.value, "70");
  checkSelected([5, 16, 26, 37, 47], [16, 26, 37, 47]);

  await removeValues(27, 1, ["24a"]);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "7");
  Assert.equal(rows[65].dataset.value, "71");
  checkSelected([5, 16, 26, 36, 46], [16, 26, 36, 46]);

  await removeValues(12, 1, ["10a"]);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "7");
  Assert.equal(rows[65].dataset.value, "72");
  checkSelected([5, 15, 25, 35, 45], [15, 25, 35, 45]);

  await removeValues(0, 1, ["-1"]);
  checkRows(8, 73);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[65].dataset.value, "73");
  checkSelected([4, 14, 24, 34, 44], [14, 24, 34, 44]);

  Assert.equal(
    list.scrollTop,
    1735,
    "the list is still scrolled to the middle"
  );

  // Now scroll to the bottom and repeat.

  await scrollListToPosition(6870);
  checkRows(111, 149);
  Assert.equal(rows[0].dataset.value, "111");
  Assert.equal(rows[38].dataset.value, "149");
  checkSelected([4, 14, 24, 34, 44], []);

  await addValues(50, [50]);
  checkRows(111, 150);
  Assert.equal(rows[0].dataset.value, "110");
  Assert.equal(rows[39].dataset.value, "149");
  checkSelected([4, 14, 24, 34, 44], []);

  await addValues(49, ["48a"]);
  checkRows(111, 151);
  Assert.equal(rows[0].dataset.value, "109");
  Assert.equal(rows[40].dataset.value, "149");
  checkSelected([4, 14, 24, 34, 44], []);

  await addValues(30, ["29a"]);
  checkRows(111, 152);
  Assert.equal(rows[0].dataset.value, "108");
  Assert.equal(rows[41].dataset.value, "149");
  checkSelected([4, 14, 24, 35, 45], []);

  await addValues(0, ["-1"]);
  checkRows(111, 153);
  Assert.equal(rows[0].dataset.value, "107");
  Assert.equal(rows[42].dataset.value, "149");
  checkSelected([5, 15, 25, 36, 46], []);

  Assert.equal(
    list.scrollTop,
    6870,
    "the list is still scrolled to the bottom"
  );

  await removeValues(53, 1, [50]);
  checkRows(111, 152);
  Assert.equal(rows[0].dataset.value, "108");
  Assert.equal(rows[41].dataset.value, "149");
  checkSelected([5, 15, 25, 36, 46], []);

  await removeValues(51, 1, ["48a"]);
  checkRows(111, 151);
  Assert.equal(rows[0].dataset.value, "109");
  Assert.equal(rows[40].dataset.value, "149");
  checkSelected([5, 15, 25, 36, 46], []);

  await removeValues(31, 1, ["29a"]);
  checkRows(111, 150);
  Assert.equal(rows[0].dataset.value, "110");
  Assert.equal(rows[39].dataset.value, "149");
  checkSelected([5, 15, 25, 35, 45], []);

  await removeValues(0, 1, ["-1"]);
  checkRows(111, 149);
  Assert.equal(rows[0].dataset.value, "111");
  Assert.equal(rows[38].dataset.value, "149");
  checkSelected([4, 14, 24, 34, 44], []);

  Assert.equal(
    list.scrollTop,
    6870,
    "the list is still scrolled to the bottom"
  );

  // Remove a selected row and check the selection changes.

  await scrollListToPosition(0);

  checkSelected([4, 14, 24, 34, 44], [4, 14, 24, 34]);

  await removeValues(3, 3, [3, 4, 5]); // 4 is selected.
  checkSelected([11, 21, 31, 41], [11, 21, 31]);

  await addValues(3, [3, 4, 5]);
  checkSelected([14, 24, 34, 44], [14, 24, 34]);

  // Remove some consecutive selected rows.

  list.selectedIndices = [6, 7, 8, 9];
  checkSelected([6, 7, 8, 9], [6, 7, 8, 9]);

  await removeValues(7, 1, [7]);
  checkSelected([6, 7, 8], [6, 7, 8]);

  await removeValues(7, 1, [8]);
  checkSelected([6, 7], [6, 7]);

  await removeValues(7, 1, [9]);
  checkSelected([6], [6]);

  // Reset the list.

  await addValues(7, [7, 8, 9]);
  list.selectedIndex = -1;
}

/**
 * Checks that expanding and collapsing works. Twisties in the test file are
 * styled as coloured squares: red for collapsed, green for expanded.
 *
 * @note This is practically the same test as in browser_treeListbox.js, but
 * for TreeView instead of TreeListbox. If you make changes here you
 * may want to make changes there too.
 */
add_task(async function testExpandCollapse() {
  await runTestInSandbox(subtestExpandCollapse, "levels");
});

async function subtestExpandCollapse() {
  const doc = content.document;
  const list = doc.getElementById("testTree");
  const allIds = [
    "row-1",
    "row-2",
    "row-2-1",
    "row-2-2",
    "row-3",
    "row-3-1",
    "row-3-1-1",
    "row-3-1-2",
  ];
  const idsWithoutChildren = [
    "row-1",
    "row-2-1",
    "row-2-2",
    "row-3-1-1",
    "row-3-1-2",
  ];

  const listener = {
    reset() {
      this.collapsedIndex = null;
      this.expandedIndex = null;
    },
    handleEvent(event) {
      if (event.type == "collapsed") {
        this.collapsedIndex = event.detail;
      } else if (event.type == "expanded") {
        this.expandedIndex = event.detail;
      }
    },
  };
  list.addEventListener("collapsed", listener);
  list.addEventListener("expanded", listener);

  const selectHandler = {
    seenEvent: null,
    selectedAtEvent: null,

    reset() {
      this.seenEvent = null;
      this.selectedAtEvent = null;
    },
    handleEvent(event) {
      this.seenEvent = event;
      this.selectedAtEvent = list.selectedIndex;
    },
  };

  Assert.equal(
    list.querySelectorAll("collapsed").length,
    0,
    "no rows are collapsed"
  );
  Assert.equal(list.view.rowCount, 8, "row count");
  Assert.deepEqual(
    Array.from(list.table.body.children, r => r.id),
    [
      "row-1",
      "row-2",
      "row-2-1",
      "row-2-2",
      "row-3",
      "row-3-1",
      "row-3-1-1",
      "row-3-1-2",
    ],
    "rows property"
  );

  function checkCurrent(expectedIndex) {
    Assert.equal(list.currentIndex, expectedIndex, "currentIndex is correct");
    const current = list.querySelectorAll(".current");
    if (expectedIndex == -1) {
      Assert.equal(current.length, 0, "no rows have the 'current' class");
    } else {
      Assert.equal(current.length, 1, "only one row has the 'current' class");
      Assert.equal(
        current[0].index,
        expectedIndex,
        "correct row has the 'current' class"
      );
    }
  }

  function checkMultiSelect(...expectedIds) {
    const selected = [...list.querySelectorAll(".selected")].map(row => row.id);
    Assert.deepEqual(selected, expectedIds, "selection should be correct");
  }

  function checkSelectedAndCurrent(expectedIndex, expectedId) {
    Assert.equal(list.selectedIndex, expectedIndex, "selectedIndex is correct");
    const selected = [...list.querySelectorAll(".selected")].map(row => row.id);
    Assert.deepEqual(
      selected,
      [expectedId],
      "correct rows have the 'selected' class"
    );
    checkCurrent(expectedIndex);
  }

  list.selectedIndex = 0;
  checkSelectedAndCurrent(0, "row-1");

  // Click the twisties of rows without children.

  function performChange(id, expectedChange, changeCallback) {
    listener.reset();
    let row = doc.getElementById(id);
    const before = row.classList.contains("collapsed");

    changeCallback(row);

    row = doc.getElementById(id);
    if (expectedChange == "collapsed") {
      Assert.ok(!before, `${id} was expanded`);
      Assert.ok(row.classList.contains("collapsed"), `${id} collapsed`);
      Assert.notEqual(
        listener.collapsedIndex,
        null,
        `${id} fired 'collapse' event`
      );
      Assert.ok(!listener.expandedIndex, `${id} did not fire 'expand' event`);
    } else if (expectedChange == "expanded") {
      Assert.ok(before, `${id} was collapsed`);
      Assert.ok(!row.classList.contains("collapsed"), `${id} expanded`);
      Assert.ok(
        !listener.collapsedIndex,
        `${id} did not fire 'collapse' event`
      );
      Assert.notEqual(
        listener.expandedIndex,
        null,
        `${id} fired 'expand' event`
      );
    } else {
      Assert.equal(
        row.classList.contains("collapsed"),
        before,
        `${id} state did not change`
      );
    }
  }

  function clickTwisty(id, expectedChange) {
    info(`clicking the twisty on ${id}`);
    performChange(id, expectedChange, row =>
      EventUtils.synthesizeMouseAtCenter(
        row.querySelector(".twisty"),
        {},
        content
      )
    );
  }

  function clickThread(id, expectedChange) {
    info(`clicking the thread on ${id}`);
    performChange(id, expectedChange, row => {
      EventUtils.synthesizeMouseAtCenter(
        row.querySelector(".tree-button-thread"),
        {},
        content
      );
    });
  }

  for (const id of idsWithoutChildren) {
    clickTwisty(id, null);
    Assert.equal(list.querySelector(".selected").id, id);
  }

  checkSelectedAndCurrent(7, "row-3-1-2");

  // Click the twisties of rows with children.

  function checkRowsAreHidden(...hiddenIds) {
    const remainingIds = allIds.slice();

    for (const id of allIds) {
      if (hiddenIds.includes(id)) {
        Assert.ok(!doc.getElementById(id), `${id} is hidden`);
        remainingIds.splice(remainingIds.indexOf(id), 1);
      } else {
        Assert.greater(
          doc.getElementById(id).clientHeight,
          0,
          `${id} is visible`
        );
      }
    }

    Assert.equal(list.view.rowCount, 8 - hiddenIds.length, "row count");
    Assert.deepEqual(
      Array.from(list.table.body.children, r => r.id),
      remainingIds,
      "rows property"
    );
  }

  // Collapse row 2.

  clickTwisty("row-2", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2");
  checkSelectedAndCurrent(5, "row-3-1-2");

  // Collapse row 3.

  clickTwisty("row-3", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(2, "row-3");

  // Expand row 2.

  clickTwisty("row-2", "expanded");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");

  // Expand row 3.

  clickTwisty("row-3", "expanded");
  checkRowsAreHidden();
  checkSelectedAndCurrent(4, "row-3");

  // Collapse row 3-1.

  clickTwisty("row-3-1", "collapsed");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");

  // Collapse row 3.

  clickTwisty("row-3", "collapsed");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");

  // Expand row 3.

  clickTwisty("row-3", "expanded");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");

  // Expand row 3-1.

  clickTwisty("row-3-1", "expanded");
  checkRowsAreHidden();
  checkSelectedAndCurrent(4, "row-3");

  // Test key presses.

  function pressKey(id, key, expectedChange) {
    info(`pressing ${key}`);
    performChange(id, expectedChange, () => {
      EventUtils.synthesizeKey(key, {}, content);
    });
  }

  // Row 0 has no children or parent, nothing should happen.

  list.selectedIndex = 0;
  pressKey("row-1", "VK_LEFT");
  checkSelectedAndCurrent(0, "row-1");
  pressKey("row-1", "VK_RIGHT");
  checkSelectedAndCurrent(0, "row-1");

  // Collapse row 2.

  list.selectedIndex = 1;
  pressKey("row-2", "VK_LEFT", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2");
  checkSelectedAndCurrent(1, "row-2");

  pressKey("row-2", "VK_LEFT");
  checkRowsAreHidden("row-2-1", "row-2-2");
  checkSelectedAndCurrent(1, "row-2");

  // Collapse row 3.

  list.selectedIndex = 2;
  pressKey("row-3", "VK_LEFT", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(2, "row-3");

  pressKey("row-3", "VK_LEFT");
  checkRowsAreHidden("row-2-1", "row-2-2", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(2, "row-3");

  // Expand row 2.

  list.selectedIndex = 1;
  pressKey("row-2", "VK_RIGHT", "expanded");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(1, "row-2");

  // Expand row 3.

  list.selectedIndex = 4;
  pressKey("row-3", "VK_RIGHT", "expanded");
  checkRowsAreHidden();
  checkSelectedAndCurrent(4, "row-3");

  // Go down the tree to row 3-1-1.

  pressKey("row-3", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(5, "row-3-1");

  pressKey("row-3", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(6, "row-3-1-1");

  pressKey("row-3-1-1", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(6, "row-3-1-1");

  // Collapse row 3-1.

  pressKey("row-3-1-1", "VK_LEFT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(5, "row-3-1");

  pressKey("row-3-1", "VK_LEFT", "collapsed");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(5, "row-3-1");

  // Collapse row 3.

  pressKey("row-3-1", "VK_LEFT");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");

  pressKey("row-3", "VK_LEFT", "collapsed");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");

  // Expand row 3.

  pressKey("row-3", "VK_RIGHT", "expanded");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");

  pressKey("row-3", "VK_RIGHT");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(5, "row-3-1");

  // Expand row 3-1.

  pressKey("row-3-1", "VK_RIGHT", "expanded");
  checkRowsAreHidden();
  checkSelectedAndCurrent(5, "row-3-1");

  pressKey("row-3-1", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(6, "row-3-1-1");

  pressKey("row-3-1-1", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(6, "row-3-1-1");

  // Same again, with a RTL tree.

  info("switching to RTL");
  doc.documentElement.dir = "rtl";

  // Row 0 has no children or parent, nothing should happen.

  list.selectedIndex = 0;
  pressKey("row-1", "VK_RIGHT");
  checkSelectedAndCurrent(0, "row-1");
  pressKey("row-1", "VK_LEFT");
  checkSelectedAndCurrent(0, "row-1");

  // Collapse row 2.

  list.selectedIndex = 1;
  pressKey("row-2", "VK_RIGHT", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2");
  checkSelectedAndCurrent(1, "row-2");

  pressKey("row-2", "VK_RIGHT");
  checkRowsAreHidden("row-2-1", "row-2-2");
  checkSelectedAndCurrent(1, "row-2");

  // Collapse row 3.

  list.selectedIndex = 2;
  pressKey("row-3", "VK_RIGHT", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(2, "row-3");

  pressKey("row-3", "VK_RIGHT");
  checkRowsAreHidden("row-2-1", "row-2-2", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(2, "row-3");

  // Expand row 2.

  list.selectedIndex = 1;
  pressKey("row-2", "VK_LEFT", "expanded");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(1, "row-2");

  // Expand row 3.

  list.selectedIndex = 4;
  pressKey("row-3", "VK_LEFT", "expanded");
  checkRowsAreHidden();
  checkSelectedAndCurrent(4, "row-3");

  // Go down the tree to row 3-1-1.

  pressKey("row-3", "VK_LEFT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(5, "row-3-1");

  pressKey("row-3", "VK_LEFT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(6, "row-3-1-1");

  pressKey("row-3-1-1", "VK_LEFT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(6, "row-3-1-1");

  // Collapse row 3-1.

  pressKey("row-3-1-1", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(5, "row-3-1");

  pressKey("row-3-1", "VK_RIGHT", "collapsed");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(5, "row-3-1");

  // Collapse row 3.

  pressKey("row-3-1", "VK_RIGHT");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");

  pressKey("row-3", "VK_RIGHT", "collapsed");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");

  // Expand row 3.

  pressKey("row-3", "VK_LEFT", "expanded");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");

  pressKey("row-3", "VK_LEFT");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(5, "row-3-1");

  // Expand row 3-1.

  pressKey("row-3-1", "VK_LEFT", "expanded");
  checkRowsAreHidden();
  checkSelectedAndCurrent(5, "row-3-1");

  pressKey("row-3-1", "VK_LEFT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(6, "row-3-1-1");

  pressKey("row-3-1-1", "VK_LEFT");
  checkRowsAreHidden();
  checkSelectedAndCurrent(6, "row-3-1-1");

  // Use the class methods for expanding and collapsing.

  selectHandler.reset();
  list.addEventListener("select", selectHandler);
  listener.reset();

  list.collapseRowAtIndex(6); // No children, no effect.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.ok(!listener.collapsedIndex, "'collapsed' event did not fire");

  list.expandRowAtIndex(6); // No children, no effect.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.ok(!listener.expandedIndex, "'expanded' event did not fire");

  list.collapseRowAtIndex(1); // Item with children that aren't selected.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.equal(listener.collapsedIndex, 1, "row-2 fired 'collapsed' event");
  listener.reset();

  list.expandRowAtIndex(1); // Item with children that aren't selected.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.equal(listener.expandedIndex, 1, "row-2 fired 'expanded' event");
  listener.reset();

  list.collapseRowAtIndex(5); // Item with children that are selected.
  Assert.ok(selectHandler.seenEvent, "'select' event fired");
  Assert.equal(
    selectHandler.selectedAtEvent,
    5,
    "selectedIndex was correct when 'select' event fired"
  );
  Assert.equal(listener.collapsedIndex, 5, "row-3-1 fired 'collapsed' event");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(5, "row-3-1");
  selectHandler.reset();
  listener.reset();

  list.expandRowAtIndex(5); // Selected item with children.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.equal(listener.expandedIndex, 5, "row-3-1 fired 'expanded' event");
  checkRowsAreHidden();
  checkSelectedAndCurrent(5, "row-3-1");
  listener.reset();

  list.selectedIndex = 7;
  selectHandler.reset();

  list.collapseRowAtIndex(4); // Item with grandchildren that are selected.
  Assert.ok(selectHandler.seenEvent, "'select' event fired");
  Assert.equal(
    selectHandler.selectedAtEvent,
    4,
    "selectedIndex was correct when 'select' event fired"
  );
  Assert.equal(listener.collapsedIndex, 4, "row-3 fired 'collapsed' event");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelectedAndCurrent(4, "row-3");
  selectHandler.reset();
  listener.reset();

  list.expandRowAtIndex(4); // Selected item with grandchildren.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.equal(listener.expandedIndex, 4, "row-3 fired 'expanded' event");
  checkRowsAreHidden();
  checkSelectedAndCurrent(4, "row-3");
  listener.reset();

  // Click thread for already expanded thread. Should select all in thread.
  selectHandler.reset();
  clickThread("row-3"); // Item with grandchildren.
  Assert.ok(selectHandler.seenEvent, "'select' event fired");
  Assert.equal(
    selectHandler.selectedAtEvent,
    4,
    "selectedIndex was correct when 'select' event fired"
  );
  checkRowsAreHidden();
  checkMultiSelect("row-3", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkCurrent(4);

  // Click thread for collapsed thread. Should expand the thread and select all
  // children.
  list.collapseRowAtIndex(1); // Item with children that aren't selected.
  Assert.equal(listener.collapsedIndex, 1, "row-2 fired 'collapsed' event");
  checkRowsAreHidden("row-2-1", "row-2-2");
  clickThread("row-2", "expanded");
  Assert.equal(listener.expandedIndex, 1, "row-2 fired 'expanded' event");
  checkMultiSelect("row-2", "row-2-1", "row-2-2");
  checkCurrent(1);

  // Select multiple messages in an expanded thread by keyboard, ending with a
  // child message, then collapse the thread. After that, currentIndex should
  // be the root message.
  selectHandler.reset();
  list.selectedIndex = 1;
  checkSelectedAndCurrent(1, "row-2");
  info(`pressing VK_DOWN with shift key twice`);
  EventUtils.synthesizeKey("VK_DOWN", { shiftKey: true }, content);
  EventUtils.synthesizeKey("VK_DOWN", { shiftKey: true }, content);
  checkMultiSelect("row-2", "row-2-1", "row-2-2");
  checkCurrent(3);
  clickTwisty("row-2", "collapsed");
  checkSelectedAndCurrent(1, "row-2");

  list.removeEventListener("collapsed", listener);
  list.removeEventListener("expanded", listener);
  list.removeEventListener("select", selectHandler);
  doc.documentElement.dir = null;
}

/**
 * Checks that expanding and collapsing scrolls the view to the right position.
 * Twisties in the test file are styled as coloured squares: red for collapsed,
 * green for expanded.
 */
add_task(async function testScrollWhenExpandCollapse() {
  await runTestInSandbox(subtestScrollWhenExpandCollapse, "scroll");
});

async function subtestScrollWhenExpandCollapse() {
  const doc = content.document;
  const list = doc.getElementById("testTree");

  const listener = {
    reset() {
      this.collapsedIndex = null;
      this.expandedIndex = null;
    },
    handleEvent(event) {
      if (event.type == "collapsed") {
        this.collapsedIndex = event.detail;
      } else if (event.type == "expanded") {
        this.expandedIndex = event.detail;
      }
    },
  };
  list.addEventListener("collapsed", listener);
  list.addEventListener("expanded", listener);

  const selectHandler = {
    seenEvent: null,
    selectedAtEvent: null,

    reset() {
      this.seenEvent = null;
      this.selectedAtEvent = null;
    },
    handleEvent(event) {
      this.seenEvent = event;
      this.selectedAtEvent = list.selectedIndex;
    },
  };

  // Click the twisties of rows without children.

  function performChange(id, expectedChange, changeCallback) {
    listener.reset();
    let row = doc.getElementById(id);
    const before = row.classList.contains("collapsed");

    changeCallback(row);

    row = doc.getElementById(id);
    if (expectedChange == "collapsed") {
      Assert.ok(!before, `${id} was expanded`);
      Assert.ok(row.classList.contains("collapsed"), `${id} collapsed`);
      Assert.notEqual(
        listener.collapsedIndex,
        null,
        `${id} fired 'collapse' event`
      );
      Assert.ok(!listener.expandedIndex, `${id} did not fire 'expand' event`);
    } else if (expectedChange == "expanded") {
      Assert.ok(before, `${id} was collapsed`);
      Assert.ok(!row.classList.contains("collapsed"), `${id} expanded`);
      Assert.ok(
        !listener.collapsedIndex,
        `${id} did not fire 'collapse' event`
      );
      Assert.notEqual(
        listener.expandedIndex,
        null,
        `${id} fired 'expand' event`
      );
    } else {
      Assert.equal(
        row.classList.contains("collapsed"),
        before,
        `${id} state did not change`
      );
    }
  }

  function clickTwisty(id, expectedChange) {
    info(`clicking the twisty on ${id}`);
    performChange(id, expectedChange, row =>
      EventUtils.synthesizeMouseAtCenter(
        row.querySelector(".twisty"),
        {},
        content
      )
    );
  }

  // Test key presses.

  function pressKey(id, key, expectedChange) {
    info(`pressing ${key}`);
    performChange(id, expectedChange, () => {
      EventUtils.synthesizeKey(key, {}, content);
    });
  }

  async function checkFirstVisibleRow(id) {
    await new Promise(resolve => content.requestAnimationFrame(resolve));
    Assert.equal(list.getFirstVisibleIndex(), id, "is first visible row");
  }

  async function checkLastVisibleRow(id) {
    await new Promise(resolve => content.requestAnimationFrame(resolve));
    Assert.equal(list.getLastVisibleIndex(), id, "is last visible row");
  }

  async function checkVisibleRow(id) {
    await new Promise(resolve => content.requestAnimationFrame(resolve));
    Assert.lessOrEqual(
      list.getFirstVisibleIndex(),
      id,
      "is first visible row or above"
    );
    Assert.greaterOrEqual(
      list.getLastVisibleIndex(),
      id,
      "is last visible id or below"
    );
  }

  Assert.equal(
    list.querySelectorAll("collapsed").length,
    0,
    "no rows are collapsed"
  );
  Assert.equal(list.view.rowCount, 30, "row count");

  // Expanding/collapsing row with few children all fitting the screen should
  // not scroll.

  list.selectedIndex = 0;
  await new Promise(resolve => content.requestAnimationFrame(resolve));

  clickTwisty("row-3", "expanded");
  await checkFirstVisibleRow(0);

  clickTwisty("row-3", "collapsed");
  await checkFirstVisibleRow(0);

  list.selectedIndex = 2;
  await new Promise(resolve => content.requestAnimationFrame(resolve));

  pressKey("row-3", "VK_RIGHT", "expanded");
  await checkFirstVisibleRow(0);

  pressKey("row-3", "VK_LEFT", "collapsed");
  await checkFirstVisibleRow(0);

  // Expanding/collapsing row with many children not all fitting the screen
  // should scroll the first row to the top.

  list.selectedIndex = 0;
  await new Promise(resolve => content.requestAnimationFrame(resolve));

  clickTwisty("row-4", "expanded");
  await checkFirstVisibleRow(3);

  clickTwisty("row-4", "collapsed");
  await checkVisibleRow(3);

  list.selectedIndex = 3;
  await new Promise(resolve => content.requestAnimationFrame(resolve));

  pressKey("row-4", "VK_RIGHT", "expanded");
  await checkFirstVisibleRow(3);

  pressKey("row-4", "VK_LEFT", "collapsed");
  await checkVisibleRow(3);

  // Expanding a row near the bottom with few children should scroll just the
  // last child into view.

  pressKey("row-4", "VK_RIGHT", "expanded");
  list.selectedIndex = 38;
  await new Promise(resolve => content.requestAnimationFrame(resolve));

  clickTwisty("row-9", "expanded");
  await checkLastVisibleRow(43);

  clickTwisty("row-9", "collapsed");
  await checkVisibleRow(38);

  list.selectedIndex = 0;
  await new Promise(resolve => content.requestAnimationFrame(resolve));
  list.selectedIndex = 38;
  await new Promise(resolve => content.requestAnimationFrame(resolve));

  pressKey("row-9", "VK_RIGHT", "expanded");
  checkLastVisibleRow(43);

  pressKey("row-9", "VK_LEFT", "collapsed");
  checkVisibleRow(38);

  list.removeEventListener("collapsed", listener);
  list.removeEventListener("expanded", listener);
  list.removeEventListener("select", selectHandler);
  doc.documentElement.dir = null;
}

/**
 * Checks that the row widget can be changed, redrawing the rows and
 * maintaining the selection.
 */
add_task(async function testRowClassChange() {
  for (const variant of TEST_VARIANTS) {
    info(`Running row class change test for ${variant}`);
    await runTestInSandbox(subtestRowClassChange, variant);
  }
});

async function subtestRowClassChange() {
  const doc = content.document;
  const list = doc.getElementById("testTree");
  const indices = (list.selectedIndices = [1, 2, 3, 5, 8, 13, 21, 34]);
  list.currentIndex = 5;

  for (const row of list.table.body.children) {
    Assert.equal(row.getAttribute("is"), "test-row");
    Assert.equal(row.clientHeight, 50);
    Assert.equal(
      row.classList.contains("selected"),
      indices.includes(row.index)
    );
    Assert.equal(row.classList.contains("current"), row.index == 5);
  }

  info("switching row class to AlternativeCardRow");
  list.setAttribute("rows", "alternative-row");
  Assert.deepEqual(list.selectedIndices, indices);
  Assert.equal(list.currentIndex, 5);

  for (const row of list.table.body.children) {
    Assert.equal(row.getAttribute("is"), "alternative-row");
    Assert.equal(row.clientHeight, 80);
    Assert.equal(
      row.classList.contains("selected"),
      indices.includes(row.index)
    );
    Assert.equal(row.classList.contains("current"), row.index == 5);
  }

  list.selectedIndex = -1;
  Assert.deepEqual(list.selectedIndices, []);
  Assert.equal(list.currentIndex, -1);

  info("switching row class to TestCardRow");
  list.setAttribute("rows", "test-row");
  Assert.deepEqual(list.selectedIndices, []);
  Assert.equal(list.currentIndex, -1);

  for (const row of list.table.body.children) {
    Assert.equal(row.getAttribute("is"), "test-row");
    Assert.equal(row.clientHeight, 50);
    Assert.ok(!row.classList.contains("selected"));
    Assert.ok(!row.classList.contains("current"));
  }
}

/**
 * Checks that resizing the widget automatically adds more rows if necessary.
 */
add_task(async function testResize() {
  for (const variant of TEST_VARIANTS) {
    info(`Running resize test for ${variant}`);
    await runTestInSandbox(subtestResize, variant);
  }
});

async function subtestResize() {
  const doc = content.document;

  const list = doc.getElementById("testTree");
  Assert.ok(!!list, "the list exists");

  async function doListActionAndWaitForRowBuffer(actionFn) {
    // Filling the row buffer is fiddly timing, so provide an event to indicate
    // that actions which may trigger changes in the row buffer have finished.
    const eventName = "_treerowbufferfill";
    list._rowBufferReadyEvent = new content.CustomEvent(eventName);

    const promise = new Promise(resolve =>
      list.addEventListener(eventName, resolve, { once: true })
    );

    await actionFn();
    await promise;

    list._rowBufferReadyEvent = null;
  }

  async function scrollVerticallyBy(scrollDistance) {
    await doListActionAndWaitForRowBuffer(() => {
      list.scrollBy(0, scrollDistance);
    });
  }

  async function changeHeightTo(newHeight) {
    await doListActionAndWaitForRowBuffer(() => {
      list.style.height = `${newHeight}px`;
    });
  }

  const rowCount = function () {
    return list.querySelectorAll(`tr[is="test-row"]`).length;
  };

  const originalHeight = list.clientHeight;

  // We should already be at the top, but this will force us to have finished
  // loading before we trigger another scroll. Otherwise, we may get back a fill
  // event for the initial fill when we expect an event in response to a scroll.
  await doListActionAndWaitForRowBuffer(() => {
    list.scrollTo(0, 0);
  });

  // Start by scrolling to somewhere in the middle of the list, so that we
  // don't have to think about buffer rows that don't exist at the ends.
  await scrollVerticallyBy(2650);

  // The list has enough space for 13 visible rows, and 26 buffer rows should
  // exist above and below.
  Assert.equal(
    rowCount(),
    13 + 26 + 26,
    "the list should contain the right number of rows"
  );

  // Make the list shorter by 5 rows. This should not affect the number of rows,
  // but this is a bit flaky, so check we have at least the minimum required.
  await changeHeightTo(originalHeight - 250);
  Assert.equal(list._toleranceSize, 16);
  Assert.greaterOrEqual(
    rowCount(),
    8 + 26 + 26,
    "making the list shorter should not change the number of rows"
  );

  // Scrolling the list by any amount should remove excess rows.
  await scrollVerticallyBy(50);
  Assert.equal(
    rowCount(),
    8 + 16 + 16,
    "scrolling the list after resize should remove the excess rows"
  );

  // Return to the original height. More buffer rows should be added. We have
  // to wait for the ResizeObserver to be triggered.
  await changeHeightTo(originalHeight);
  Assert.equal(list._toleranceSize, 26);
  Assert.equal(
    rowCount(),
    13 + 26 + 26,
    "making the list taller should change the number of rows"
  );

  // Make the list taller by 5 rows. We have to wait for the ResizeObserver
  // to be triggered.
  await changeHeightTo(originalHeight + 250);
  Assert.equal(list._toleranceSize, 36);
  Assert.equal(
    rowCount(),
    18 + 36 + 36,
    "making the list taller should change the number of rows"
  );

  // Scrolling the list should not affect the number of rows.
  await scrollVerticallyBy(50);
  Assert.equal(
    rowCount(),
    18 + 36 + 36,
    "scrolling the list should not change the number of rows"
  );
}
