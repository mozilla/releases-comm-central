/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openAddonsTab, openChatTab, openNewCalendarEventTab,
 * openNewCalendarTaskTab, openPreferencesTab, openTasksTab,
 * selectCalendarEventTab, selectCalendarTaskTab, selectFolderTab */

var { CALENDARNAME, controller, createCalendar, deleteCalendars } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarUtils.jsm"
);

// Test that today pane is visible/collapsed correctly for various tab types.
// In all cases today pane should not be visible in preferences or addons tab.
// Also test that the today pane button is visible/hidden for various tab types.
add_task(async () => {
  createCalendar(controller, CALENDARNAME);

  const todayPane = document.getElementById("today-pane-panel");
  const todayPaneButton = document.getElementById("calendar-status-todaypane-button");

  let eventTabPanelId, taskTabPanelId;

  async function clickTodayPaneButton() {
    // The today pane button will be hidden for certain tabs (e.g. preferences), and then
    // the user won't be able to click it, so we shouldn't be able to here either.
    if (BrowserTestUtils.is_visible(todayPaneButton)) {
      EventUtils.synthesizeMouseAtCenter(todayPaneButton, { clickCount: 1 });
    }
    await new Promise(resolve => setTimeout(resolve));
  }

  /**
   * Tests whether the today pane is only open in certain tabs.
   *
   * @param {string[]} tabsWhereVisible - Array of tab mode names for tabs where
   *                                      the today pane should be visible.
   */
  async function checkTodayPaneVisibility(tabsWhereVisible) {
    function check(tabModeName) {
      let shouldBeVisible = tabsWhereVisible.includes(tabModeName);
      is(
        BrowserTestUtils.is_visible(todayPane),
        shouldBeVisible,
        `today pane is ${shouldBeVisible ? "visible" : "collapsed"} in ${tabModeName} tab`
      );
    }

    await selectFolderTab();
    check("folder");
    await CalendarTestUtils.openCalendarTab(window);
    check("calendar");
    await openTasksTab();
    check("tasks");
    await openChatTab();
    check("chat");
    await selectCalendarEventTab(eventTabPanelId);
    check("calendarEvent");
    await selectCalendarTaskTab(taskTabPanelId);
    check("calendarTask");
    await openPreferencesTab();
    check("preferencesTab");
    await openAddonsTab();
    check("contentTab");
  }

  // Show today pane in folder (mail) tab, but not in other tabs.
  await selectFolderTab();
  if (!BrowserTestUtils.is_visible(todayPane)) {
    await clickTodayPaneButton();
  }
  await CalendarTestUtils.openCalendarTab(window);
  if (BrowserTestUtils.is_visible(todayPane)) {
    await clickTodayPaneButton();
  }
  await openTasksTab();
  if (BrowserTestUtils.is_visible(todayPane)) {
    await clickTodayPaneButton();
  }
  await openChatTab();
  if (BrowserTestUtils.is_visible(todayPane)) {
    await clickTodayPaneButton();
  }
  eventTabPanelId = await openNewCalendarEventTab();
  if (BrowserTestUtils.is_visible(todayPane)) {
    await clickTodayPaneButton();
  }
  taskTabPanelId = await openNewCalendarTaskTab();
  if (BrowserTestUtils.is_visible(todayPane)) {
    await clickTodayPaneButton();
  }

  await checkTodayPaneVisibility(["folder"]);

  // Show today pane in calendar tab, but not in other tabs.
  // Hide it in folder tab.
  await selectFolderTab();
  await clickTodayPaneButton();
  // Show it in calendar tab.
  await CalendarTestUtils.openCalendarTab(window);
  await clickTodayPaneButton();

  await checkTodayPaneVisibility(["calendar"]);

  // Show today pane in tasks tab, but not in other tabs.
  // Hide it in calendar tab.
  await CalendarTestUtils.openCalendarTab(window);
  await clickTodayPaneButton();
  // Show it in tasks tab.
  await openTasksTab();
  await clickTodayPaneButton();

  await checkTodayPaneVisibility(["tasks"]);

  // Show today pane in chat tab, but not in other tabs.
  // Hide it in tasks tab.
  await openTasksTab();
  await clickTodayPaneButton();
  // Show it in chat tab.
  await openChatTab();
  await clickTodayPaneButton();

  await checkTodayPaneVisibility(["chat"]);

  // Show today pane in calendar event tab, but not in other tabs.
  // Hide it in chat tab.
  await openChatTab();
  await clickTodayPaneButton();
  // Show it in calendar event tab.
  await selectCalendarEventTab(eventTabPanelId);
  await clickTodayPaneButton();

  await checkTodayPaneVisibility(["calendarEvent"]);

  // Show today pane in calendar task tab, but not in other tabs.
  // Hide it in calendar event tab.
  await selectCalendarEventTab(eventTabPanelId);
  await clickTodayPaneButton();
  // Show it in calendar task tab.
  await selectCalendarTaskTab(taskTabPanelId);
  await clickTodayPaneButton();

  await checkTodayPaneVisibility(["calendarTask"]);

  // Check the visibility of the today pane button.
  const button = document.getElementById("calendar-status-todaypane-button");
  await selectFolderTab();
  ok(BrowserTestUtils.is_visible(button), "today pane button is visible in folder tab");
  await CalendarTestUtils.openCalendarTab(window);
  ok(BrowserTestUtils.is_visible(button), "today pane button is visible in calendar tab");
  await openTasksTab();
  ok(BrowserTestUtils.is_visible(button), "today pane button is visible in tasks tab");
  await openChatTab();
  ok(BrowserTestUtils.is_visible(button), "today pane button is visible in chat tab");
  await selectCalendarEventTab(eventTabPanelId);
  ok(BrowserTestUtils.is_visible(button), "today pane button is visible in event tab");
  await selectCalendarTaskTab(taskTabPanelId);
  ok(BrowserTestUtils.is_visible(button), "today pane button is visible in task tab");
  await openPreferencesTab();
  is(BrowserTestUtils.is_visible(button), false, "today pane button is hidden in preferences tab");
  await openAddonsTab();
  is(BrowserTestUtils.is_visible(button), false, "today pane button is hidden in addons tab");
});

registerCleanupFunction(() => {
  deleteCalendars(controller, CALENDARNAME);
});
