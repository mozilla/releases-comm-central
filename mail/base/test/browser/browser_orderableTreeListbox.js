/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint mozilla/no-arbitrary-setTimeout: off */

let dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

let WAIT_TIME = 0;

let tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  Services.prefs.clearUserPref("ui.prefersReducedMotion");
  Services.prefs.clearUserPref("mailnews.default_view_flags");
});

async function withMotion(subtest) {
  Services.prefs.setIntPref("ui.prefersReducedMotion", 0);
  WAIT_TIME = 300;
  await TestUtils.waitForCondition(
    () => !matchMedia("(prefers-reduced-motion)").matches
  );
  return subtest();
}

async function withoutMotion(subtest) {
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
  WAIT_TIME = 0;
  await TestUtils.waitForCondition(
    () => matchMedia("(prefers-reduced-motion)").matches
  );
  await subtest();
}

let win, doc, list, dataTransfer;

async function orderWithKeys(key) {
  selectHandler.reset();
  orderedHandler.reset();

  list.addEventListener("select", selectHandler);
  list.addEventListener("ordered", orderedHandler);
  EventUtils.synthesizeKey(key, { altKey: true }, win);
  await new Promise(resolve => win.setTimeout(resolve, WAIT_TIME));
  list.removeEventListener("select", selectHandler);
  list.removeEventListener("ordered", orderedHandler);

  await checkNoTransformations();
}

async function startDrag(index) {
  let listRect = list.getBoundingClientRect();
  let clientY = listRect.top + index * 32 + 4;

  dragService.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_NONE);
  [, dataTransfer] = EventUtils.synthesizeDragOver(
    list.rows[index],
    list,
    null,
    null,
    win,
    win,
    {
      clientY,
      _domDispatchOnly: true,
    }
  );

  await new Promise(resolve => setTimeout(resolve, WAIT_TIME));
}

async function continueDrag(index) {
  let listRect = list.getBoundingClientRect();
  let destClientX = listRect.left + listRect.width / 2;
  let destClientY = listRect.top + index * 32 + 4;
  let destScreenX = win.mozInnerScreenX + destClientX;
  let destScreenY = win.mozInnerScreenY + destClientY;

  let result = EventUtils.sendDragEvent(
    {
      type: "dragover",
      screenX: destScreenX,
      screenY: destScreenY,
      clientX: destClientX,
      clientY: destClientY,
      dataTransfer,
      _domDispatchOnly: true,
    },
    list,
    win
  );

  await new Promise(resolve => setTimeout(resolve, WAIT_TIME));
  return result;
}

async function endDrag(index) {
  let listRect = list.getBoundingClientRect();
  let clientY = listRect.top + index * 32 + 4;

  EventUtils.synthesizeDropAfterDragOver(false, dataTransfer, list, win, {
    clientY,
    _domDispatchOnly: true,
  });
  list.dispatchEvent(new CustomEvent("dragend", { bubbles: true }));
  dragService.endDragSession(true);

  await new Promise(resolve => setTimeout(resolve, WAIT_TIME));
}

