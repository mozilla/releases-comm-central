/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use-strict";

/**
 * Tests for ensuring the undo/redo options are enabled properly when
 * manipulating events.
 */
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
});

const calendar = CalendarTestUtils.createProxyCalendar("Undo Redo Test");
const calTransManager = Cc["@mozilla.org/calendar/transactionmanager;1"].getService(
  Ci.calITransactionManager
).wrappedJSObject;

/**
 * Checks the value of the "disabled" property for items in either the "Edit"
 * menu bar or the app menu. Display of the relevant menu is triggered first so
 * the UI code can update the respective items.
 *
 * @param {XULElement} element - The menu item we want to check, if its id begins
 *                               with "menu" then we assume it is in the menu
 *                               bar, if "appmenu" then the app menu.
 */
async function isDisabled(element) {
  let targetMenu;
  if (element.id.startsWith("menu")) {
    targetMenu = document.getElementById("menu_EditPopup");

    let shownPromise = BrowserTestUtils.waitForEvent(targetMenu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(document.getElementById("menu_Edit"), {});
    await shownPromise;
  } else if (element.id.startsWith("appmenu")) {
    targetMenu = document.getElementById("appMenu-popup");

    let shownPromise = BrowserTestUtils.waitForEvent(targetMenu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(document.getElementById("button-appmenu"), {});
    await shownPromise;

    let viewShownPromise = BrowserTestUtils.waitForEvent(
      document.getElementById("appMenu-editView"),
      "ViewShown"
    );
    EventUtils.synthesizeMouseAtCenter(document.getElementById("appmenu-edit-button"), {});
    await viewShownPromise;
  }

  let hiddenPromise = BrowserTestUtils.waitForEvent(targetMenu, "popuphidden");
  let status = element.disabled;
  EventUtils.synthesizeKey("VK_ESCAPE");
  await hiddenPromise;
  return status;
}

/**
 * Removes CalTransaction items from the CalTransactionManager stacks so other
 * tests are unhindered.
 */
function clearTransactions() {
  calTransManager.transactionManager.clearUndoStack();
  calTransManager.batchTransactions = [];
}

/**
 * Test the undo/redo functionality for event creation.
 *
 * @param {string} undoId - The id of the "undo" menu item.
 * @param {string} redoId - The id of the "redo" menu item.
 */
async function testAddUndoRedoEvent(undoId, redoId) {
  let undo = document.getElementById(undoId);
  let redo = document.getElementById(redoId);
  Assert.ok(await isDisabled(undo), `#${undoId} is disabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  let newBtn = document.getElementById("calendar-newevent-button");
  let windowOpened = CalendarTestUtils.waitForEventDialog("edit");
  EventUtils.synthesizeMouseAtCenter(newBtn, {});

  let win = await windowOpened;
  let iframeWin = win.document.getElementById("calendar-item-panel-iframe").contentWindow;
  await CalendarTestUtils.items.setData(win, iframeWin, { title: "A New Event" });
  await CalendarTestUtils.items.saveAndCloseItemDialog(win);

  let eventItem;
  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return eventItem;
  }, "event not created in time");

  Assert.ok(!(await isDisabled(undo)), `#${undoId} is enabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  // Test undo.
  undo.doCommand();
  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return !eventItem;
  }, "undo did not remove item in time");

  Assert.ok(!eventItem, `#${undoId} reverses item creation`);

  // Test redo.
  redo.doCommand();
  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return eventItem;
  }, `${redoId} did not re-create item in time`);
  Assert.ok(eventItem, `#${redoId} redos item creation`);

  await calendar.deleteItem(eventItem.item);
  clearTransactions();
}

/**
 * Test the undo/redo functionality for event modification.
 *
 * @param {string} undoId - The id of the "undo" menu item.
 * @param {string} redoId - The id of the "redo" menu item.
 */
