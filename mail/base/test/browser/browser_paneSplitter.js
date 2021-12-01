/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

// Increase this value to slow the test down if you want to see what it is doing.
let MOUSE_DELAY = 0;

let win, doc;

let resizingEvents = 0;
let resizedEvents = 0;
let collapsedEvents = 0;
let expandedEvents = 0;

// This object keeps the test simple by removing the differences between
// horizontal and vertical, and which pane is controlled by the splitter.
let testRunner = {
  outer: null, // The container for the splitter and panes.
  splitter: null, // The splitter.
  resized: null, // The pane the splitter controls the size of.
  fill: null, // The pane that splitter doesn't control.
  before: null, // The pane to the left/top of outer.
  after: null, // The pane to right/bottom of outer.
  dimension: null, // Which dimension the splitter resizes.

  get sizeProperty() {
    return this.dimension == "width" ? "clientWidth" : "clientHeight";
  },

  get minSizeAttribute() {
    return this.dimension == "width" ? "min-width" : "min-height";
  },

  get minSizeProperty() {
    return this.dimension == "width" ? "minWidth" : "minHeight";
  },

  setMinSizeOnResized(size) {
    this.splitter.setAttribute(this.minSizeAttribute, size);
  },

  clearMinSizeOnResized() {
    this.splitter.removeAttribute(this.minSizeAttribute);
  },

  setMinSizeOnFill(size) {
    this.fill.style[this.minSizeProperty] = size + "px";
  },

  clearMinSizeOnFill() {
    this.fill.style[this.minSizeProperty] = null;
  },

  async synthMouse(position, type = "mousemove", otherPosition = 50) {
    let x, y;
    if (this.before != this.resized) {
      position = 500 - position;
    }
    if (this.dimension == "width") {
      [x, y] = [position, otherPosition];
    } else {
      [x, y] = [otherPosition, position];
    }
    EventUtils.synthesizeMouse(
      this.splitter.parentNode,
      x,
      y,
      { type, buttons: 1 },
      win
    );

    if (MOUSE_DELAY) {
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(resolve => setTimeout(resolve, MOUSE_DELAY));
    }
  },
};

