/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the task tree keeps following the calendar after the unified toolbar
 * customization has been opened and closed. The customization hides
 * #messengerBody, which destroys and rebuilds the tree body frame.
 */
const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

const calendar = CalendarTestUtils.createCalendar("Task Customization Test", "memory");

add_setup(function () {
  Assert.ok(window.gSpacesToolbar.isLoaded, "spaces toolbar needs to be loaded");
  registerCleanupFunction(() => {
    // Never leave #messengerBody hidden behind for the tests that follow.
    document.querySelector("unified-toolbar-customization")?.toggle(false);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

/**
 * Open the unified toolbar customization and close it again without saving.
 */
async function openAndCloseCustomization() {
  try {
    await document.querySelector("unified-toolbar").showCustomization();

    await TestUtils.waitForCondition(
      () => document.querySelector("unified-toolbar-customization")?.hasConnected,
      "customization is connected"
    );
    await TestUtils.waitForCondition(
      () => BrowserTestUtils.isHidden(document.getElementById("messengerBody")),
      "messenger body is hidden while customizing"
    );

    EventUtils.synthesizeMouseAtCenter(
      document.getElementById("unifiedToolbarCustomizationCancel"),
      {}
    );
  } finally {
    document.querySelector("unified-toolbar-customization")?.toggle(false);
  }

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(document.getElementById("messengerBody")),
    "messenger body is visible again"
  );
}

add_task(async function testTaskTreeFollowsCalendarAfterCustomization() {
  const task = new CalTodo();
  task.id = "customization-task";
  task.title = "Before customization";
  task.entryDate = cal.createDateTime("20210126T000001Z");
  await calendar.addItem(task);

  await openTasksTab();

  const tree = document.getElementById("calendar-task-tree");
  let refreshed = BrowserTestUtils.waitForEvent(tree, "refresh");
  EventUtils.synthesizeMouseAtCenter(document.getElementById("opt_all_filter"), {});
  tree.refresh();
  await refreshed;

  Assert.equal(tree.view.rowCount, 1, "the task is displayed");

  let reattached = false;
  const onRefresh = () => {
    reattached = true;
  };
  tree.addEventListener("refresh", onRefresh);
  await openAndCloseCustomization();
  await TestUtils.waitForCondition(
    () => reattached,
    "the tree reloads its items after the customization closed"
  );
  tree.removeEventListener("refresh", onRefresh);

  const oldItem = await calendar.getItem(task.id);
  const newItem = oldItem.clone();
  newItem.title = "After customization";
  await calendar.modifyItem(newItem, oldItem);

  await TestUtils.waitForCondition(
    () => tree.getTaskAtRow(0)?.title == "After customization",
    "the modified task is displayed"
  );

  // A stale row would be rejected by the provider with a generation mismatch,
  // which is what the edit dialog runs into when it saves a second time.
  const displayedItem = tree.getTaskAtRow(0);
  const editedAgain = displayedItem.clone();
  editedAgain.title = "Edited twice";
  await calendar.modifyItem(editedAgain, displayedItem);

  await TestUtils.waitForCondition(
    () => tree.getTaskAtRow(0)?.title == "Edited twice",
    "the task modified from the displayed row is displayed"
  );

  await calendar.deleteItem(await calendar.getItem(task.id));

  await TestUtils.waitForCondition(() => tree.view.rowCount == 0, "the task is removed");

  refreshed = BrowserTestUtils.waitForEvent(tree, "refresh");
  EventUtils.synthesizeMouseAtCenter(document.getElementById("opt_throughcurrent_filter"), {});
  tree.refresh();
  await refreshed;

  await closeTasksTab();
});
