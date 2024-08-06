/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// This test frequently takes longer than the allowed time.
requestLongerTimeout(2);

const tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

// Increase this value to slow the test down if you want to see what it is doing.
const MOUSE_DELAY = 0;

let win, doc;

let resizingEvents = 0;
let resizedEvents = 0;
let collapsedEvents = 0;
let expandedEvents = 0;

// This object keeps the test simple by removing the differences between
// horizontal and vertical, and which pane is controlled by the splitter.
const testRunner = {
  outer: null, // The container for the splitter and panes.
  splitter: null, // The splitter.
  resizedIsBefore: null, // Whether resized is before the splitter.
  resized: null, // The pane the splitter controls the size of.
  fill: null, // The pane that splitter doesn't control.
  dimension: null, // Which dimension the splitter resizes.

  getSize(element) {
    return element.getBoundingClientRect()[this.dimension];
  },

  assertElementSizes(size, msg = "") {
    Assert.equal(
      this.getSize(this.resized),
      size,
      `Resized element should take up the expected ${this.dimension}: ${msg}`
    );
    Assert.equal(
      this.getSize(this.fill),
      500 - size,
      `Fill element should take up the rest of the ${this.dimension}: ${msg}`
    );
  },

  assertSplitterSize(size, msg = "") {
    Assert.equal(
      this.splitter[this.dimension],
      size,
      `Splitter ${this.dimension} should match expected ${size}: ${msg}`
    );
  },

  get minSizeProperty() {
    return this.dimension == "width" ? "minWidth" : "minHeight";
  },

  get maxSizeProperty() {
    return this.dimension == "width" ? "maxWidth" : "maxHeight";
  },

  get collapseSizeAttribute() {
    return this.dimension == "width" ? "collapse-width" : "collapse-height";
  },

  setCollapseSize(size) {
    this.splitter.setAttribute(this.collapseSizeAttribute, size);
  },

  clearCollapseSize() {
    this.splitter.removeAttribute(this.collapseSizeAttribute);
  },

  async synthMouse(position, type = "mousemove", otherPosition = 50) {
    let x, y;
    if (!this.resizedIsBefore) {
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

    await new Promise(resolve => requestAnimationFrame(resolve));
  },
};

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/base/test/widgets/files/paneSplitter.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  win = tab.browser.contentWindow;
  doc = win.document;

  win.addEventListener("splitter-resizing", () => resizingEvents++);
  win.addEventListener("splitter-resized", () => resizedEvents++);
  win.addEventListener("splitter-collapsed", () => collapsedEvents++);
  win.addEventListener("splitter-expanded", () => expandedEvents++);
});

add_task(async function testHorizontalBefore() {
  const outer = doc.getElementById("horizontal-before");
  const resized = outer.querySelector(".resized");
  const splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  const fill = outer.querySelector(".fill");

  Assert.equal(resized.clientWidth, 200);
  Assert.equal(fill.clientWidth, 300);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ew-resize");

  testRunner.outer = outer;
  testRunner.splitter = splitter;
  testRunner.resizedIsBefore = true;
  testRunner.resized = resized;
  testRunner.fill = fill;
  testRunner.dimension = "width";

  await subtestDrag();
  await subtestDragSizeBounds();
  await subtestDragAutoCollapse();
  await subtestCollapseExpand();
});

add_task(async function testHorizontalAfter() {
  const outer = doc.getElementById("horizontal-after");
  const fill = outer.querySelector(".fill");
  const splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  const resized = outer.querySelector(".resized");

  Assert.equal(fill.clientWidth, 300);
  Assert.equal(resized.clientWidth, 200);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ew-resize");

  testRunner.outer = outer;
  testRunner.splitter = splitter;
  testRunner.resizedIsBefore = false;
  testRunner.resized = resized;
  testRunner.fill = fill;
  testRunner.dimension = "width";

  await subtestDrag();
  await subtestDragSizeBounds();
  await subtestDragAutoCollapse();
  await subtestCollapseExpand();
});

add_task(async function testVerticalBefore() {
  const outer = doc.getElementById("vertical-before");
  const resized = outer.querySelector(".resized");
  const splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  const fill = outer.querySelector(".fill");

  Assert.equal(resized.clientHeight, 200);
  Assert.equal(fill.clientHeight, 300);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ns-resize");

  testRunner.outer = outer;
  testRunner.splitter = splitter;
  testRunner.resizedIsBefore = true;
  testRunner.resized = resized;
  testRunner.fill = fill;
  testRunner.dimension = "height";

  await subtestDrag();
  await subtestDragSizeBounds();
  await subtestDragAutoCollapse();
  await subtestCollapseExpand();
});

add_task(async function testVerticalAfter() {
  const outer = doc.getElementById("vertical-after");
  const fill = outer.querySelector(".fill");
  const splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  const resized = outer.querySelector(".resized");

  testRunner.outer = outer;
  testRunner.splitter = splitter;
  testRunner.resizedIsBefore = false;
  testRunner.resized = resized;
  testRunner.fill = fill;
  testRunner.dimension = "height";

  Assert.equal(fill.clientHeight, 300);
  Assert.equal(resized.clientHeight, 200);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ns-resize");

  await subtestDrag();
  await subtestDragSizeBounds();
  await subtestDragAutoCollapse();
  await subtestCollapseExpand();
});