add_task(async function setUp() {
  let tab = tabmail.openTab("contentTab", {
    url:
      "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/paneSplitter.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  win = tab.browser.contentWindow;
  doc = win.document;

  win.addEventListener("splitter-resizing", event => resizingEvents++);
  win.addEventListener("splitter-resized", event => resizedEvents++);
  win.addEventListener("splitter-collapsed", event => collapsedEvents++);
  win.addEventListener("splitter-expanded", event => expandedEvents++);
});

add_task(async function testHorizontalBefore() {
  let outer = doc.getElementById("horizontal-before");
  let resized = outer.querySelector(".resized");
  let splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  let fill = outer.querySelector(".fill");

  Assert.equal(resized.clientWidth, 200);
  Assert.equal(fill.clientWidth, 300);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ew-resize");

  testRunner.outer = outer;
  testRunner.splitter = splitter;
  testRunner.resized = testRunner.before = resized;
  testRunner.fill = testRunner.after = fill;
  testRunner.dimension = "width";

  await subtestDrag();
  await subtestDragMinSize();
  await subtestCollapseExpand();
});

add_task(async function testHorizontalAfter() {
  let outer = doc.getElementById("horizontal-after");
  let fill = outer.querySelector(".fill");
  let splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  let resized = outer.querySelector(".resized");

  Assert.equal(fill.clientWidth, 300);
  Assert.equal(resized.clientWidth, 200);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ew-resize");

  testRunner.outer = outer;
  testRunner.splitter = splitter;
  testRunner.resized = testRunner.after = resized;
  testRunner.fill = testRunner.before = fill;
  testRunner.dimension = "width";

  await subtestDrag();
  await subtestDragMinSize();
  await subtestCollapseExpand();
});

add_task(async function testVerticalBefore() {
  let outer = doc.getElementById("vertical-before");
  let resized = outer.querySelector(".resized");
  let splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  let fill = outer.querySelector(".fill");

  Assert.equal(resized.clientHeight, 200);
  Assert.equal(fill.clientHeight, 300);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ns-resize");

  testRunner.outer = outer;
  testRunner.splitter = splitter;
  testRunner.resized = testRunner.before = resized;
  testRunner.fill = testRunner.after = fill;
  testRunner.dimension = "height";

  await subtestDrag();
  await subtestDragMinSize();
  await subtestCollapseExpand();
});

add_task(async function testVerticalAfter() {
  let outer = doc.getElementById("vertical-after");
  let fill = outer.querySelector(".fill");
  let splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  let resized = outer.querySelector(".resized");

  testRunner.outer = outer;
  testRunner.splitter = splitter;
  testRunner.resized = testRunner.after = resized;
  testRunner.fill = testRunner.before = fill;
  testRunner.dimension = "height";

  Assert.equal(fill.clientHeight, 300);
  Assert.equal(resized.clientHeight, 200);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ns-resize");

  await subtestDrag();
  await subtestDragMinSize();
  await subtestCollapseExpand();
});

async function subtestDrag() {
  info("subtestDrag");
  resizingEvents = 0;
  resizedEvents = 0;

  let { resized, fill, sizeProperty } = testRunner;

  let originalPosition = resized[sizeProperty];
  let position = 200;

  await testRunner.synthMouse(position, "mousedown");

  await testRunner.synthMouse(position, "mousemove", 25);
  Assert.equal(resizingEvents, 0, "moving up the splitter does nothing");
  await testRunner.synthMouse(position, "mousemove", 75);
  Assert.equal(resizingEvents, 0, "moving down the splitter does nothing");

  position--;
  await testRunner.synthMouse(position);
  Assert.equal(resizingEvents, 0, "moving 1px does nothing");

  position--;
  await testRunner.synthMouse(position);
  Assert.equal(resizingEvents, 0, "moving 2px does nothing");

  position--;
  await testRunner.synthMouse(position);
  Assert.equal(resizingEvents, 1, "a resizing event fired");

  // Drag in steps to the left-hand/top end.
  for (; position >= 0; position -= 50) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], position);
    Assert.equal(fill[sizeProperty], 500 - position);
  }

  // Drag beyond the left-hand/top end.
  position = -50;
  await testRunner.synthMouse(position);
  Assert.equal(resized[sizeProperty], 0);
  Assert.equal(fill[sizeProperty], 500);

  // Drag in steps to the right-hand/bottom end.
  for (let position = 0; position <= 500; position += 50) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], position);
    Assert.equal(fill[sizeProperty], 500 - position);
  }

  // Drag beyond the right-hand/bottom end.
  position = 550;
  await testRunner.synthMouse(position);
  Assert.equal(resized[sizeProperty], 500);
  Assert.equal(fill[sizeProperty], 0);

  // Drop.
  position = 400;
  Assert.equal(resizingEvents, 1, "no more resizing events fired");
  Assert.equal(resizedEvents, 0, "no resized events fired");
  await testRunner.synthMouse(position);
  await testRunner.synthMouse(position, "mouseup");
  Assert.equal(resized[sizeProperty], 400);
  Assert.equal(fill[sizeProperty], 100);
  Assert.equal(resizingEvents, 1, "no more resizing events fired");
  Assert.equal(resizedEvents, 1, "a resized event fired");

  // Pick up again.
  await testRunner.synthMouse(position, "mousedown");

  // Move.
  for (; position >= originalPosition; position -= 50) {
    await testRunner.synthMouse(position);
  }

  // Drop.
  Assert.equal(resizingEvents, 2, "a resizing event fired");
  Assert.equal(resizedEvents, 1, "no more resized events fired");
  await testRunner.synthMouse(position, "mouseup");
  Assert.equal(resized[sizeProperty], originalPosition);
  Assert.equal(fill[sizeProperty], 500 - originalPosition);
  Assert.equal(resizingEvents, 2, "no more resizing events fired");
  Assert.equal(resizedEvents, 2, "a resized event fired");
}

