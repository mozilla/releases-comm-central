/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the replace of alerts service with our own. This will let us check if we're
 * prompting or not.
 */

var { alertHook } = ChromeUtils.importESModule(
  "resource:///modules/activity/alertHook.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MockAlertsService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockAlertsService.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

alertHook.init();

// Wait time of 1s for slow debug builds.
const TEST_WAITTIME = 1000;

var gMsgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);
var cid;
var mailnewsURL;

add_setup(function () {
  MockAlertsService.init();
  // A random URL.
  MailServices.accounts.createIncomingServer("", "localhost", "nntp");
  const uri = Services.io.newURI("news://localhost/1@regular.invalid");
  mailnewsURL = uri.QueryInterface(Ci.nsIMsgMailNewsUrl);

  registerCleanupFunction(() => {
    MockAlertsService.cleanup();
  });
});

add_task(async function test_not_shown_to_user_silent() {
  const alertPromise = MockAlertsService.promiseShown();
  // Just text, silent = true => expect no error shown to user
  MailServices.mailSession.alertUser("test error", mailnewsURL, true);
  await Promise.race([
    PromiseTestUtils.promiseDelay(TEST_WAITTIME).then(() => {
      Assert.ok(true, "Alert is not shown when it should be silent");
    }),
    alertPromise.then(() => {
      throw new Error("Alert is shown to the user when it should be silent");
    }),
  ]);
  MockAlertsService.reset();
});

add_task(async function test_shown_to_user() {
  // Reset promise state.
  const alertPromise = MockAlertsService.promiseShown();

  // Text, silent = false => expect error shown to user
  MailServices.mailSession.alertUser("test error 2", mailnewsURL, false);
  await alertPromise;
  Assert.ok(MockAlertsService.alert);
  MockAlertsService.reset();
});
