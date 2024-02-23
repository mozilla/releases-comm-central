/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for deleting tasks in the task view.
 */
const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.sys.mjs",
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

const calendar = CalendarTestUtils.createCalendar("Task Delete Test", "memory");
registerCleanupFunction(() => CalendarTestUtils.removeCalendar(calendar));

/**
 * Test ensures its possible to delete a task in the task view. Creates two task
 * and deletes one.
 */
add_task(async function testTaskDeletion() {
  const task1 = new CalTodo();
  task1.id = "1";
  task1.title = "Task 1";
  task1.entryDate = cal.createDateTime("20210126T000001Z");

  const task2 = new CalTodo();
  task2.id = "2";
  task2.title = "Task 2";
  task2.entryDate = cal.createDateTime("20210127T000001Z");

  await calendar.addItem(task1);
  await calendar.addItem(task2);
  await openTasksTab();

  let tree = document.querySelector("#calendar-task-tree");
  const radio = document.querySelector("#opt_next7days_filter");
  const waitForRefresh = BrowserTestUtils.waitForEvent(tree, "refresh");
  EventUtils.synthesizeMouseAtCenter(radio, {});
  tree.refresh();

  await waitForRefresh;
  Assert.equal(tree.view.rowCount, 2, "2 tasks are displayed");

  mailTestUtils.treeClick(EventUtils, window, tree, 0, 1, { clickCount: 1 });
  EventUtils.synthesizeKey("VK_DELETE");

  // Try and trigger a reflow
  tree.getBoundingClientRect();
  tree.invalidate();
  await new Promise(r => setTimeout(r));

  await TestUtils.waitForCondition(() => {
    tree = document.querySelector("#calendar-task-tree");
    return tree.view.rowCount == 1;
  }, `task view displays ${tree.view.rowCount} tasks instead of 1`);

  let result = await calendar.getItem(task1.id);
  Assert.ok(!result, "first task was deleted successfully");

  result = await calendar.getItem(task2.id);
  Assert.ok(result, "second task was not deleted");
  await calendar.deleteItem(task2);
  await closeTasksTab();
});

/**
 * Test ensures it is possible to delete a recurring task from the task view.
 * See bug 1688708.
 */
add_task(async function testRecurringTaskDeletion() {
  let repeatTask = new CalTodo();
  repeatTask.id = "1";
  repeatTask.title = "Repeating Task";
  repeatTask.entryDate = cal.createDateTime("20210125T000001Z");
  repeatTask.recurrenceInfo = new CalRecurrenceInfo(repeatTask);
  repeatTask.recurrenceInfo.appendRecurrenceItem(
    cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=3")
  );

  let nonRepeatTask = new CalTodo();
  nonRepeatTask.id = "2";
  nonRepeatTask.title = "Non-Repeating Task";
  nonRepeatTask.entryDate = cal.createDateTime("20210126T000001Z");

  repeatTask = await calendar.addItem(repeatTask);
  nonRepeatTask = await calendar.addItem(nonRepeatTask);

  await openTasksTab();

  let tree = document.querySelector("#calendar-task-tree");
  const radio = document.querySelector("#opt_next7days_filter");
  const waitForRefresh = BrowserTestUtils.waitForEvent(tree, "refresh");
  EventUtils.synthesizeMouseAtCenter(radio, {});
  tree.refresh();

  await waitForRefresh;
  Assert.equal(tree.view.rowCount, 4, "4 tasks are displayed");

  // Delete a single occurrence.
  const handleSingleDelete = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-occurrence-prompt.xhtml",
    {
      async callback(win) {
        const dialog = win.document.querySelector("dialog");
        const button = dialog.querySelector("#accept-occurrence-button");
        EventUtils.synthesizeMouseAtCenter(button, {}, win);
      },
    }
  );
  mailTestUtils.treeClick(EventUtils, window, tree, 1, 1, { clickCount: 1 });
  EventUtils.synthesizeKey("VK_DELETE");
  await handleSingleDelete;

  // Try and trigger a reflow
  tree.getBoundingClientRect();
  tree.invalidate();
  await new Promise(r => setTimeout(r));

  await TestUtils.waitForCondition(() => {
    tree = document.querySelector("#calendar-task-tree");
    return tree.view.rowCount == 3;
  }, `task view displays ${tree.view.rowCount} tasks instead of 3`);

  repeatTask = await calendar.getItem(repeatTask.id);

  Assert.equal(
    repeatTask.recurrenceInfo.getOccurrences(
      cal.createDateTime("20210126T000001Z"),
      cal.createDateTime("20210126T000001Z"),
      10
    ).length,
    0,
    "a single occurrence was deleted successfully"
  );

  Assert.equal(
    repeatTask.recurrenceInfo.getOccurrences(
      repeatTask.entryDate,
      cal.createDateTime("20210131T000001Z"),
      10
    ).length,
    2,
    "other occurrences were not removed"
  );

  // Delete all occurrences
  const handleAllDelete = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-occurrence-prompt.xhtml",
    {
      async callback(win) {
        const dialog = win.document.querySelector("dialog");
        const button = dialog.querySelector("#accept-parent-button");
        EventUtils.synthesizeMouseAtCenter(button, {}, win);
      },
    }
  );

  mailTestUtils.treeClick(EventUtils, window, tree, 1, 1, { clickCount: 1 });
  EventUtils.synthesizeKey("VK_DELETE");
  await handleAllDelete;

  // Try and trigger a reflow
  tree.getBoundingClientRect();
  tree.invalidate();
  await new Promise(r => setTimeout(r));

  await TestUtils.waitForCondition(() => {
    tree = document.querySelector("#calendar-task-tree");
    return tree.view.rowCount == 1;
  }, `task view displays ${tree.view.rowCount} tasks instead of 1`);

  repeatTask = await calendar.getItem(repeatTask.id);
  Assert.ok(!repeatTask, "all occurrences were removed");

  const result = await calendar.getItem(nonRepeatTask.id);
  Assert.ok(result, "non-recurring task was not deleted");
  await closeTasksTab();
});
