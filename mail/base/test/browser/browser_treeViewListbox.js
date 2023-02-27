/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

/**
 * Checks that interactions with the widget do as expected.
 */
add_task(async function testKeyboardAndMouse() {
  let tab = tabmail.openTab("contentTab", {
    url:
      "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/treeViewListbox.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  await SpecialPowers.spawn(tab.browser, [], subtestKeyboardAndMouse);

  tabmail.closeTab(tab);
});

async function subtestKeyboardAndMouse() {
  let doc = content.document;

  let list = doc.getElementById("testTree");
  Assert.ok(!!list, "the list exists");

  let listRect = list.getBoundingClientRect();

  let rows = list.querySelectorAll(`tr[is="test-listrow"]`);
  // Count is calculated from the height of `list` divided by
  // TestCardRow.ROW_HEIGHT, plus TreeViewListbox.OVERFLOW_BUFFER.
  Assert.equal(rows.length, 23, "the list has the right number of rows");

  Assert.equal(doc.activeElement, doc.body);

  EventUtils.synthesizeKey("VK_TAB", {}, content);
  Assert.equal(
    doc.activeElement.id,
    "before",
    "the element before the list has focus"
  );

  EventUtils.synthesizeKey("VK_TAB", {}, content);
  Assert.equal(doc.activeElement.id, "testList", "the list has focus");

  EventUtils.synthesizeKey("VK_TAB", {}, content);
  Assert.equal(
    doc.activeElement.id,
    "after",
    "the element after the list has focus"
  );

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, content);
  Assert.equal(doc.activeElement.id, "testList", "the list has focus");

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, content);
  Assert.equal(
    doc.activeElement.id,
    "before",
    "the element before the list has focus"
  );

  // Check initial selection.

  let selectHandler = {
    seenEvent: null,
    currentAtEvent: null,
    selectedAtEvent: null,

    reset() {
      this.seenEvent = null;
      this.currentAtEvent = null;
      this.selectedAtEvent = null;
    },
    handleEvent(event) {
      this.seenEvent = event;
      this.currentAtEvent = list.currentIndex;
      this.selectedAtEvent = list.selectedIndices;
    },
  };

  /**
   * Check if the spacerTop TBODY of the TreeViewTable is properly allocating
   * the height of non existing rows.
   *
   * @param {int} rows - The number of rows that the spacerTop should be
   * simulating their height allocation.
   */
  function checkTopSpacerHeight(rows) {
    let table = doc.querySelector(`[is="tree-view-table"]`);
    // -10 to account for the OVERFLOW_BUFFER.
    Assert.equal(
      table.spacerTop.clientHeight,
      list.getRowAtIndex(rows).clientHeight * (rows - 10),
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

    let current = list.querySelectorAll(".current");
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

    let selected = [...list.querySelectorAll(".selected")].map(
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
  checkSelected(0);

  // Click on some individual rows.

  const { TestUtils } = ChromeUtils.importESModule(
    "resource://testing-common/TestUtils.sys.mjs"
  );

  async function clickOnRow(index, modifiers = {}, expectEvent = true) {
    if (modifiers.shiftKey) {
      info(`clicking on row ${index} with shift key`);
    } else if (modifiers.accelKey) {
      info(`clicking on row ${index} with ctrl key`);
    } else {
      info(`clicking on row ${index}`);
    }

    let x = list.clientWidth / 2;
    let y = index * 50 + 25;

    selectHandler.reset();
    list.addEventListener("select", selectHandler, { once: true });
    EventUtils.synthesizeMouse(list, x, y, modifiers, content);
    await TestUtils.waitForCondition(
      () => !!selectHandler.seenEvent == expectEvent,
      `'select' event should ${expectEvent ? "" : "not "}get fired`
    );
  }

  await clickOnRow(0, {}, false);
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

  await clickOnRow(6, { shiftKey: true });
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
  }

  function scrollingDelay() {
    return new Promise(r => content.setTimeout(r, 100));
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

  // Multi select with Ctrl+Space.
  await pressKey(" ", { accelKey: true });
  checkCurrent(2);
  checkSelected(0, 2);

  await pressKey("VK_DOWN", { accelKey: true }, false);
  checkCurrent(3);
  checkSelected(0, 2);

  await pressKey("VK_DOWN", { accelKey: true }, false);
  checkCurrent(4);
  checkSelected(0, 2);

  await pressKey(" ", { accelKey: true });
  checkCurrent(4);
  checkSelected(0, 2, 4);

  // Single selection restored with normal navigation.
  await pressKey("VK_UP");
  checkCurrent(3);
  checkSelected(3);

  // Can select none using Ctrl+Space.
  await pressKey(" ", { accelKey: true });
  checkCurrent(3);
  checkSelected();

  await pressKey("VK_DOWN");
  checkCurrent(4);
  checkSelected(4);

  await pressKey("VK_HOME", { accelKey: true }, false);
  checkCurrent(0);
  checkSelected(4);

  // Select only the current item with Space (no modifier).
  await pressKey(" ");
  checkCurrent(0);
  checkSelected(0);

  // The list is 630px high, so rows 0-11 are fully visible.

  await pressKey("VK_PAGE_DOWN");
  await scrollingDelay();
  checkCurrent(12);
  checkSelected(12);
  Assert.equal(list.getFirstVisibleIndex(), 1, "scrolled to the correct place");

  await pressKey("VK_PAGE_UP", { shiftKey: true });
  await scrollingDelay();
  checkCurrent(0);
  checkSelected(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
  Assert.equal(list.getFirstVisibleIndex(), 0, "scrolled to the correct place");

  // Shrink shift selection.
  await pressKey("VK_DOWN", { shiftKey: true });
  checkCurrent(1);
  checkSelected(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

  await pressKey("VK_DOWN", { accelKey: true }, false);
  checkCurrent(2);
  checkSelected(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

  await pressKey("VK_DOWN", { accelKey: true }, false);
  checkCurrent(3);
  checkSelected(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

  // Break the shift sequence by Ctrl+Space.
  await pressKey(" ", { accelKey: true });
  checkCurrent(3);
  checkSelected(1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12);

  await pressKey("VK_DOWN", { shiftKey: true });
  checkCurrent(4);
  checkSelected(3, 4);

  // Reverse selection direction.
  await pressKey("VK_HOME", { shiftKey: true });
  checkCurrent(0);
  checkSelected(0, 1, 2, 3);

  // Now rows 38-49 are fully visible.

  await pressKey("VK_END");
  await scrollingDelay();
  checkCurrent(49);
  checkSelected(49);
  Assert.equal(
    list.getFirstVisibleIndex(),
    38,
    "scrolled to the correct place"
  );
  checkTopSpacerHeight(37);

  // Does nothing.
  await pressKey("VK_DOWN", {}, false);
  checkCurrent(49);
  checkSelected(49);
  Assert.equal(
    list.getFirstVisibleIndex(),
    38,
    "scrolled to the correct place"
  );
  checkTopSpacerHeight(37);

  await pressKey("VK_PAGE_UP");
  await scrollingDelay();
  checkCurrent(37);
  checkSelected(37);
  Assert.equal(
    list.getFirstVisibleIndex(),
    37,
    "scrolled to the correct place"
  );

  await pressKey("VK_PAGE_DOWN", { shiftKey: true });
  await scrollingDelay();
  checkCurrent(49);
  checkSelected(37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49);
  Assert.equal(
    list.getFirstVisibleIndex(),
    38,
    "scrolled to the correct place"
  );
  checkTopSpacerHeight(37);

  await pressKey("VK_HOME");
  await scrollingDelay();
  checkCurrent(0);
  checkSelected(0);
  Assert.equal(list.getFirstVisibleIndex(), 0, "scrolled to the correct place");

  // Scroll around. Which rows are current and selected should be remembered
  // even if the row element itself disappears.

  selectHandler.reset();
  list.scrollTo(0, 125);
  await scrollingDelay();
  checkCurrent(0);
  checkSelected(0);
  Assert.equal(
    list.getFirstVisibleIndex(),
    3,
    "getFirstVisibleIndex is correct"
  );

  list.scrollTo(0, 1025);
  await scrollingDelay();
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
    21,
    "getFirstVisibleIndex is correct"
  );
  Assert.ok(
    !selectHandler.seenEvent,
    "'select' event did not fire as expected"
  );
  checkTopSpacerHeight(20);

  await pressKey("VK_DOWN");
  await scrollingDelay();
  checkCurrent(1);
  checkSelected(1);
  Assert.equal(list.getFirstVisibleIndex(), 1, "scrolled to the correct place");

  selectHandler.reset();
  list.scrollTo(0, 0);
  await scrollingDelay();
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
  Assert.equal(list.getFirstVisibleIndex(), 0, "scrolled to the correct place");

  // Some literal edge cases. Clicking on a partially visible row should
  // scroll it into view.

  rows = list.querySelectorAll(`tr[is="test-listrow"]`);
  let bcr = rows[12].getBoundingClientRect();
  Assert.less(
    Math.round(bcr.top),
    Math.round(listRect.bottom),
    "top of row 12 is visible"
  );
  Assert.greater(
    Math.round(bcr.bottom),
    Math.round(listRect.bottom),
    "bottom of row 12 is not visible"
  );
  await clickOnRow(12);
  await scrollingDelay();
  rows = list.querySelectorAll(`tr[is="test-listrow"]`);
  bcr = rows[12].getBoundingClientRect();
  Assert.less(
    Math.round(bcr.top),
    Math.round(listRect.bottom),
    "top of row 12 is visible"
  );
  Assert.equal(
    Math.round(bcr.bottom),
    Math.round(listRect.bottom),
    "bottom of row 12 is visible"
  );

  bcr = rows[0].getBoundingClientRect();
  Assert.less(
    Math.round(bcr.top),
    Math.round(listRect.top),
    "top of row 0 is not visible"
  );
  Assert.greater(
    Math.round(bcr.bottom),
    Math.round(listRect.top),
    "bottom of row 0 is visible"
  );
  await clickOnRow(0);
  await scrollingDelay();
  rows = list.querySelectorAll(`tr[is="test-listrow"]`);
  bcr = rows[0].getBoundingClientRect();
  Assert.equal(
    Math.round(bcr.top),
    Math.round(listRect.top),
    "top of row 0 is visible"
  );
  Assert.greater(
    Math.round(bcr.bottom),
    Math.round(listRect.top),
    "bottom of row 0 is visible"
  );
}

/**
 * Checks that changes in the view are propagated to the list.
 */
add_task(async function testRowCountChange() {
  let tab = tabmail.openTab("contentTab", {
    url:
      "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/treeViewListbox.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  await SpecialPowers.spawn(tab.browser, [], subtestRowCountChange);

  tabmail.closeTab(tab);
});

async function subtestRowCountChange() {
  let doc = content.document;

  let ROW_HEIGHT = 50;
  let list = doc.getElementById("testTree");
  let view = list.view;
  let rows;

  // Check the initial state.

  function checkRows(first, last) {
    let expectedIndices = [];
    for (let i = first; i <= last; i++) {
      expectedIndices.push(i);
    }
    rows = list.querySelectorAll(`tr[is="test-listrow"]`);
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
    let selectedRows = list.querySelectorAll(`tr[is="test-listrow"].selected`);
    Assert.deepEqual(
      Array.from(selectedRows, r => r.index),
      existingIndices
    );
  }

  let expectedCount = 50;

  // Select every tenth row. We'll check what is selected remains selected.

  list.selectedIndices = [4, 14, 24, 34, 44];

  function addValues(index, values) {
    view.values.splice(index, 0, ...values);
    info(`Added ${values.join(", ")} at ${index}`);
    info(view.values);

    expectedCount += values.length;
    Assert.equal(
      view.rowCount,
      expectedCount,
      "the view has the right number of rows"
    );

    list.rowCountChanged(index, values.length);
    Assert.equal(
      list.scrollHeight,
      expectedCount * ROW_HEIGHT,
      "space for all rows is allocated"
    );
  }

  function removeValues(index, count, expectedRemoved) {
    let values = view.values.splice(index, count);
    info(`Removed ${values.join(", ")} from ${index}`);
    info(view.values);

    Assert.deepEqual(values, expectedRemoved);

    expectedCount -= values.length;
    Assert.equal(
      view.rowCount,
      expectedCount,
      "the view has the right number of rows"
    );

    list.rowCountChanged(index, -count);
    Assert.equal(
      list.scrollHeight,
      expectedCount * ROW_HEIGHT,
      "space for all rows is allocated"
    );
  }

  Assert.equal(
    view.rowCount,
    expectedCount,
    "the view has the right number of rows"
  );
  Assert.equal(list.scrollTop, 0, "the list is scrolled to the top");
  Assert.equal(
    list.scrollHeight,
    expectedCount * ROW_HEIGHT,
    "space for all rows is allocated"
  );
  checkRows(0, 22);
  checkSelected([4, 14, 24, 34, 44], [4, 14]);

  // Add a value at the end. Only the scroll height should change.

  addValues(50, [50]);
  checkRows(0, 22);
  checkSelected([4, 14, 24, 34, 44], [4, 14]);

  // Add more values at the end. Only the scroll height should change.

  addValues(51, [51, 52, 53]);
  checkRows(0, 22);
  checkSelected([4, 14, 24, 34, 44], [4, 14]);

  // Add values between the last row and the end.
  // Only the scroll height should change.

  addValues(40, ["39a", "39b"]);
  checkRows(0, 22);
  checkSelected([4, 14, 24, 34, 46], [4, 14]);

  // Add values between the last visible row and the last row.
  // The changed rows and those below them should be updated.

  addValues(18, ["17a", "17b", "17c"]);
  checkRows(0, 22);
  // Hard-coded sanity checks to prove checkRows is working as intended.
  Assert.equal(rows[17].dataset.value, "17");
  Assert.equal(rows[18].dataset.value, "17a");
  Assert.equal(rows[19].dataset.value, "17b");
  Assert.equal(rows[20].dataset.value, "17c");
  Assert.equal(rows[21].dataset.value, "18");
  checkSelected([4, 14, 27, 37, 49], [4, 14]);

  // Add values in the visible rows.
  // The changed rows and those below them should be updated.

  addValues(8, ["7a", "7b"]);
  checkRows(0, 22);
  Assert.equal(rows[7].dataset.value, "7");
  Assert.equal(rows[8].dataset.value, "7a");
  Assert.equal(rows[9].dataset.value, "7b");
  Assert.equal(rows[10].dataset.value, "8");
  Assert.equal(rows[22].dataset.value, "17c");
  checkSelected([4, 16, 29, 39, 51], [4, 16]);

  // Add a value at the start. All rows should be updated.

  addValues(0, [-1]);
  checkRows(0, 22);
  Assert.equal(rows[0].dataset.value, "-1");
  Assert.equal(rows[1].dataset.value, "0");
  Assert.equal(rows[22].dataset.value, "17b");
  checkSelected([5, 17, 30, 40, 52], [5, 17]);

  // Add more values at the start. All rows should be updated.

  addValues(0, [-3, -2]);
  checkRows(0, 22);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[1].dataset.value, "-2");
  Assert.equal(rows[2].dataset.value, "-1");
  Assert.equal(rows[22].dataset.value, "17");
  checkSelected([7, 19, 32, 42, 54], [7, 19]);

  Assert.equal(list.scrollTop, 0, "the list is still scrolled to the top");

  // Remove values in the order we added them.

  removeValues(60, 1, [50]);
  checkRows(0, 22);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[22].dataset.value, "17");
  checkSelected([7, 19, 32, 42, 54], [7, 19]);

  removeValues(60, 3, [51, 52, 53]);
  checkRows(0, 22);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[22].dataset.value, "17");
  checkSelected([7, 19, 32, 42, 54], [7, 19]);

  removeValues(48, 2, ["39a", "39b"]);
  checkRows(0, 22);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[22].dataset.value, "17");
  checkSelected([7, 19, 32, 42, 52], [7, 19]);

  removeValues(23, 3, ["17a", "17b", "17c"]);
  checkRows(0, 22);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[22].dataset.value, "17");
  checkSelected([7, 19, 29, 39, 49], [7, 19]);

  removeValues(11, 2, ["7a", "7b"]);
  checkRows(0, 22);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[10].dataset.value, "7");
  Assert.equal(rows[11].dataset.value, "8");
  Assert.equal(rows[22].dataset.value, "19");
  checkSelected([7, 17, 27, 37, 47], [7, 17]);

  removeValues(2, 1, [-1]);
  checkRows(0, 22);
  Assert.equal(rows[0].dataset.value, "-3");
  Assert.equal(rows[1].dataset.value, "-2");
  Assert.equal(rows[2].dataset.value, "0");
  Assert.equal(rows[22].dataset.value, "20");
  checkSelected([6, 16, 26, 36, 46], [6, 16]);

  removeValues(0, 2, [-3, -2]);
  checkRows(0, 22);
  Assert.equal(rows[0].dataset.value, "0");
  Assert.equal(rows[1].dataset.value, "1");
  Assert.equal(rows[22].dataset.value, "22");
  checkSelected([4, 14, 24, 34, 44], [4, 14]);

  Assert.equal(list.scrollTop, 0, "the list is still scrolled to the top");

  // Now scroll to the middle and repeat.

  list.scrollTo(0, 935);
  await new Promise(r => content.setTimeout(r, 100));
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[33].dataset.value, "41");
  checkSelected([4, 14, 24, 34, 44], [14, 24, 34]);

  addValues(50, [50]);
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[33].dataset.value, "41");
  checkSelected([4, 14, 24, 34, 44], [14, 24, 34]);

  addValues(38, ["37a"]);
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[29].dataset.value, "37");
  Assert.equal(rows[30].dataset.value, "37a");
  Assert.equal(rows[31].dataset.value, "38");
  Assert.equal(rows[33].dataset.value, "40");
  checkSelected([4, 14, 24, 34, 45], [14, 24, 34]);

  addValues(25, ["24a"]);
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[16].dataset.value, "24");
  Assert.equal(rows[17].dataset.value, "24a");
  Assert.equal(rows[18].dataset.value, "25");
  Assert.equal(rows[33].dataset.value, "39");
  checkSelected([4, 14, 24, 35, 46], [14, 24, 35]);

  addValues(11, ["10a"]);
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[2].dataset.value, "10");
  Assert.equal(rows[3].dataset.value, "10a");
  Assert.equal(rows[4].dataset.value, "11");
  Assert.equal(rows[33].dataset.value, "38");
  checkSelected([4, 15, 25, 36, 47], [15, 25, 36]);

  addValues(0, ["-1"]);
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "7");
  Assert.equal(rows[33].dataset.value, "37a");
  checkSelected([5, 16, 26, 37, 48], [16, 26, 37]);

  Assert.equal(list.scrollTop, 935, "the list is still scrolled to the middle");

  removeValues(54, 1, [50]);
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "7");
  Assert.equal(rows[33].dataset.value, "37a");
  checkSelected([5, 16, 26, 37, 48], [16, 26, 37]);

  removeValues(41, 1, ["37a"]);
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "7");
  Assert.equal(rows[33].dataset.value, "38");
  checkSelected([5, 16, 26, 37, 47], [16, 26, 37]);

  removeValues(27, 1, ["24a"]);
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "7");
  Assert.equal(rows[33].dataset.value, "39");
  checkSelected([5, 16, 26, 36, 46], [16, 26, 36]);

  removeValues(12, 1, ["10a"]);
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "7");
  Assert.equal(rows[33].dataset.value, "40");
  checkSelected([5, 15, 25, 35, 45], [15, 25, 35]);

  removeValues(0, 1, ["-1"]);
  checkRows(8, 41);
  Assert.equal(rows[0].dataset.value, "8");
  Assert.equal(rows[33].dataset.value, "41");
  checkSelected([4, 14, 24, 34, 44], [14, 24, 34]);

  Assert.equal(list.scrollTop, 935, "the list is still scrolled to the middle");

  // Now scroll to the bottom and repeat.

  list.scrollTo(0, 1870);
  await new Promise(r => content.setTimeout(r, 100));
  checkRows(27, 49);
  Assert.equal(rows[0].dataset.value, "27");
  Assert.equal(rows[22].dataset.value, "49");
  checkSelected([4, 14, 24, 34, 44], [34, 44]);

  addValues(50, [50]);
  checkRows(27, 50);
  Assert.equal(rows[0].dataset.value, "27");
  Assert.equal(rows[22].dataset.value, "49");
  Assert.equal(rows[23].dataset.value, "50");
  checkSelected([4, 14, 24, 34, 44], [34, 44]);

  addValues(49, ["48a"]);
  checkRows(27, 51);
  Assert.equal(rows[0].dataset.value, "27");
  Assert.equal(rows[21].dataset.value, "48");
  Assert.equal(rows[22].dataset.value, "48a");
  Assert.equal(rows[23].dataset.value, "49");
  Assert.equal(rows[24].dataset.value, "50");
  checkSelected([4, 14, 24, 34, 44], [34, 44]);

  addValues(30, ["29a"]);
  checkRows(27, 52);
  Assert.equal(rows[0].dataset.value, "27");
  Assert.equal(rows[2].dataset.value, "29");
  Assert.equal(rows[3].dataset.value, "29a");
  Assert.equal(rows[4].dataset.value, "30");
  Assert.equal(rows[25].dataset.value, "50");
  checkSelected([4, 14, 24, 35, 45], [35, 45]);

  addValues(0, ["-1"]);
  checkRows(27, 53);
  Assert.equal(rows[0].dataset.value, "26");
  Assert.equal(rows[26].dataset.value, "50");
  checkSelected([5, 15, 25, 36, 46], [36, 46]);

  Assert.equal(
    list.scrollTop,
    1870,
    "the list is still scrolled to the bottom"
  );

  removeValues(53, 1, [50]);
  checkRows(27, 52);
  Assert.equal(rows[0].dataset.value, "26");
  Assert.equal(rows[25].dataset.value, "49");
  checkSelected([5, 15, 25, 36, 46], [36, 46]);

  removeValues(51, 1, ["48a"]);
  checkRows(27, 51);
  Assert.equal(rows[0].dataset.value, "26");
  Assert.equal(rows[23].dataset.value, "48");
  Assert.equal(rows[24].dataset.value, "49");
  checkSelected([5, 15, 25, 36, 46], [36, 46]);

  removeValues(31, 1, ["29a"]);
  checkRows(27, 50);
  Assert.equal(rows[0].dataset.value, "26");
  Assert.equal(rows[3].dataset.value, "29");
  Assert.equal(rows[4].dataset.value, "30");
  Assert.equal(rows[23].dataset.value, "49");
  checkSelected([5, 15, 25, 35, 45], [35, 45]);

  removeValues(0, 1, ["-1"]);
  checkRows(27, 49);
  Assert.equal(rows[0].dataset.value, "27");
  Assert.equal(rows[22].dataset.value, "49");
  checkSelected([4, 14, 24, 34, 44], [34, 44]);

  Assert.equal(
    list.scrollTop,
    1870,
    "the list is still scrolled to the bottom"
  );

  // Remove a selected row and check the selection changes.

  list.scrollTo(0, 0);
  await new Promise(r => content.setTimeout(r, 100));

  checkSelected([4, 14, 24, 34, 44], [4, 14]);

  removeValues(3, 3, [3, 4, 5]); // 4 is selected.
  checkSelected([11, 21, 31, 41], [11, 21]);

  addValues(3, [3, 4, 5]);
  checkSelected([14, 24, 34, 44], [14]);

  // Remove some consecutive selected rows.

  list.selectedIndices = [6, 7, 8, 9];
  checkSelected([6, 7, 8, 9], [6, 7, 8, 9]);

  removeValues(7, 1, [7]);
  checkSelected([6, 7, 8], [6, 7, 8]);

  removeValues(7, 1, [8]);
  checkSelected([6, 7], [6, 7]);

  removeValues(7, 1, [9]);
  checkSelected([6], [6]);

  // Reset the list.

  addValues(7, [7, 8, 9]);
  list.selectedIndex = -1;
}

