/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource:///modules/activity/alertHook.js");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://testing-common/mailnews/MockFactory.js");
alertHook.init();

// Replace the alerts service with our own. This will let us check if we're
// prompting or not.
var gAlertShown = false;

var mockAlertsService = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAlertsService]),

  showAlertNotification: function(imageUrl, title, text, textClickable, cookie,
                                  alertListener, name) {
    gAlertShown = true;
  }
};

var gMsgWindow = {};

var mailnewsURL = {
  get msgWindow() {
    if (gMsgWindow)
      return gMsgWindow;

    throw Cr.NS_ERROR_INVALID_POINTER;
  }
};

function run_test() {
  // First register the mock alerts service
  let uuid = MockFactory.register("@mozilla.org/alerts-service;1", mockAlertsService);
  do_register_cleanup(function() {
    MockFactory.unregister(uuid);
  });

  // Just text, no url or window => expect no error shown to user
  gAlertShown = false;
  MailServices.mailSession.alertUser("test error");
  do_check_false(gAlertShown);

  // Text, url and window => expect error shown to user
  gAlertShown = false;
  MailServices.mailSession.alertUser("test error 2", mailnewsURL);
  do_check_true(gAlertShown);

  // Text, url and no window => export no error shown to user
  gAlertShown = false;
  gMsgWindow = null;
  MailServices.mailSession.alertUser("test error 2", mailnewsURL);
  do_check_false(gAlertShown);

  // XXX There appears to be a shutdown leak within the activity manager when
  // unless it is cleaned up, however as it is only shutdown, it doesn't really
  // matter, so we'll just ignore it here.
  Cc["@mozilla.org/activity-manager;1"]
    .getService(Ci.nsIActivityManager)
    .cleanUp();
}
