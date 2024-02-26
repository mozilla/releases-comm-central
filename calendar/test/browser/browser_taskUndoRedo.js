/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests for ensuring the undo/redo options are enabled properly when
 * manipulating tasks.
 */

var { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(this, {
  CalTransactionManager: "resource:///modules/CalTransactionManager.jsm",
});

const calendar = CalendarTestUtils.createCalendar("Undo Redo Test", "memory");
const calTransManager = CalTransactionManager.getInstance();

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
  const targetMenu = document.getElementById("menu_EditPopup");

  const shownPromise = BrowserTestUtils.waitForEvent(targetMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(document.getElementById("menu_Edit"), {});
  await shownPromise;

  const hiddenPromise = BrowserTestUtils.waitForEvent(targetMenu, "popuphidden");
  const status = element.disabled;
  EventUtils.synthesizeKey("VK_ESCAPE");
  await hiddenPromise;
  return status;
}

/**
 * Removes CalTransaction items from the CalTransactionManager stacks so other
 * tests are unhindered.
 */
function clearTransactions() {
  calTransManager.undoStack = [];
  calTransManager.redoStack = [];
}

/**
 * Test the undo/redo functionality for task creation.
 *
 * @param {string} undoId - The id of the "undo" menu item.
 * @param {string} redoId - The id of the "redo" menu item.
 */
async function taskAddUndoRedoTask(undoId, redoId) {
  const undo = document.getElementById(undoId);
  const redo = document.getElementById(redoId);
  Assert.ok(await isDisabled(undo), `#${undoId} is disabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  const newBtn = document.getElementById("sidePanelNewTask");
  const windowPromise = CalendarTestUtils.waitForEventDialog("edit");
  EventUtils.synthesizeMouseAtCenter(newBtn, {});

  const win = await windowPromise;
  const iframeWin = win.document.getElementById("calendar-item-panel-iframe").contentWindow;
  await CalendarTestUtils.items.setData(win, iframeWin, { title: "New Task" });
  await CalendarTestUtils.items.saveAndCloseItemDialog(win);

  const tree = document.querySelector("#calendar-task-tree");
  const refreshPromise = BrowserTestUtils.waitForEvent(tree, "refresh");
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

  const task = tree.getTaskAtRow(0);
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
  const undo = document.getElementById(undoId);
  const redo = document.getElementById(redoId);
  Assert.ok(await isDisabled(undo), `#${undoId} is disabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  const task = new CalTodo();
  task.title = "Modifiable Task";
  task.entryDate = cal.dtz.now();
  await calendar.addItem(task);

  const tree = document.querySelector("#calendar-task-tree");
  let refreshPromise = BrowserTestUtils.waitForEvent(tree, "refresh");
  tree.refresh();
  await refreshPromise;

  const windowPromise = CalendarTestUtils.waitForEventDialog("edit");
  mailTestUtils.treeClick(EventUtils, window, tree, 0, 1, { clickCount: 2 });

  const win = await windowPromise;
  const iframeWin = win.document.getElementById("calendar-item-panel-iframe").contentWindow;
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
  const undo = document.getElementById(undoId);
  const redo = document.getElementById(redoId);
  Assert.ok(await isDisabled(undo), `#${undoId} is disabled`);
  Assert.ok(await isDisabled(redo), `#${redoId} is disabled`);

  const task = new CalTodo();
  task.title = "Deletable Task";
  task.startDate = cal.dtz.now();
  task.entryDate = cal.dtz.now();
  await calendar.addItem(task);

  const tree = document.querySelector("#calendar-task-tree");
  const refreshPromise = BrowserTestUtils.waitForEvent(tree, "refresh");
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
add_setup(async function () {
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  clearTransactions();
  document.getElementById("toolbar-menubar").setAttribute("autohide", null);
  await openTasksTab();
});

/**
 * Tests the menu bar's undo/redo after adding an event.
 */
add_task(async function testMenuBarAddTaskUndoRedo() {
  return taskAddUndoRedoTask("menu_undo", "menu_redo");
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

/**
 * Tests the menu bar's undo/redo after modifying an event.
 */
add_task(async function testMenuBarModifyTaskUndoRedo() {
  return testModifyUndoRedoTask("menu_undo", "menu_redo");
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

/**
 * Tests the menu bar's undo/redo after deleting an event.
 */
add_task(async function testMenuBarDeleteTaskUndoRedo() {
  return testDeleteUndoRedoTask("menu_undo", "menu_redo");
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.
