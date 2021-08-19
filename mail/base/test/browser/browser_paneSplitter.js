/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

let win, doc;
let resizingEvents = 0;
let resizedEvents = 0;

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
});

add_task(async function testHorizontalBefore() {
  let outer = doc.getElementById("horizontal-before");
  let resized = outer.querySelector(".resized");
  let splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  let fill = outer.querySelector(".fill");

  Assert.equal(resized.clientWidth, 200);
  Assert.equal(fill.clientWidth, 300);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ew-resize");

  await subtestHorizontal(outer, resized, fill);
});

add_task(async function testHorizontalAfter() {
  let outer = doc.getElementById("horizontal-after");
  let fill = outer.querySelector(".fill");
  let splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  let resized = outer.querySelector(".resized");

  Assert.equal(fill.clientWidth, 300);
  Assert.equal(resized.clientWidth, 200);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ew-resize");

  await subtestHorizontal(outer, fill, resized);
});

add_task(async function testVerticalBefore() {
  let outer = doc.getElementById("vertical-before");
  let resized = outer.querySelector(".resized");
  let splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  let fill = outer.querySelector(".fill");

  Assert.equal(resized.clientHeight, 200);
  Assert.equal(fill.clientHeight, 300);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ns-resize");

  await subtestVertical(outer, resized, fill);
});

add_task(async function testVerticalAfter() {
  let outer = doc.getElementById("vertical-after");
  let fill = outer.querySelector(".fill");
  let splitter = outer.querySelector(`hr[is="pane-splitter"]`);
  let resized = outer.querySelector(".resized");

  Assert.equal(fill.clientHeight, 300);
  Assert.equal(resized.clientHeight, 200);
  Assert.equal(win.getComputedStyle(splitter).cursor, "ns-resize");

  await subtestVertical(outer, fill, resized);
});

