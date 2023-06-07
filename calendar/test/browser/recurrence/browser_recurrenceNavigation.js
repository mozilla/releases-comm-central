/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const calendar = CalendarTestUtils.createCalendar("Minimonths", "memory");

registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
});

add_task(async function testRecurrenceNavigation() {
  await CalendarTestUtils.setCalendarView(window, "month");

  let eventDate = cal.createDateTime("20200201T000001Z");
  window.goToDate(eventDate);

  let newEventBtn = document.querySelector("#sidePanelNewEvent");
  let getEventWin = CalendarTestUtils.waitForEventDialog("edit");
  EventUtils.synthesizeMouseAtCenter(newEventBtn, {});

  let eventWin = await getEventWin;
  let iframe = eventWin.document.querySelector("iframe");

  let getRepeatWin = BrowserTestUtils.promiseAlertDialogOpen(
    "",
    "chrome://calendar/content/calendar-event-dialog-recurrence.xhtml",
    {
      async callback(win) {
        let container = await TestUtils.waitForCondition(() => {
          return win.document.querySelector("#recurrencePreviewContainer");
        }, `The recurrence container exists`);

        let initialMonth = await TestUtils.waitForCondition(() => {
          return container.querySelector(`calendar-minimonth[month="1"][year="2020"]`);
        }, `Initial month exists`);
        Assert.ok(!initialMonth.hidden, `Initial month is visible on load`);

        let nextButton = container.querySelector("#recurrenceNext");
        Assert.ok(nextButton, `Next button exists`);
        nextButton.scrollIntoView();
        EventUtils.synthesizeMouseAtCenter(nextButton, {}, win);

        let nextMonth = container.querySelector(`calendar-minimonth[month="2"][year="2020"]`);
        Assert.ok(nextMonth, `Next month exists`);
        Assert.ok(!nextMonth.hidden, `Next month is visible`);

        let previousButton = container.querySelector("#recurrencePrevious");
        Assert.ok(previousButton, `Previous button exists`);
        previousButton.scrollIntoView();
        EventUtils.synthesizeMouseAtCenter(previousButton, {}, win);
        Assert.ok(!initialMonth.hidden, `Previous month is visible after using previous button`);

        // Check that future dates display
        nextButton.scrollIntoView();
        for (let index = 0; index < 5; index++) {
          EventUtils.synthesizeMouseAtCenter(nextButton, {}, win);
        }

        let futureMonth = await TestUtils.waitForCondition(() => {
          return container.querySelector(`calendar-minimonth[month="6"][year="2020"]`);
        }, `Future month exist`);
        Assert.ok(!futureMonth.hidden, `Future month is visible after using next button`);

        // Ensure the number of minimonths shown is the amount we expect.
        let defaultMinimonthCount = "3";
        let actualVisibleMinimonthCount = container.querySelectorAll(
          `calendar-minimonth:not([hidden])`
        ).length;
        Assert.equal(
          defaultMinimonthCount,
          actualVisibleMinimonthCount,
          `Default minimonth visible count matches actual: ${actualVisibleMinimonthCount}`
        );

        // Go back 5 times; we should go back to the initial month.
        for (let index = 0; index < 5; index++) {
          EventUtils.synthesizeMouseAtCenter(previousButton, {}, win);
        }
        Assert.ok(!initialMonth.hidden, `Initial month is visible`);

        // Close window at end of tests for this item
        await BrowserTestUtils.closeWindow(win);
      },
    }
  );

  let repeatMenu = iframe.contentDocument.querySelector("#item-repeat");
  repeatMenu.value = "custom";
  repeatMenu.doCommand();
  await getRepeatWin;

  await BrowserTestUtils.closeWindow(eventWin);
});

add_task(async function testRecurrenceCreationOfMonths() {
  await CalendarTestUtils.setCalendarView(window, "month");

  let eventDate = cal.createDateTime("20200101T000001Z");
  window.goToDate(eventDate);

  let newEventBtn = document.querySelector("#sidePanelNewEvent");
  let getEventWin = CalendarTestUtils.waitForEventDialog("edit");
  EventUtils.synthesizeMouseAtCenter(newEventBtn, {});

  let eventWin = await getEventWin;
  let iframe = eventWin.document.querySelector("iframe");

  let getRepeatWin = BrowserTestUtils.promiseAlertDialogOpen(
    "",
    "chrome://calendar/content/calendar-event-dialog-recurrence.xhtml",
    {
      async callback(win) {
        let container = win.document.querySelector("#recurrencePreviewContainer");
        let nextButton = container.querySelector("#recurrenceNext");
        nextButton.scrollIntoView();
        for (let index = 0; index < 10; index++) {
          EventUtils.synthesizeMouseAtCenter(nextButton, {}, win);
        }

        let futureMonth = container.querySelector(`calendar-minimonth[month="10"][year="2020"]`);
        Assert.ok(futureMonth, `Dynamically created future month exists`);
        Assert.ok(!futureMonth.hidden, `Dynamically created future month is visible`);

        // Close window at end of tests for this item
        await BrowserTestUtils.closeWindow(win);
      },
    }
  );

  let repeatMenu = iframe.contentDocument.querySelector("#item-repeat");
  repeatMenu.value = "custom";
  repeatMenu.doCommand();
  await getRepeatWin;

  await BrowserTestUtils.closeWindow(eventWin);
});
