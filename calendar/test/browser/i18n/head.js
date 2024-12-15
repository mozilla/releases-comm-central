/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals cal getMinimonth */

const { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

const intervalDescription = document.getElementById("intervalDescription");

/**
 * Tests that the week view has the right column labels, and the right columns
 * marked as days off. This test should run before anything else has loaded the
 * week view or changed the selected date.
 *
 * @param {string[]} longDays - The long names of the days of the week, in the
 *   expected language and starting with the expected first day of the week.
 * @param {string[]} shortDays - The short names of the days of the week, in the
 *   expected language and starting with the expected first day of the week.
 * @param {boolean[]} daysOff - Values indicating which days are days off.
 */
async function subtestWeekView(longDays, shortDays, daysOff) {
  await CalendarTestUtils.setCalendarView(window, "week");

  const weekView = document.getElementById("week-view");
  const columns = Array.from(weekView.querySelectorAll(".day-column-container"));
  const headers = columns.map(c => c.querySelector(".day-column-heading"));

  Assert.deepEqual(
    headers.map(h => h.children[0].textContent.split(" ")[0]),
    longDays
  );
  Assert.deepEqual(
    headers.map(h => h.children[1].textContent.split(" ")[0]),
    shortDays
  );
  Assert.deepEqual(
    columns.map(c => c.classList.contains("day-column-weekend")),
    daysOff
  );
}

/**
 * Tests that the multiweek view has the right column labels, and the right
 * columns marked as days off. This test should run before anything else has
 * loaded the multiweek view or changed the selected date.
 *
 * @param {string[]} longDays - The long names of the days of the week, in the
 *   expected language and starting with the expected first day of the week.
 * @param {string[]} shortDays - The short names of the days of the week, in the
 *   expected language and starting with the expected first day of the week.
 * @param {boolean[]} daysOff - Values indicating which days are days off.
 */
async function subtestMultiweekView(longDays, shortDays, daysOff) {
  await CalendarTestUtils.setCalendarView(window, "multiweek");

  const multiweekView = document.getElementById("multiweek-view");
  const table = multiweekView.querySelector("table");
  const headers = Array.from(table.tHead.rows[0].cells, c => c.querySelector("calendar-day-label"));
  const cells = Array.from(table.tBodies[0].rows[0].cells, c =>
    c.querySelector("calendar-month-day-box")
  );

  Assert.deepEqual(
    headers.map(h => h.children[0].value),
    longDays
  );
  Assert.deepEqual(
    headers.map(h => h.children[1].value),
    shortDays
  );
  Assert.deepEqual(
    cells.map(c => c.classList.contains("calendar-month-day-box-day-off")),
    daysOff
  );
}

/**
 * Tests that the month view has the right column labels, and the right columns
 * marked as days off. This test should run before anything else has loaded the
 * month view or changed the selected date.
 *
 * @param {string[]} longDays - The long names of the days of the week, in the
 *   expected language and starting with the expected first day of the week.
 * @param {string[]} shortDays - The short names of the days of the week, in the
 *   expected language and starting with the expected first day of the week.
 * @param {boolean[]} daysOff - Values indicating which days are days off.
 */
async function subtestMonthView(longDays, shortDays, daysOff) {
  await CalendarTestUtils.setCalendarView(window, "month");

  const monthView = document.getElementById("month-view");
  const table = monthView.querySelector("table");
  const headers = Array.from(table.tHead.rows[0].cells, c => c.querySelector("calendar-day-label"));
  const cells = Array.from(table.tBodies[0].rows[0].cells, c =>
    c.querySelector("calendar-month-day-box")
  );

  Assert.deepEqual(
    headers.map(h => h.children[0].value),
    longDays
  );
  Assert.deepEqual(
    headers.map(h => h.children[1].value),
    shortDays
  );
  Assert.deepEqual(
    cells.map(c => c.classList.contains("calendar-month-day-box-day-off")),
    daysOff
  );
}

/**
 * Tests that the minimonth has the right column labels.
 *
 * @param {string[]} narrowDays - The narrow names of the days of the week, in the
 *   expected language and starting with the expected first day of the week.
 */
function subtestMinimonth(narrowDays) {
  const minimonth = getMinimonth();
  const headers = minimonth.querySelectorAll(".minimonth-row-header");

  Assert.deepEqual(
    Array.from(headers, h => h.textContent),
    narrowDays
  );
}

/**
 * Tests the interval description for each view.
 *
 * @param {string} dayText - Description of 2024-10-19 in the expected language.
 * @param {string} weekText - Description of the week containing 2024-10-19 in
 *   the expected language.
 * @param {string} multiweekText - Description of the week containing
 *   2024-10-19 and the following 3 weeks in the expected language.
 * @param {string} monthText - Description of 2024-10 in the expected language.
 */
async function subtestIntervalDescription(dayText, weekText, multiweekText, monthText) {
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2024, 10, 19);
  Assert.equal(intervalDescription.textContent, dayText);

  await CalendarTestUtils.setCalendarView(window, "week");
  Assert.equal(intervalDescription.textContent, weekText);

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  Assert.equal(intervalDescription.textContent, multiweekText);

  await CalendarTestUtils.setCalendarView(window, "month");
  Assert.equal(intervalDescription.textContent, monthText);
}

