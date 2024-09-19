/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { NotificationUpdater } = ChromeUtils.importESModule(
  "resource:///modules/NotificationUpdater.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { clearInterval } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

let updateSpy;
let notifications;

add_setup(async () => {
  updateSpy = sinon.spy();
  NotificationUpdater.onUpdate = updateSpy;

  Services.prefs.setIntPref(
    "datareporting.policy.dataSubmissionPolicyAcceptedVersion",
    10
  );
  Services.prefs.setIntPref("datareporting.policy.currentPolicyVersion", 10);

  const server = new HttpServer();
  server.registerDirectory("/", do_get_file("files/"));
  server.registerPathHandler("/error.json", (request, response) => {
    response.setStatusLine(request.httpVersion, 404, "Not Found");
  });
  server.start(-1);

  const serverUrl = `http://localhost:${server.identity.primaryPort}/notifications.json`;
  Services.prefs.setStringPref("mail.inappnotifications.url", serverUrl);

  notifications = await IOUtils.readJSON(
    do_get_file("files/notifications.json").path
  );

  registerCleanupFunction(async () => {
    NotificationUpdater.onUpdate = null;

    Services.prefs.clearUserPref(
      "datareporting.policy.dataSubmissionPolicyAcceptedVersion"
    );
    Services.prefs.clearUserPref("datareporting.policy.currentPolicyVersion");
    Services.prefs.setStringPref("mail.inappnotifications.url", "");
    await new Promise(resolve => server.stop(resolve));
  });
});

add_task(function test_canUpdate() {
  Assert.ok(NotificationUpdater.canUpdate, "Can update without any changes");

  Services.prefs.setBoolPref("mail.inappnotifications.enabled", false);
  Assert.ok(
    !NotificationUpdater.canUpdate,
    "Can't update when feature is disabled"
  );
  Services.prefs.setBoolPref("mail.inappnotifications.enabled", true);

  Services.io.offline = true;
  Assert.ok(!NotificationUpdater.canUpdate, "Can't update while offline");
  Services.io.offline = false;

  Services.prefs.clearUserPref(
    "datareporting.policy.dataSubmissionPolicyAcceptedVersion"
  );
  Assert.ok(
    !NotificationUpdater.canUpdate,
    "Not updating if data submission policy not accepted"
  );
  Services.prefs.setIntPref(
    "datareporting.policy.dataSubmissionPolicyAcceptedVersion",
    10
  );
});

add_task(async function test_fetch_noFetch() {
  Services.io.offline = true;
  const didFetchOffline = await NotificationUpdater._fetch();
  Assert.ok(!didFetchOffline, "Should not try to fetch when offline");
  Assert.ok(updateSpy.notCalled, "Should not have called the update callback");
  Services.io.offline = false;

  const url = Services.prefs.getStringPref("mail.inappnotifications.url", "");
  Services.prefs.setStringPref("mail.inappnotifications.url", "");
  const didFetchWithoutUrl = await NotificationUpdater._fetch();
  Assert.ok(
    !didFetchWithoutUrl,
    "Should not fetch if there is no url configured"
  );
  Assert.ok(updateSpy.notCalled, "Should not have called the update callback");
  Services.prefs.setStringPref("mail.inappnotifications.url", url);

  updateSpy.resetHistory();
});

add_task(async function test_fetch() {
  const didFetch = await NotificationUpdater._fetch();

  Assert.ok(didFetch, "Should fetch notifications successfully");
  Assert.equal(updateSpy.callCount, 1, "Should call the update callback");
  Assert.ok(
    updateSpy.calledWith(sinon.match(notifications)),
    "Should call callback with the notifications"
  );

  updateSpy.resetHistory();
});

add_task(async function test_fetch_networkError() {
  const url = Services.prefs.getStringPref("mail.inappnotifications.url", "");
  Services.prefs.setStringPref(
    "mail.inappnotifications.url",
    url.replace("notifications.json", "error.json")
  );

  const didFetchNetError = await NotificationUpdater._fetch();

  Assert.ok(!didFetchNetError, "Should not report fetch with a network error");
  Assert.ok(updateSpy.notCalled, "Should not call callback with network error");

  Services.prefs.setStringPref("mail.inappnotifications.url", url);
  updateSpy.resetHistory();
});

add_task(async function test_fetch_parseError() {
  const url = Services.prefs.getStringPref("mail.inappnotifications.url", "");
  Services.prefs.setStringPref(
    "mail.inappnotifications.url",
    url.replace("notifications.json", "plaintext.txt")
  );

  const didFetchNetError = await NotificationUpdater._fetch();

  Assert.ok(
    !didFetchNetError,
    "Should not report fetch with a non-json document"
  );
  Assert.ok(
    updateSpy.notCalled,
    "Should not call callback without parsed json"
  );

  Services.prefs.setStringPref("mail.inappnotifications.url", url);
  updateSpy.resetHistory();
});

add_task(async function test_fetch_updateError() {
  NotificationUpdater.onUpdate = sinon.stub();
  NotificationUpdater.onUpdate.throws(new Error("Update error"));

  const consoleErrorLogPromise = TestUtils.consoleMessageObserved(
    logMessage =>
      logMessage.wrappedJSObject.arguments?.[0] ==
      "Error fetching in-app notifications:"
  );
  const didFetchUpdateError = await NotificationUpdater._fetch();
  await consoleErrorLogPromise;

  Assert.ok(
    !didFetchUpdateError,
    "Should not indicate a successful fetch if the update callback throws"
  );
  Assert.equal(
    NotificationUpdater.onUpdate.callCount,
    1,
    "Should call update callback"
  );
  Assert.ok(
    NotificationUpdater.onUpdate.threw(),
    "Callback should report throw"
  );

  NotificationUpdater.onUpdate = updateSpy;
});

add_task(async function test_fetch_noOnUpdate() {
  NotificationUpdater.onUpdate = null;

  const consoleWarnNoUpdatePromise = TestUtils.consoleMessageObserved(
    logMessage =>
      logMessage.wrappedJSObject.arguments?.[0] ==
      "Not checking for in-app notifications updates because no callback is registered"
  );

  const didFetch = await NotificationUpdater._fetch();
  await consoleWarnNoUpdatePromise;

  Assert.ok(!didFetch, "Should skip fetching notifications without onUpdate");
  Assert.equal(updateSpy.callCount, 0, "Should not call callback");

  NotificationUpdater.onUpdate = updateSpy;
});

add_task(async function test_init() {
  Services.prefs.setIntPref("mail.inappnotifications.refreshInterval", 100);
  const { resolve, promise } = Promise.withResolvers();

  const initTs = Date.now();
  const initResult = await NotificationUpdater.init(0);

  Assert.ok(!initResult, "Should report successful fetch on init");
  Assert.equal(updateSpy.callCount, 1, "Should call update callback in init");
  Assert.ok(
    updateSpy.calledWith(sinon.match(notifications)),
    "Should pass notifications to update callback from init"
  );

  const initAgainResult = await NotificationUpdater.init(0);

  Assert.ok(
    !initAgainResult,
    "Should ask caller to use cache if already initialized"
  );
  Assert.equal(
    updateSpy.callCount,
    1,
    "Should not call update spy again after first init"
  );

  NotificationUpdater.onUpdate = sinon.spy(resolve);
  await promise;
  const now = Date.now();

  clearInterval(NotificationUpdater._interval);
  NotificationUpdater._interval = null;

  Assert.equal(
    NotificationUpdater.onUpdate.callCount,
    1,
    "Should call update spy from scheduled refresh"
  );
  Assert.ok(
    NotificationUpdater.onUpdate.calledWith(sinon.match(notifications)),
    "Should get notifications from scheduled refresh"
  );
  Assert.greaterOrEqual(
    now,
    initTs + 99,
    "Should have waited for at least the configured length of the refresh interval"
  );

  Services.prefs.clearUserPref("mail.inappnotifications.refreshInterval");
  NotificationUpdater.onUpdate = updateSpy;
  updateSpy.resetHistory();
});

add_task(async function test_init_withRecentUpdate() {
  const initTs = Date.now();
  const initResult = await NotificationUpdater.init(initTs - 100);

  clearInterval(NotificationUpdater._interval);
  NotificationUpdater._interval = null;

  Assert.ok(initResult, "Should not have fetched updates on init");
  Assert.equal(
    updateSpy.callCount,
    0,
    "Should not have called the update callback"
  );

  updateSpy.resetHistory();
});