async function subtestDrag() {
  info("subtestDrag");
  resizingEvents = 0;
  resizedEvents = 0;

  const originalPosition = testRunner.getSize(testRunner.resized);
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
    testRunner.assertElementSizes(position);
  }

  // Drag beyond the left-hand/top end.
  position = -50;
  await testRunner.synthMouse(position);
  testRunner.assertElementSizes(0);

  // Drag in steps to the right-hand/bottom end.
  for (let position = 0; position <= 500; position += 50) {
    await testRunner.synthMouse(position);
    testRunner.assertElementSizes(position);
  }

  // Drag beyond the right-hand/bottom end.
  position = 550;
  await testRunner.synthMouse(position);
  testRunner.assertElementSizes(500);

  // Drop.
  position = 400;
  Assert.equal(resizingEvents, 1, "no more resizing events fired");
  Assert.equal(resizedEvents, 0, "no resized events fired");
  await testRunner.synthMouse(position);
  await testRunner.synthMouse(position, "mouseup");
  testRunner.assertElementSizes(400);
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
  testRunner.assertElementSizes(originalPosition);
  Assert.equal(resizingEvents, 2, "no more resizing events fired");
  Assert.equal(resizedEvents, 2, "a resized event fired");
}

async function subtestDragSizeBounds() {
  info("subtestDragSizeBounds");

  const { splitter, resized, fill, minSizeProperty, maxSizeProperty } =
    testRunner;

  // Various min or max sizes to set on the resized and fill elements.
  // NOTE: the sum of the max sizes is greater than 500px.
  // Moreover, the resized element's min size is below 200px, and the max size
  // above it. Similarly, the fill element's min size is below 300px. This
  // ensures that the initial sizes of 200px and 300px are within their
  // respective min-max bounds.
  // NOTE: We do not set a max size on the fill element. The grid layout does
  // not handle this. Nor is it an expected usage of the splitter.
  for (const [minResized, min] of [
    [null, 0],
    ["100.5px", 100.5],
  ]) {
    for (const [maxResized, expectMax1] of [
      [null, 500],
      ["360px", 360],
    ]) {
      for (const [minFill, expectMax2] of [
        [null, 500],
        ["148px", 352],
      ]) {
        info(`Bounds [${minResized}, ${maxResized}] and [${minFill}, none]`);
        const max = Math.min(expectMax1, expectMax2);
        info(`Overall bound [${min}px, ${max}px]`);

        // Construct a set of positions we are interested in.
        const roundMin = Math.floor(min);
        const roundMax = Math.ceil(max);
        const positionSet = [-50, 150, 350, 550];
        // Include specific positions around the minimum and maximum points.
        positionSet.push(roundMin - 1, roundMin, roundMin + 1);
        positionSet.push(roundMax - 1, roundMax, roundMax + 1);
        positionSet.sort();

        // Reset the splitter.
        splitter.width = null;
        splitter.height = null;

        resized.style[minSizeProperty] = minResized;
        resized.style[maxSizeProperty] = maxResized;
        fill.style[minSizeProperty] = minFill;

        testRunner.assertElementSizes(200, "initial position");
        await testRunner.synthMouse(200, "mousedown");

        for (const position of positionSet) {
          await testRunner.synthMouse(position);
          const size = Math.min(Math.max(position, min), max);
          testRunner.assertElementSizes(size, `Moved forward to ${position}`);
          testRunner.assertSplitterSize(size, `Moved forward to ${position}`);
        }

        await testRunner.synthMouse(500);
        await testRunner.synthMouse(500, "mouseup");
        testRunner.assertElementSizes(max, "positioned at max");
        testRunner.assertSplitterSize(max, "positioned at max");

        // Reverse.
        await testRunner.synthMouse(max, "mousedown");

        for (const position of positionSet.reverse()) {
          await testRunner.synthMouse(position);
          const size = Math.min(Math.max(position, min), max);
          testRunner.assertElementSizes(size, `Moved backward to ${position}`);
          testRunner.assertSplitterSize(size, `Moved backward to ${position}`);
        }

        await testRunner.synthMouse(0);
        await testRunner.synthMouse(0, "mouseup");
        testRunner.assertElementSizes(min, "positioned at min");
        testRunner.assertSplitterSize(min, "positioned at min");
      }
    }
  }

  // Reset.
  splitter.width = null;
  splitter.height = null;
  resized.style[minSizeProperty] = null;
  resized.style[maxSizeProperty] = null;
  fill.style[minSizeProperty] = null;
}

