/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

async function withTab(callback) {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/base/test/widgets/files/treeListbox.xhtml",
  });
  await BrowserTestUtils.browserLoaded(tab.browser);

  tab.browser.focus();
  await SpecialPowers.spawn(tab.browser, [], callback);

  tabmail.closeTab(tab);
}

add_task(async function testKeyboard() {
  await withTab(subtestKeyboard);
});
add_task(async function testMutation() {
  await withTab(subtestMutation);
});
add_task(async function testExpandCollapse() {
  await withTab(subtestExpandCollapse);
});
add_task(async function testSelectOnRemoval1() {
  await withTab(subtestSelectOnRemoval1);
});
add_task(async function testSelectOnRemoval2() {
  await withTab(subtestSelectOnRemoval2);
});
add_task(async function testSelectOnRemoval3() {
  await withTab(subtestSelectOnRemoval3);
});
add_task(async function testUnselectable() {
  await withTab(subtestUnselectable);
});

/**
 * Tests keyboard navigation up and down the list.
 */
async function subtestKeyboard() {
  const doc = content.document;

  const list = doc.querySelector(`ul[is="tree-listbox"]`);
  Assert.ok(!!list, "the list exists");

  const initialRowIds = [
    "row-1",
    "row-2",
    "row-2-1",
    "row-2-2",
    "row-3",
    "row-3-1",
    "row-3-1-1",
    "row-3-1-2",
  ];
  Assert.equal(list.rowCount, initialRowIds.length, "rowCount is correct");
  Assert.deepEqual(
    list.rows.map(r => r.id),
    initialRowIds,
    "initial rows are correct"
  );
  Assert.equal(list.selectedIndex, 0, "selectedIndex is set to 0");

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

  function pressKey(key, expectEvent = true) {
    info(`pressing ${key}`);

    selectHandler.reset();
    list.addEventListener("select", selectHandler);
    EventUtils.synthesizeKey(key, {}, content);
    list.removeEventListener("select", selectHandler);
    Assert.equal(
      !!selectHandler.seenEvent,
      expectEvent,
      `'select' event ${expectEvent ? "fired" : "did not fire"}`
    );
  }

  function checkSelected(expectedIndex, expectedId) {
    Assert.equal(list.selectedIndex, expectedIndex, "selectedIndex is correct");
    if (selectHandler.selectedAtEvent !== null) {
      // Check the value was already set when the select event fired.
      Assert.deepEqual(
        selectHandler.selectedAtEvent,
        expectedIndex,
        "selectedIndex was correct at the last 'select' event"
      );
    }

    Assert.deepEqual(
      Array.from(list.querySelectorAll(".selected"), row => row.id),
      [expectedId],
      "correct rows have the 'selected' class"
    );
  }

  // Key down the list.

  list.focus();
  for (let i = 1; i < initialRowIds.length; i++) {
    pressKey("KEY_ArrowDown");
    checkSelected(i, initialRowIds[i]);
  }

  pressKey("KEY_ArrowDown", false);
  checkSelected(7, "row-3-1-2");

  pressKey("KEY_PageDown", false);
  checkSelected(7, "row-3-1-2");

  pressKey("KEY_End", false);
  checkSelected(7, "row-3-1-2");

  // And up again.

  for (let i = initialRowIds.length - 2; i >= 0; i--) {
    pressKey("KEY_ArrowUp");
    checkSelected(i, initialRowIds[i]);
  }

  pressKey("KEY_ArrowUp", false);
  checkSelected(0, "row-1");

  pressKey("KEY_PageUp", false);
  checkSelected(0, "row-1");

  pressKey("KEY_Home", false);
  checkSelected(0, "row-1");

  // Jump around.

  pressKey("KEY_End");
  checkSelected(7, "row-3-1-2");

  pressKey("KEY_PageUp");
  checkSelected(0, "row-1");

  pressKey("KEY_PageDown");
  checkSelected(7, "row-3-1-2");

  pressKey("KEY_Home");
  checkSelected(0, "row-1");
}

