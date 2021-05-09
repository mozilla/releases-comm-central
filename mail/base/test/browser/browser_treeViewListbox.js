let tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

add_task(async function() {
  let tab = tabmail.openTab("contentTab", {
    url:
      "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/treeViewListbox.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  await SpecialPowers.spawn(tab.browser, [], testKeyboardAndMouse);
  await SpecialPowers.spawn(tab.browser, [], testRowCountChange);

  tabmail.closeTab(tab);
});

async function testKeyboardAndMouse() {
  let doc = content.document;

  let list = doc.querySelector("tree-view-listbox");
  Assert.ok(!!list, "the list exists");

  let listRect = list.getBoundingClientRect();

  let rows = list.querySelectorAll("test-listrow");
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
      this.selectedAtEvent = list.selectedIndicies;
    },
  };

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
    Assert.equal(current.length, 1, "only one row has the 'current' class");
    Assert.equal(
      current[0].index,
      expectedIndex,
      "correct row has the 'current' class"
    );
  }

  function checkSelected(...expectedIndicies) {
    Assert.deepEqual(
      list.selectedIndicies,
      expectedIndicies,
      "selectedIndicies are correct"
    );
    if (selectHandler.selectedAtEvent !== null) {
      // Check the value was already set when the select event fired.
      Assert.deepEqual(
        selectHandler.selectedAtEvent,
        expectedIndicies,
        "selectedIndicies were correct at the last 'select' event"
      );
    }

    let selected = [...list.querySelectorAll(".selected")].map(
      row => row.index
    );
    expectedIndicies.sort((a, b) => a - b);
    Assert.deepEqual(
      selected,
      expectedIndicies,
      "correct rows have the 'selected' class"
    );
  }

  checkCurrent(0);
  checkSelected();

  // Click on some individual rows.

  function clickOnRow(index, modifiers = {}) {
    if (modifiers.shiftKey) {
      info(`clicking on row ${index} with shift key`);
    } else if (modifiers.ctrlKey) {
      info(`clicking on row ${index} with ctrl key`);
    } else {
      info(`clicking on row ${index}`);
    }

    let x = list.clientWidth / 2;
    let y = index * 50 + 25;

    selectHandler.reset();
    list.addEventListener("select", selectHandler);
    EventUtils.synthesizeMouse(list, x, y, modifiers, content);
    list.removeEventListener("select", selectHandler);
    Assert.ok(selectHandler.seenEvent, "'select' event fired as expected");
  }

  clickOnRow(0);
  checkCurrent(0);
  checkSelected(0);

  clickOnRow(1);
  checkCurrent(1);
  checkSelected(1);

  clickOnRow(2);
  checkCurrent(2);
  checkSelected(2);

  // Select multiple rows by shift-clicking.

  clickOnRow(4, { shiftKey: true });
  checkCurrent(4);
  checkSelected(2, 3, 4);

  clickOnRow(6, { shiftKey: true });
  checkCurrent(6);
  checkSelected(2, 3, 4, 5, 6);

  clickOnRow(0, { shiftKey: true });
  checkCurrent(0);
  checkSelected(0, 1, 2);

  clickOnRow(2, { shiftKey: true });
  checkCurrent(2);
  checkSelected(2);

  // Select multiple rows by ctrl-clicking.

  clickOnRow(5, { ctrlKey: true });
  checkCurrent(5);
  checkSelected(2, 5);

  clickOnRow(1, { ctrlKey: true });
  checkCurrent(1);
  checkSelected(2, 5, 1);

  clickOnRow(5, { ctrlKey: true });
  checkCurrent(5); // Is this right?
  checkSelected(2, 1);

  clickOnRow(1, { ctrlKey: true });
  checkCurrent(1); // Is this right?
  checkSelected(2);

  clickOnRow(2, { ctrlKey: true });
  checkCurrent(2); // Is this right?
  checkSelected();

  // Move around by pressing keys.

  function pressKey(key, modifiers = {}, expectEvent = true) {
    if (modifiers.shiftKey) {
      info(`pressing ${key} with shift key`);
    } else {
      info(`pressing ${key}`);
    }

    selectHandler.reset();
    list.addEventListener("select", selectHandler);
    EventUtils.synthesizeKey(key, modifiers, content);
    list.removeEventListener("select", selectHandler);
    Assert.equal(
      !!selectHandler.seenEvent,
      expectEvent,
      `'select' event ${expectEvent ? "fired" : "did not fire"} as expected`
    );
  }

  function scrollingDelay() {
    return new Promise(r => content.setTimeout(r, 100));
  }

  pressKey("VK_UP");
  checkCurrent(1);
  checkSelected(1);

  pressKey("VK_UP");
  checkCurrent(0);
  checkSelected(0);

  // Does nothing.
  pressKey("VK_UP", undefined, false);
  checkCurrent(0);
  checkSelected(0);

  // The list is 630px high, so rows 0-11 are fully visible.

  pressKey("VK_PAGE_DOWN");
  await scrollingDelay();
  checkCurrent(12);
  checkSelected(12);
  Assert.equal(list.getFirstVisibleIndex(), 1, "scrolled to the correct place");

  pressKey("VK_PAGE_UP", { shiftKey: true });
  await scrollingDelay();
  checkCurrent(0);
  checkSelected(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
  Assert.equal(list.getFirstVisibleIndex(), 0, "scrolled to the correct place");

  // Now rows 38-49 are fully visible.

  pressKey("VK_END");
  await scrollingDelay();
  checkCurrent(49);
  checkSelected(49);
  Assert.equal(
    list.getFirstVisibleIndex(),
    38,
    "scrolled to the correct place"
  );

  // Does nothing.
  pressKey("VK_DOWN", undefined, false);
  checkCurrent(49);
  checkSelected(49);
  Assert.equal(
    list.getFirstVisibleIndex(),
    38,
    "scrolled to the correct place"
  );

  pressKey("VK_PAGE_UP");
  await scrollingDelay();
  checkCurrent(37);
  checkSelected(37);
  Assert.equal(
    list.getFirstVisibleIndex(),
    37,
    "scrolled to the correct place"
  );

  pressKey("VK_PAGE_DOWN", { shiftKey: true });
  await scrollingDelay();
  checkCurrent(49);
  checkSelected(37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49);
  Assert.equal(
    list.getFirstVisibleIndex(),
    38,
    "scrolled to the correct place"
  );

  pressKey("VK_HOME");
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
  Assert.deepEqual(
    list.selectedIndicies,
    [0],
    "selectedIndicies are still set"
  );
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

  pressKey("VK_DOWN");
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

  pressKey("VK_UP");
  checkCurrent(0);
  checkSelected(0);
  Assert.equal(list.getFirstVisibleIndex(), 0, "scrolled to the correct place");

  // Some literal edge cases. Clicking on a partially visible row should
  // scroll it into view.

  rows = list.querySelectorAll("test-listrow");
  let bcr = rows[12].getBoundingClientRect();
  Assert.less(bcr.top, listRect.bottom, "top of row 12 is visible");
  Assert.greater(
    bcr.bottom,
    listRect.bottom,
    "bottom of row 12 is not visible"
  );
  clickOnRow(12);
  await scrollingDelay();
  bcr = rows[12].getBoundingClientRect();
  Assert.less(bcr.top, listRect.bottom, "top of row 12 is visible");
  Assert.equal(bcr.bottom, listRect.bottom, "bottom of row 12 is visible");

  bcr = rows[0].getBoundingClientRect();
  Assert.less(bcr.top, listRect.top, "top of row 0 is not visible");
  Assert.greater(bcr.bottom, listRect.top, "bottom of row 0 is visible");
  clickOnRow(0);
  await scrollingDelay();
  bcr = rows[0].getBoundingClientRect();
  Assert.equal(bcr.top, listRect.top, "top of row 0 is visible");
  Assert.greater(bcr.bottom, listRect.top, "bottom of row 0 is visible");
}

async function testRowCountChange() {
  let doc = content.document;

  let ROW_HEIGHT = 50;
  let list = doc.querySelector("tree-view-listbox");
  let view = list.view;
  let rows;

  // Check the initial state.

  function checkRows(first, last) {
    let expectedIndicies = [];
    for (let i = first; i <= last; i++) {
      expectedIndicies.push(i);
    }
    rows = list.querySelectorAll("test-listrow");
    Assert.deepEqual(
      Array.from(rows, r => r.index),
      expectedIndicies,
      "the list has the right rows"
    );
    Assert.deepEqual(
      Array.from(rows, r => r.dataset.value),
      view.values.slice(first, last + 1),
      "the list has the right rows"
    );
  }

  function checkSelected(indicies, existingIndicies) {
    Assert.deepEqual(list.selectedIndicies, indicies);
    let selectedRows = list.querySelectorAll("test-listrow.selected");
    Assert.deepEqual(
      Array.from(selectedRows, r => r.index),
      existingIndicies
    );
  }

  let expectedCount = 50;

  // Select every tenth row. We'll check what is selected remains selected.

  list.selectedIndicies = [4, 14, 24, 34, 44];

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

  list.selectedIndicies = [6, 7, 8, 9];
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
