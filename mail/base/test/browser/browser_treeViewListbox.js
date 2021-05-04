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

  await SpecialPowers.spawn(tab.browser, [], testInner);

  tabmail.closeTab(tab);
});

async function testInner() {
  let doc = content.document;

  let list = doc.querySelector("tree-view-listbox");
  Assert.ok(!!list, "the list exists");

  let listRect = list.getBoundingClientRect();

  let rows = list.querySelectorAll("test-listrow");
  Assert.greater(rows.length, 0, "the list has rows");

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
