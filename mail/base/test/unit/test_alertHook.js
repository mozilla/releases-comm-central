/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { alertHook } = ChromeUtils.import(
  "resource:///modules/activity/alertHook.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);
alertHook.init();

// Replace the alerts service with our own. This will let us check if we're
// prompting or not.
var gAlertShown = false;

var mockAlertsService = {
  QueryInterface: ChromeUtils.generateQI(["nsIAlertsService"]),

  showAlertNotification(
    imageUrl,
    title,
    text,
    textClickable,
    cookie,
    alertListener,
    name
  ) {
    gAlertShown = true;
  },
};

var gMsgWindow = {};

var mailnewsURL = {
  get msgWindow() {
    if (gMsgWindow) {
      return gMsgWindow;
    }

    throw Components.Exception("", Cr.NS_ERROR_INVALID_POINTER);
  },
};

function run_test() {
  // First register the mock alerts service
  let cid = MockRegistrar.register(
    "@mozilla.org/alerts-service;1",
    mockAlertsService
  );
  registerCleanupFunction(function() {
    MockRegistrar.unregister(cid);
  });

  // Just text, no url or window => expect no error shown to user
  gAlertShown = false;
  MailServices.mailSession.alertUser("test error");
  Assert.ok(!gAlertShown);

  // Text, url and window => expect error shown to user
  gAlertShown = false;
  MailServices.mailSession.alertUser("test error 2", mailnewsURL);
  Assert.ok(gAlertShown);

  // Text, url and no window => export no error shown to user
  gAlertShown = false;
  gMsgWindow = null;
  MailServices.mailSession.alertUser("test error 2", mailnewsURL);
  Assert.ok(!gAlertShown);

  // XXX There appears to be a shutdown leak within the activity manager when
  // unless it is cleaned up, however as it is only shutdown, it doesn't really
  // matter, so we'll just ignore it here.
  Cc["@mozilla.org/activity-manager;1"]
    .getService(Ci.nsIActivityManager)
    .cleanUp();
}
