/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalDAVServer } = ChromeUtils.import("resource://testing-common/CalDAVServer.jsm");

CalDAVServer.open("bob", "bob");
if (!Services.logins.findLogins(CalDAVServer.origin, null, "test").length) {
  // Save a username and password to the login manager.
  let loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  loginInfo.init(CalDAVServer.origin, null, "test", "bob", "bob", "", "");
  Services.logins.addLogin(loginInfo);
}

let calendar;
add_task(async function setUp() {
  calendarObserver._onLoadPromise = PromiseUtils.defer();
  calendar = createCalendar("caldav", CalDAVServer.url, false);
  // This calendar doesn't seem to wake up until something calls finalizeUpdatedItems.
  // I'm not sure why that is, but for now just wake it up directly.
  calendar.wrappedJSObject.finalizeUpdatedItems(null, calendar.wrappedJSObject.makeUri());
  await calendarObserver._onLoadPromise.promise;
  info("calendar set-up complete");

  registerCleanupFunction(async () => {
    await CalDAVServer.close();
    Services.logins.removeAllLogins();
    removeCalendar(calendar);
  });
});

add_task(async function testAlarms() {
  calendarObserver._batchRequired = true;
  return runTestAlarms(calendar);
});
