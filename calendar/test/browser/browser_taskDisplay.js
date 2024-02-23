/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(this, {
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.sys.mjs",
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

var calendar = CalendarTestUtils.createCalendar();
registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
});

const tree = document.getElementById("calendar-task-tree");

add_task(async () => {
  async function createTask(title, attributes = {}) {
    const task = new CalTodo();
    task.title = title;
    for (const [key, value] of Object.entries(attributes)) {
      task[key] = value;
    }
    return calendar.addItem(task);
  }

  function treeRefresh() {
    return BrowserTestUtils.waitForEvent(tree, "refresh");
  }

  async function setFilterGroup(name) {
    info(`Setting filter to ${name}`);
    const radio = document.getElementById(`opt_${name}_filter`);
    EventUtils.synthesizeMouseAtCenter(radio, {});
    await treeRefresh();
    Assert.equal(
      document.getElementById("calendar-task-tree").getAttribute("filterValue"),
      radio.value,
      "Filter group changed"
    );
  }

  async function setFilterText(text) {
    EventUtils.synthesizeMouseAtCenter(document.getElementById("task-text-filter-field"), {});
    EventUtils.sendString(text);
    Assert.equal(document.getElementById("task-text-filter-field").value, text, "Filter text set");
    await treeRefresh();
  }

  async function clearFilterText() {
    EventUtils.synthesizeMouseAtCenter(document.getElementById("task-text-filter-field"), {});
    EventUtils.synthesizeKey("VK_ESCAPE");
    Assert.equal(
      document.getElementById("task-text-filter-field").value,
      "",
      "Filter text cleared"
    );
    await treeRefresh();
  }

  async function checkVisibleTasks(...expectedTasks) {
    function toPrettyString(task) {
      if (task.recurrenceId) {
        return `${task.title}#${task.recurrenceId}`;
      }
      return task.title;
    }
    tree.getBoundingClientRect(); // Try and trigger a reflow...
    tree.invalidate();

    // It seems that under certain conditions notifyOperationComplete() is
    // called in CalStorageCalender.getItems before all the results have been
    // retrieved. This results in the "refresh" event being fired prematurely in
    // calendar-task-tree. After some investigation, the cause of this seems to
    // be related to multiple calls of executeAsync() in CalStorageItemModel.
    // getAdditionalDataForItemMap() not finishing before notifyOperationComplete()
    // is called despite being awaited on.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(r => setTimeout(r, 500));

    const actualTasks = [];
    for (let i = 0; i < tree.view.rowCount; i++) {
      actualTasks.push(tree.getTaskAtRow(i));
    }
    info("Expected: " + expectedTasks.map(toPrettyString).join(", "));
    info("Actual: " + actualTasks.map(toPrettyString).join(", "));

    Assert.equal(tree.view.rowCount, expectedTasks.length, "Correct number of tasks");
    await new Promise(r => setTimeout(r));

    // Although the order of expectedTasks matches the observed behaviour when
    // this test was written, order is NOT checked here. The order of the list
    // is not well defined (particularly when changing the filter text).
    for (const aTask of actualTasks) {
      Assert.ok(
        expectedTasks.some(eTask => eTask.hasSameIds(aTask)),
        toPrettyString(aTask)
      );
    }
  }

  const today = cal.dtz.now();
  today.hour = today.minute = today.second = 0;
  const yesterday = today.clone();
  yesterday.addDuration(cal.createDuration("-P1D"));
  const tomorrow = today.clone();
  tomorrow.addDuration(cal.createDuration("P1D"));
  const later = today.clone();
  later.addDuration(cal.createDuration("P2W"));

  const tasks = {
    incomplete: await createTask("Incomplete"),
    started30: await createTask("30% started", { percentComplete: 30 }),
    started60: await createTask("60% started", { percentComplete: 60 }),
    complete: await createTask("Complete", { isCompleted: true }),
    overdue: await createTask("Overdue", { dueDate: yesterday }),
    startsToday: await createTask("Starts today", { entryDate: today }),
    startsTomorrow: await createTask("Starts tomorrow", { entryDate: tomorrow }),
    startsLater: await createTask("Starts later", { entryDate: later }),
  };

  let repeatingTask = new CalTodo();
  repeatingTask.title = "Repeating";
  repeatingTask.entryDate = yesterday;
  repeatingTask.recurrenceInfo = new CalRecurrenceInfo(repeatingTask);
  repeatingTask.recurrenceInfo.appendRecurrenceItem(
    cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=3")
  );

  const firstOccurrence = repeatingTask.recurrenceInfo.getOccurrenceFor(yesterday);
  firstOccurrence.isCompleted = true;
  firstOccurrence.completedDate = yesterday;
  repeatingTask.recurrenceInfo.modifyException(firstOccurrence, true);

  repeatingTask = await calendar.addItem(repeatingTask);

  const occurrences = repeatingTask.recurrenceInfo.getOccurrences(yesterday, later, 10);
  Assert.equal(occurrences.length, 3);

  await openTasksTab();

  await setFilterGroup("all");
  await checkVisibleTasks(
    tasks.incomplete,
    tasks.started30,
    tasks.started60,
    tasks.complete,
    tasks.overdue,
    tasks.startsToday,
    tasks.startsTomorrow,
    tasks.startsLater,
    repeatingTask
  );

  await setFilterGroup("open");
  await checkVisibleTasks(
    tasks.incomplete,
    tasks.started30,
    tasks.started60,
    tasks.overdue,
    tasks.startsToday,
    tasks.startsTomorrow,
    tasks.startsLater,
    occurrences[1],
    occurrences[2]
  );

  await setFilterGroup("completed");
  await checkVisibleTasks(tasks.complete, occurrences[0]);

  await setFilterGroup("overdue");
  await checkVisibleTasks(tasks.overdue);

  await setFilterGroup("notstarted");
  await checkVisibleTasks(tasks.overdue, tasks.incomplete, tasks.startsToday, occurrences[1]);

  await setFilterGroup("next7days");
  await checkVisibleTasks(
    tasks.overdue,
    tasks.incomplete,
    tasks.startsToday,
    tasks.started30,
    tasks.started60,
    tasks.complete,
    tasks.startsTomorrow,
    occurrences[1],
    occurrences[2]
  );

  await setFilterGroup("today");
  await checkVisibleTasks(
    tasks.overdue,
    tasks.incomplete,
    tasks.startsToday,
    tasks.started30,
    tasks.started60,
    tasks.complete,
    occurrences[1]
  );

  await setFilterGroup("throughcurrent");
  await checkVisibleTasks(
    tasks.overdue,
    tasks.incomplete,
    tasks.startsToday,
    tasks.started30,
    tasks.started60,
    tasks.complete,
    occurrences[1]
  );

  await setFilterText("No matches");
  await checkVisibleTasks();

  await clearFilterText();
  await checkVisibleTasks(
    tasks.incomplete,
    tasks.started30,
    tasks.started60,
    tasks.complete,
    tasks.overdue,
    tasks.startsToday,
    occurrences[1]
  );

  await setFilterText("StArTeD");
  await checkVisibleTasks(tasks.started30, tasks.started60);

  await setFilterGroup("today");
  Assert.equal(document.getElementById("task-text-filter-field").value, "StArTeD");
  await checkVisibleTasks(tasks.started30, tasks.started60);

  await setFilterGroup("next7days");
  Assert.equal(document.getElementById("task-text-filter-field").value, "StArTeD");
  await checkVisibleTasks(tasks.started30, tasks.started60);

  await setFilterGroup("notstarted");
  Assert.equal(document.getElementById("task-text-filter-field").value, "StArTeD");
  await checkVisibleTasks();

  await setFilterGroup("overdue");
  Assert.equal(document.getElementById("task-text-filter-field").value, "StArTeD");
  await checkVisibleTasks();

  await setFilterGroup("completed");
  Assert.equal(document.getElementById("task-text-filter-field").value, "StArTeD");
  await checkVisibleTasks();

  await setFilterGroup("open");
  Assert.equal(document.getElementById("task-text-filter-field").value, "StArTeD");
  await checkVisibleTasks(tasks.started30, tasks.started60);

  await setFilterGroup("all");
  Assert.equal(document.getElementById("task-text-filter-field").value, "StArTeD");
  await checkVisibleTasks(tasks.started30, tasks.started60);

  await clearFilterText();
  await checkVisibleTasks(
    tasks.started30,
    tasks.started60,
    tasks.incomplete,
    tasks.complete,
    tasks.overdue,
    tasks.startsToday,
    tasks.startsTomorrow,
    tasks.startsLater,
    repeatingTask
  );

  for (const task of Object.values(tasks)) {
    await calendar.deleteItem(task);
  }
  await setFilterGroup("throughcurrent");
});