/**
 * Checks that expanding and collapsing works. Twisties in the test file are
 * styled as coloured squares: red for collapsed, green for expanded.
 *
 * @note This is practically the same test as in browser_treeListbox.js, but
 * for TreeViewListbox instead of TreeListbox. If you make changes here you
 * may want to make changes there too.
 */
add_task(async function testExpandCollapse() {
  let tab = tabmail.openTab("contentTab", {
    url:
      "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/treeViewListbox2.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  await SpecialPowers.spawn(tab.browser, [], subtestExpandCollapse);

  tabmail.closeTab(tab);
});

async function subtestExpandCollapse() {
  let doc = content.document;
  let list = doc.getElementById("testTree");
  let allIds = [
    "row-1",
    "row-2",
    "row-2-1",
    "row-2-2",
    "row-3",
    "row-3-1",
    "row-3-1-1",
    "row-3-1-2",
  ];
  let idsWithoutChildren = [
    "row-1",
    "row-2-1",
    "row-2-2",
    "row-3-1-1",
    "row-3-1-2",
  ];

  let listener = {
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

  let selectHandler = {
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
    Array.from(list.table.listbox.children, r => r.id),
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

  function checkSelected(expectedIndex, expectedId) {
    Assert.equal(list.selectedIndex, expectedIndex, "selectedIndex is correct");
    let selected = [...list.querySelectorAll(".selected")].map(row => row.id);
    Assert.deepEqual(
      selected,
      [expectedId],
      "correct rows have the 'selected' class"
    );
  }

  list.selectedIndex = 0;
  checkSelected(0, "row-1");

  // Click the twisties of rows without children.

  function performChange(id, expectedChange, changeCallback) {
    listener.reset();
    let row = doc.getElementById(id);
    let before = row.classList.contains("collapsed");

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

  for (let id of idsWithoutChildren) {
    clickTwisty(id, null);
    Assert.equal(list.querySelector(".selected").id, id);
  }

  checkSelected(7, "row-3-1-2");

  // Click the twisties of rows with children.

  function checkRowsAreHidden(...hiddenIds) {
    let remainingIds = allIds.slice();

    for (let id of allIds) {
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
      Array.from(list.table.listbox.children, r => r.id),
      remainingIds,
      "rows property"
    );
  }

  // Collapse row 2.

  clickTwisty("row-2", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2");
  checkSelected(5, "row-3-1-2");

  // Collapse row 3.

  clickTwisty("row-3", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(2, "row-3");

  // Expand row 2.

  clickTwisty("row-2", "expanded");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  // Expand row 3.

  clickTwisty("row-3", "expanded");
  checkRowsAreHidden();
  checkSelected(4, "row-3");

  // Collapse row 3-1.

  clickTwisty("row-3-1", "collapsed");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  // Collapse row 3.

  clickTwisty("row-3", "collapsed");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  // Expand row 3.

  clickTwisty("row-3", "expanded");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  // Expand row 3-1.

  clickTwisty("row-3-1", "expanded");
  checkRowsAreHidden();
  checkSelected(4, "row-3");

  // Test key presses.

  function pressKey(id, key, expectedChange) {
    info(`pressing ${key}`);
    performChange(id, expectedChange, row => {
      EventUtils.synthesizeKey(key, {}, content);
    });
  }

  // Row 0 has no children or parent, nothing should happen.

  list.selectedIndex = 0;
  pressKey("row-1", "VK_LEFT");
  checkSelected(0, "row-1");
  pressKey("row-1", "VK_RIGHT");
  checkSelected(0, "row-1");

  // Collapse row 2.

  list.selectedIndex = 1;
  pressKey("row-2", "VK_LEFT", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2");
  checkSelected(1, "row-2");

  pressKey("row-2", "VK_LEFT");
  checkRowsAreHidden("row-2-1", "row-2-2");
  checkSelected(1, "row-2");

  // Collapse row 3.

  list.selectedIndex = 2;
  pressKey("row-3", "VK_LEFT", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(2, "row-3");

  pressKey("row-3", "VK_LEFT");
  checkRowsAreHidden("row-2-1", "row-2-2", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(2, "row-3");

  // Expand row 2.

  list.selectedIndex = 1;
  pressKey("row-2", "VK_RIGHT", "expanded");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(1, "row-2");

  // Expand row 3.

  list.selectedIndex = 4;
  pressKey("row-3", "VK_RIGHT", "expanded");
  checkRowsAreHidden();
  checkSelected(4, "row-3");

  // Go down the tree to row 3-1-1.

  pressKey("row-3", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelected(5, "row-3-1");

  pressKey("row-3", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelected(6, "row-3-1-1");

  pressKey("row-3-1-1", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelected(6, "row-3-1-1");

  // Collapse row 3-1.

  pressKey("row-3-1-1", "VK_LEFT");
  checkRowsAreHidden();
  checkSelected(5, "row-3-1");

  pressKey("row-3-1", "VK_LEFT", "collapsed");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(5, "row-3-1");

  // Collapse row 3.

  pressKey("row-3-1", "VK_LEFT");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  pressKey("row-3", "VK_LEFT", "collapsed");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  // Expand row 3.

  pressKey("row-3", "VK_RIGHT", "expanded");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  pressKey("row-3", "VK_RIGHT");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(5, "row-3-1");

  // Expand row 3-1.

  pressKey("row-3-1", "VK_RIGHT", "expanded");
  checkRowsAreHidden();
  checkSelected(5, "row-3-1");

  pressKey("row-3-1", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelected(6, "row-3-1-1");

  pressKey("row-3-1-1", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelected(6, "row-3-1-1");

  // Same again, with a RTL tree.

  info("switching to RTL");
  doc.documentElement.dir = "rtl";

  // Row 0 has no children or parent, nothing should happen.

  list.selectedIndex = 0;
  pressKey("row-1", "VK_RIGHT");
  checkSelected(0, "row-1");
  pressKey("row-1", "VK_LEFT");
  checkSelected(0, "row-1");

  // Collapse row 2.

  list.selectedIndex = 1;
  pressKey("row-2", "VK_RIGHT", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2");
  checkSelected(1, "row-2");

  pressKey("row-2", "VK_RIGHT");
  checkRowsAreHidden("row-2-1", "row-2-2");
  checkSelected(1, "row-2");

  // Collapse row 3.

  list.selectedIndex = 2;
  pressKey("row-3", "VK_RIGHT", "collapsed");
  checkRowsAreHidden("row-2-1", "row-2-2", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(2, "row-3");

  pressKey("row-3", "VK_RIGHT");
  checkRowsAreHidden("row-2-1", "row-2-2", "row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(2, "row-3");

  // Expand row 2.

  list.selectedIndex = 1;
  pressKey("row-2", "VK_LEFT", "expanded");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(1, "row-2");

  // Expand row 3.

  list.selectedIndex = 4;
  pressKey("row-3", "VK_LEFT", "expanded");
  checkRowsAreHidden();
  checkSelected(4, "row-3");

  // Go down the tree to row 3-1-1.

  pressKey("row-3", "VK_LEFT");
  checkRowsAreHidden();
  checkSelected(5, "row-3-1");

  pressKey("row-3", "VK_LEFT");
  checkRowsAreHidden();
  checkSelected(6, "row-3-1-1");

  pressKey("row-3-1-1", "VK_LEFT");
  checkRowsAreHidden();
  checkSelected(6, "row-3-1-1");

  // Collapse row 3-1.

  pressKey("row-3-1-1", "VK_RIGHT");
  checkRowsAreHidden();
  checkSelected(5, "row-3-1");

  pressKey("row-3-1", "VK_RIGHT", "collapsed");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(5, "row-3-1");

  // Collapse row 3.

  pressKey("row-3-1", "VK_RIGHT");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  pressKey("row-3", "VK_RIGHT", "collapsed");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  // Expand row 3.

  pressKey("row-3", "VK_LEFT", "expanded");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  pressKey("row-3", "VK_LEFT");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(5, "row-3-1");

  // Expand row 3-1.

  pressKey("row-3-1", "VK_LEFT", "expanded");
  checkRowsAreHidden();
  checkSelected(5, "row-3-1");

  pressKey("row-3-1", "VK_LEFT");
  checkRowsAreHidden();
  checkSelected(6, "row-3-1-1");

  pressKey("row-3-1-1", "VK_LEFT");
  checkRowsAreHidden();
  checkSelected(6, "row-3-1-1");

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
  checkSelected(5, "row-3-1");
  selectHandler.reset();
  listener.reset();

  list.expandRowAtIndex(5); // Selected item with children.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.equal(listener.expandedIndex, 5, "row-3-1 fired 'expanded' event");
  checkRowsAreHidden();
  checkSelected(5, "row-3-1");
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
  checkSelected(4, "row-3");
  selectHandler.reset();
  listener.reset();

  list.expandRowAtIndex(4); // Selected item with grandchildren.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.equal(listener.expandedIndex, 4, "row-3 fired 'expanded' event");
  checkRowsAreHidden();
  checkSelected(4, "row-3");
  listener.reset();

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
  let tab = tabmail.openTab("contentTab", {
    url:
      "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/treeViewListbox.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  await SpecialPowers.spawn(tab.browser, [], subtestRowClassChange);

  tabmail.closeTab(tab);
});

async function subtestRowClassChange() {
  let doc = content.document;
  let list = doc.getElementById("testTree");
  let indices = (list.selectedIndices = [1, 2, 3, 5, 8, 13, 21, 34]);
  list.currentIndex = 5;

  for (let row of list.table.listbox.children) {
    Assert.equal(row.getAttribute("is"), "test-listrow");
    Assert.equal(row.clientHeight, 50);
    Assert.equal(
      row.classList.contains("selected"),
      indices.includes(row.index)
    );
    Assert.equal(row.classList.contains("current"), row.index == 5);
  }

  info("switching row class to AlternativeCardRow");
  list.setAttribute("rows", "alternative-listrow");
  Assert.deepEqual(list.selectedIndices, indices);
  Assert.equal(list.currentIndex, 5);

  for (let row of list.table.listbox.children) {
    Assert.equal(row.getAttribute("is"), "alternative-listrow");
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
  list.setAttribute("rows", "test-listrow");
  Assert.deepEqual(list.selectedIndices, []);
  Assert.equal(list.currentIndex, -1);

  for (let row of list.table.listbox.children) {
    Assert.equal(row.getAttribute("is"), "test-listrow");
    Assert.equal(row.clientHeight, 50);
    Assert.ok(!row.classList.contains("selected"));
    Assert.ok(!row.classList.contains("current"));
  }
}

/**
 * Checks that resizing the widget automatically adds more rows if necessary.
 */
add_task(async function testResize() {
  let tab = tabmail.openTab("contentTab", {
    url:
      "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/treeViewListbox.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  await SpecialPowers.spawn(tab.browser, [], subtestResize);

  tabmail.closeTab(tab);
});

async function subtestResize() {
  const { TestUtils } = ChromeUtils.importESModule(
    "resource://testing-common/TestUtils.sys.mjs"
  );

  let doc = content.document;

  let list = doc.getElementById("testTree");
  Assert.ok(!!list, "the list exists");

  let rowCount = function() {
    return list.querySelectorAll(`tr[is="test-listrow"]`).length;
  };

  let originalHeight = list.clientHeight;

  // Start by scrolling to somewhere in the middle of the list, so that we
  // don't have to think about buffer rows that don't exist at the ends.
  list.scrollBy(0, 650);

  // The list has enough space for 13 visible rows, and 10 buffer rows should
  // exist above and below.
  await TestUtils.waitForCondition(
    () => rowCount() == 33,
    "the list should the right number of rows"
  );

  // Make the list shorter by 5 rows. This should not affect the number of rows,
  // but this is a bit flaky, so check we have at least the minimum required.
  list.style.height = `${originalHeight - 250}px`;
  await new Promise(resolve => content.setTimeout(resolve, 500));
  Assert.greaterOrEqual(
    rowCount(),
    28,
    "making the list shorter should not change the number of rows"
  );

  // Scrolling the list by any amount should remove excess rows.
  list.scrollBy(0, 50);
  await TestUtils.waitForCondition(
    () => rowCount() == 28,
    "scrolling the list after resize should remove the excess rows"
  );

  // Return to the original height. More buffer rows should be added.
  list.style.height = `${originalHeight}px`;
  await TestUtils.waitForCondition(
    () => rowCount() == 33,
    "making the list taller should change the number of rows"
  );

  // Make the list taller by 5 rows.
  list.style.height = `${originalHeight + 250}px`;
  await TestUtils.waitForCondition(
    () => rowCount() == 38,
    "making the list taller should change the number of rows"
  );

  // Scrolling the list should not affect the number of rows.
  list.scrollBy(0, 50);
  await new Promise(resolve => content.setTimeout(resolve, 1000));
  Assert.equal(
    rowCount(),
    38,
    "scrolling the list should not change the number of rows"
  );
}
