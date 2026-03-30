/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);
const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

var { saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

const calendar = CalendarTestUtils.createCalendar("Task All Day Test", "memory");

registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
});

add_task(async function testTaskAllDayRoundTrip() {
  function findTaskRow(title) {
    for (let i = 0; i < tree.view.rowCount; i++) {
      if (tree.getTaskAtRow(i).title == title) {
        return i;
      }
    }
    return -1;
  }

  calendar.setProperty("calendar-main-default", true);

  await openTasksTab();

  const tree = document.getElementById("calendar-task-tree");
  const refreshPromise = BrowserTestUtils.waitForEvent(tree, "refresh");
  tree.refresh();
  await refreshPromise;

  const entryDate = cal.createDateTime("20260110T090000Z");
  const dueDate = cal.createDateTime("20260111T170000Z");

  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewTask(window);
  await setData(dialogWindow, iframeWindow, {
    title: "Task All Day",
    calendar: calendar.name,
    startdate: entryDate,
    enddate: dueDate,
    allday: true,
  });
  await saveAndCloseItemDialog(dialogWindow);

  const afterCreateRefresh = BrowserTestUtils.waitForEvent(tree, "refresh");
  tree.refresh();
  await afterCreateRefresh;

  const taskRow = findTaskRow("Task All Day");
  Assert.notEqual(taskRow, -1, "task is displayed");
  let task = tree.getTaskAtRow(taskRow);
  Assert.ok(task.entryDate.isDate, "entry date is saved as a date");
  Assert.ok(task.dueDate.isDate, "due date is saved as a date");

  const dialogPromise = CalendarTestUtils.waitForEventDialog("edit");
  mailTestUtils.treeClick(EventUtils, window, tree, taskRow, 1, { clickCount: 2 });
  const reopenedDialog = await dialogPromise;
  const reopenedIframe = reopenedDialog.document.getElementById(
    "calendar-item-panel-iframe"
  ).contentWindow;
  const reopenedDocument = reopenedIframe.document;

  Assert.ok(reopenedDocument.getElementById("event-all-day").checked, "all-day remains checked");
  Assert.ok(
    reopenedDocument.getElementById("todo-entrydate").hasAttribute("timepickerdisabled"),
    "entry time is disabled for all-day tasks"
  );
  Assert.ok(
    reopenedDocument.getElementById("todo-duedate").hasAttribute("timepickerdisabled"),
    "due time is disabled for all-day tasks"
  );

  await saveAndCloseItemDialog(reopenedDialog);

  const afterReopenRefresh = BrowserTestUtils.waitForEvent(tree, "refresh");
  tree.refresh();
  await afterReopenRefresh;

  task = tree.getTaskAtRow(findTaskRow("Task All Day"));
  Assert.ok(task.entryDate.isDate, "entry date stays date-only after reopening");
  Assert.ok(task.dueDate.isDate, "due date stays date-only after reopening");

  await closeTasksTab();
});
