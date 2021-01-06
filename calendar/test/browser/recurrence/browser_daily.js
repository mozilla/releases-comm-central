/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  CANVAS_BOX,
  EVENTPATH,
  EVENT_BOX,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
  handleOccurrencePrompt,
  helpersForController,
  invokeNewEventDialog,
  invokeEditingRepeatEventDialog,
  menulistSelect,
  switchToView,
  viewBack,
  viewForward,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { setData } = ChromeUtils.import("resource://testing-common/mozmill/ItemEditingHelpers.jsm");

var { lookupEventBox } = helpersForController(controller);

const HOUR = 8;
const TITLE = "Event";

add_task(async function testDailyRecurrence() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 1);

  // Create daily event.
  let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
  await invokeNewEventDialog(controller, eventBox, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    await setData(event, iframe, {
      title: TITLE,
      repeat: "daily",
      repeatuntil: cal.createDateTime("20090320T000000Z"),
    });
    event.click(eventid("button-saveandclose"));
  });

  // Check day view for 7 days.
  let daybox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  controller.waitForElement(daybox);

  for (let day = 1; day <= 7; day++) {
    controller.waitForElement(daybox);
    viewForward(controller, 1);
  }

  // Check week view for 2 weeks.
  switchToView(controller, "week");
  goToDate(controller, 2009, 1, 1);

  for (let day = 5; day <= 7; day++) {
    controller.waitForElement(lookupEventBox("week", EVENT_BOX, 1, day, null, EVENTPATH));
  }

  viewForward(controller, 1);

  for (let day = 1; day <= 7; day++) {
    controller.waitForElement(lookupEventBox("week", EVENT_BOX, 2, day, null, EVENTPATH));
  }

  // Check multiweek view for 4 weeks.
  switchToView(controller, "multiweek");
  goToDate(controller, 2009, 1, 1);

  for (let day = 5; day <= 7; day++) {
    controller.waitForElement(lookupEventBox("multiweek", CANVAS_BOX, 1, day, null, EVENTPATH));
  }

  for (let week = 2; week <= 4; week++) {
    for (let day = 1; day <= 7; day++) {
      controller.waitForElement(
        lookupEventBox("multiweek", CANVAS_BOX, week, day, null, EVENTPATH)
      );
    }
  }
  // Check month view for all 5 weeks.
  switchToView(controller, "month");
  goToDate(controller, 2009, 1, 1);

  for (let day = 5; day <= 7; day++) {
    controller.waitForElement(lookupEventBox("month", CANVAS_BOX, 1, day, null, EVENTPATH));
  }

  for (let week = 2; week <= 5; week++) {
    for (let day = 1; day <= 7; day++) {
      Assert.ok(lookupEventBox("month", CANVAS_BOX, week, day, null, EVENTPATH).exists());
    }
  }

  // Delete 3rd January occurrence.
  let saturday = lookupEventBox("month", CANVAS_BOX, 1, 7, null, EVENTPATH);
  controller.click(saturday);
  handleOccurrencePrompt(controller, saturday, "delete", false);

  // Verify in all views.
  controller.waitForElementNotPresent(saturday);

  switchToView(controller, "multiweek");
  Assert.ok(!lookupEventBox("multiweek", CANVAS_BOX, 1, 7, null, EVENTPATH).exists());

  switchToView(controller, "week");
  Assert.ok(!lookupEventBox("week", EVENT_BOX, null, 7, null, EVENTPATH).exists());

  switchToView(controller, "day");
  Assert.ok(!lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH).exists());

  // Go to previous day to edit event to occur only on weekdays.
  viewBack(controller, 1);

  eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  await invokeEditingRepeatEventDialog(
    controller,
    eventBox,
    event => {
      let { eid: eventid, sleep: eventsleep } = helpersForController(event);

      menulistSelect(eventid("item-repeat"), "every.weekday", event);
      eventsleep();
      event.click(eventid("button-saveandclose"));
    },
    true
  );

  // Check day view for 7 days.
  let day = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  let dates = [
    [2009, 1, 3],
    [2009, 1, 4],
  ];
  for (let [y, m, d] of dates) {
    goToDate(controller, y, m, d);
    Assert.ok(!day.exists());
  }

  // Check week view for 2 weeks.
  switchToView(controller, "week");
  goToDate(controller, 2009, 1, 1);

  for (let i = 0; i <= 1; i++) {
    controller.waitForElementNotPresent(
      lookupEventBox("week", EVENT_BOX, null, 1, null, EVENTPATH)
    );
    Assert.ok(!lookupEventBox("week", EVENT_BOX, null, 7, null, EVENTPATH).exists());
    viewForward(controller, 1);
  }

  // Check multiweek view for 4 weeks.
  switchToView(controller, "multiweek");
  goToDate(controller, 2009, 1, 1);

  for (let i = 1; i <= 4; i++) {
    controller.waitForElementNotPresent(
      lookupEventBox("multiweek", CANVAS_BOX, i, 1, null, EVENTPATH)
    );
    Assert.ok(!lookupEventBox("multiweek", CANVAS_BOX, i, 7, null, EVENTPATH).exists());
  }

  // Check month view for all 5 weeks.
  switchToView(controller, "month");
  goToDate(controller, 2009, 1, 1);

  for (let i = 1; i <= 5; i++) {
    controller.waitForElementNotPresent(lookupEventBox("month", CANVAS_BOX, i, 1, null, EVENTPATH));
    Assert.ok(!lookupEventBox("month", CANVAS_BOX, i, 7, null, EVENTPATH).exists());
  }

  // Delete event.
  day = lookupEventBox("month", CANVAS_BOX, 1, 5, null, EVENTPATH);
  controller.click(day);
  handleOccurrencePrompt(controller, day, "delete", true);
  controller.waitForElementNotPresent(day);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
