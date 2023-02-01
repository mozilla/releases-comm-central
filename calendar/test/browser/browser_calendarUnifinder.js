/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.jsm",
});

/**
 * Tests clicking on events opens in the summary dialog for both
 * non-recurring and recurring events.
 */
add_task(async function testOpenEvent() {
  let uri = Services.io.newURI("moz-memory-calendar://");
  let calendar = cal.manager.createCalendar("memory", uri);

  calendar.name = "Unifinder Test";
  cal.manager.registerCalendar(calendar);
  registerCleanupFunction(() => cal.manager.removeCalendar(calendar));

  let now = cal.dtz.now();

  let noRepeatEvent = new CalEvent();
  noRepeatEvent.id = "no repeat event";
  noRepeatEvent.title = "No Repeat Event";
  noRepeatEvent.startDate = now;
  noRepeatEvent.endDate = noRepeatEvent.startDate.clone();
  noRepeatEvent.endDate.hour++;

  let repeatEvent = new CalEvent();
  repeatEvent.id = "repeated event";
  repeatEvent.title = "Repeat Event";
  repeatEvent.startDate = now;
  repeatEvent.endDate = noRepeatEvent.startDate.clone();
  repeatEvent.endDate.hour++;
  repeatEvent.recurrenceInfo = new CalRecurrenceInfo(repeatEvent);
  repeatEvent.recurrenceInfo.appendRecurrenceItem(
    cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=30")
  );

  await CalendarTestUtils.openCalendarTab(window);

  if (window.isUnifinderHidden()) {
    window.toggleUnifinder();

    await BrowserTestUtils.waitForCondition(
      () => window.isUnifinderHidden(),
      "calendar unifinder is open"
    );
  }

  for (let event of [noRepeatEvent, repeatEvent]) {
    await calendar.addItem(event);

    let dialogWindowPromise = CalendarTestUtils.waitForEventDialog();
    let tree = document.querySelector("#unifinder-search-results-tree");
    mailTestUtils.treeClick(EventUtils, window, tree, 0, 1, { clickCount: 2 });

    let dialogWindow = await dialogWindowPromise;
    let docUri = dialogWindow.document.documentURI;
    Assert.ok(
      docUri === "chrome://calendar/content/calendar-summary-dialog.xhtml",
      "event summary dialog did show"
    );

    await BrowserTestUtils.closeWindow(dialogWindow);
    await calendar.deleteItem(event);
  }
});
