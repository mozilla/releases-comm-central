/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MockAlertsService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockAlertsService.sys.mjs"
);
var CalAlarmMonitor = Cc["@mozilla.org/calendar/alarm-monitor;1"].getService(
  Ci.calIAlarmServiceObserver
);

add_task(async function () {
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
    MockAlertsService.reset();
  });

  const event = new CalEvent();
  event.title = "Notify me!";
  event.startDate = cal.dtz.now();
  event.endDate = cal.dtz.now();
  event.endDate.hour++;
  calendar.addItem(event);

  MockAlertsService.init();
  const shownPromise = MockAlertsService.promiseShown();

  // Fire the notification. Do this directly in CalAlarmMonitor instead of
  // relying on timers which can be unreliable in tests.
  CalAlarmMonitor.onNotification(event);

  await shownPromise;
  Assert.equal(
    MockAlertsService.alert.imageURL,
    AppConstants.platform == "macosx" ? "" : "chrome://branding/content/icon48.png"
  );
  Assert.equal(
    MockAlertsService.alert.title,
    "Notify me!",
    "the alert title should be the event title"
  );

  const dialogPromise = CalendarTestUtils.waitForEventDialog();

  // Click on the notification. An item summary dialog should show.
  MockAlertsService.listener.observe(null, "alertclickcallback", "");
  MockAlertsService.listener.observe(null, "alertfinished", "");

  const dialog = await dialogPromise;
  Assert.equal(
    dialog.document.querySelector(".item-title").textContent,
    "Notify me!",
    "the summary dialog should show the event"
  );
  await BrowserTestUtils.closeWindow(dialog);
});
