/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use-strict";

/**
 * Tests for ensuring the undo/redo options are enabled properly when
 * manipulating tasks.
 */

var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

var { mailTestUtils } = ChromeUtils.import("resource://testing-common/mailnews/MailTestUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalTodo: "resource:///modules/CalTodo.jsm",
});

const calendar = CalendarTestUtils.createProxyCalendar("Undo Redo Test", "memory");
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
 * Test the undo/redo functionality for task creation.
 *
 * @param {string} undoId - The id of the "undo" menu item.
 * @param {string} redoId - The id of the "redo" menu item.
 */
async function taskAddUndoRedoTask(undoId, redoId) {
  let undo = document.getElementById(undoId);
  let redo = document.getElementById(redoId);
  Assert.ok(await isDisabled(undo), `#${undoId} is disabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  let newBtn = document.getElementById("task-newtask-button");
  let windowPromise = CalendarTestUtils.waitForEventDialog("edit");
  EventUtils.synthesizeMouseAtCenter(newBtn, {});

  let win = await windowPromise;
  let iframeWin = win.document.getElementById("calendar-item-panel-iframe").contentWindow;
  await CalendarTestUtils.items.setData(win, iframeWin, { title: "New Task" });
  await CalendarTestUtils.items.saveAndCloseItemDialog(win);

  let tree = window.document.querySelector("#calendar-task-tree");
  let refreshPromise = BrowserTestUtils.waitForEvent(tree, "refresh");
  tree.refresh();
  await refreshPromise;

  Assert.equal(tree.view.rowCount, 1);
  Assert.ok(!(await isDisabled(undo)), `#${undoId} is enabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  // Test undo.
  undo.doCommand();
  await TestUtils.waitForCondition(
    () => tree.view.rowCount == 0,
    `${undoId} did not remove task in time`
  );
  Assert.equal(tree.view.rowCount, 0, `#${undoId} reverses task creation`);

  // Test redo.
  redo.doCommand();
  await TestUtils.waitForCondition(
    () => tree.view.rowCount == 1,
    `${redoId} did not re-create task in time`
  );

  let task = tree.getTaskAtRow(0);
  Assert.equal(task.title, "New Task", `#${redoId} redos task creation`);
  await calendar.deleteItem(task);
  clearTransactions();
}

/**
 * Test the undo/redo functionality for task modification.
 *
 * @param {string} undoId - The id of the "undo" menu item.
 * @param {string} redoId - The id of the "redo" menu item.
 */
async function testModifyUndoRedoTask(undoId, redoId) {
  let undo = document.getElementById(undoId);
  let redo = document.getElementById(redoId);
  Assert.ok(await isDisabled(undo), `#${undoId} is disabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  let task = new CalTodo();
  task.title = "Modifiable Task";
  task.entryDate = cal.dtz.now();
  await calendar.addItem(task);

  let tree = window.document.querySelector("#calendar-task-tree");
  let refreshPromise = BrowserTestUtils.waitForEvent(tree, "refresh");
  tree.refresh();
  await refreshPromise;

  let windowPromise = CalendarTestUtils.waitForEventDialog("edit");
  mailTestUtils.treeClick(EventUtils, window, tree, 0, 1, { clickCount: 2 });

  let win = await windowPromise;
  let iframeWin = win.document.getElementById("calendar-item-panel-iframe").contentWindow;
  await CalendarTestUtils.items.setData(win, iframeWin, { title: "Modified Task" });
  await CalendarTestUtils.items.saveAndCloseItemDialog(win);

  Assert.equal(tree.getTaskAtRow(0).title, "Modified Task");
  Assert.ok(!(await isDisabled(undo)), `#${undoId} is enabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  // Test undo.
  undo.doCommand();
  refreshPromise = BrowserTestUtils.waitForEvent(tree, "refresh");
  tree.refresh();
  await refreshPromise;
  Assert.equal(
    tree.getTaskAtRow(0).title,
    "Modifiable Task",
    `#${undoId} reverses task modification`
  );

  // Test redo.
  redo.doCommand();
  refreshPromise = BrowserTestUtils.waitForEvent(tree, "refresh");
  tree.refresh();
  await refreshPromise;
  Assert.equal(tree.getTaskAtRow(0).title, "Modified Task", `#${redoId} redos task modification`);

  clearTransactions();
  await calendar.deleteItem(tree.getTaskAtRow(0));
}

/**
 * Test the undo/redo functionality for task deletion.
 *
 * @param {string} undoId - The id of the "undo" menu item.
 * @param {string} redoId - The id of the "redo" menu item.
 */
async function testDeleteUndoRedoTask(undoId, redoId) {
  let undo = document.getElementById(undoId);
  let redo = document.getElementById(redoId);
  Assert.ok(await isDisabled(undo), `#${undoId} is disabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  let task = new CalTodo();
  task.title = "Deletable Task";
  task.startDate = cal.dtz.now();
  task.entryDate = cal.dtz.now();
  await calendar.addItem(task);

  let tree = window.document.querySelector("#calendar-task-tree");
  let refreshPromise = BrowserTestUtils.waitForEvent(tree, "refresh");
  tree.refresh();
  await refreshPromise;
  Assert.equal(tree.view.rowCount, 1);

  mailTestUtils.treeClick(EventUtils, window, tree, 0, 1, { clickCount: 1 });
  EventUtils.synthesizeKey("VK_DELETE");
  await TestUtils.waitForCondition(() => tree.view.rowCount == 0, "task was not removed in time");

  Assert.ok(!(await isDisabled(undo)), `#${undoId} is enabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  // Test undo.
  undo.doCommand();
  tree.refresh();
  await TestUtils.waitForCondition(
    () => tree.view.rowCount == 1,
    "undo did not restore task in time"
  );
  Assert.equal(tree.getTaskAtRow(0).title, "Deletable Task", `#${undoId} reverses item deletion`);

  // Test redo.
  redo.doCommand();
  await TestUtils.waitForCondition(
    () => tree.view.rowCount == 0,
    `#${redoId} redo did not delete item in time`
  );
  Assert.ok(!tree.getTaskAtRow(0), `#${redoId} redos item deletion`);

  clearTransactions();
}

/**
 * Ensure the menu bar is visible and navigate to the task view.
 */
add_task(async function setUp() {
  registerCleanupFunction(() => {
    CalendarTestUtils.removeProxyCalendar(calendar);
  });

  clearTransactions();
  document.getElementById("mail-toolbar-menubar2").setAttribute("autohide", null);
  await openTasksTab();
});

/**
 * Tests the app menu's undo/redo after adding an event.
 */
add_task(async function testAppMenuAddTaskUndoRedo() {
  return taskAddUndoRedoTask("appmenu-editmenu-undo", "appmenu-editmenu-redo");
});

/**
 * Tests the menu bar's undo/redo after adding an event.
 */
add_task(async function testMenuBarAddTaskUndoRedo() {
  return taskAddUndoRedoTask("menu_undo", "menu_redo");
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

/**
 * Tests the app menu's undo/redo after modifying an event.
 */
add_task(async function testAppMenuModifyTaskUndoRedo() {
  return testModifyUndoRedoTask("appmenu-editmenu-undo", "appmenu-editmenu-redo");
});

/**
 * Tests the menu bar's undo/redo after modifying an event.
 */
add_task(async function testMenuBarModifyTaskUndoRedo() {
  return testModifyUndoRedoTask("menu_undo", "menu_redo");
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

/**
 * Tests the app menu's undo/redo after deleting an event.
 */
add_task(async function testAppMenuDeleteTaskUndoRedo() {
  return testDeleteUndoRedoTask("appmenu-editmenu-undo", "appmenu-editmenu-redo");
});

/**
 * Tests the menu bar's undo/redo after deleting an event.
 */
add_task(async function testMenuBarDeleteTaskUndoRedo() {
  return testDeleteUndoRedoTask("menu_undo", "menu_redo");
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.
