/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ICSServer } = ChromeUtils.import("resource://testing-common/calendar/ICSServer.jsm");

ICSServer.open("bob", "bob");

let calendar;
add_setup(async function () {
  if (!Services.logins.findLogins(ICSServer.origin, null, "test").length) {
    // Save a username and password to the login manager.
    const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
    loginInfo.init(ICSServer.origin, null, "test", "bob", "bob", "", "");
    await Services.logins.addLoginAsync(loginInfo);
  }
  calendarObserver._onLoadPromise = Promise.withResolvers();
  calendar = createCalendar("ics", ICSServer.url, false);
  await calendarObserver._onLoadPromise.promise;
  info("calendar set-up complete");

  registerCleanupFunction(async () => {
    await ICSServer.close();
    Services.logins.removeAllLogins();
    removeCalendar(calendar);
  });
});

async function promiseIdle() {
  await TestUtils.waitForCondition(
    () =>
      calendar.wrappedJSObject._queue.length == 0 && calendar.wrappedJSObject._isLocked === false
  );
  await fetch(`${ICSServer.origin}/ping`);
}

add_task(async function testAlarms() {
  calendarObserver._batchRequired = true;
  await runTestAlarms(calendar);

  // Be sure the calendar has finished deleting the event.
  await promiseIdle();
});

add_task(async function testSyncChanges() {
  await syncChangesTest.setUp();

  await ICSServer.putICSInternal(syncChangesTest.part1Item);
  await syncChangesTest.runPart1();

  await ICSServer.putICSInternal(syncChangesTest.part2Item);
  await syncChangesTest.runPart2();

  await ICSServer.putICSInternal(
    CalendarTestUtils.dedent`
      BEGIN:VCALENDAR
      END:VCALENDAR
      `
  );
  await syncChangesTest.runPart3();

  // Be sure the calendar has finished all requests.
  await promiseIdle();
});
