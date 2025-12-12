/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals showNotification, resetWindow, waitForNotification, waitForMinimize,
 * NotificationScheduler, moveWindowTo, openNewWindow, waitASecond
 */

"use strict";

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const expectedURI = "https://example.com/notificationTarget";

add_setup(async function () {
  NotificationScheduler._resolveStartupDelay();
  await NotificationScheduler._startupDelayPromise;
  await TestUtils.waitForTick();
  NotificationScheduler._idleService.disabled = true;
  NotificationManager._PER_TIME_UNIT = 1;
  NotificationScheduler.observe(null, "active");
  // PlacesUtils when executing the CTA needs the profile.

  MockExternalProtocolService.init();
  registerCleanupFunction(async () => {
    await resetWindow();
    NotificationScheduler._idleService.disabled = false;
    MockExternalProtocolService.cleanup();
    await PlacesUtils.history.clear();
  });
});

add_task(async function test_showWhenOffFullyScreenXLinux() {
  const promise = MockExternalProtocolService.promiseLoad();
  await moveWindowTo(-(window.screen.width * 2), 0);

  showNotification({ type: "donation_browser" });

  await waitASecond();

  await promise;

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffFullyScreenX() {
  await moveWindowTo(-(window.screen.width * 2), 0);

  showNotification({ type: "donation_browser" });

  await waitASecond();

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "browser was not opened when offscreen"
  );

  await moveWindowTo(window.screen.availLeft, window.screen.availTop);

  const promise = MockExternalProtocolService.promiseLoad();

  await waitASecond();

  const openedURL = await promise;

  Assert.equal(
    openedURL,
    expectedURI,
    "browser was opened when window becomes visible again"
  );

  MockExternalProtocolService.reset();
  await resetWindow();
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen150XLinux() {
  const promise = MockExternalProtocolService.promiseLoad();
  await moveWindowTo(-150, 0);

  await showNotification({ type: "donation_browser" });

  await promise;

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffScreen150X() {
  await moveWindowTo(-150, 0);

  await showNotification({ type: "donation_browser" });

  await waitASecond();

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "browser was not opened when offscreen"
  );

  await moveWindowTo(window.screen.availLeft, window.screen.availTop);

  const promise = MockExternalProtocolService.promiseLoad();

  await waitASecond();

  const openedURL = await promise;

  Assert.equal(
    openedURL,
    expectedURI,
    "browser was opened when window becomes visible again"
  );

  MockExternalProtocolService.reset();
  await resetWindow();
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen100X() {
  await moveWindowTo(-100, 0);

  const promise = MockExternalProtocolService.promiseLoad();

  await showNotification({ type: "donation_browser" });

  await waitASecond();

  const openedURL = await promise;

  Assert.equal(
    openedURL,
    expectedURI,
    "browser was opened when window is mostly visible"
  );

  MockExternalProtocolService.reset();
  await resetWindow();
});

add_task(async function test_showWhenOffFullyScreenYLinux() {
  const promise = MockExternalProtocolService.promiseLoad();
  await moveWindowTo(0, window.screen.height * 3);

  await showNotification({ type: "donation_browser" });

  await promise;

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffFullyScreenY() {
  await moveWindowTo(0, window.screen.height * 3);

  await showNotification({ type: "donation_browser" });

  await waitASecond();

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "browser was not opened when offscreen"
  );

  await moveWindowTo(window.screen.availLeft, window.screen.availTop);

  const loadPromise = MockExternalProtocolService.promiseLoad();

  await waitASecond();

  const openedURL = await loadPromise;

  Assert.equal(
    openedURL,
    expectedURI,
    "browser was opened when window becomes visible again"
  );

  MockExternalProtocolService.reset();
  await resetWindow();
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen150YLinux() {
  const promise = MockExternalProtocolService.promiseLoad();
  await moveWindowTo(0, window.screen.availHeight - window.outerHeight + 150);

  await showNotification({ type: "donation_browser" });

  await promise;

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffScreen150Y() {
  await moveWindowTo(
    0,
    window.screen.availHeight -
      window.outerHeight +
      150 +
      window.screen.availTop
  );

  await showNotification({ type: "donation_browser" });

  await waitASecond();

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "browser was not opened when offscreen"
  );

  await moveWindowTo(window.screen.availLeft, window.top.availTop);

  const promise = MockExternalProtocolService.promiseLoad();

  await waitASecond();

  const openedURL = await promise;

  Assert.equal(
    openedURL,
    expectedURI,
    "browser was opened when window becomes visible again"
  );

  MockExternalProtocolService.reset();
  await resetWindow();
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen100Y() {
  await moveWindowTo(0, window.screen.availHeight - window.outerHeight + 100);

  const promise = MockExternalProtocolService.promiseLoad();

  await showNotification({ type: "donation_browser" });

  await waitASecond();

  const openedURL = await promise;

  Assert.equal(
    openedURL,
    expectedURI,
    "browser was opened when window is mostly visible"
  );

  MockExternalProtocolService.reset();
  await resetWindow();
});
