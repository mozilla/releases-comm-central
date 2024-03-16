/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../base/content/calendar-views-utils.js */

/* globals openOptionsDialog, openAddonsMgr */

const { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

async function openTasksTab() {
  const tabmail = document.getElementById("tabmail");
  const tasksMode = tabmail.tabModes.tasks;

  if (tasksMode.tabs.length == 1) {
    tabmail.selectedTab = tasksMode.tabs[0];
  } else {
    const tasksTabButton = document.getElementById("tasksButton");
    EventUtils.synthesizeMouseAtCenter(tasksTabButton, { clickCount: 1 });
  }

  is(tasksMode.tabs.length, 1, "tasks tab is open");
  is(tabmail.selectedTab, tasksMode.tabs[0], "tasks tab is selected");

  await new Promise(resolve => setTimeout(resolve));
}

async function closeTasksTab() {
  const tabmail = document.getElementById("tabmail");
  const tasksMode = tabmail.tabModes.tasks;

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
  const folderMode = tabmail.tabModes.mail3PaneTab;

  tabmail.selectedTab = folderMode.tabs[0];

  is(folderMode.tabs.length > 0, true, "at least one folder tab is open");
  is(tabmail.selectedTab, folderMode.tabs[0], "a folder tab is selected");

  await new Promise(resolve => setTimeout(resolve));
}

async function openChatTab() {
  const tabmail = document.getElementById("tabmail");
  const chatMode = tabmail.tabModes.chat;

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
  const tabmail = document.getElementById("tabmail");
  const chatMode = tabmail.tabModes.chat;

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
 * @returns {string} - The id of the new tab's panel element.
 */
async function _openNewCalendarItemTab(tabMode) {
  const tabmail = document.getElementById("tabmail");
  const itemTabs = tabmail.tabModes[tabMode].tabs;
  const previousTabCount = itemTabs.length;

  Services.prefs.setBoolPref("calendar.item.editInTab", true);
  let buttonId = "sidePanelNewEvent";
  if (tabMode == "calendarTask") {
    await openTasksTab();
    buttonId = "sidePanelNewTask";
  } else {
    await CalendarTestUtils.openCalendarTab(window);
  }

  const newItemButton = document.getElementById(buttonId);
  EventUtils.synthesizeMouseAtCenter(newItemButton, { clickCount: 1 });

  const newTab = itemTabs[itemTabs.length - 1];

  is(itemTabs.length, previousTabCount + 1, `new ${tabMode} tab is open`);
  is(tabmail.selectedTab, newTab, `new ${tabMode} tab is selected`);

  await BrowserTestUtils.browserLoaded(newTab.iframe);
  await new Promise(resolve => setTimeout(resolve));
  return newTab.panel.id;
}

const openNewCalendarEventTab = _openNewCalendarItemTab.bind(null, "calendarEvent");
const openNewCalendarTaskTab = _openNewCalendarItemTab.bind(null, "calendarTask");

/**
 * Selects an existing (open) calendar event or task tab.
 *
 * @param {string} tabMode - The tab mode, either `calendarEvent` or `calendarTask`.
 * @param {string} panelId - The id of the tab's panel element.
 */
async function _selectCalendarItemTab(tabMode, panelId) {
  const tabmail = document.getElementById("tabmail");
  const itemTabs = tabmail.tabModes[tabMode].tabs;
  const tabToSelect = itemTabs.find(tab => tab.panel.id == panelId);

  ok(tabToSelect, `${tabMode} tab is open`);

  tabmail.selectedTab = tabToSelect;

  is(tabmail.selectedTab, tabToSelect, `${tabMode} tab is selected`);

  await new Promise(resolve => setTimeout(resolve));
}

const selectCalendarEventTab = _selectCalendarItemTab.bind(null, "calendarEvent");
const selectCalendarTaskTab = _selectCalendarItemTab.bind(null, "calendarTask");

/**
 * Closes a calendar event or task tab.
 *
 * @param {string} tabMode - The tab mode, either `calendarEvent` or `calendarTask`.
 * @param {string} panelId - The id of the panel of the tab to close.
 */
async function _closeCalendarItemTab(tabMode, panelId) {
  const tabmail = document.getElementById("tabmail");
  const itemTabs = tabmail.tabModes[tabMode].tabs;
  const previousTabCount = itemTabs.length;
  const itemTab = itemTabs.find(tab => tab.panel.id == panelId);

  if (itemTab) {
    // Tab does not immediately close, so wait for it.
    const tabClosedPromise = new Promise(resolve => {
      itemTab.tabNode.addEventListener("TabClose", resolve, { once: true });
    });
    tabmail.closeTab(itemTab);
    await tabClosedPromise;
  }

  is(itemTabs.length, previousTabCount - 1, `${tabMode} tab was closed`);

  await new Promise(resolve => setTimeout(resolve));
}

const closeCalendarEventTab = _closeCalendarItemTab.bind(null, "calendarEvent");
const closeCalendarTaskTab = _closeCalendarItemTab.bind(null, "calendarTask");

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

async function closeAddressBookTab() {
  const tabmail = document.getElementById("tabmail");
  const abMode = tabmail.tabModes.addressBookTab;

  if (abMode.tabs.length == 1) {
    tabmail.closeTab(abMode.tabs[0]);
  }

  is(abMode.tabs.length, 0, "address book tab is not open");

  await new Promise(resolve => setTimeout(resolve));
}

async function closePreferencesTab() {
  const tabmail = document.getElementById("tabmail");
  const prefsMode = tabmail.tabModes.preferencesTab;

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
  const tabmail = document.getElementById("tabmail");
  const contentMode = tabmail.tabModes.contentTab;

  if (contentMode.tabs.length == 1) {
    tabmail.closeTab(contentMode.tabs[0]);
  }

  is(contentMode.tabs.length, 0, "addons tab is not open");

  await new Promise(resolve => setTimeout(resolve));
}

/**
 * Create a calendar using the "Create New Calendar" dialog.
 *
 * @param {string} name - Name for the new calendar.
 * @param {object} [data] - Data to enter into the dialog.
 * @param {boolean} [data.showReminders] - False to disable reminders.
 * @param {string} [data.email] - An email address.
 * @param {object} [data.network] - Data for network calendars.
 * @param {string} [data.network.location] - A URI (leave undefined for local ICS file).
 * @param {boolean} [data.network.offline] - False to disable the cache.
 */
async function createCalendarUsingDialog(name, data = {}) {
  /**
   * Callback function to interact with the dialog.
   *
   * @param {nsIDOMWindow} win - The dialog window.
   */
  async function useDialog(win) {
    const doc = win.document;
    const dialogElement = doc.querySelector("dialog");
    const acceptButton = dialogElement.getButton("accept");

    if (data.network) {
      // Choose network calendar type.
      doc.querySelector("#calendar-type [value='network']").click();
      acceptButton.click();

      // Enter a location.
      if (data.network.location == undefined) {
        const calendarFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
        calendarFile.append(name + ".ics");
        const fileURI = Services.io.newFileURI(calendarFile);
        data.network.location = fileURI.prePath + fileURI.pathQueryRef;
      }
      EventUtils.synthesizeMouseAtCenter(doc.querySelector("#network-location-input"), {}, win);
      EventUtils.sendString(data.network.location, win);

      // Choose offline support.
      if (data.network.offline == undefined) {
        data.network.offline = true;
      }
      const offlineCheckbox = doc.querySelector("#network-cache-checkbox");
      if (!offlineCheckbox.checked) {
        EventUtils.synthesizeMouseAtCenter(offlineCheckbox, {}, win);
      }
      acceptButton.click();

      // Set up an observer to wait for calendar(s) to be found, before
      // clicking the accept button to subscribe to the calendar(s).
      const observer = new MutationObserver(mutationList => {
        mutationList.forEach(async mutation => {
          if (mutation.type === "childList") {
            acceptButton.click();
          }
        });
      });
      observer.observe(doc.querySelector("#network-calendar-list"), { childList: true });
    } else {
      // Choose local calendar type.
      doc.querySelector("#calendar-type [value='local']").click();
      acceptButton.click();

      // Set calendar name.
      // Setting the value does not activate the accept button on all platforms,
      // so we need to type something in case the field is empty.
      const nameInput = doc.querySelector("#local-calendar-name-input");
      if (nameInput.value == "") {
        EventUtils.synthesizeMouseAtCenter(nameInput, {}, win);
        EventUtils.sendString(name, win);
      }

      // Set reminder option.
      if (data.showReminders == undefined) {
        data.showReminders = true;
      }
      const localFireAlarmsCheckbox = doc.querySelector("#local-fire-alarms-checkbox");
      if (localFireAlarmsCheckbox.checked != data.showReminders) {
        EventUtils.synthesizeMouseAtCenter(localFireAlarmsCheckbox, {}, win);
      }

      // Set email account.
      if (data.email == undefined) {
        data.email = "none";
      }
      const emailIdentityMenulist = doc.querySelector("#email-identity-menulist");
      EventUtils.synthesizeMouseAtCenter(emailIdentityMenulist, {}, win);
      emailIdentityMenulist.querySelector("menuitem[value='none']").click();

      // Create the calendar.
      acceptButton.click();
    }
  }

  const dialogWindowPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-creation.xhtml",
    { callback: useDialog }
  );
  // Open the "create new calendar" dialog.
  CalendarTestUtils.openCalendarTab(window);
  // This double-click must be inside the calendar list but below the list items.
  EventUtils.synthesizeMouseAtCenter(document.querySelector("#calendar-list"), { clickCount: 2 });
  return dialogWindowPromise;
}

const calendarViewsInitialState = CalendarTestUtils.saveCalendarViewsState(window);

registerCleanupFunction(async () => {
  await CalendarTestUtils.restoreCalendarViewsState(window, calendarViewsInitialState);
  await closeTasksTab();
  await closeChatTab();
  await closeAddressBookTab();
  await closePreferencesTab();
  await closeAddonsTab();

  // Close any event or task tabs that are open.
  const tabmail = document.getElementById("tabmail");
  const eventTabPanelIds = tabmail.tabModes.calendarEvent.tabs.map(tab => tab.panel.id);
  const taskTabPanelIds = tabmail.tabModes.calendarTask.tabs.map(tab => tab.panel.id);
  for (const id of eventTabPanelIds) {
    await closeCalendarEventTab(id);
  }
  for (const id of taskTabPanelIds) {
    await closeCalendarTaskTab(id);
  }
  Services.prefs.setBoolPref("calendar.item.editInTab", false);

  Assert.equal(tabmail.tabInfo.length, 1, "all tabs closed");
});
