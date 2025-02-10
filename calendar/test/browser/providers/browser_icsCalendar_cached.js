/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ICSServer } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ICSServer.sys.mjs"
);

ICSServer.open("bob", "bob");

let calendar;
add_setup(async function () {
  if (!Services.logins.findLogins(ICSServer.origin, null, "test").length) {
    // Save a username and password to the login manager.
    const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
    loginInfo.init(ICSServer.origin, null, "test", "bob", "bob", "", "");
    await Services.logins.addLoginAsync(loginInfo);
  }
  // TODO: item notifications from a cached ICS calendar occur outside of batches.
  // This isn't fatal but it shouldn't happen. Side-effects include alarms firing
  // twice - once from onAddItem then again at onLoad.
  //
  // Remove the next line when this is fixed.
  calendarObserver._batchRequired = false;

  calendarObserver._onLoadPromise = Promise.withResolvers();
  calendar = createCalendar("ics", ICSServer.url, true);
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
      calendar.wrappedJSObject.mUncachedCalendar.wrappedJSObject._queue.length == 0 &&
      calendar.wrappedJSObject.mUncachedCalendar.wrappedJSObject._isLocked === false
  );
}

add_task(async function testAlarms() {
  // Remove the next line when fixed.
  calendarObserver._batchRequired = false;
  await runTestAlarms(calendar);

  // Be sure the calendar has finished deleting the event.
  await promiseIdle();
}).skip(); // Broken.

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

  // Be sure the calendar has finished deleting the event.
  await promiseIdle();
});