async function subtestDragMinSize() {
  info("subtestDragMinSize");
  testRunner.setMinSizeOnResized(78);
  testRunner.setMinSizeOnFill(123);

  collapsedEvents = 0;
  expandedEvents = 0;

  let { splitter, resized, fill, sizeProperty } = testRunner;

  let originalPosition = 200;
  let position = 200;

  // Drag in steps toward the left-hand/top end.
  await testRunner.synthMouse(position, "mousedown");
  for (let position of [180, 160, 140, 120, 100, 80, 78]) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], position);
    Assert.equal(fill[sizeProperty], 500 - position);
    Assert.ok(!splitter.isCollapsed);
  }

  // For the first 20 pixels inside the minimum size, nothing happens.
  for (let position of [74, 68, 64, 60, 58]) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], 78);
    Assert.equal(fill[sizeProperty], 422);
    Assert.ok(!splitter.isCollapsed);
  }

  // Then the pane collapses.
  await testRunner.synthMouse(57);
  Assert.equal(collapsedEvents, 1, "collapsed event fired");
  for (let position of [57, 55, 51, 40, 20, 0, -20]) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], 0);
    Assert.equal(fill[sizeProperty], 500);
    Assert.ok(splitter.isCollapsed);
  }

  await testRunner.synthMouse(position, "mouseup");
  Assert.equal(resized[sizeProperty], 0);
  Assert.equal(fill[sizeProperty], 500);
  Assert.ok(splitter.isCollapsed);

  // Drag it from the collapsed state.
  await testRunner.synthMouse(0, "mousedown");
  for (let position of [0, 8, 16, 19]) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], 0);
    Assert.equal(fill[sizeProperty], 500);
    Assert.ok(splitter.isCollapsed);
  }

  // Then the pane expands. For the first 20 pixels, nothing happens.
  await testRunner.synthMouse(20);
  Assert.equal(expandedEvents, 1, "expanded event fired");
  for (let position of [40, 60, 78]) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], 78);
    Assert.equal(fill[sizeProperty], 422);
    Assert.ok(!splitter.isCollapsed);
  }

  for (let position of [79, 100, 120]) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], position);
    Assert.equal(fill[sizeProperty], 500 - position);
    Assert.ok(!splitter.isCollapsed);
  }

  // Drag in steps to the right-hand/bottom end.
  for (; position <= 377; position += 50) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], position);
    Assert.equal(fill[sizeProperty], 500 - position);
  }

  for (; position <= 550; position += 50) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], 377);
    Assert.equal(fill[sizeProperty], 123);
  }

  await testRunner.synthMouse(position, "mouseup");
  Assert.equal(resized[sizeProperty], 377);
  Assert.equal(fill[sizeProperty], 123);

  // Test that collapse and expand can happen in the same drag.
  await testRunner.synthMouse(377, "mousedown");
  let expectedSize;
  for ([position, expectedSize] of [
    [58, 78],
    [57, 0],
    [58, 78],
    [57, 0],
  ]) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], expectedSize);
    Assert.equal(fill[sizeProperty], 500 - expectedSize);
  }
  Assert.equal(collapsedEvents, 3, "collapsed events fired");
  Assert.equal(expandedEvents, 2, "expanded events fired");
  await testRunner.synthMouse(position, "mouseup");

  // Test that expansion from collapsed reverts to normal behaviour after
  // dragging out to the minimum size.
  await testRunner.synthMouse(0, "mousedown");
  for ([position, expectedSize] of [
    [0, 0],
    [10, 0],
    [20, 78],
    [40, 78],
    [60, 78],
    [40, 0],
    [60, 78],
    [40, 0],
    [80, 80],
    [100, 100],
  ]) {
    await testRunner.synthMouse(position);
    Assert.equal(resized[sizeProperty], expectedSize);
    Assert.equal(fill[sizeProperty], 500 - expectedSize);
  }
  Assert.equal(collapsedEvents, 5, "collapsed events fired");
  Assert.equal(expandedEvents, 5, "expanded events fired");
  await testRunner.synthMouse(position, "mouseup");

  // Restore the original position.
  await testRunner.synthMouse(position, "mousedown");
  position = originalPosition;
  await testRunner.synthMouse(position);
  await testRunner.synthMouse(position, "mouseup");
  Assert.equal(resized[sizeProperty], originalPosition);
  Assert.equal(fill[sizeProperty], 500 - originalPosition);

  testRunner.clearMinSizeOnResized();
  testRunner.clearMinSizeOnFill();
}

async function subtestCollapseExpand() {
  info("subtestCollapseExpand");
  collapsedEvents = 0;
  expandedEvents = 0;

  let { splitter, resized, fill, before, after, sizeProperty } = testRunner;

  let beforeSize = before[sizeProperty];
  let afterSize = after[sizeProperty];

  // Collapse.
  Assert.ok(!splitter.isCollapsed, "splitter is not collapsed");
  Assert.equal(collapsedEvents, 0, "no collapsed events have fired");

  splitter.collapse();
  Assert.equal(splitter._adjacent[sizeProperty], 0);
  Assert.equal(splitter._opposite[sizeProperty], 500);
  Assert.ok(splitter.isCollapsed, "splitter is collapsed");
  Assert.equal(collapsedEvents, 1, "a collapsed event fired");

  splitter.collapse();
  Assert.ok(splitter.isCollapsed, "splitter is collapsed");
  Assert.equal(collapsedEvents, 1, "no more collapsed events have fired");

  // Expand.
  splitter.expand();
  Assert.equal(before[sizeProperty], beforeSize);
  Assert.equal(after[sizeProperty], afterSize);
  Assert.ok(!splitter.isCollapsed, "splitter is not collapsed");
  Assert.equal(expandedEvents, 1, "an expanded event fired");

  splitter.expand();
  Assert.ok(!splitter.isCollapsed, "splitter is not collapsed");
  Assert.equal(expandedEvents, 1, "no more expanded events have fired");

  collapsedEvents = 0;
  expandedEvents = 0;

  // Collapse again. Then drag to expand.
  splitter.collapse();
  Assert.equal(collapsedEvents, 1, "a collapsed event fired");

  testRunner.setMinSizeOnResized(78);

  await testRunner.synthMouse(0, "mousedown");
  await testRunner.synthMouse(200);
  await testRunner.synthMouse(200, "mouseup");
  Assert.equal(resized[sizeProperty], 200);
  Assert.equal(fill[sizeProperty], 300);
  Assert.ok(!splitter.isCollapsed, "splitter is not collapsed");
  Assert.equal(expandedEvents, 1, "an expanded event fired");

  testRunner.clearMinSizeOnResized();
}
