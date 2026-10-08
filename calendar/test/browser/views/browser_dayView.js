/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { formatDate, formatTime, saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");

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

add_task(async function testDayViewManyAllDayItems() {
  const calendar = CalendarTestUtils.createCalendar("Many Items", "memory");
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  const addEvent = (title, start = "20090101") => {
    const event = new CalEvent();
    event.title = title;
    event.startDate = cal.createDateTime(start);
    event.endDate = cal.createDateTime("20090102");
    return calendar.addItem(event);
  };
  const titles = (from, to) =>
    Array.from({ length: to - from + 1 }, (_, i) => `Event ${String(from + i).padStart(2, "0")}`);

  const items = [];
  for (let i = 1; i <= 60; i++) {
    items.push(await addEvent(titles(i, i)[0]));
  }

  const header = CalendarTestUtils.dayView.getAllDayHeader(window);
  const moreButton = header.querySelector(".calendar-item-list-more-button");
  const getTitles = () =>
    Array.from(header.querySelectorAll("calendar-editable-item"), box => box.occurrence.title);

  await TestUtils.waitForCondition(() => getTitles().length == 50, "first batch should render");
  Assert.deepEqual(getTitles(), titles(1, 50), "only the first 50 items should be rendered");
  Assert.ok(BrowserTestUtils.isVisible(moreButton), "more button should be visible");
  await TestUtils.waitForCondition(
    () => moreButton.textContent == "… and 10 more",
    "more button should count the hidden items"
  );

  info("adding an item that sorts first");
  await addEvent("Early", "20081231");
  await TestUtils.waitForCondition(() => getTitles()[0] == "Early", "new item should render");
  Assert.deepEqual(
    getTitles(),
    ["Early", ...titles(1, 49)],
    "the last rendered item should be pushed out"
  );

  info("deleting a rendered item");
  await calendar.deleteItem(items[0]);
  await TestUtils.waitForCondition(
    () => getTitles()[1] == "Event 02",
    "deleted item should be removed"
  );
  Assert.deepEqual(
    getTitles(),
    ["Early", ...titles(2, 50)],
    "the first hidden item should be rendered"
  );
  await TestUtils.waitForCondition(
    () => moreButton.textContent == "… and 10 more",
    "more button should no longer count the rendered item"
  );

  info("selecting an item that is not rendered");
  const dayView = document.getElementById("day-view");
  dayView.setSelectedItems([items[54]]);
  Assert.deepEqual(getTitles(), ["Early", ...titles(2, 60)], "all items should be rendered");
  Assert.ok(
    [...header.querySelectorAll("calendar-editable-item")].find(
      box => box.occurrence.title == "Event 55"
    ).selected,
    "the selected item should be rendered as selected"
  );
  Assert.ok(BrowserTestUtils.isHidden(moreButton), "more button should be hidden");
  dayView.setSelectedItems([]);

  info("removing the calendar");
  CalendarTestUtils.removeCalendar(calendar);
  await TestUtils.waitForCondition(() => getTitles().length == 0, "items should be removed");
  Assert.ok(BrowserTestUtils.isHidden(moreButton), "more button should stay hidden");
});

add_task(async function testDayViewManyOverlappingItems() {
  const calendar = CalendarTestUtils.createCalendar("Many Items", "memory");
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  const addEvent = (title, start = "20090101T100000Z", end = "20090101T110000Z") => {
    const event = new CalEvent();
    event.title = title;
    event.startDate = cal.createDateTime(start);
    event.endDate = cal.createDateTime(end);
    return calendar.addItem(event);
  };
  const titles = (from, to) =>
    Array.from({ length: to - from + 1 }, (_, i) => `Event ${String(from + i).padStart(2, "0")}`);

  await addEvent("Early", "20090101T080000Z", "20090101T090000Z");
  const items = [];
  for (let i = 1; i <= 12; i++) {
    items.push(await addEvent(titles(i, i)[0]));
  }

  const column = document.getElementById("day-view").dayColumns[0].column;
  const getTitles = () =>
    Array.from(CalendarTestUtils.dayView.getEventBoxes(window), box => box.occurrence.title);
  const getOverflowTexts = () =>
    Array.from(column.querySelectorAll(".multiday-events-overflow-item"), el => el.textContent);

  await TestUtils.waitForCondition(
    () => getOverflowTexts()[0] == "… and 5 more",
    "overflow indicator should count the events not shown"
  );
  Assert.deepEqual(
    getTitles(),
    ["Early", ...titles(1, 7)],
    "only the events fitting in the lanes should be shown"
  );
  Assert.equal(
    CalendarTestUtils.dayView.getEventBoxAt(window, 1).parentNode.style.width,
    "100%",
    "an event not overlapping others should use the full width"
  );

  info("deleting a shown event");
  await calendar.deleteItem(items[0]);
  await TestUtils.waitForCondition(
    () => getOverflowTexts()[0] == "… and 4 more",
    "overflow indicator should update"
  );
  Assert.deepEqual(
    getTitles(),
    ["Early", ...titles(2, 8)],
    "an event not shown before should be shown"
  );

  info("deleting events until all fit");
  for (const item of items.slice(1, 4)) {
    await calendar.deleteItem(item);
  }
  await TestUtils.waitForCondition(() => getTitles().length == 9, "all events should be shown");
  Assert.deepEqual(getTitles(), ["Early", ...titles(5, 12)], "all events should be shown");
  Assert.deepEqual(getOverflowTexts(), [], "there should be no overflow indicator");

  info("removing the calendar");
  CalendarTestUtils.removeCalendar(calendar);
  await TestUtils.waitForCondition(() => getTitles().length == 0, "events should be removed");
});

add_task(async function testDayViewOverflowClusters() {
  const calendar = CalendarTestUtils.createCalendar("Many Items", "memory");
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  const addEvent = (title, start, end) => {
    const event = new CalEvent();
    event.title = title;
    event.startDate = cal.createDateTime(`20090101T${start}00Z`);
    event.endDate = cal.createDateTime(`20090101T${end}00Z`);
    return calendar.addItem(event);
  };

  // All these events are linked by the long event, but only the late events
  // need more lanes than there are.
  await addEvent("Long", "0800", "1600");
  for (let i = 1; i <= 7; i++) {
    await addEvent(`Early ${i}`, "0800", "0830");
  }
  for (let i = 1; i <= 8; i++) {
    await addEvent(`Late ${i}`, "1400", "1500");
  }

  const column = document.getElementById("day-view").dayColumns[0].column;
  const getTitles = () =>
    Array.from(CalendarTestUtils.dayView.getEventBoxes(window), box => box.occurrence.title);
  const getOverflowElements = () => [...column.querySelectorAll(".multiday-events-overflow-item")];

  await TestUtils.waitForCondition(
    () => getOverflowElements()[0]?.textContent == "… and 2 more",
    "overflow indicator should count the late events not shown"
  );
  Assert.equal(getOverflowElements().length, 1, "there should be one overflow indicator");
  const titles = getTitles();
  Assert.ok(titles.includes("Early 7"), "the early event in the last lane should be shown");
  Assert.ok(!titles.includes("Late 7"), "the late event in the last lane should not be shown");
  Assert.equal(titles.length, 14, "all other events should be shown");
  const lateBox = [...CalendarTestUtils.dayView.getEventBoxes(window)].find(
    box => box.occurrence.title == "Late 1"
  );
  Assert.equal(
    getOverflowElements()[0].style.insetBlockStart,
    lateBox.parentNode.style.insetBlockStart,
    "the overflow indicator should start with the late events"
  );
  Assert.equal(
    getOverflowElements()[0].style.height,
    lateBox.parentNode.style.height,
    "the overflow indicator should end with the late events"
  );

  info("a new event that is not shown should open in the dialog");
  const dialogPromise = CalendarTestUtils.waitForEventDialog("edit");
  column.newEventNeedsEditing = true;
  await addEvent("New", "1400", "1500");
  const dialogWindow = await dialogPromise;
  const iframe = dialogWindow.document.querySelector("#calendar-item-panel-iframe");
  await TestUtils.waitForCondition(
    () => iframe.contentDocument?.querySelector("#item-title")?.value == "New",
    "the dialog should edit the new event"
  );
  const dialogClosed = BrowserTestUtils.domWindowClosed(dialogWindow);
  CalendarTestUtils.items.cancelItemDialog(dialogWindow);
  await dialogClosed;

  CalendarTestUtils.removeCalendar(calendar);
  await TestUtils.waitForCondition(() => getTitles().length == 0, "events should be removed");
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
    "the displayed date should not be highlighted as the current day"
  );

  // When displaying the current day, it should be highlighted.
  await CalendarTestUtils.goToToday(window);

  container = CalendarTestUtils.dayView.getColumnContainer(window);
  Assert.ok(
    container.classList.contains("day-column-today"),
    "the displayed date should be highlighted as the current day"
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
    "the displayed date should be not be highlighted as a day off"
  );

  await CalendarTestUtils.goToDate(window, 2022, 4, 13);

  container = CalendarTestUtils.dayView.getColumnContainer(window);
  Assert.ok(
    container.classList.contains("day-column-weekend"),
    "the displayed date should be highlighted as a day off"
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

  Assert.deepEqual(
    document.l10n.getAttributes(previousButton),
    { id: "calendar-nav-button-prev-tooltip-day", args: null },
    "previous button label should have the right tooltip"
  );
  Assert.deepEqual(
    document.l10n.getAttributes(nextButton),
    { id: "calendar-nav-button-next-tooltip-day", args: null },
    "next button label should have the right tooltip"
  );

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
