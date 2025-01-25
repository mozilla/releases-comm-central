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

const { clearTimeout, setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

let updateSpy;
let notifications;

async function clear() {
  await new Promise(resolve => setTimeout(resolve));
  clearTimeout(NotificationUpdater._timeout);
  NotificationUpdater._timeout = null;
  NotificationUpdater._updateHistory = [];
}

const getExpirationTime = NotificationUpdater.getExpirationTime;

add_setup(async () => {
  updateSpy = sinon.spy();
  NotificationUpdater.onUpdate = updateSpy;

  Services.prefs.setIntPref(
    "datareporting.policy.dataSubmissionPolicyAcceptedVersion",
    10
  );
  Services.prefs.setIntPref("datareporting.policy.currentPolicyVersion", 10);

  const server = new HttpServer();
  const raw = await IOUtils.readUTF8(
    do_get_file("files/notifications.json").path
  );

  server.registerPathHandler("/notifications.json", (request, response) => {
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "max-age=100");
    response.write(raw);
  });

  server.registerPathHandler("/error.json", (request, response) => {
    response.setStatusLine(request.httpVersion, 404, "Not Found");
  });

  server.registerPrefixHandler("/formatted/", (request, response) => {
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Type", "application/json");
    response.write(JSON.stringify({ formatTest: request.path }));
  });
  server.start(-1);

  const serverUrl = `http://localhost:${server.identity.primaryPort}/notifications.json`;
  Services.prefs.setStringPref("mail.inappnotifications.url", serverUrl);

  notifications = JSON.parse(raw);

  registerCleanupFunction(async () => {
    NotificationUpdater.onUpdate = null;

    await clear();
    NotificationUpdater._timeout = null;

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

  Services.prefs.setStringPref("mail.inappnotifications.url", "about:blank");
  const didFetchWithAboutBlank = await NotificationUpdater._fetch();
  Assert.ok(
    !didFetchWithAboutBlank,
    "Should not fetch if the formatted URL is about:blank"
  );
  Assert.ok(
    updateSpy.notCalled,
    "Should not have called the update callback for about:blank"
  );
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

  await clear();
  updateSpy.resetHistory();
});

add_task(async function test_fetch_networkError() {
  clearTimeout(NotificationUpdater._timeout);
  const url = Services.prefs.getStringPref("mail.inappnotifications.url", "");
  Services.prefs.setStringPref(
    "mail.inappnotifications.url",
    url.replace("notifications.json", "error.json")
  );

  const didFetchNetError = await NotificationUpdater._fetch();

  Assert.ok(!didFetchNetError, "Should not report fetch with a network error");
  Assert.ok(updateSpy.notCalled, "Should not call callback with network error");

  Services.prefs.setStringPref("mail.inappnotifications.url", url);
  await clear();
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
  await clear();
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

  await clear();
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

  await clear();
  NotificationUpdater.onUpdate = updateSpy;
});

add_task(async function test_fetch_formattedURL() {
  const url = Services.prefs.getStringPref("mail.inappnotifications.url", "");
  Services.prefs.setStringPref(
    "mail.inappnotifications.url",
    url.replace("notifications.json", "formatted/%LOCALE%/notifications.json")
  );
  const expectedURL = Services.urlFormatter.formatURLPref(
    "mail.inappnotifications.url"
  );
  // Cut off http://host:port
  const expectedPath = `/${expectedURL.split("/").slice(3).join("/")}`;
  Assert.stringContains(expectedURL, "formatted", "Should have updated URL");
  Assert.ok(
    !expectedURL.includes("%LOCALE%"),
    "Placeholder should be formatted"
  );

  const formattedFetch = await NotificationUpdater._fetch();

  Assert.ok(formattedFetch, "Should report fetch");
  Assert.ok(
    updateSpy.calledWith({ formatTest: expectedPath }),
    "Should call update with expected payload"
  );

  Services.prefs.setStringPref("mail.inappnotifications.url", url);
  await clear();
  updateSpy.resetHistory();
});

add_task(async function test_init() {
  NotificationUpdater.getExpirationTime = () => null;
  NotificationUpdater._timeout = null;
  Services.prefs.setIntPref("mail.inappnotifications.refreshInterval", 100);
  const { resolve, promise } = Promise.withResolvers();

  const initTs = Date.now();
  const initResult = await NotificationUpdater.init();

  Assert.ok(!initResult, "Should report successful fetch on init");
  Assert.equal(updateSpy.callCount, 1, "Should call update callback in init");
  Assert.ok(
    updateSpy.calledWith(sinon.match(notifications)),
    "Should pass notifications to update callback from init"
  );

  const initAgainResult = await NotificationUpdater.init();

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
  await clear();
  updateSpy.resetHistory();
  NotificationUpdater.getExpirationTime = getExpirationTime;
});

add_task(async function test_init_withRecentUpdate() {
  await clear();

  const { resolve, promise } = Promise.withResolvers();
  const schedule = NotificationUpdater._schedule;
  const scheduleSpy = sinon.spy();

  NotificationUpdater._schedule = scheduleSpy;
  NotificationUpdater.onUpdate = sinon.spy(resolve);
  NotificationUpdater._fetch();

  await promise;

  updateSpy.resetHistory();

  const initResult = await NotificationUpdater.init();

  Assert.ok(initResult, "Should not have fetched updates on init");
  Assert.equal(
    updateSpy.callCount,
    0,
    "Should not have called the update callback"
  );

  // The schedule is called twice once with 0 so it executes immediately and
  // then the next update is scheduled.
  Assert.equal(scheduleSpy.callCount, 2, "Should call schedule callback twice");

  await clear();
  NotificationUpdater._schedule = schedule;
  updateSpy.resetHistory();
});

add_task(async function test_getRemainingCacheTime() {
  NotificationUpdater.getExpirationTime = () => {
    return Date.now() / 1000 + 1;
  };
  const remainingTime = await NotificationUpdater.getRemainingCacheTime("test");

  Assert.greater(remainingTime, 900);
  Assert.lessOrEqual(
    remainingTime,
    1000,
    "getRemainingTime returns correct amount of time"
  );
  NotificationUpdater.getExpirationTime = getExpirationTime;
});

add_task(async function test_getRemainingCacheTimeNull() {
  NotificationUpdater.getExpirationTime = () => null;
  const remainingTime = await NotificationUpdater.getRemainingCacheTime("test");

  Assert.equal(
    remainingTime,
    0,
    "getRemainingTime returns correct amount of time"
  );
  NotificationUpdater.getExpirationTime = getExpirationTime;
});

add_task(async function test_getRemainingCacheTimeZero() {
  NotificationUpdater.getExpirationTime = () => 0;
  const remainingTime = await NotificationUpdater.getRemainingCacheTime("test");

  Assert.equal(
    remainingTime,
    0,
    "getRemainingTime returns correct amount of time"
  );
  NotificationUpdater.getExpirationTime = getExpirationTime;
});

add_task(async function test_getRemainingCacheTimeNegative() {
  NotificationUpdater.getExpirationTime = () => -9;
  const remainingTime = await NotificationUpdater.getRemainingCacheTime("test");

  Assert.equal(
    remainingTime,
    0,
    "getRemainingTime returns correct amount of time"
  );
  NotificationUpdater.getExpirationTime = getExpirationTime;
});

add_task(async function test_getRemainingCacheTimeSmall() {
  NotificationUpdater.getExpirationTime = () => 2;
  const remainingTime = await NotificationUpdater.getRemainingCacheTime("test");

  Assert.equal(
    remainingTime,
    0,
    "getRemainingTime returns correct amount of time"
  );
  NotificationUpdater.getExpirationTime = getExpirationTime;
});

add_task(async function test_getRemainingCacheTimeNoCache() {
  NotificationUpdater.getExpirationTime = () => 0xffffffff;
  const remainingTime = await NotificationUpdater.getRemainingCacheTime("test");

  Assert.equal(
    remainingTime,
    0,
    "getRemainingTime returns correct amount of time"
  );
  NotificationUpdater.getExpirationTime = getExpirationTime;
});

add_task(async function test_fetchScheduling() {
  const startTime = Date.now();
  NotificationUpdater.getExpirationTime = () => Date.now() / 1000 + 0.1;
  const onUpdate = NotificationUpdater.onUpdate;
  let count = 0;
  const { resolve, promise } = Promise.withResolvers();
  NotificationUpdater.onUpdate = () => {
    count++;

    if (count > 3) {
      resolve();
      clear();
    }
  };

  NotificationUpdater._fetch();

  await promise;

  Assert.ok(true, "fetch schedules next fetch");
  Assert.greaterOrEqual(
    Date.now(),
    startTime + 100,
    "at least 100ms has passed"
  );
  NotificationUpdater.onUpdate = onUpdate;
  NotificationUpdater.getExpirationTime = getExpirationTime;
  await clear();
});

add_task(async function test_maxUpdatesPerDay() {
  NotificationUpdater._PER_TIME_UNIT = 1000 * 5;
  NotificationUpdater.getExpirationTime = () => Date.now() / 1000 + 0.1;

  const onUpdate = NotificationUpdater.onUpdate;
  let count = 0;
  const { resolve, promise } = Promise.withResolvers();
  NotificationUpdater.onUpdate = () => {
    if (count === 23) {
      // Wait one second to make sure no more updates take place
      /* eslint-disable-next-line mozilla/no-arbitrary-setTimeout */
      setTimeout(() => {
        resolve();
      }, 1000);
    }

    count++;
  };

  NotificationUpdater._fetch();

  await promise;

  Assert.equal(count, 24, "fetch respects MAX_UPDATES_PER_DAY");

  // Wait six seconds, one more then the _PER_TIME_UNIT, to make sure
  // updates commence again.
  /* eslint-disable-next-line mozilla/no-arbitrary-setTimeout */
  await new Promise(_resolve => setTimeout(_resolve, 6000));

  Assert.greaterOrEqual(count, 26, "Update called after delay");

  await clear();

  NotificationUpdater.onUpdate = onUpdate;
  NotificationUpdater.getExpirationTime = getExpirationTime;

  const schedule = NotificationUpdater._schedule;
  NotificationUpdater._schedule = () => {};

  // Wait six seconds, one more then the _PER_TIME_UNIT, to make sure
  // updates commence again.
  /* eslint-disable-next-line mozilla/no-arbitrary-setTimeout */
  await new Promise(_resolve => setTimeout(_resolve, 6000));

  NotificationUpdater._schedule = schedule;
});