async function subtestDragAutoCollapse() {
  info("subtestDragAutoCollapse");
  testRunner.setCollapseSize(78);

  collapsedEvents = 0;
  expandedEvents = 0;

  const { splitter } = testRunner;

  const originalPosition = 200;

  // Drag in steps toward the left-hand/top end.
  await testRunner.synthMouse(200, "mousedown");
  for (const position of [180, 160, 140, 120, 100, 80, 78]) {
    await testRunner.synthMouse(position);
    testRunner.assertElementSizes(
      position,
      `Should have ${position} size at ${position}`
    );
    Assert.ok(!splitter.isCollapsed, `Should not be collapsed at ${position}`);
  }

  // For the first 20 pixels inside the minimum size, nothing happens.
  for (const position of [74, 68, 64, 60, 58]) {
    await testRunner.synthMouse(position);
    testRunner.assertElementSizes(
      78,
      `Should be at collapse-size at ${position}`
    );
    Assert.ok(!splitter.isCollapsed, `Should not be collapsed at ${position}`);
  }

  // Then the pane collapses.
  await testRunner.synthMouse(57);
  Assert.equal(collapsedEvents, 1, "collapsed event fired");
  for (const position of [57, 55, 51, 40, 20, 0, -20]) {
    await testRunner.synthMouse(position);
    testRunner.assertElementSizes(0, `Should have no size at ${position}`);
    Assert.ok(splitter.isCollapsed, `Should be collapsed at ${position}`);
  }

  await testRunner.synthMouse(-20, "mouseup");
  testRunner.assertElementSizes(
    0,
    "Should be at min size after releasing mouse"
  );
  Assert.ok(splitter.isCollapsed, "Should be collapsed after releasing mouse");

  // Drag it from the collapsed state.
  await testRunner.synthMouse(0, "mousedown");
  for (const position of [0, 8, 16, 19]) {
    await testRunner.synthMouse(position);
    testRunner.assertElementSizes(
      0,
      `Should still have no size at ${position}`
    );
    Assert.ok(splitter.isCollapsed, `Should still be collapsed at ${position}`);
  }

  // Then the pane expands. For the first 20 pixels, nothing happens.
  await testRunner.synthMouse(20);
  Assert.equal(expandedEvents, 1, "expanded event fired");
  for (const position of [40, 60, 78]) {
    await testRunner.synthMouse(position);
    testRunner.assertElementSizes(
      78,
      `Should expand to collapse-size at ${position}`
    );
    Assert.ok(
      !splitter.isCollapsed,
      `Should no longer be collapsed at ${position}`
    );
  }

  for (const position of [79, 100, 120, 200, 250, 300, 400, 450]) {
    await testRunner.synthMouse(position);
    testRunner.assertElementSizes(
      position,
      `Should have ${position} size at ${position}`
    );
    Assert.ok(!splitter.isCollapsed, `Should not be collapsed at ${position}`);
  }

  await testRunner.synthMouse(450, "mouseup");
  testRunner.assertElementSizes(
    450,
    "Should be at final size after releasing mouse"
  );
  Assert.ok(
    !splitter.isCollapsed,
    "Should not be collapsed after releasing mouse"
  );

  // Test that collapse and expand can happen in the same drag.
  await testRunner.synthMouse(450, "mousedown");
  let position;
  let expectedSize;
  for ([position, expectedSize] of [
    [58, 78],
    [57, 0],
    [58, 78],
    [57, 0],
  ]) {
    await testRunner.synthMouse(position);
    testRunner.assertElementSizes(
      expectedSize,
      `Should have ${expectedSize} size at ${position}`
    );
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
    testRunner.assertElementSizes(
      expectedSize,
      `Should have ${expectedSize} size at ${position}`
    );
  }
  Assert.equal(collapsedEvents, 5, "collapsed events fired");
  Assert.equal(expandedEvents, 5, "expanded events fired");
  await testRunner.synthMouse(position, "mouseup");

  // Restore the original position.
  await testRunner.synthMouse(position, "mousedown");
  position = originalPosition;
  await testRunner.synthMouse(position);
  await testRunner.synthMouse(position, "mouseup");
  testRunner.assertElementSizes(originalPosition);

  testRunner.clearCollapseSize();
}

async function subtestCollapseExpand() {
  info("subtestCollapseExpand");
  collapsedEvents = 0;
  expandedEvents = 0;

  const { splitter } = testRunner;

  const originalSize = testRunner.getSize(testRunner.resized);

  // Collapse.
  Assert.ok(!splitter.isCollapsed, "splitter is not collapsed");
  Assert.equal(collapsedEvents, 0, "no collapsed events have fired");

  splitter.collapse();
  testRunner.assertElementSizes(0);
  Assert.ok(splitter.isCollapsed, "splitter is collapsed");
  Assert.equal(collapsedEvents, 1, "a collapsed event fired");

  splitter.collapse();
  Assert.ok(splitter.isCollapsed, "splitter is collapsed");
  Assert.equal(collapsedEvents, 1, "no more collapsed events have fired");

  // Expand.
  splitter.expand();
  testRunner.assertElementSizes(originalSize);
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

  testRunner.setCollapseSize(78);

  await testRunner.synthMouse(0, "mousedown");
  await testRunner.synthMouse(200);
  await testRunner.synthMouse(200, "mouseup");
  testRunner.assertElementSizes(200);
  Assert.ok(!splitter.isCollapsed, "splitter is not collapsed");
  Assert.equal(expandedEvents, 1, "an expanded event fired");

  testRunner.clearCollapseSize();
}