async function subtestHorizontal(outer, before, after) {
  resizingEvents = 0;
  resizedEvents = 0;

  let x = before.clientWidth;
  EventUtils.synthesizeMouse(
    outer,
    x,
    50,
    { type: "mousedown", buttons: 1 },
    win
  );

  EventUtils.synthesizeMouse(
    outer,
    x,
    25,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(resizingEvents, 0, "moving up the splitter does nothing");
  EventUtils.synthesizeMouse(
    outer,
    x,
    75,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(resizingEvents, 0, "moving down the splitter does nothing");

  x--;
  EventUtils.synthesizeMouse(
    outer,
    x,
    50,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(resizingEvents, 0, "moving 1px does nothing");

  x--;
  EventUtils.synthesizeMouse(
    outer,
    x,
    50,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(resizingEvents, 0, "moving 2px does nothing");

  x--;
  EventUtils.synthesizeMouse(
    outer,
    x,
    50,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(resizingEvents, 1, "a resizing event fired");

  // Drag in steps to the left-hand end.
  for (; x >= 0; x -= 50) {
    EventUtils.synthesizeMouse(
      outer,
      x,
      50,
      { type: "mousemove", buttons: 1 },
      win
    );
    Assert.equal(before.clientWidth, x);
    Assert.equal(after.clientWidth, 500 - x);
  }

  // Drag beyond the left-hand end.
  x = -50;
  EventUtils.synthesizeMouse(
    outer,
    x,
    50,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(before.clientWidth, 0);
  Assert.equal(after.clientWidth, 500);

  // Drag in steps to the right-hand end.
  for (x = 0; x <= 500; x += 50) {
    EventUtils.synthesizeMouse(
      outer,
      x,
      50,
      { type: "mousemove", buttons: 1 },
      win
    );
    Assert.equal(before.clientWidth, x);
    Assert.equal(after.clientWidth, 500 - x);
  }

  // Drag beyond the right-hand end.
  x = 550;
  EventUtils.synthesizeMouse(
    outer,
    x,
    50,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(before.clientWidth, 500);
  Assert.equal(after.clientWidth, 0);

  // Drop.
  x = 400;
  Assert.equal(resizingEvents, 1, "no more resizing events fired");
  Assert.equal(resizedEvents, 0, "no resized events fired");
  EventUtils.synthesizeMouse(
    outer,
    x,
    50,
    { type: "mousemove", buttons: 1 },
    win
  );
  EventUtils.synthesizeMouse(
    outer,
    x,
    50,
    { type: "mouseup", buttons: 1 },
    win
  );
  Assert.equal(before.clientWidth, 400);
  Assert.equal(after.clientWidth, 100);
  Assert.equal(resizingEvents, 1, "no more resizing events fired");
  Assert.equal(resizedEvents, 1, "a resized event fired");

  // Pick up again.
  EventUtils.synthesizeMouse(
    outer,
    x,
    50,
    { type: "mousedown", buttons: 1 },
    win
  );

  // Move.
  for (; x >= 100; x -= 50) {
    EventUtils.synthesizeMouse(
      outer,
      x,
      50,
      { type: "mousemove", buttons: 1 },
      win
    );
  }

  // Drop.
  Assert.equal(resizingEvents, 2, "a resizing event fired");
  Assert.equal(resizedEvents, 1, "no more resized events fired");
  EventUtils.synthesizeMouse(
    outer,
    x,
    50,
    { type: "mouseup", buttons: 1 },
    win
  );
  Assert.equal(before.clientWidth, 100);
  Assert.equal(after.clientWidth, 400);
  Assert.equal(resizingEvents, 2, "no more resizing events fired");
  Assert.equal(resizedEvents, 2, "a resized event fired");
}

async function subtestVertical(outer, before, after) {
  resizingEvents = 0;
  resizedEvents = 0;

  let y = before.clientHeight;
  EventUtils.synthesizeMouse(
    outer,
    50,
    y,
    { type: "mousedown", buttons: 1 },
    win
  );

  EventUtils.synthesizeMouse(
    outer,
    25,
    y,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(resizingEvents, 0, "moving along the splitter does nothing");
  EventUtils.synthesizeMouse(
    outer,
    75,
    y,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(resizingEvents, 0, "moving along the splitter does nothing");

  y--;
  EventUtils.synthesizeMouse(
    outer,
    50,
    y,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(resizingEvents, 0, "moving 1px does nothing");

  y--;
  EventUtils.synthesizeMouse(
    outer,
    50,
    y,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(resizingEvents, 0, "moving 2px does nothing");

  y--;
  EventUtils.synthesizeMouse(
    outer,
    50,
    y,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(resizingEvents, 1, "a resizing event fired");

  // Drag in steps to the top.
  for (; y >= 0; y -= 50) {
    EventUtils.synthesizeMouse(
      outer,
      50,
      y,
      { type: "mousemove", buttons: 1 },
      win
    );
    Assert.equal(before.clientHeight, y);
    Assert.equal(after.clientHeight, 500 - y);
  }

  // Drag beyond the top.
  y = -50;
  EventUtils.synthesizeMouse(
    outer,
    50,
    y,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(before.clientHeight, 0);
  Assert.equal(after.clientHeight, 500);

  // Drag in steps to the bottom.
  for (y = 0; y <= 500; y += 50) {
    EventUtils.synthesizeMouse(
      outer,
      50,
      y,
      { type: "mousemove", buttons: 1 },
      win
    );
    Assert.equal(before.clientHeight, y);
    Assert.equal(after.clientHeight, 500 - y);
  }

  // Drag beyond the bottom.
  y = 550;
  EventUtils.synthesizeMouse(
    outer,
    50,
    y,
    { type: "mousemove", buttons: 1 },
    win
  );
  Assert.equal(before.clientHeight, 500);
  Assert.equal(after.clientHeight, 0);

  // Drop.
  y = 400;
  Assert.equal(resizingEvents, 1, "no more resizing events fired");
  Assert.equal(resizedEvents, 0, "no resized events fired");
  EventUtils.synthesizeMouse(
    outer,
    50,
    y,
    { type: "mousemove", buttons: 1 },
    win
  );
  EventUtils.synthesizeMouse(
    outer,
    50,
    y,
    { type: "mouseup", buttons: 1 },
    win
  );
  Assert.equal(before.clientHeight, 400);
  Assert.equal(after.clientHeight, 100);
  Assert.equal(resizingEvents, 1, "no more resizing events fired");
  Assert.equal(resizedEvents, 1, "a resized event fired");

  // Pick up again.
  EventUtils.synthesizeMouse(
    outer,
    50,
    y,
    { type: "mousedown", buttons: 1 },
    win
  );

  // Move.
  for (; y >= 100; y -= 50) {
    EventUtils.synthesizeMouse(
      outer,
      50,
      y,
      { type: "mousemove", buttons: 1 },
      win
    );
  }

  // Drop.
  Assert.equal(resizingEvents, 2, "a resizing event fired");
  Assert.equal(resizedEvents, 1, "no more resized events fired");
  EventUtils.synthesizeMouse(
    outer,
    50,
    y,
    { type: "mouseup", buttons: 1 },
    win
  );
  Assert.equal(before.clientHeight, 100);
  Assert.equal(after.clientHeight, 400);
  Assert.equal(resizingEvents, 2, "no more resizing events fired");
  Assert.equal(resizedEvents, 2, "a resized event fired");
}