/**
 * Tests that rows added to or removed from the tree cause their parent rows
 * to gain or lose the 'children' class as appropriate. This is done with a
 * mutation observer so the tree is not updated immediately, but at the end of
 * the event loop.
 */
async function subtestMutation() {
  const doc = content.document;
  const list = doc.querySelector(`ul[is="tree-listbox"]`);
  const idsWithChildren = ["row-2", "row-3", "row-3-1"];
  const idsWithoutChildren = [
    "row-1",
    "row-2-1",
    "row-2-2",
    "row-3-1-1",
    "row-3-1-2",
  ];

  // Check the initial state.

  function createNewRow() {
    const template = doc.getElementById("rowToAdd");
    return template.content.cloneNode(true).firstElementChild;
  }

  function checkHasClass(id, shouldHaveClass = true) {
    const row = doc.getElementById(id);
    if (shouldHaveClass) {
      Assert.ok(
        row.classList.contains("children"),
        `${id} should have the 'children' class`
      );
    } else {
      Assert.ok(
        !row.classList.contains("children"),
        `${id} should NOT have the 'children' class`
      );
    }
  }

  for (const id of idsWithChildren) {
    checkHasClass(id, true);
  }
  for (const id of idsWithoutChildren) {
    checkHasClass(id, false);
  }

  // Add a new row without children to the end of the list.

  info("adding new row to end of list");
  let newRow = list.appendChild(createNewRow());
  // Wait for mutation observer. It does nothing, but let's be sure.
  await new Promise(r => content.setTimeout(r));
  checkHasClass("new-row", false);
  newRow.remove();
  await new Promise(r => content.setTimeout(r));

  // Add and remove a single row to rows with existing children.

  for (const id of idsWithChildren) {
    const row = doc.getElementById(id);

    info(`adding new row to ${id}`);
    newRow = row.querySelector("ul").appendChild(createNewRow());
    // Wait for mutation observer. It does nothing, but let's be sure.
    await new Promise(r => content.setTimeout(r));
    checkHasClass("new-row", false);
    checkHasClass(id, true);

    info(`removing new row from ${id}`);
    newRow.remove();
    // Wait for mutation observer. It does nothing, but let's be sure.
    await new Promise(r => content.setTimeout(r));
    checkHasClass(id, true);

    if (id == "row-3-1") {
      checkHasClass("row-3", true);
    }
  }

  // Add and remove a single row to rows without existing children.

  for (const id of idsWithoutChildren) {
    const row = doc.getElementById(id);
    const childList = row.appendChild(doc.createElement("ul"));

    info(`adding new row to ${id}`);
    newRow = childList.appendChild(createNewRow());
    // Wait for mutation observer.
    await new Promise(r => content.setTimeout(r));
    checkHasClass("new-row", false);
    checkHasClass(id, true);

    info(`removing new row from ${id}`);
    newRow.remove();
    // Wait for mutation observer.
    await new Promise(r => content.setTimeout(r));
    checkHasClass(id, false);

    // This time remove the child list, not the row itself.

    info(`adding new row to ${id} again`);
    newRow = childList.appendChild(createNewRow());
    // Wait for mutation observer.
    await new Promise(r => content.setTimeout(r));
    checkHasClass("new-row", false);
    checkHasClass(id, true);

    info(`removing child list from ${id}`);
    childList.remove();
    // Wait for mutation observer.
    await new Promise(r => content.setTimeout(r));
    checkHasClass(id, false);

    if (["row-2-1", "row-2-2"].includes(id)) {
      checkHasClass("row-2", true);
    } else if (["row-3-1-1", "row-3-1-2"].includes(id)) {
      checkHasClass("row-3-1", true);
      checkHasClass("row-3", true);
    }
  }

  // Add a row with children and a grandchild to the end of the list. The new
  // row should be given the "children" class. The child with a grandchild
  // should be given the "children" class. I think it's safe to assume this
  // works no matter where in the tree it's added.

  const template = doc.getElementById("rowsToAdd");
  newRow = template.content.cloneNode(true).firstElementChild;
  list.appendChild(newRow);
  // Wait for mutation observer.
  await new Promise(r => content.setTimeout(r));
  checkHasClass("added-row", true);
  checkHasClass("added-row-1", true);
  checkHasClass("added-row-1-1", false);
  checkHasClass("added-row-2", false);
  newRow.remove();
  await new Promise(r => content.setTimeout(r));

  // Add a new row without children to the middle of the list. Selection should
  // be maintained.

  list.selectedIndex = 5; // row-3-1

  info("adding new row to middle of list");
  newRow = template.content.cloneNode(true).firstElementChild;
  list.insertBefore(newRow, list.querySelector("#row-3"));
  await new Promise(r => content.setTimeout(r));
  Assert.equal(list.selectedIndex, 9, "row-3-1 is still selected");

  newRow.remove();
  await new Promise(r => content.setTimeout(r));
  Assert.equal(list.selectedIndex, 5, "row-3-1 is still selected");

  list.selectedIndex = 0;
}

