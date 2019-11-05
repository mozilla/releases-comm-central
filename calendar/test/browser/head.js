/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

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

async function openChatTab() {
  let tabmail = document.getElementById("tabmail");
  let chatMode = tabmail.tabModes.chat;

  if (chatMode.tabs.length == 1) {
    tabmail.selectedTab = chatMode.tabs[0];
  } else {
    window.showChatTab();
  }

  is(chatMode.tabs.length, 1, "chat tab is open");
  is(tabmail.selectedTab, chatMode.tabs[0], "chat tab is selected");

  await new Promise(resolve => setTimeout(resolve));
}

async function closeChatTab() {
  let tabmail = document.getElementById("tabmail");
  let chatMode = tabmail.tabModes.chat;

  if (chatMode.tabs.length == 1) {
    tabmail.closeTab(chatMode.tabs[0]);
  }

  is(chatMode.tabs.length, 0, "chat tab is not open");

  await new Promise(resolve => setTimeout(resolve));
}

/**
 * Opens a new calendar event or task tab.
 *
 * @param {string} tabMode - Mode of the new tab, either `calendarEvent` or `calendarTask`.
 * @return {string} - The id of the new tab's panel element.
 */
async function _openNewCalendarItemTab(tabMode) {
  let tabmail = document.getElementById("tabmail");
  let itemTabs = tabmail.tabModes[tabMode].tabs;
  let previousTabCount = itemTabs.length;

  Services.prefs.setBoolPref("calendar.item.editInTab", true);
  openCalendarTab();
  let buttonId = tabMode == "calendarTask" ? "calendar-newtask-button" : "calendar-newevent-button";

  let newItemButton = document.getElementById(buttonId);
  EventUtils.synthesizeMouseAtCenter(newItemButton, { clickCount: 1 });

  let newTab = itemTabs[itemTabs.length - 1];

  is(itemTabs.length, previousTabCount + 1, `new ${tabMode} tab is open`);
  is(tabmail.selectedTab, newTab, `new ${tabMode} tab is selected`);

  await new Promise(resolve => setTimeout(resolve));
  return newTab.panel.id;
}

let openNewCalendarEventTab = _openNewCalendarItemTab.bind(null, "calendarEvent");
let openNewCalendarTaskTab = _openNewCalendarItemTab.bind(null, "calendarTask");

/**
 * Selects an existing (open) calendar event or task tab.
 *
 * @param {string} tabMode - The tab mode, either `calendarEvent` or `calendarTask`.
 * @param {string} panelId - The id of the tab's panel element.
 */
async function _selectCalendarItemTab(tabMode, panelId) {
  let tabmail = document.getElementById("tabmail");
  let itemTabs = tabmail.tabModes[tabMode].tabs;
  let tabToSelect = itemTabs.find(tab => tab.panel.id == panelId);

  ok(tabToSelect, `${tabMode} tab is open`);

  tabmail.selectedTab = tabToSelect;

  is(tabmail.selectedTab, tabToSelect, `${tabMode} tab is selected`);

  await new Promise(resolve => setTimeout(resolve));
}

let selectCalendarEventTab = _selectCalendarItemTab.bind(null, "calendarEvent");
let selectCalendarTaskTab = _selectCalendarItemTab.bind(null, "calendarTask");

/**
 * Closes a calendar event or task tab.
 *
 * @param {string} tabMode - The tab mode, either `calendarEvent` or `calendarTask`.
 * @param {string} panelId - The id of the panel of the tab to close.
 */
async function _closeCalendarItemTab(tabMode, panelId) {
  let tabmail = document.getElementById("tabmail");
  let itemTabs = tabmail.tabModes[tabMode].tabs;
  let previousTabCount = itemTabs.length;
  let itemTab = itemTabs.find(tab => tab.panel.id == panelId);

  if (itemTab) {
    // Tab does not immediately close, so wait for it.
    let tabClosedPromise = new Promise(resolve => {
      itemTab.tabNode.addEventListener("TabClose", resolve, { once: true });
    });
    tabmail.closeTab(itemTab);
    await tabClosedPromise;
  }

  is(itemTabs.length, previousTabCount - 1, `${tabMode} tab was closed`);

  await new Promise(resolve => setTimeout(resolve));
}

let closeCalendarEventTab = _closeCalendarItemTab.bind(null, "calendarEvent");
let closeCalendarTaskTab = _closeCalendarItemTab.bind(null, "calendarTask");

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
  await closeChatTab();
  await closePreferencesTab();
  await closeAddonsTab();

  // Close any event or task tabs that are open.
  let tabmail = document.getElementById("tabmail");
  let eventTabPanelIds = tabmail.tabModes.calendarEvent.tabs.map(tab => tab.panel.id);
  let taskTabPanelIds = tabmail.tabModes.calendarTask.tabs.map(tab => tab.panel.id);
  for (let id of eventTabPanelIds) {
    await closeCalendarEventTab(id);
  }
  for (let id of taskTabPanelIds) {
    await closeCalendarTaskTab(id);
  }
  Services.prefs.setBoolPref("calendar.item.editInTab", false);
});