function checkRowOrder(expectedOrder) {
  expectedOrder = expectedOrder.split(" ").map(i => `row-${i}`);
  Assert.equal(list.rowCount, expectedOrder.length, "rowCount is correct");
  Assert.deepEqual(
    list.rows.map(row => row.id),
    expectedOrder,
    "order in DOM is correct"
  );

  let apparentOrder = list.rows.sort(
    (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
  );
  Assert.deepEqual(
    apparentOrder.map(row => row.id),
    expectedOrder,
    "order on screen is correct"
  );

  if (orderedHandler.orderAtEvent) {
    Assert.deepEqual(
      orderedHandler.orderAtEvent,
      expectedOrder,
      "order at the last 'ordered' event was correct"
    );
  }
}

function checkYPositions(...expectedPositions) {
  let offset = list.getBoundingClientRect().top;

  for (let i = 0; i < 5; i++) {
    let id = `row-${i + 1}`;
    let row = doc.getElementById(id);
    Assert.equal(
      row.getBoundingClientRect().top - offset,
      expectedPositions[i],
      id
    );
  }
}

async function checkNoTransformations() {
  for (let row of list.children) {
    await TestUtils.waitForCondition(
      () => win.getComputedStyle(row).transform == "none",
      `${row.id} has no transforms`
    );
    Assert.equal(
      row
        .getAnimations()
        .filter(animation => animation.transitionProperty != "opacity").length,
      0,
      `${row.id} has no animations`
    );
  }
}

let selectHandler = {
  seenEvent: null,

  reset() {
    this.seenEvent = null;
  },
  handleEvent(event) {
    this.seenEvent = event;
  },
};

let orderedHandler = {
  seenEvent: null,
  orderAtEvent: null,

  reset() {
    this.seenEvent = null;
    this.orderAtEvent = null;
  },
  handleEvent(event) {
    if (this.seenEvent) {
      throw new Error("we already have an 'ordered' event");
    }
    this.seenEvent = event;
    this.orderAtEvent = list.rows.map(row => row.id);
  },
};

/** Test Alt+Up and Alt+Down. */
async function subtestKeyReorder() {
  list.focus();
  list.selectedIndex = 0;

  // Move row 1 down the list to the bottom.

  await orderWithKeys("KEY_ArrowDown");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("2 2-1 2-2 1 3 3-1 3-2 3-3 4 5 5-1 5-2");

  // Some additional checks to prove the right row is selected.

  Assert.ok(!selectHandler.seenEvent);
  Assert.equal(list.selectedIndex, 3, "correct index is selected");
  Assert.equal(
    list.querySelector(".selected").id,
    "row-1",
    "correct row is selected"
  );

  EventUtils.synthesizeKey("KEY_ArrowUp", {}, win);
  Assert.equal(
    list.querySelector(".selected").id,
    "row-2-2",
    "key press moved to the correct row"
  );
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, win);

  await orderWithKeys("KEY_ArrowDown");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("2 2-1 2-2 3 3-1 3-2 3-3 1 4 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowDown");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("2 2-1 2-2 3 3-1 3-2 3-3 4 1 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowDown");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("2 2-1 2-2 3 3-1 3-2 3-3 4 5 5-1 5-2 1");

  // Move row 1 back to the top.

  await orderWithKeys("KEY_ArrowUp");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("2 2-1 2-2 3 3-1 3-2 3-3 4 1 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowUp");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("2 2-1 2-2 3 3-1 3-2 3-3 1 4 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowUp");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("2 2-1 2-2 1 3 3-1 3-2 3-3 4 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowUp");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("1 2 2-1 2-2 3 3-1 3-2 3-3 4 5 5-1 5-2");

  // Move row 3 around. Row 3 has children, so we're checking they move with it.

  list.selectedIndex = 4;

  await orderWithKeys("KEY_ArrowUp");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("1 3 3-1 3-2 3-3 2 2-1 2-2 4 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowUp");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("3 3-1 3-2 3-3 1 2 2-1 2-2 4 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowDown");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("1 3 3-1 3-2 3-3 2 2-1 2-2 4 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowDown");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("1 2 2-1 2-2 3 3-1 3-2 3-3 4 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowDown");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("1 2 2-1 2-2 4 3 3-1 3-2 3-3 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowDown");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("1 2 2-1 2-2 4 5 5-1 5-2 3 3-1 3-2 3-3");

  await orderWithKeys("KEY_ArrowUp");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("1 2 2-1 2-2 4 3 3-1 3-2 3-3 5 5-1 5-2");

  await orderWithKeys("KEY_ArrowUp");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("1 2 2-1 2-2 3 3-1 3-2 3-3 4 5 5-1 5-2");
}

/** Drag the first item to the end. */
async function subtestDragReorder1() {
  orderedHandler.reset();
  list.addEventListener("ordered", orderedHandler);

  checkYPositions(1, 33, 129, 257, 289);

  await startDrag(0);
  checkYPositions(1, 33, 129, 257, 289);

  await continueDrag(2);
  checkYPositions(52, 1, 129, 257, 289);
  await continueDrag(3);
  checkYPositions(84, 1, 129, 257, 289);
  await continueDrag(4);
  checkYPositions(116, 1, 129, 257, 289);
  await continueDrag(5);
  checkYPositions(148, 1, 129, 257, 289);
  await continueDrag(6);
  checkYPositions(180, 1, 97, 257, 289);
  await continueDrag(7);
  checkYPositions(212, 1, 97, 257, 289);
  await continueDrag(8);
  checkYPositions(244, 1, 97, 225, 289);
  await continueDrag(9);
  checkYPositions(276, 1, 97, 225, 289);
  await continueDrag(10);
  checkYPositions(308, 1, 97, 225, 257);
  await continueDrag(11);
  checkYPositions(340, 1, 97, 225, 257);
  await continueDrag(12);
  checkYPositions(353, 1, 97, 225, 257);

  await endDrag(12);
  list.removeEventListener("ordered", orderedHandler);

  Assert.ok(orderedHandler.seenEvent);
  checkYPositions(353, 1, 97, 225, 257);
  checkRowOrder("2 2-1 2-2 3 3-1 3-2 3-3 4 5 5-1 5-2 1");
  await checkNoTransformations();
}

