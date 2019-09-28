/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openAddonsTab, openCalendarTab, openChatTab, openTasksTab, selectFolderTab,
  openPreferencesTab */

async function clickTodayPaneButton() {
  const button = document.getElementById("calendar-status-todaypane-button");
  // The today pane button will be hidden for certain tabs (e.g. preferences), and then
  // the user won't be able to click it, so we shouldn't be able to here either.
  if (BrowserTestUtils.is_visible(button)) {
    EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 });
  }
  await new Promise(resolve => setTimeout(resolve));
}

// Test that today pane is visible/collapsed correctly for various tab types.
// In all cases today pane should not be visible in preferences or addons tab.
// Test that the today pane button is visible/hidden for various tab types.
add_task(async () => {
  const todayPane = document.getElementById("today-pane-panel");

  // Show today pane in folder (mail) tab, but not in other tabs.
  await selectFolderTab();
  if (!BrowserTestUtils.is_visible(todayPane)) {
    await clickTodayPaneButton();
  }
  await openCalendarTab();
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

  await selectFolderTab();
  ok(BrowserTestUtils.is_visible(todayPane), "today pane is visible in folder tab");
  await openCalendarTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in calendar tab");
  await openTasksTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in tasks tab");
  await openChatTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in chat tab");
  await openPreferencesTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in preferences tab");
  await openAddonsTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in addons tab");

  // Show today pane in calendar tab, but not in other tabs.
  // Hide it in folder tab.
  await selectFolderTab();
  await clickTodayPaneButton();
  // Show it in calendar tab.
  await openCalendarTab();
  await clickTodayPaneButton();

  await selectFolderTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in folder tab");
  await openCalendarTab();
  ok(BrowserTestUtils.is_visible(todayPane), "today pane is visible in calendar tab");
  await openTasksTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in tasks tab");
  await openChatTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in chat tab");
  await openPreferencesTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in preferences tab");
  await openAddonsTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in addons tab");

  // Show today pane in tasks tab, but not in other tabs.
  // Hide it in calendar tab.
  await openCalendarTab();
  await clickTodayPaneButton();
  // Show it in tasks tab.
  await openTasksTab();
  await clickTodayPaneButton();

  await selectFolderTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in folder tab");
  await openCalendarTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in calendar tab");
  await openTasksTab();
  ok(BrowserTestUtils.is_visible(todayPane), "today pane is visible in tasks tab");
  await openChatTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in chat tab");
  await openPreferencesTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in preferences tab");
  await openAddonsTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in addons tab");

  // Show today pane in chat tab, but not in other tabs.
  // Hide it in tasks tab.
  await openTasksTab();
  await clickTodayPaneButton();
  // Show it in chat tab.
  await openChatTab();
  await clickTodayPaneButton();

  await selectFolderTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in folder tab");
  await openCalendarTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in calendar tab");
  await openTasksTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in tasks tab");
  await openChatTab();
  ok(BrowserTestUtils.is_visible(todayPane), "today pane is visible in chat tab");
  await openPreferencesTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in preferences tab");
  await openAddonsTab();
  is(BrowserTestUtils.is_visible(todayPane), false, "today pane is collapsed in addons tab");

  // Check the visibility of the today pane button.
  const button = document.getElementById("calendar-status-todaypane-button");
  await selectFolderTab();
  ok(BrowserTestUtils.is_visible(button), "today pane button is visible in folder tab");
  await openCalendarTab();
  ok(BrowserTestUtils.is_visible(button), "today pane button is visible in calendar tab");
  await openTasksTab();
  ok(BrowserTestUtils.is_visible(button), "today pane button is visible in tasks tab");
  await openChatTab();
  ok(BrowserTestUtils.is_visible(button), "today pane button is visible in chat tab");
  await openPreferencesTab();
  is(BrowserTestUtils.is_visible(button), false, "today pane button is hidden in preferences tab");
  await openAddonsTab();
  is(BrowserTestUtils.is_visible(button), false, "today pane button is hidden in addons tab");
});
