/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* Provides methods to make sure our test shuts down mailnews properly. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);

// Notifies everyone that the we're shutting down. This is needed to make sure
// that e.g. the account manager closes and cleans up correctly. It is semi-fake
// because we don't actually do any work to make sure the profile goes away, but
// it will mimic the behaviour in the app sufficiently.
//
// See also http://developer.mozilla.org/en/Observer_Notifications
function postShutdownNotifications() {
  // first give everyone a heads up about us shutting down. if someone wants
  // to cancel this, our test should fail.
  var cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");
  if (cancelQuit.data) {
    do_throw("Cannot shutdown: Someone cancelled the quit request!");
  }

  // post all notifications in the right order. none of these are cancellable
  var notifications = [
    "quit-application",
    "profile-change-net-teardown",
    "profile-change-teardown",
    "profile-before-change",
  ];
  notifications.forEach(function(notification) {
    Services.obs.notifyObservers(null, notification);
  });

  // finally, the xpcom-shutdown notification is handled by XPCOM itself.
}

MockRegistrar.unregisterAll();

// First do a gc to let anything not being referenced be cleaned up.
gc();

// Now shut everything down.
postShutdownNotifications();
