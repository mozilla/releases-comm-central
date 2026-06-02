/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { formatDate, formatTime, saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const TITLE1 = "Multiweek View Event";
const TITLE2 = "Multiweek View Event Changed";
const DESC = "Multiweek View Event Description";

add_setup(function () {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function testMultiweekView() {
  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  // Verify date.
  await TestUtils.waitForCondition(() => {
    const dateLabel = document.querySelector(
      '#multiweek-view td[selected="true"] > calendar-month-day-box'
    );
    return dateLabel && dateLabel.mDate.icalString == "20090101";
  }, "Inspecting the date");

  // Create event.
  // Thursday of 2009-01-05 should be the selected box in the first row with default settings.
  const hour = new Date().getUTCHours(); // Remember time at click.
  let eventBox = CalendarTestUtils.multiweekView.getDayBox(window, 1, 5);
  let { dialogWindow, iframeWindow, iframeDocument } = await CalendarTestUtils.editNewEvent(
    window,
    eventBox
  );

  // Check that the start time is correct.
  // Next full hour except last hour hour of the day.
  const nextHour = hour == 23 ? hour : (hour + 1) % 24;
  const someDate = cal.dtz.now();
  someDate.resetTo(2009, 0, 5, nextHour, 0, 0, cal.dtz.UTC);

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
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.multiweekView.editItemAt(
    window,
    1,
    5,
    1
  ));
  // Change title and save changes.
  await setData(dialogWindow, iframeWindow, { title: TITLE2 });
  await saveAndCloseItemDialog(dialogWindow);

  // Check if name was saved.
  await TestUtils.waitForCondition(() => {
    eventBox = CalendarTestUtils.multiweekView.getItemAt(window, 1, 5, 1);
    if (eventBox === null) {
      return false;
    }
    const eventName = eventBox.querySelector(".event-name-label");
    return eventName && eventName.textContent == TITLE2;
  }, "Wait for the new title");

  // Delete event.
  EventUtils.synthesizeMouseAtCenter(eventBox, {}, window);
  eventBox.focus();
  EventUtils.synthesizeKey("KEY_Delete", {}, window);
  await CalendarTestUtils.multiweekView.waitForNoItemAt(window, 1, 5, 1);

  Assert.ok(true, "Test ran to completion");
});

add_task(async function testMultiweekViewStartOfWeek() {
  await CalendarTestUtils.setCalendarView(window, "multiweek");

  // Check the first day of the week is Thursday, set by the test manifest.
  Assert.equal(Services.prefs.getIntPref("calendar.week.start"), 4);

  // Check the view is displayed correctly.
  let labels = document.querySelectorAll("#multiweek-view calendar-day-label");
  Assert.equal(labels.length, 7);
  Assert.deepEqual(
    Array.from(labels, label => label.weekDay),
    [4, 5, 6, 0, 1, 2, 3],
    "week day column days should be correct initially"
  );
  Assert.deepEqual(
    Array.from(labels, label => label.firstElementChild.value),
    ["Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday"],
    "week day column labels should be correct initially"
  );
  Assert.deepEqual(
    Array.from(labels, label => label.lastElementChild.value),
    ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"],
    "week day column labels should be correct initially"
  );

  // Change the first day of the week to Monday.
  Services.prefs.setIntPref("calendar.week.start", 1);
  await TestUtils.waitForCondition(() => {
    const x = document.querySelector("#multiweek-view calendar-day-label").weekDay;
    console.log(x);
    return x == 1;
  });

  // Check the view is updated correctly.
  labels = document.querySelectorAll("#multiweek-view calendar-day-label");
  Assert.equal(labels.length, 7);
  Assert.deepEqual(
    Array.from(labels, label => label.weekDay),
    [1, 2, 3, 4, 5, 6, 0],
    "week day column days should have been rearranged"
  );
  Assert.deepEqual(
    Array.from(labels, label => label.firstElementChild.value),
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    "week day column labels should have been updated"
  );
  Assert.deepEqual(
    Array.from(labels, label => label.lastElementChild.value),
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "week day column labels should have been updated"
  );

  // Reset the first day of the week to Thursday.
  Services.prefs.setIntPref("calendar.week.start", 4);
  await TestUtils.waitForTick();

  // Check the view is updated correctly.
  labels = document.querySelectorAll("#multiweek-view calendar-day-label");
  Assert.equal(labels.length, 7);
  Assert.deepEqual(
    Array.from(labels, label => label.weekDay),
    [4, 5, 6, 0, 1, 2, 3],
    "week day column days should have been rearranged"
  );
  Assert.deepEqual(
    Array.from(labels, label => label.firstElementChild.value),
    ["Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday"],
    "week day column labels should have been updated"
  );
  Assert.deepEqual(
    Array.from(labels, label => label.lastElementChild.value),
    ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"],
    "week day column labels should have been updated"
  );

  const expectedTodayColumn = [3, 4, 5, 6, 0, 1, 2][new Date().getUTCDay()];
  for (let i = 0; i < 7; i++) {
    if (i == expectedTodayColumn) {
      Assert.equal(
        labels[i].getAttribute("relation"),
        "today",
        `column ${i} should have the "today" relation`
      );
      Assert.equal(
        labels[i].firstElementChild.getAttribute("relation"),
        "today",
        `column ${i} should have the "today" relation`
      );
      Assert.equal(
        labels[i].lastElementChild.getAttribute("relation"),
        "today",
        `column ${i} should have the "today" relation`
      );
    } else {
      Assert.ok(
        !labels[i].hasAttribute("relation"),
        `column ${i} should not have the "today" relation`
      );
      Assert.ok(
        !labels[i].firstElementChild.hasAttribute("relation"),
        `column ${i} should not have the "today" relation`
      );
      Assert.ok(
        !labels[i].lastElementChild.hasAttribute("relation"),
        `column ${i} should not have the "today" relation`
      );
    }
  }
});

add_task(async function testMultiweekViewWorkDayHighlight() {
  // The test configuration sets Wednesday and Saturday as days off, so they
  // should have the weekend background.
  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToDate(window, 2022, 4, 10);

  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= 7; c++) {
      const isDayOff = [3, 7].includes(c);
      const container = CalendarTestUtils.multiweekView.getDayBox(window, r, c);
      Assert.equal(
        container.classList.contains("calendar-month-day-box-day-off"),
        isDayOff,
        `the day at row ${r}, column ${c} ${isDayOff ? "should" : "should not"} be highlighted as day off`
      );
    }
  }
});

