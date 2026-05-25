/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { formatDate, formatTime, saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const TITLE1 = "Day View Event";
const TITLE2 = "Day View Event Changed";
const DESC = "Day View Event Description";

add_setup(async function () {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function testDayView() {
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  const dayView = document.getElementById("day-view");
  // Verify date in view.
  await TestUtils.waitForCondition(
    () => dayView.dayColumns[0]?.date.icalString == "20090101",
    "Inspecting the date"
  );

  // Create event at 8 AM.
  let eventBox = CalendarTestUtils.dayView.getHourBoxAt(window, 8);
  let { dialogWindow, iframeWindow, iframeDocument } = await CalendarTestUtils.editNewEvent(
    window,
    eventBox
  );

  // Check that the start time is correct.
  const someDate = cal.createDateTime();
  someDate.resetTo(2009, 0, 1, 8, 0, 0, cal.dtz.UTC);

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
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.dayView.editEventAt(window, 1));
  await setData(dialogWindow, iframeWindow, { title: TITLE2 });
  await saveAndCloseItemDialog(dialogWindow);

  // Check if name was saved.
  await TestUtils.waitForCondition(() => {
    eventBox = CalendarTestUtils.dayView.getEventBoxAt(window, 1);
    if (!eventBox) {
      return false;
    }

    const eventName = eventBox.querySelector(".event-name-label");
    return eventName.textContent == TITLE2;
  }, "event was modified in the view");

  // Delete event
  EventUtils.synthesizeMouseAtCenter(eventBox, {}, window);
  eventBox.focus();
  EventUtils.synthesizeKey("KEY_Delete", {}, window);
  await CalendarTestUtils.dayView.waitForNoEventBoxAt(window, 1);

  Assert.ok(true, "Test ran to completion");
});

add_task(async function testDayViewDateLabel() {
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2022, 4, 13);

  const heading = CalendarTestUtils.dayView.getColumnHeading(window);
  const labelSpan = heading.querySelector("span:not([hidden])");

  await document.l10n.translateRoots();
  Assert.equal(
    labelSpan.textContent,
    "Wednesday Apr 13",
    "the date label should contain the displayed date in a human-readable string"
  );
});

add_task(async function testDayViewCurrentDayHighlight() {
  // Sanity check that this date (which should be in the past) is not today's
  // date.
  const today = new Date();
  Assert.ok(today.getUTCFullYear() != 2022 || today.getUTCMonth() != 3 || today.getUTCDate() != 13);

  // When displaying days which are not the current day, there should be no
  // highlight.
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2022, 4, 13);

  let container = CalendarTestUtils.dayView.getColumnContainer(window);
  Assert.ok(
    !container.classList.contains("day-column-today"),
    "the displayed date should not be highlighted if it is not the current day"
  );

  // When displaying the current day, it should be highlighted.
  await CalendarTestUtils.goToToday(window);

  container = CalendarTestUtils.dayView.getColumnContainer(window);
  Assert.ok(
    container.classList.contains("day-column-today"),
    "the displayed date should be highlighted if it is the current day"
  );
});

add_task(async function testDayViewWorkDayHighlight() {
  // The test configuration sets Sunday to be a work day, so it should not have
  // the weekend background.
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2022, 4, 10);

  let container = CalendarTestUtils.dayView.getColumnContainer(window);
  Assert.ok(
    !container.classList.contains("day-column-weekend"),
    "the displayed date should not be highlighted if it is a work day"
  );

  await CalendarTestUtils.goToDate(window, 2022, 4, 13);

  container = CalendarTestUtils.dayView.getColumnContainer(window);
  Assert.ok(
    container.classList.contains("day-column-weekend"),
    "the displayed date should be highlighted if it is not a work day"
  );
});

add_task(async function testDayViewNavbar() {
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2022, 4, 13);

  const intervalDescription = CalendarTestUtils.getNavBarIntervalDescription(window);
  Assert.equal(
    intervalDescription.textContent,
    "Wednesday, April 13, 2022",
    "interval description should contain a description of the displayed date"
  );

  await document.l10n.translateRoots();

  // Note that the value 14 here tests calculation of the calendar week based on
  // the starting day of the week; if the calculation built in an assumption of
  // Sunday or Monday as the starting day of the week, we would get 15 here.
  const calendarWeek = CalendarTestUtils.getNavBarCalendarWeekBox(window);
  Assert.equal(
    calendarWeek.textContent,
    "CW: 14",
    "calendar week label should contain an indicator of which week contains displayed date"
  );
});

function checkDisplayedDate(expectedDate) {
  const displayedDate = CalendarTestUtils.dayView.getEventColumn(window).date;

  Assert.equal(
    displayedDate.year,
    expectedDate.getUTCFullYear(),
    "year of displayed date should be this year"
  );
  Assert.equal(
    displayedDate.month,
    expectedDate.getUTCMonth(),
    "month of displayed date should be this month"
  );
  Assert.equal(
    displayedDate.day,
    expectedDate.getUTCDate(),
    `day of displayed date should be ${expectedDate.getUTCDate()}`
  );
}

add_task(async function testDayViewNavigationButtons() {
  await CalendarTestUtils.setCalendarView(window, "day");

  const previousButton = document.getElementById("previousViewButton");
  const todayButton = CalendarTestUtils.getNavBarTodayButton(window);
  const nextButton = document.getElementById("nextViewButton");

  const yesterday = new Date();
  yesterday.setUTCHours(-2);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setUTCHours(26);

  info("today button");
  EventUtils.synthesizeMouseAtCenter(todayButton, {}, window);
  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(today);

  info("forward button");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, window);
  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(tomorrow);

  info("back button");
  EventUtils.synthesizeMouseAtCenter(previousButton, {}, window);
  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(today);

  info("back button");
  EventUtils.synthesizeMouseAtCenter(previousButton, {}, window);
  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(yesterday);

  info("forward button");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, window);
  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(today);
});

add_task(async function testDayViewNavigationMenuItems() {
  await CalendarTestUtils.setCalendarView(window, "day");

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

  const yesterday = new Date();
  yesterday.setUTCHours(-2);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setUTCHours(26);

  info("today menu item");
  await openMenus(goMenu);
  goMenu.menupopup.activateItem(todayMenuItem);
  await closeMenus(goMenu);

  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(today);

  info("forward menu item");
  await openMenus(goMenu, nextMenu);
  Assert.equal(nextMenuItem.label, "Day");
  Assert.equal(nextMenuItem.accessKey, "D");
  nextMenu.menupopup.activateItem(nextMenuItem);
  await closeMenus(nextMenu, goMenu);

  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(tomorrow);

  info("back menu item");
  await openMenus(goMenu, previousMenu);
  Assert.equal(previousMenuItem.label, "Day");
  Assert.equal(previousMenuItem.accessKey, "D");
  previousMenu.menupopup.activateItem(previousMenuItem);
  await closeMenus(previousMenu, goMenu);

  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(today);

  info("back menu item");
  await openMenus(goMenu, previousMenu);
  EventUtils.synthesizeMouseAtCenter(previousMenuItem, {}, window);
  await closeMenus(previousMenu, goMenu);

  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(yesterday);

  info("forward menu item");
  await openMenus(goMenu, nextMenu);
  EventUtils.synthesizeMouseAtCenter(nextMenuItem, {}, window);
  await closeMenus(nextMenu, goMenu);

  await CalendarTestUtils.ensureViewLoaded(window);
  checkDisplayedDate(today);
}).skip(AppConstants.platform == "macosx");
