/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let calendar = cal.async.promisifyCalendar(cal.getCalendarManager().getCalendars()[0]);
let tree = document.getElementById("calendar-task-tree");

add_task(async () => {
  async function createTask(title, attributes = {}) {
    let task = cal.createTodo();
    task.title = title;
    for (let [key, value] of Object.entries(attributes)) {
      task[key] = value;
    }
    return calendar.addItem(task);
  }

  function treeRefresh() {
    return BrowserTestUtils.waitForEvent(tree, "refresh");
  }

  async function setFilterGroup(name) {
    info(`Setting filter to ${name}`);
    EventUtils.synthesizeMouseAtCenter(document.getElementById(`opt_${name}_filter`), {});
    await treeRefresh();
  }

  async function setFilterText(text) {
    EventUtils.synthesizeMouseAtCenter(document.getElementById("task-text-filter-field"), {});
    EventUtils.sendString(text);
    await treeRefresh();
  }

  async function clearFilterText() {
    EventUtils.synthesizeMouseAtCenter(document.getElementById("task-text-filter-field"), {});
    EventUtils.synthesizeKey("VK_ESCAPE");
    is(document.getElementById("task-text-filter-field").value, "", "Filter text cleared");
    await treeRefresh();
  }

  function checkVisibleTasks(...expectedTasks) {
    let actualTasks = [];
    for (let i = 0; i < tree.view.rowCount; i++) {
      actualTasks.push(tree.getTaskAtRow(i));
    }
    info("Expected: " + expectedTasks.map(task => task.title).join(", "));
    info("Actual: " + actualTasks.map(task => task.title).join(", "));

    is(tree.view.rowCount, expectedTasks.length, "Correct number of tasks");

    // Although the order of expectedTasks matches the observed behaviour when
    // this test was written, order is NOT checked here. The order of the list
    // is not well defined (particularly when changing the filter text).
    ok(expectedTasks.every(task => actualTasks.includes(task)), "All expected tasks found");
  }

  let today = cal.dtz.now();
  let yesterday = today.clone();
  yesterday.addDuration(cal.createDuration("-P1D"));
  let tomorrow = today.clone();
  tomorrow.addDuration(cal.createDuration("P1D"));
  let later = today.clone();
  later.addDuration(cal.createDuration("P2W"));

  let tasks = {
    incomplete: await createTask("Incomplete"),
    started30: await createTask("30% started", { percentComplete: 30 }),
    started60: await createTask("60% started", { percentComplete: 60 }),
    complete: await createTask("Complete", { isCompleted: true }),
    overdue: await createTask("Overdue", { dueDate: yesterday }),
    startsToday: await createTask("Starts today", { entryDate: today }),
    startsTomorrow: await createTask("Starts tomorrow", { entryDate: tomorrow }),
    startsLater: await createTask("Starts later", { entryDate: later }),
  };

  await openTasksTab();

  await setFilterGroup("all");
  checkVisibleTasks(
    tasks.incomplete,
    tasks.started30,
    tasks.started60,
    tasks.complete,
    tasks.overdue,
    tasks.startsToday,
    tasks.startsTomorrow,
    tasks.startsLater
  );

  await setFilterGroup("open");
  checkVisibleTasks(
    tasks.incomplete,
    tasks.started30,
    tasks.started60,
    tasks.overdue,
    tasks.startsToday,
    tasks.startsTomorrow,
    tasks.startsLater
  );

  await setFilterGroup("completed");
  checkVisibleTasks(tasks.complete);

  await setFilterGroup("overdue");
  checkVisibleTasks(tasks.overdue);

  await setFilterGroup("notstarted");
  checkVisibleTasks(tasks.overdue, tasks.incomplete, tasks.startsToday);

  await setFilterGroup("next7days");
  checkVisibleTasks(
    tasks.overdue,
    tasks.incomplete,
    tasks.startsToday,
    tasks.started30,
    tasks.started60,
    tasks.complete,
    tasks.startsTomorrow
  );

  await setFilterGroup("today");
  checkVisibleTasks(
    tasks.overdue,
    tasks.incomplete,
    tasks.startsToday,
    tasks.started30,
    tasks.started60,
    tasks.complete
  );

  await setFilterGroup("throughcurrent");
  checkVisibleTasks(
    tasks.overdue,
    tasks.incomplete,
    tasks.startsToday,
    tasks.started30,
    tasks.started60,
    tasks.complete
  );

  await setFilterText("No matches");
  checkVisibleTasks();

  await clearFilterText();
  checkVisibleTasks(
    tasks.incomplete,
    tasks.started30,
    tasks.started60,
    tasks.complete,
    tasks.overdue,
    tasks.startsToday
  );

  await setFilterText("StArTeD");
  checkVisibleTasks(tasks.started30, tasks.started60);

  await setFilterGroup("today");
  is(document.getElementById("task-text-filter-field").value, "StArTeD");
  checkVisibleTasks(tasks.started30, tasks.started60);

  await setFilterGroup("next7days");
  is(document.getElementById("task-text-filter-field").value, "StArTeD");
  checkVisibleTasks(tasks.started30, tasks.started60);

  await setFilterGroup("notstarted");
  is(document.getElementById("task-text-filter-field").value, "StArTeD");
  checkVisibleTasks();

  await setFilterGroup("overdue");
  is(document.getElementById("task-text-filter-field").value, "StArTeD");
  checkVisibleTasks();

  await setFilterGroup("completed");
  is(document.getElementById("task-text-filter-field").value, "StArTeD");
  checkVisibleTasks();

  await setFilterGroup("open");
  is(document.getElementById("task-text-filter-field").value, "StArTeD");
  checkVisibleTasks(tasks.started30, tasks.started60);

  await setFilterGroup("all");
  is(document.getElementById("task-text-filter-field").value, "StArTeD");
  checkVisibleTasks(tasks.started30, tasks.started60);

  await clearFilterText();
  checkVisibleTasks(
    tasks.started30,
    tasks.started60,
    tasks.incomplete,
    tasks.complete,
    tasks.overdue,
    tasks.startsToday,
    tasks.startsTomorrow,
    tasks.startsLater
  );

  for (let task of Object.values(tasks)) {
    await calendar.deleteItem(task);
  }
});