add_task(async function testMultiweekViewNavbar() {
  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToDate(window, 2022, 4, 13);

  const intervalDescription = CalendarTestUtils.getNavBarIntervalDescription(window);
  Assert.ok(
    ["Thursday, April 7 – Wednesday, May 4, 2022", "April 7 – May 4, 2022"].includes(
      intervalDescription.textContent
    ),
    "interval description should contain a description of the displayed weeks"
  );

  await document.l10n.translateRoots();

  // Note that the value here tests calculation of the calendar week based on
  // the starting day of the week; if the calculation built in an assumption of
  // Sunday or Monday as the starting day of the week, we would get a different
  // value here.
  const calendarWeek = CalendarTestUtils.getNavBarCalendarWeekBox(window);
  Assert.equal(
    calendarWeek.textContent,
    "CWs: 14-17",
    "calendar week label should contain the displayed weeks"
  );
});

function checkDisplayedDate(expectedFirst) {
  const displayedDate = CalendarTestUtils.multiweekView.getDayBox(window, 1, 1).date;

  Assert.equal(displayedDate.year, expectedFirst.getUTCFullYear(), "year of first date");
  Assert.equal(displayedDate.month, expectedFirst.getUTCMonth(), "month of first date");
  Assert.equal(displayedDate.day, expectedFirst.getUTCDate(), "day of first date");
}

add_task(async function testMultiweekViewNavigationButtons() {
  await CalendarTestUtils.setCalendarView(window, "multiweek");

  const previousButton = document.getElementById("previousViewButton");
  const todayButton = CalendarTestUtils.getNavBarTodayButton(window);
  const nextButton = document.getElementById("nextViewButton");

  Assert.deepEqual(
    document.l10n.getAttributes(previousButton),
    { id: "calendar-nav-button-prev-tooltip-multiweek", args: null },
    "previous button label should have the right tooltip"
  );
  Assert.deepEqual(
    document.l10n.getAttributes(nextButton),
    { id: "calendar-nav-button-next-tooltip-multiweek", args: null },
    "next button label should have the right tooltip"
  );

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

add_task(async function testMultiweekViewNavigationMenuItems() {
  await CalendarTestUtils.setCalendarView(window, "multiweek");

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
