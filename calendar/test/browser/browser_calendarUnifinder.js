/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.sys.mjs",
});

/**
 * Tests clicking on events opens in the summary dialog for both
 * non-recurring and recurring events.
 */
add_task(async function testOpenEvent() {
  const uri = Services.io.newURI("moz-memory-calendar://");
  const calendar = cal.manager.createCalendar("memory", uri);

  calendar.name = "Unifinder Test";
  cal.manager.registerCalendar(calendar);
  registerCleanupFunction(() => cal.manager.removeCalendar(calendar));

  const now = cal.dtz.now();

  const noRepeatEvent = new CalEvent();
  noRepeatEvent.id = "no repeat event";
  noRepeatEvent.title = "No Repeat Event";
  noRepeatEvent.startDate = now;
  noRepeatEvent.endDate = noRepeatEvent.startDate.clone();
  noRepeatEvent.endDate.hour++;

  const repeatEvent = new CalEvent();
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

  function isUnifinderHidden() {
    const tabmail = window.document.getElementById("tabmail");

    return (
      tabmail.currentTabInfo?.mode.type != "calendar" ||
      window.document.getElementById("bottom-events-box").hidden
    );
  }

  if (isUnifinderHidden()) {
    window.toggleUnifinder();

    await BrowserTestUtils.waitForCondition(
      () => isUnifinderHidden(),
      "calendar unifinder should have opened"
    );
  }

  for (const event of [noRepeatEvent, repeatEvent]) {
    await calendar.addItem(event);

    const dialogWindowPromise = CalendarTestUtils.waitForEventDialog();
    const tree = document.querySelector("#unifinder-search-results-tree");
    mailTestUtils.treeClick(EventUtils, window, tree, 0, 1, { clickCount: 2 });

    const dialogWindow = await dialogWindowPromise;
    const docUri = dialogWindow.document.documentURI;
    Assert.ok(
      docUri === "chrome://calendar/content/calendar-summary-dialog.xhtml",
      "event summary dialog should have opened"
    );

    await BrowserTestUtils.closeWindow(dialogWindow);
    await calendar.deleteItem(event);
  }
});
