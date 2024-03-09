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
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
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
var mockAlertsService;
var cid;
var mailnewsURL;

add_setup(function () {
  // First register the mock alerts service.
  mockAlertsService = new MockAlertsService();
  cid = MockRegistrar.register(
    "@mozilla.org/alerts-service;1",
    mockAlertsService
  );
  // A random URL.
  const uri = Services.io.newURI("news://localhost:80/1@regular.invalid");
  mailnewsURL = uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
});

add_task(async function test_not_shown_to_user_no_url_no_window() {
  // Just text, no url or window => expect no error shown to user
  MailServices.mailSession.alertUser("test error");
  await Promise.race([
    PromiseTestUtils.promiseDelay(TEST_WAITTIME).then(result => {
      Assert.ok(true, "Alert is not shown with no window or no url present");
    }),
    mockAlertsService.promise.then(result => {
      throw new Error(
        "Alert is shown to the user although neither window nor url is present"
      );
    }),
  ]);
});

add_task(async function test_shown_to_user() {
  // Reset promise state.
  mockAlertsService.deferPromise();
  // Set a window for the URL.
  mailnewsURL.msgWindow = gMsgWindow;

  // Text, url and window => expect error shown to user
  MailServices.mailSession.alertUser("test error 2", mailnewsURL);
  const alertShown = await mockAlertsService.promise;
  Assert.ok(alertShown);
});

add_task(async function test_not_shown_to_user_no_window() {
  // Reset promise state.
  mockAlertsService.deferPromise();
  // No window for the URL.
  mailnewsURL.msgWindow = null;

  // Text, url and no window => export no error shown to user
  MailServices.mailSession.alertUser("test error 3", mailnewsURL);
  await Promise.race([
    PromiseTestUtils.promiseDelay(TEST_WAITTIME).then(result => {
      Assert.ok(true, "Alert is not shown with no window but a url present");
    }),
    mockAlertsService.promise.then(result => {
      throw new Error(
        "Alert is shown to the user although no window in the mailnewsURL present"
      );
    }),
  ]);
});

add_task(function endTest() {
  MockRegistrar.unregister(cid);
});

class MockAlertsService {
  QueryInterface = ChromeUtils.generateQI(["nsIAlertsService"]);

  constructor() {
    this._deferredPromise = Promise.withResolvers();
  }

  showAlert() {
    this._deferredPromise.resolve(true);
  }

  deferPromise() {
    this._deferredPromise = Promise.withResolvers();
  }

  get promise() {
    return this._deferredPromise.promise;
  }
}
