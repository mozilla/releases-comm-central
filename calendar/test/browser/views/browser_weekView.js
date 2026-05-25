/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { formatDate, formatTime, saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

var TITLE1 = "Week View Event";
var TITLE2 = "Week View Event Changed";
var DESC = "Week View Event Description";

add_setup(function () {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function testWeekView() {
  await CalendarTestUtils.setCalendarView(window, "week");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  // Verify date.
  await TestUtils.waitForCondition(() => {
    const dateLabel = document.querySelector(
      "#week-view .day-column-selected calendar-event-column"
    );
    return dateLabel?.date.icalString == "20090101";
  }, "Date is selected");

  // Create event at 8 AM.
  // Thursday of 2009-01-05 is 4th with default settings.
  let eventBox = CalendarTestUtils.weekView.getHourBoxAt(window, 5, 8);
  let { dialogWindow, iframeWindow, iframeDocument } = await CalendarTestUtils.editNewEvent(
    window,
    eventBox
  );

  // Check that the start time is correct.
  const someDate = cal.createDateTime();
  someDate.resetTo(2009, 0, 5, 8, 0, 0, cal.dtz.UTC);

  const startPicker = iframeDocument.getElementById("event-starttime");
  Assert.equal(startPicker._datepicker._inputField.value, formatDate(someDate));
  Assert.equal(startPicker._timepicker._inputField.value, formatTime(someDate));

  // Fill in title, description and calendar.
  await setData(dialogWindow, iframeWindow, {
    title: TITLE1,
    description: DESC,
    calendar: "Test",
  });

  await saveAndCloseItemDialog(dialogWindow);

  // If it was created successfully, it can be opened.
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.weekView.editEventAt(window, 5, 1));
  // Change title and save changes.
  await setData(dialogWindow, iframeWindow, { title: TITLE2 });
  await saveAndCloseItemDialog(dialogWindow);

  // Check if name was saved.
  let eventName;
  await TestUtils.waitForCondition(() => {
    eventBox = CalendarTestUtils.weekView.getEventBoxAt(window, 5, 1);
    if (!eventBox) {
      return false;
    }
    eventName = eventBox.querySelector(".event-name-label").textContent;
    return eventName == TITLE2;
  }, "event name did not update in time");

  Assert.equal(eventName, TITLE2);

  // Delete event.
  EventUtils.synthesizeMouseAtCenter(eventBox, {}, window);
  eventBox.focus();
  EventUtils.synthesizeKey("KEY_Delete", {}, window);
  await CalendarTestUtils.weekView.waitForNoEventBoxAt(window, 5, 1);

  Assert.ok(true, "Test ran to completion");
});

add_task(async function testStartOfWeek() {
  await CalendarTestUtils.setCalendarView(window, "week");

  // Check the first day of the week is Thursday, set by the test manifest.
  Assert.equal(Services.prefs.getIntPref("calendar.week.start"), 4);

  // Check the view is displayed correctly.
  const weekView = document.getElementById("week-view");
  Assert.equal(weekView.dayColumns.length, 7);
  Assert.deepEqual(
    Array.from(weekView.dayColumns, column => column.date.weekday),
    [4, 5, 6, 0, 1, 2, 3],
    "week day column days should be correct initially"
  );
  Assert.deepEqual(
    Array.from(weekView.dayColumns, column => column.longHeading.textContent.split(" ")[0]),
    ["Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday"],
    "week day column labels should be correct initially"
  );
  Assert.deepEqual(
    Array.from(weekView.dayColumns, column => column.shortHeading.textContent.split(" ")[0]),
    ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"],
    "week day column labels should be correct initially"
  );

  // Change the first day of the week to Monday.
  Services.prefs.setIntPref("calendar.week.start", 1);

  // Check the view is updated correctly.
  Assert.equal(weekView.dayColumns.length, 7);
  Assert.deepEqual(
    Array.from(weekView.dayColumns, column => column.date.weekday),
    [1, 2, 3, 4, 5, 6, 0],
    "week day column days should have been rearranged"
  );
  Assert.deepEqual(
    Array.from(weekView.dayColumns, column => column.longHeading.textContent.split(" ")[0]),
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    "week day column labels should have been updated"
  );
  Assert.deepEqual(
    Array.from(weekView.dayColumns, column => column.shortHeading.textContent.split(" ")[0]),
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "week day column labels should have been updated"
  );

  // Reset the first day of the week to Thursday.
  Services.prefs.setIntPref("calendar.week.start", 4);

  // Check the view is updated correctly.
  Assert.equal(weekView.dayColumns.length, 7);
  Assert.deepEqual(
    Array.from(weekView.dayColumns, column => column.date.weekday),
    [4, 5, 6, 0, 1, 2, 3],
    "week day column days should have been rearranged"
  );
  Assert.deepEqual(
    Array.from(weekView.dayColumns, column => column.longHeading.textContent.split(" ")[0]),
    ["Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday"],
    "week day column labels should have been updated"
  );
  Assert.deepEqual(
    Array.from(weekView.dayColumns, column => column.shortHeading.textContent.split(" ")[0]),
    ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"],
    "week day column labels should have been updated"
  );
});

function checkDisplayedDate(expectedFirst) {
  const displayedDate = CalendarTestUtils.weekView.getEventColumn(window, 1).date;

  Assert.equal(displayedDate.year, expectedFirst.getUTCFullYear(), "year of first date");
  Assert.equal(displayedDate.month, expectedFirst.getUTCMonth(), "month of first date");
  Assert.equal(displayedDate.day, expectedFirst.getUTCDate(), "day of first date");
}

add_task(async function testWeekViewNavigationButtons() {
  await CalendarTestUtils.setCalendarView(window, "week");

  const previousButton = document.getElementById("previousViewButton");
  const todayButton = CalendarTestUtils.getNavBarTodayButton(window);
  const nextButton = document.getElementById("nextViewButton");

  const thisWeek = new Date();
  thisWeek.setUTCDate(thisWeek.getUTCDate() - [3, 4, 5, 6, 0, 1, 2][thisWeek.getUTCDay()]);
  const lastWeek = new Date(thisWeek);
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const nextWeek = new Date(thisWeek);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);

  info("today button");
  EventUtils.synthesizeMouseAtCenter(todayButton, {}, window);
  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(thisWeek);

  info("forward button");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, window);
  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(nextWeek);

  info("back button");
  EventUtils.synthesizeMouseAtCenter(previousButton, {}, window);
  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(thisWeek);

  info("back button");
  EventUtils.synthesizeMouseAtCenter(previousButton, {}, window);
  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(lastWeek);

  info("forward button");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, window);
  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(thisWeek);
});