/**
 * Checks that expanding and collapsing works. Twisties in the test file are
 * styled as coloured squares: red for collapsed, green for expanded.
 *
 * @note This is practically the same test as in browser_treeView.js,
 * but for TreeListbox instead of TreeView. If you make changes here
 * you may want to make changes there too.
 */
async function subtestExpandCollapse() {
  const doc = content.document;
  const list = doc.querySelector(`ul[is="tree-listbox"]`);
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
      this.collapsedRow = null;
      this.expandedRow = null;
    },
    handleEvent(event) {
      if (event.type == "collapsed") {
        this.collapsedRow = event.target;
      } else if (event.type == "expanded") {
        this.expandedRow = event.target;
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
  Assert.equal(list.rowCount, 8, "row count");
  Assert.deepEqual(
    list.rows.map(r => r.id),
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
    const selected = [...list.querySelectorAll(".selected")].map(row => row.id);
    Assert.deepEqual(
      selected,
      [expectedId],
      "correct rows have the 'selected' class"
    );
  }

  checkSelected(0, "row-1");

  // Click the twisties of rows without children.

  function performChange(id, expectedChange, changeCallback) {
    listener.reset();
    const row = doc.getElementById(id);
    const before = row.classList.contains("collapsed");

    changeCallback(row);

    if (expectedChange == "collapsed") {
      Assert.ok(!before, `${id} was expanded`);
      Assert.ok(row.classList.contains("collapsed"), `${id} collapsed`);
      Assert.equal(listener.collapsedRow, row, `${id} fired 'collapse' event`);
      Assert.ok(!listener.expandedRow, `${id} did not fire 'expand' event`);
    } else if (expectedChange == "expanded") {
      Assert.ok(before, `${id} was collapsed`);
      Assert.ok(!row.classList.contains("collapsed"), `${id} expanded`);
      Assert.ok(!listener.collapsedRow, `${id} did not fire 'collapse' event`);
      Assert.equal(listener.expandedRow, row, `${id} fired 'expand' event`);
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

  function doubleClick(id, expectedChange) {
    info(`double clicking on ${id}`);
    performChange(id, expectedChange, row =>
      EventUtils.synthesizeMouseAtCenter(row, { clickCount: 2 }, content)
    );
  }

  for (const id of idsWithoutChildren) {
    clickTwisty(id, null);
    Assert.equal(list.querySelector(".selected").id, id);
  }

  checkSelected(7, "row-3-1-2");

  // Click the twisties of rows with children.

  function checkRowsAreHidden(...hiddenIds) {
    const remainingIds = allIds.slice();

    for (const id of allIds) {
      if (hiddenIds.includes(id)) {
        Assert.equal(doc.getElementById(id).clientHeight, 0, `${id} is hidden`);
        remainingIds.splice(remainingIds.indexOf(id), 1);
      } else {
        Assert.greater(
          doc.getElementById(id).clientHeight,
          0,
          `${id} is visible`
        );
      }
    }

    Assert.equal(list.rowCount, 8 - hiddenIds.length, "row count");
    Assert.deepEqual(
      list.rows.map(r => r.id),
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

  doubleClick("row-2", "expanded");
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");

  // Expand row 3.

  doubleClick("row-3", "expanded");
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

  // Toggle expansion of row 3-1 with Enter key.

  list.selectedIndex = 5;
  pressKey("row-3-1", "KEY_Enter", "collapsed");
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(5, "row-3-1");

  pressKey("row-3-1", "KEY_Enter", "expanded");
  checkRowsAreHidden();
  checkSelected(5, "row-3-1");

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
  Assert.ok(!listener.collapsedRow, "'collapsed' event did not fire");

  list.expandRowAtIndex(6); // No children, no effect.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.ok(!listener.expandedRow, "'expanded' event did not fire");

  list.collapseRowAtIndex(1); // Item with children that aren't selected.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.equal(
    listener.collapsedRow.id,
    "row-2",
    "row-2 fired 'collapsed' event"
  );
  listener.reset();

  list.expandRowAtIndex(1); // Item with children that aren't selected.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.equal(
    listener.expandedRow.id,
    "row-2",
    "row-2 fired 'expanded' event"
  );
  listener.reset();

  list.collapseRowAtIndex(5); // Item with children that are selected.
  Assert.ok(selectHandler.seenEvent, "'select' event fired");
  Assert.equal(
    selectHandler.selectedAtEvent,
    5,
    "selectedIndex was correct when 'select' event fired"
  );
  Assert.equal(
    listener.collapsedRow.id,
    "row-3-1",
    "row-3-1 fired 'collapsed' event"
  );
  checkRowsAreHidden("row-3-1-1", "row-3-1-2");
  checkSelected(5, "row-3-1");
  selectHandler.reset();
  listener.reset();

  list.expandRowAtIndex(5); // Selected item with children.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.equal(
    listener.expandedRow.id,
    "row-3-1",
    "row-3-1 fired 'expanded' event"
  );
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
  Assert.equal(
    listener.collapsedRow.id,
    "row-3",
    "row-3 fired 'collapsed' event"
  );
  checkRowsAreHidden("row-3-1", "row-3-1-1", "row-3-1-2");
  checkSelected(4, "row-3");
  selectHandler.reset();
  listener.reset();

  list.expandRowAtIndex(4); // Selected item with grandchildren.
  Assert.ok(!selectHandler.seenEvent, "'select' event did not fire");
  Assert.equal(
    listener.expandedRow.id,
    "row-3",
    "row-3 fired 'expanded' event"
  );
  checkRowsAreHidden();
  checkSelected(4, "row-3");
  listener.reset();

  list.removeEventListener("collapsed", listener);
  list.removeEventListener("expanded", listener);
  list.removeEventListener("select", selectHandler);
  doc.documentElement.dir = null;
}

/**
 * Tests what happens to selection when a row is removed.
 */
async function subtestSelectOnRemoval1() {
  const doc = content.document;
  const list = doc.getElementById("deleteTree");

  let selectPromise;
  function promiseSelectEvent() {
    selectPromise = new Promise(resolve =>
      list.addEventListener(
        "select",
        () => resolve([list.selectedIndex, list.selectedRow?.id ?? null]),
        {
          once: true,
        }
      )
    );
  }
  // dRow-1
  // dRow-2
  //   dRow-2-1
  //   dRow-2-2
  // dRow-3
  //   dRow-3-1
  //     dRow-3-1-1
  //     dRow-3-1-2
  //     dRow-3-1-3
  // dRow-4
  //   dRow-4-1
  //   dRow-4-2
  //   dRow-4-3
  //     dRow-4-3-1
  //     dRow-4-3-2
  //   dRow-4-4
  // dRow-5
  //   dRow-5-1
  // dRow-6

  // Delete a row that is selected, and not at the top level. Selection should
  // move to the next row under the shared parent.

  list.selectedIndex = 2;
  Assert.equal(list.selectedRow.id, "dRow-2-1");

  promiseSelectEvent();
  list.querySelector("#dRow-2-1").remove();
  Assert.deepEqual(
    await selectPromise,
    [2, "dRow-2-2"],
    "selection moved to the next row"
  );

  // dRow-1
  // dRow-2
  //   dRow-2-2
  // dRow-3
  //   dRow-3-1
  //     dRow-3-1-1
  //     dRow-3-1-2
  //     dRow-3-1-3
  // dRow-4
  //   dRow-4-1
  //   dRow-4-2
  //   dRow-4-3
  //     dRow-4-3-1
  //     dRow-4-3-2
  //   dRow-4-4
  // dRow-5
  //   dRow-5-1
  // dRow-6

  // Delete a row that contains the selected, and at the top level. Selection
  // should move to the next top-level row.

  Assert.equal(list.selectedRow.id, "dRow-2-2");
  promiseSelectEvent();
  list.querySelector("#dRow-2").remove();
  Assert.deepEqual(
    await selectPromise,
    [1, "dRow-3"],
    "selection moved to the next row"
  );

  // dRow-1
  // dRow-3
  //   dRow-3-1
  //     dRow-3-1-1
  //     dRow-3-1-2
  //     dRow-3-1-3
  // dRow-4
  //   dRow-4-1
  //   dRow-4-2
  //   dRow-4-3
  //     dRow-4-3-1
  //     dRow-4-3-2
  //   dRow-4-4
  // dRow-5
  //   dRow-5-1
  // dRow-6

  // Delete the first top-level row that is selected. Should select the first
  // row.
  list.selectedIndex = 0;
  Assert.equal(list.selectedRow.id, "dRow-1");
  promiseSelectEvent();
  list.querySelector("#dRow-1").remove();
  Assert.deepEqual(
    await selectPromise,
    [0, "dRow-3"],
    "selection moved to the first row"
  );

  // dRow-3
  //   dRow-3-1
  //     dRow-3-1-1
  //     dRow-3-1-2
  //     dRow-3-1-3
  // dRow-4
  //   dRow-4-1
  //   dRow-4-2
  //   dRow-4-3
  //     dRow-4-3-1
  //     dRow-4-3-2
  //   dRow-4-4
  // dRow-5
  //   dRow-5-1
  // dRow-6

  // Delete the last top-level row that is selected. Should select the last row.
  list.selectedIndex = 14;
  Assert.equal(list.selectedRow.id, "dRow-6");
  promiseSelectEvent();
  list.querySelector("#dRow-6").remove();
  Assert.deepEqual(
    await selectPromise,
    [13, "dRow-5-1"],
    "selection moved to the new last row"
  );

  // dRow-3
  //   dRow-3-1
  //     dRow-3-1-1
  //     dRow-3-1-2
  //     dRow-3-1-3
  // dRow-4
  //   dRow-4-1
  //   dRow-4-2
  //   dRow-4-3
  //     dRow-4-3-1
  //     dRow-4-3-2
  //   dRow-4-4
  // dRow-5
  //   dRow-5-1

  // Delete the last selected descendant should move selection to the new
  // descendant child.
  list.selectedIndex = 11;
  Assert.equal(list.selectedRow.id, "dRow-4-4");
  promiseSelectEvent();
  list.querySelector("#dRow-4-4").remove();
  Assert.deepEqual(
    await selectPromise,
    [10, "dRow-4-3-2"],
    "selection moved to the new last row"
  );

  // dRow-3
  //   dRow-3-1
  //     dRow-3-1-1
  //     dRow-3-1-2
  //     dRow-3-1-3
  // dRow-4
  //   dRow-4-1
  //   dRow-4-2
  //   dRow-4-3
  //     dRow-4-3-1
  //     dRow-4-3-2
  // dRow-5
  //   dRow-5-1

  // Delete the first selected child should move selection to the new first child.
  list.selectedIndex = 6;
  Assert.equal(list.selectedRow.id, "dRow-4-1");
  promiseSelectEvent();
  list.querySelector("#dRow-4-1").remove();
  Assert.deepEqual(
    await selectPromise,
    [6, "dRow-4-2"],
    "selection moved to the new first row"
  );

  // dRow-3
  //   dRow-3-1
  //     dRow-3-1-1
  //     dRow-3-1-2
  //     dRow-3-1-3
  // dRow-4
  //   dRow-4-2
  //   dRow-4-3
  //     dRow-4-3-1
  //     dRow-4-3-2
  // dRow-5
  //   dRow-5-1

  // Delete a row that isn't selected. Nothing should happen.

  list.selectedIndex = 2;
  Assert.equal(list.selectedRow.id, "dRow-3-1-1");

  list.querySelector("#dRow-3-1-2").remove();
  await new Promise(resolve => content.setTimeout(resolve));
  Assert.equal(list.selectedIndex, 2, "selection did not change");
  Assert.equal(list.selectedRow.id, "dRow-3-1-1", "selection did not change");

  // dRow-3
  //   dRow-3-1
  //     dRow-3-1-1
  //     dRow-3-1-3
  // dRow-4
  //   dRow-4-2
  //   dRow-4-3
  //     dRow-4-3-1
  //     dRow-4-3-2
  // dRow-5
  //   dRow-5-1

  // Deleting the last row under a parent that contains the selection should
  // select the parent.
  list.selectedIndex = 2;
  Assert.equal(list.selectedRow.id, "dRow-3-1-1");

  promiseSelectEvent();
  const rowToReplace = list.querySelector("#dRow-3-1");
  rowToReplace.remove();
  Assert.deepEqual(
    await selectPromise,
    [0, "dRow-3"],
    "selection moved to the parent row"
  );

  // dRow-3
  // dRow-4
  //   dRow-4-2
  //   dRow-4-3
  //     dRow-4-3-1
  //     dRow-4-3-2
  // dRow-5
  //   dRow-5-1

  // Deleting several rows under a parent, should select the parent row.
  list.selectedIndex = 4;
  Assert.equal(list.selectedRow.id, "dRow-4-3-1");
  promiseSelectEvent();
  list.querySelector("#dRow-4 ul").remove();
  Assert.deepEqual(
    await selectPromise,
    [1, "dRow-4"],
    "selection moved to the parent row"
  );

  // Delete the last remaining rows. The selected index should be -1.

  promiseSelectEvent();
  list.replaceChildren();
  Assert.deepEqual(await selectPromise, [-1, null], "selection was cleared");

  // Add back a row. One of the row's children was selected, this should be
  // removed and the selection set to the top-level row.

  promiseSelectEvent();
  list.appendChild(rowToReplace);
  Assert.deepEqual(
    await selectPromise,
    [0, "dRow-3-1"],
    "selection set to the added row"
  );
  Assert.ok(list.querySelector("#dRow-3-1-1"), "child of the added row exists");
  Assert.ok(
    !list.querySelector("#dRow-3-1-1").classList.contains("selected"),
    "child of the added row is not selected"
  );
}

/**
 * Tests what happens to selection when a row is removed.
 */
async function subtestSelectOnRemoval2() {
  const doc = content.document;
  const list = doc.querySelector(`ul[is="tree-listbox"]`);

  let selectPromise;
  function promiseSelectEvent() {
    selectPromise = new Promise(resolve =>
      list.addEventListener("select", () => resolve(list.selectedIndex), {
        once: true,
      })
    );
  }

  // Delete row-3 containing the selection.

  list.selectedIndex = 7; // row-3-1-2

  promiseSelectEvent();
  list.querySelector("#row-3").remove();
  Assert.equal(await selectPromise, 3, "selection moved to the last row");

  // Delete row-2. Selection should move to the only row.

  promiseSelectEvent();
  list.querySelector("#row-2").remove();
  Assert.equal(
    await selectPromise,
    0, // row-1
    "selection moved to the last row"
  );
}

/**
 * Tests what happens to selection when elements above it are removed.
 */
async function subtestSelectOnRemoval3() {
  const doc = content.document;
  const list = doc.querySelector(`ul[is="tree-listbox"]`);

  // Delete a row.

  list.selectedIndex = 6; // row-3-1-1

  list.querySelector("#row-2-1").remove();
  await new Promise(r => content.setTimeout(r));
  Assert.deepEqual(
    list.rows.map(r => r.id),
    ["row-1", "row-2", "row-2-2", "row-3", "row-3-1", "row-3-1-1", "row-3-1-2"]
  );
  Assert.equal(
    list.selectedIndex,
    5, // row-3-1-1
    "selection moved to the previous top-level row"
  );

  // Delete an element that isn't a row.

  list.querySelector("#row-2 div").remove();
  await new Promise(r => content.setTimeout(r));
  Assert.deepEqual(
    list.rows.map(r => r.id),
    ["row-1", "row-2", "row-2-2", "row-3", "row-3-1", "row-3-1-1", "row-3-1-2"]
  );
  Assert.equal(
    list.selectedIndex,
    5, // row-3-1-1
    "selection moved to the previous top-level row"
  );

  // Delete an element that contains a row.

  list.querySelector("#row-2 ul").remove();
  await new Promise(r => content.setTimeout(r));
  Assert.deepEqual(
    list.rows.map(r => r.id),
    ["row-1", "row-2", "row-3", "row-3-1", "row-3-1-1", "row-3-1-2"]
  );
  Assert.equal(
    list.selectedIndex,
    4, // row-3-1-1
    "selection moved to the previous top-level row"
  );
}

/**
 * Tests that rows marked as unselectable cannot be selected.
 */
async function subtestUnselectable() {
  const doc = content.document;

  const list = doc.querySelector(`ul#unselectableTree`);
  Assert.ok(!!list, "the list exists");

  const initialRowIds = [
    "uRow-2-1",
    "uRow-2-2",
    "uRow-3-1",
    "uRow-3-1-1",
    "uRow-3-1-2",
  ];
  Assert.equal(list.rowCount, initialRowIds.length, "rowCount is correct");
  Assert.deepEqual(
    list.rows.map(r => r.id),
    initialRowIds,
    "initial rows are correct"
  );

  function checkSelected(expectedIndex, expectedId) {
    Assert.equal(list.selectedIndex, expectedIndex, "selectedIndex is correct");
    Assert.deepEqual(
      Array.from(list.querySelectorAll(".selected"), row => row.id),
      [expectedId],
      "correct rows have the 'selected' class"
    );
  }

  checkSelected(0, "uRow-2-1");

  // Clicking unselectable rows should not change the selection.
  EventUtils.synthesizeMouseAtCenter(
    doc.querySelector("#uRow-1 > div"),
    {},
    content
  );
  checkSelected(0, "uRow-2-1");
  EventUtils.synthesizeMouseAtCenter(
    doc.querySelector("#uRow-2 > div"),
    {},
    content
  );
  checkSelected(0, "uRow-2-1");
  EventUtils.synthesizeMouseAtCenter(
    doc.querySelector("#uRow-3 > div"),
    {},
    content
  );
  checkSelected(0, "uRow-2-1");

  // Unselectable rows should not be accessible by keyboard.
  EventUtils.synthesizeKey("KEY_ArrowUp", {}, content);
  checkSelected(0, "uRow-2-1");
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, content);
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, content);
  checkSelected(2, "uRow-3-1");
  EventUtils.synthesizeKey("KEY_Home", {}, content);
  checkSelected(0, "uRow-2-1");
  EventUtils.synthesizeKey("KEY_End", {}, content);
  checkSelected(4, "uRow-3-1-2");
  EventUtils.synthesizeKey("KEY_PageUp", {}, content);
  checkSelected(0, "uRow-2-1");
  EventUtils.synthesizeKey("KEY_PageDown", {}, content);
  checkSelected(4, "uRow-3-1-2");

  EventUtils.synthesizeKey("VK_LEFT", {}, content); // Move up to 3-1.
  checkSelected(2, "uRow-3-1");
  EventUtils.synthesizeKey("VK_LEFT", {}, content); // Collapse.
  checkSelected(2, "uRow-3-1");
  EventUtils.synthesizeKey("VK_LEFT", {}, content); // Try to move to 3.
  checkSelected(2, "uRow-3-1");
}