/**
 * Tests that printing a month grid uses the right month titles and column labels.
 *
 * @param {string[]} shortDays - The short names of the days of the week, in the
 *   expected language and starting with the expected first day of the week.
 * @param {string} monthText - Description of 2024-12 in the expected language.
 * @param {string} monthRangeText - Description of 2024-10 to 2024-12 in the
 *   expected language.
 */
async function subtestPrint(shortDays, monthName, monthRangeText) {
  await CalendarTestUtils.setCalendarView(window, "month");
  const printPromise = TestUtils.topicObserved("subdialog-loaded", win =>
    win.location.href.startsWith("chrome://global/content/print.html")
  );
  goDoCommand("cmd_print");
  const [formWin] = await printPromise;
  const formDoc = formWin.document;

  try {
    const layoutSelect = await TestUtils.waitForCondition(
      () => formDoc.getElementById("layout"),
      "waiting for calendar print form to be added"
    );
    layoutSelect.value = "monthGrid";
    layoutSelect.dispatchEvent(new CustomEvent("change"));

    const fromMonth = formDoc.getElementById("from-month");
    const fromYear = formDoc.getElementById("from-year");
    const toMonth = formDoc.getElementById("to-month");
    const toYear = formDoc.getElementById("to-year");
    fromMonth.value = 11;
    fromYear.value = 2024;
    toMonth.value = 11;
    toYear.value = 2024;
    toYear.dispatchEvent(new CustomEvent("change"));
    await TestUtils.waitForTick();

    const previewDoc =
      formWin.PrintEventHandler.printPreviewEl.querySelector("browser").contentDocument;

    Assert.equal(previewDoc.getElementById("month-container").childElementCount, 1);
    Assert.equal(previewDoc.title, monthName);
    const month = previewDoc.getElementById("month-container").firstElementChild;
    Assert.equal(month.rows[0].cells[0].textContent, monthName);
    Assert.deepEqual(
      Array.from(month.rows[1].cells, c => c.textContent),
      shortDays
    );

    fromMonth.value = 9;
    fromMonth.dispatchEvent(new CustomEvent("change"));
    await TestUtils.waitForTick();

    Assert.equal(previewDoc.getElementById("month-container").childElementCount, 3);
    Assert.equal(previewDoc.title, monthRangeText);
  } finally {
    EventUtils.synthesizeMouseAtCenter(
      formWin.document.querySelector(`button[is="cancel-button"]`),
      {},
      formWin
    );
  }
}
