/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ICSServer } = ChromeUtils.import("resource://testing-common/ICSServer.jsm");

ICSServer.open("bob", "bob");
if (!Services.logins.findLogins(ICSServer.origin, null, "test").length) {
  // Save a username and password to the login manager.
  let loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  loginInfo.init(ICSServer.origin, null, "test", "bob", "bob", "", "");
  Services.logins.addLogin(loginInfo);
}

add_task(async function() {
  calendarObserver._onLoadPromise = PromiseUtils.defer();
  let calendar = createCalendar("ics", ICSServer.url, false);
  await calendarObserver._onLoadPromise.promise;
  info("calendar set-up complete");

  registerCleanupFunction(async () => {
    await ICSServer.close();
    Services.logins.removeAllLogins();
    removeCalendar(calendar);
  });

  return testAlarms(calendar);
});