/** Drag the (now) last item back to the start. */
async function subtestDragReorder2() {
  orderedHandler.reset();
  list.addEventListener("ordered", orderedHandler);

  await startDrag(11);
  checkYPositions(340, 1, 97, 225, 257);

  await continueDrag(9);
  checkYPositions(276, 1, 97, 225, 289);

  await continueDrag(7);
  checkYPositions(212, 1, 97, 257, 289);

  await continueDrag(4);
  checkYPositions(116, 1, 129, 257, 289);

  await continueDrag(1);
  checkYPositions(20, 33, 129, 257, 289);

  await endDrag(0);
  list.removeEventListener("ordered", orderedHandler);

  Assert.ok(orderedHandler.seenEvent);
  checkYPositions(1, 33, 129, 257, 289);
  checkRowOrder("1 2 2-1 2-2 3 3-1 3-2 3-3 4 5 5-1 5-2");
  await checkNoTransformations();
}

/**
 * Listen for the 'ordering' event and prevent dropping on some rows.
 *
 * In this test, we'll prevent dragging an item below the last one - row-5 and
 * its descendants. Other use cases may be possible but haven't been needed
 * yet, so they are untested.
 */
async function subtestDragUndroppable() {
  let originalGetter = list.__lookupGetter__("_orderableChildren");
  list.__defineGetter__("_orderableChildren", function () {
    let rows = [...this.children];
    rows.pop();
    return rows;
  });

  orderedHandler.reset();
  list.addEventListener("ordered", orderedHandler);

  checkYPositions(1, 33, 129, 257, 289);

  await startDrag(0);
  checkYPositions(1, 33, 129, 257, 289);

  await continueDrag(8);
  checkYPositions(244, 1, 97, 225, 289);
  await continueDrag(9);
  checkYPositions(257, 1, 97, 225, 289);
  await continueDrag(10);
  checkYPositions(257, 1, 97, 225, 289);
  await continueDrag(11);
  checkYPositions(257, 1, 97, 225, 289);
  await continueDrag(12);
  checkYPositions(257, 1, 97, 225, 289);

  await endDrag(12);
  list.removeEventListener("ordered", orderedHandler);

  Assert.ok(orderedHandler.seenEvent);
  checkYPositions(257, 1, 97, 225, 289);
  checkRowOrder("2 2-1 2-2 3 3-1 3-2 3-3 4 1 5 5-1 5-2");
  await checkNoTransformations();

  // Move row-3 down with the keyboard.

  list.selectedIndex = 7;
  await orderWithKeys("KEY_ArrowDown");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("2 2-1 2-2 3 3-1 3-2 3-3 1 4 5 5-1 5-2");

  // It should not move further down.

  await orderWithKeys("KEY_ArrowDown");
  Assert.ok(!orderedHandler.seenEvent);
  checkRowOrder("2 2-1 2-2 3 3-1 3-2 3-3 1 4 5 5-1 5-2");

  // Reset the order.

  await orderWithKeys("KEY_ArrowUp");
  Assert.ok(orderedHandler.seenEvent);
  checkRowOrder("2 2-1 2-2 3 3-1 3-2 3-3 4 1 5 5-1 5-2");

  orderedHandler.reset();
  await startDrag(8);
  await continueDrag(1);
  await endDrag(1);
  checkRowOrder("1 2 2-1 2-2 3 3-1 3-2 3-3 4 5 5-1 5-2");

  list.__defineGetter__("_orderableChildren", originalGetter);
}

add_setup(async function () {
  // Make sure the whole test runs with an unthreaded view in all folders.
  Services.prefs.setIntPref("mailnews.default_view_flags", 0);

  let tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/orderableTreeListbox.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  win = tab.browser.contentWindow;
  doc = win.document;

  list = doc.querySelector(`ol[is="orderable-tree-listbox"]`);
  Assert.ok(!!list, "the list exists");

  checkRowOrder("1 2 2-1 2-2 3 3-1 3-2 3-3 4 5 5-1 5-2");
  Assert.equal(list.selectedIndex, 0, "selectedIndex is set to 0");
});

add_task(async function testKeyReorder() {
  await withMotion(subtestKeyReorder);
});
add_task(async function testDragReorder1() {
  await withMotion(subtestDragReorder1);
});
add_task(async function testDragReorder2() {
  await withMotion(subtestDragReorder2);
});
add_task(async function testDragUndroppable() {
  await withMotion(subtestDragUndroppable);
});

add_task(async function testKeyReorderReducedMotion() {
  await withoutMotion(subtestKeyReorder);
});
add_task(async function testDragReorder1ReducedMotion() {
  await withoutMotion(subtestDragReorder1);
});
add_task(async function testDragReorder2ReducedMotion() {
  await withoutMotion(subtestDragReorder2);
});
add_task(async function testDragUndroppableReducedMotion() {
  await withoutMotion(subtestDragUndroppable);
});
