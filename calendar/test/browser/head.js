/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported openCalendarTab, setCalendarView, closeCalendarTab, openTasksTab,
 * closeTasksTab, selectFolderTab, openPreferencesTab, closePreferencesTab,
 * openAddonsTab, closeAddonsTab
 */

/* import-globals-from ../../base/content/calendar-views-utils.js */

/* globals openOptionsDialog, openAddonsMgr */

async function openCalendarTab() {
  let tabmail = document.getElementById("tabmail");
  let calendarMode = tabmail.tabModes.calendar;

  if (calendarMode.tabs.length == 1) {
    tabmail.selectedTab = calendarMode.tabs[0];
  } else {
    let calendarTabButton = document.getElementById("calendar-tab-button");
    EventUtils.synthesizeMouseAtCenter(calendarTabButton, { clickCount: 1 });
  }

  is(calendarMode.tabs.length, 1, "calendar tab is open");
  is(tabmail.selectedTab, calendarMode.tabs[0], "calendar tab is selected");

  await new Promise(resolve => setTimeout(resolve));
}

async function setCalendarView(viewName) {
  await openCalendarTab();

  let viewTabButton = document.getElementById(`calendar-${viewName}-view-button`);
  EventUtils.synthesizeMouseAtCenter(viewTabButton, { clickCount: 1 });

  is(currentView().id, `${viewName}-view`);

  await new Promise(resolve => setTimeout(resolve));
}

async function closeCalendarTab() {
  let tabmail = document.getElementById("tabmail");
  let calendarMode = tabmail.tabModes.calendar;

  if (calendarMode.tabs.length == 1) {
    tabmail.closeTab(calendarMode.tabs[0]);
  }

  is(calendarMode.tabs.length, 0, "calendar tab is not open");

  await new Promise(resolve => setTimeout(resolve));
}

async function openTasksTab() {
  let tabmail = document.getElementById("tabmail");
  let tasksMode = tabmail.tabModes.tasks;

  if (tasksMode.tabs.length == 1) {
    tabmail.selectedTab = tasksMode.tabs[0];
  } else {
    let tasksTabButton = document.getElementById("task-tab-button");
    EventUtils.synthesizeMouseAtCenter(tasksTabButton, { clickCount: 1 });
  }

  is(tasksMode.tabs.length, 1, "tasks tab is open");
  is(tabmail.selectedTab, tasksMode.tabs[0], "tasks tab is selected");

  await new Promise(resolve => setTimeout(resolve));
}

async function closeTasksTab() {
  let tabmail = document.getElementById("tabmail");
  let tasksMode = tabmail.tabModes.tasks;

  if (tasksMode.tabs.length == 1) {
    tabmail.closeTab(tasksMode.tabs[0]);
  }

  is(tasksMode.tabs.length, 0, "tasks tab is not open");

  await new Promise(resolve => setTimeout(resolve));
}

/**
 * Currently there's always a folder tab open, hence "select" not "open".
 */
async function selectFolderTab() {
  const tabmail = document.getElementById("tabmail");
  const folderMode = tabmail.tabModes.folder;

  tabmail.selectedTab = folderMode.tabs[0];

  is(folderMode.tabs.length > 0, true, "at least one folder tab is open");
  is(tabmail.selectedTab, folderMode.tabs[0], "a folder tab is selected");

  await new Promise(resolve => setTimeout(resolve));
}

async function openPreferencesTab() {
  const tabmail = document.getElementById("tabmail");
  const prefsMode = tabmail.tabModes.preferencesTab;

  if (prefsMode.tabs.length == 1) {
    tabmail.selectedTab = prefsMode.tabs[0];
  } else {
    openOptionsDialog();
  }

  is(prefsMode.tabs.length, 1, "preferences tab is open");
  is(tabmail.selectedTab, prefsMode.tabs[0], "preferences tab is selected");

  await new Promise(resolve => setTimeout(resolve));
}

async function closePreferencesTab() {
  let tabmail = document.getElementById("tabmail");
  let prefsMode = tabmail.tabModes.preferencesTab;

  if (prefsMode.tabs.length == 1) {
    tabmail.closeTab(prefsMode.tabs[0]);
  }

  is(prefsMode.tabs.length, 0, "preferences tab is not open");

  await new Promise(resolve => setTimeout(resolve));
}

async function openAddonsTab() {
  const tabmail = document.getElementById("tabmail");
  const contentMode = tabmail.tabModes.contentTab;

  if (contentMode.tabs.length == 1) {
    tabmail.selectedTab = contentMode.tabs[0];
  } else {
    openAddonsMgr("addons://list/extension");
  }

  is(contentMode.tabs.length, 1, "addons tab is open");
  is(tabmail.selectedTab, contentMode.tabs[0], "addons tab is selected");

  await new Promise(resolve => setTimeout(resolve));
}

async function closeAddonsTab() {
  let tabmail = document.getElementById("tabmail");
  let contentMode = tabmail.tabModes.contentTab;

  if (contentMode.tabs.length == 1) {
    tabmail.closeTab(contentMode.tabs[0]);
  }

  is(contentMode.tabs.length, 0, "addons tab is not open");

  await new Promise(resolve => setTimeout(resolve));
}

registerCleanupFunction(async () => {
  await closeCalendarTab();
  await closeTasksTab();
  await closePreferencesTab();
  await closeAddonsTab();
});