async function testModifyUndoRedoEvent(undoId, redoId) {
  let undo = document.getElementById(undoId);
  let redo = document.getElementById(redoId);
  Assert.ok(await isDisabled(undo), `#${undoId} is disabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  let event = new CalEvent();
  event.title = "Modifiable Event";
  event.startDate = cal.dtz.now();
  await calendar.addItem(event);
  window.goToDate(event.startDate);

  let eventItem;
  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return eventItem;
  }, "event not created in time");

  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editItem(window, eventItem);
  await CalendarTestUtils.items.setData(dialogWindow, iframeWindow, {
    title: "Modified Event",
  });
  await CalendarTestUtils.items.saveAndCloseItemDialog(dialogWindow);

  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return eventItem && eventItem.item.title == "Modified Event";
  }, "event not modified in time");

  Assert.ok(!(await isDisabled(undo)), `#${undoId} is enabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  // Test undo.
  undo.doCommand();
  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return eventItem && eventItem.item.title == "Modifiable Event";
  }, `#${undoId} did not un-modify event in time`);

  Assert.equal(eventItem.item.title, "Modifiable Event", `#${undoId} reverses item modification`);

  // Test redo.
  redo.doCommand();
  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return eventItem && eventItem.item.title == "Modified Event";
  }, `${redoId} did not re-modify item in time`);

  Assert.equal(eventItem.item.title, "Modified Event", `#${redoId} redos item modification`);

  clearTransactions();
  await calendar.deleteItem(eventItem.item);
}

/**
 * Test the undo/redo functionality for event deletion.
 *
 * @param {string} undoId - The id of the "undo" menu item.
 * @param {string} redoId - The id of the "redo" menu item.
 */
async function testDeleteUndoRedo(undoId, redoId) {
  let undo = document.getElementById(undoId);
  let redo = document.getElementById(redoId);
  Assert.ok(await isDisabled(undo), `#${undoId} is disabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  let event = new CalEvent();
  event.title = "Deletable Event";
  event.startDate = cal.dtz.now();
  await calendar.addItem(event);
  window.goToDate(event.startDate);

  let eventItem;
  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return eventItem;
  }, "event not created in time");

  EventUtils.synthesizeMouseAtCenter(eventItem, {});
  EventUtils.synthesizeKey("VK_DELETE");

  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return !eventItem;
  }, "event not deleted in time");

  Assert.ok(!(await isDisabled(undo)), `#${undoId} is enabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  // Test undo.
  undo.doCommand();
  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return eventItem;
  }, `#${undoId} did not add event in time`);
  Assert.ok(eventItem, `#${undoId} reverses item deletion`);

  // Test redo.
  redo.doCommand();
  await TestUtils.waitForCondition(() => {
    eventItem = document.querySelector("calendar-month-day-box-item");
    return !eventItem;
  }, "redo did not delete item in time");

  Assert.ok(!eventItem, `#${redoId} redos item deletion`);
  clearTransactions();
}

/**
 * Ensure the menu bar is visible and navigate the calendar view to today.
 */
add_task(async function setUp() {
  registerCleanupFunction(() => {
    CalendarTestUtils.removeProxyCalendar(calendar);
  });

  clearTransactions();
  document.getElementById("mail-toolbar-menubar2").setAttribute("autohide", null);
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(cal.dtz.now());
});

/**
 * Tests the app menu's undo/redo after adding an event.
 */
add_task(async function testAppMenuAddEventUndoRedo() {
  return testAddUndoRedoEvent("appmenu-editmenu-undo", "appmenu-editmenu-redo");
});

/**
 * Tests the menu bar's undo/redo after adding an event.
 */
add_task(async function testMenuBarAddEventUndoRedo() {
  return testAddUndoRedoEvent("menu_undo", "menu_redo");
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

/**
 * Tests the app menu's undo/redo after modifying an event.
 */
add_task(async function testAppMenuModifyEventUndoRedo() {
  return testModifyUndoRedoEvent("appmenu-editmenu-undo", "appmenu-editmenu-redo");
});

/**
 * Tests the menu bar's undo/redo after modifying an event.
 */
add_task(async function testMenuBarModifyEventUndoRedo() {
  return testModifyUndoRedoEvent("menu_undo", "menu_redo");
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

/**
 * Tests the app menu's undo/redo after deleting an event.
 */
add_task(async function testAppMenuDeleteEventUndoRedo() {
  return testDeleteUndoRedo("appmenu-editmenu-undo", "appmenu-editmenu-redo");
});

/**
 * Tests the menu bar's undo/redo after deleting an event.
 */
add_task(async function testMenuBarDeleteEventUndoRedo() {
  return testDeleteUndoRedo("menu_undo", "menu_redo");
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.