add_task(async function testDayViewNavigationMenuItems() {
  await CalendarTestUtils.setCalendarView(window, "week");

  async function openMenus(...menus) {
    const menu = menus.shift();
    menu.openMenu(true);
    await BrowserTestUtils.waitForPopupEvent(menu.menupopup, "shown");
    if (menus.length) {
      await openMenus(...menus);
    }
  }

  async function closeMenus(...menus) {
    for (const menu of menus) {
      await BrowserTestUtils.waitForPopupEvent(menu.menupopup, "hidden");
    }
  }

  const goMenu = document.getElementById("menu_Go");
  const todayMenuItem = document.getElementById("calendar-go-to-today-menuitem");
  const nextMenu = document.getElementById("goNextMenu");
  const nextMenuItem = document.getElementById("calendar-go-menu-next");
  const previousMenu = document.getElementById("goPreviousMenu");
  const previousMenuItem = document.getElementById("calendar-go-menu-previous");

  const thisWeek = new Date();
  thisWeek.setUTCDate(thisWeek.getUTCDate() - [3, 4, 5, 6, 0, 1, 2][thisWeek.getUTCDay()]);
  const lastWeek = new Date(thisWeek);
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const nextWeek = new Date(thisWeek);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);

  info("today menu item");
  await openMenus(goMenu);
  goMenu.menupopup.activateItem(todayMenuItem);
  await closeMenus(goMenu);

  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(thisWeek);

  info("forward menu item");
  await openMenus(goMenu, nextMenu);
  Assert.equal(nextMenuItem.label, "Week");
  Assert.equal(nextMenuItem.accessKey, "W");
  nextMenu.menupopup.activateItem(nextMenuItem);
  await closeMenus(nextMenu, goMenu);

  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(nextWeek);

  info("back menu item");
  await openMenus(goMenu, previousMenu);
  Assert.equal(previousMenuItem.label, "Week");
  Assert.equal(previousMenuItem.accessKey, "W");
  previousMenu.menupopup.activateItem(previousMenuItem);
  await closeMenus(previousMenu, goMenu);

  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(thisWeek);

  info("back menu item");
  await openMenus(goMenu, previousMenu);
  EventUtils.synthesizeMouseAtCenter(previousMenuItem, {}, window);
  await closeMenus(previousMenu, goMenu);

  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(lastWeek);

  info("forward menu item");
  await openMenus(goMenu, nextMenu);
  EventUtils.synthesizeMouseAtCenter(nextMenuItem, {}, window);
  await closeMenus(nextMenu, goMenu);

  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(thisWeek);
}).skip(AppConstants.platform == "macosx");
