/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

add_task(async function() {
  let tab = tabmail.openTab("contentTab", {
    url:
      "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/treeListbox.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  await SpecialPowers.spawn(tab.browser, [], testKeyboard);
  await SpecialPowers.spawn(tab.browser, [], testMutation);
  await SpecialPowers.spawn(tab.browser, [], testExpandCollapse);

  tabmail.closeTab(tab);
});

/**
 * Tests keyboard navigation up and down the list.
 */
async function testKeyboard() {
  let doc = content.document;

  let list = doc.querySelector(`ul[is="tree-listbox"]`);
  Assert.ok(!!list, "the list exists");

  let initialRowIds = [
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

  function pressKey(key, expectEvent = true) {
    info(`pressing ${key}`);

    selectHandler.reset();
    list.addEventListener("select", selectHandler);
    EventUtils.synthesizeKey(key, {}, content);
    list.removeEventListener("select", selectHandler);
    Assert.equal(
      !!selectHandler.seenEvent,
      expectEvent,
      `'select' event ${expectEvent ? "fired" : "did not fire"} as expected`
    );
  }

  function checkSelected(expectedIndex, expectedId) {
    Assert.equal(list.selectedIndex, expectedIndex, "selectedIndex is correct");
    if (selectHandler.selectedAtEvent !== null) {
      // Check the value was already set when the select event fired.
      Assert.deepEqual(
        selectHandler.selectedAtEvent,
        expectedIndex,
        "selectedIndex were correct at the last 'select' event"
      );
    }

    let selected = [...list.querySelectorAll(".selected")].map(row => row.id);
    Assert.deepEqual(
      selected,
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
async function testMutation() {
  let doc = content.document;
  let list = doc.querySelector(`ul[is="tree-listbox"]`);
  let idsWithChildren = ["row-2", "row-3", "row-3-1"];
  let idsWithoutChildren = [
    "row-1",
    "row-2-1",
    "row-2-2",
    "row-3-1-1",
    "row-3-1-2",
  ];

  // Check the initial state.

  function createNewRow() {
    let template = doc.getElementById("rowToAdd");
    return template.content.cloneNode(true).firstElementChild;
  }

  function checkHasClass(id, shouldHaveClass = true) {
    let row = doc.getElementById(id);
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

  for (let id of idsWithChildren) {
    checkHasClass(id, true);
  }
  for (let id of idsWithoutChildren) {
    checkHasClass(id, false);
  }

  // Add a new row without children to the end of the list.

  info("adding new row to end of list");
  let newRow = list.appendChild(createNewRow());
  // Wait for mutation observer. It does nothing, but let's be sure.
  await new Promise(r => content.setTimeout(r));
  checkHasClass("new-row", false);
  newRow.remove();

  // Add and remove a single row to rows with existing children.

  for (let id of idsWithChildren) {
    let row = doc.getElementById(id);

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

  for (let id of idsWithoutChildren) {
    let row = doc.getElementById(id);
    let childList = row.appendChild(doc.createElement("ul"));

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

  let template = doc.getElementById("rowsToAdd");
  newRow = template.content.cloneNode(true).firstElementChild;
  list.appendChild(newRow);
  // Wait for mutation observer.
  await new Promise(r => content.setTimeout(r));
  checkHasClass("added-row", true);
  checkHasClass("added-row-1", true);
  checkHasClass("added-row-1-1", false);
  checkHasClass("added-row-2", false);
  newRow.remove();
}

/**
 * Checks that expanding and collapsing works. Twisties in the test file are
 * styled as coloured squares: red for collapsed, green for expanded.
 */
async function testExpandCollapse() {
  let doc = content.document;
  let list = doc.querySelector(`ul[is="tree-listbox"]`);
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
    let selected = [...list.querySelectorAll(".selected")].map(row => row.id);
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
    let row = doc.getElementById(id);
    let before = row.classList.contains("collapsed");

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

  list.removeEventListener("collapsed", listener);
  list.removeEventListener("expanded", listener);
  doc.documentElement.dir = null;
}
