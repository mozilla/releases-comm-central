/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that calendar menus show a check mark on the current choice.
 */

/* globals openTasksTab, closeTasksTab, openNewCalendarEventTab, closeCalendarEventTab */

const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
const { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);

/**
 * Click an element and wait for the popup it opens.
 *
 * @param {Element} target - The element to click.
 * @param {Element} popup - The menupopup that opens.
 */
async function clickToOpen(target, popup) {
  EventUtils.synthesizeMouseAtCenter(target, {}, window);
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
}

/**
 * Choose a menu item and wait for its popup to close.
 *
 * @param {Element} item - The menu item.
 */
async function chooseItem(item) {
  const hiddenPromise = BrowserTestUtils.waitForPopupEvent(item.parentNode, "hidden");
  item.parentNode.activateItem(item);
  await hiddenPromise;
}

/**
 * Close a menupopup and wait for it to hide.
 *
 * @param {Element} popup - The menupopup.
 */
async function closePopup(popup) {
  const hiddenPromise = BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  popup.hidePopup();
  await hiddenPromise;
}

/**
 * Get the checked menu items of a menupopup.
 *
 * @param {Element} popup - The menupopup.
 * @returns {string[]} The ids, or else the classes, of the checked items.
 */
function checkedItems(popup) {
  return Array.from(
    popup.querySelectorAll(":scope > menuitem[checked]"),
    item => item.id || item.className
  );
}

let calendar;

add_setup(async function () {
  calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.openCalendarTab(window);
  await CalendarTestUtils.setCalendarView(window, "week");
});

add_task(async function testViewMenu() {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  const viewMenu = document.getElementById("menu_View");
  const calendarMenu = document.getElementById("calCalendarMenu");
  const openCalendarSubmenu = async submenu => {
    EventUtils.synthesizeMouseAtCenter(viewMenu, {}, window);
    await BrowserTestUtils.waitForPopupEvent(viewMenu.menupopup, "shown");
    calendarMenu.openMenu(true);
    await BrowserTestUtils.waitForPopupEvent(calendarMenu.menupopup, "shown");
    if (submenu) {
      submenu.openMenu(true);
      await BrowserTestUtils.waitForPopupEvent(submenu.menupopup, "shown");
    }
  };

  await openCalendarSubmenu();
  Assert.deepEqual(
    checkedItems(calendarMenu.menupopup),
    ["calChangeViewWeek"],
    "only the week view item should be checked in week view"
  );
  await closePopup(viewMenu.menupopup);

  const paneMenu = document.getElementById("calCalendarPaneMenu");
  await openCalendarSubmenu(paneMenu);
  Assert.deepEqual(
    checkedItems(paneMenu.menupopup),
    ["calViewCalendarPane", "calTasksViewMinimonth", "calTasksViewCalendarlist"],
    "the calendar pane and both of its parts should be checked while shown"
  );
  await closePopup(viewMenu.menupopup);

  // Hide weekends from the control bar menu, then check the View menu.
  const controlBarButton = document.getElementById("calendarControlBarMenu");
  const controlBarPopup = document.getElementById("calControlBarMenuPopup");
  const hideWeekendsItem = document.getElementById("hideWeekendsButton");
  await clickToOpen(controlBarButton, controlBarPopup);
  await chooseItem(hideWeekendsItem);
  const currentViewMenu = document.getElementById("calCalendarCurrentViewMenu");
  await openCalendarSubmenu(currentViewMenu);
  Assert.deepEqual(
    checkedItems(currentViewMenu.menupopup),
    ["calWorkdaysOnlyMenuitem"],
    "workdays only should be checked after hiding weekends from the control bar"
  );
  await closePopup(viewMenu.menupopup);
  await clickToOpen(controlBarButton, controlBarPopup);
  await chooseItem(hideWeekendsItem);
}).skip(AppConstants.platform == "macosx"); // Can't click menu bar on Mac.

add_task(async function testControlBarMenu() {
  const button = document.getElementById("calendarControlBarMenu");
  const popup = document.getElementById("calControlBarMenuPopup");

  await clickToOpen(button, popup);
  Assert.deepEqual(
    checkedItems(popup),
    ["findEventsButton"],
    "only find events should be checked at first"
  );
  await closePopup(popup);
});

add_task(async function testTaskOptions() {
  const task = new CalTodo();
  task.title = "Task";
  task.priority = 5;
  task.percentComplete = 25;
  await calendar.addItem(task);

  await openTasksTab();
  const tree = document.getElementById("calendar-task-tree");
  await TestUtils.waitForCondition(
    () => tree.mTaskArray.length == 1,
    "the task should be in the task list"
  );
  mailTestUtils.treeClick(EventUtils, window, tree, 0, 1, { clickCount: 1 }, AccessibilityUtils);

  const priorityButton = document.getElementById("task-actions-priority");
  await TestUtils.waitForCondition(
    () => !priorityButton.disabled,
    "the priority button should be enabled for the selected task"
  );
  const progressDropmarker = document
    .getElementById("task-actions-markcompleted")
    .querySelector(".toolbarbutton-menubutton-dropmarker");
  for (const [target, popupId, expected, choice, property, value] of [
    [
      priorityButton,
      "task-actions-priority-menupopup",
      "priority-5-menuitem",
      "priority-1-menuitem",
      "priority",
      1,
    ],
    [
      progressDropmarker,
      "task-actions-markcompleted-menupopup",
      "percent-25-menuitem",
      "percent-50-menuitem",
      "percentComplete",
      50,
    ],
  ]) {
    const popup = document.getElementById(popupId);
    await clickToOpen(target, popup);
    Assert.deepEqual(
      checkedItems(popup),
      [expected],
      `${popupId} should check only ${expected} for the task`
    );
    await chooseItem(popup.querySelector(`.${choice}`));
    await TestUtils.waitForCondition(
      () => tree.mTaskArray[0][property] == value,
      `the task should be saved with ${property} ${value}`
    );

    await clickToOpen(target, popup);
    Assert.deepEqual(
      checkedItems(popup),
      [choice],
      `${popupId} should check only ${choice} after choosing it`
    );
    await closePopup(popup);
  }

  await closeTasksTab();
});

add_task(async function testItemTabToolbarMenus() {
  const panelId = await openNewCalendarEventTab();
  await TestUtils.waitForCondition(
    () => document.getElementById("cmd_showtimeas_busy").hasAttribute("checked"),
    "the new event tab should be set up"
  );

  for (const [buttonId, expected] of [
    ["button-priority", "event-priority-none-menuitem"],
    ["button-status", "event-status-none-menuitem"],
    ["button-freebusy", "event-freebusy-busy-menuitem"],
  ]) {
    const button = document.getElementById(buttonId);
    await clickToOpen(button, button.menupopup);
    Assert.deepEqual(
      checkedItems(button.menupopup),
      [expected],
      `${buttonId} menu should check only ${expected} for a new event`
    );
    Assert.ok(
      BrowserTestUtils.isVisible(document.getElementById(expected)),
      `${expected} should be shown for a new event`
    );
    await closePopup(button.menupopup);
  }

  await closeCalendarEventTab(panelId);
});
