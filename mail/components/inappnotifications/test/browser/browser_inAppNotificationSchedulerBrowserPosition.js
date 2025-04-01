/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals showNotification, resetWindow, waitForNotification, waitForMinimize,
 * NotificationScheduler, moveWindowTo, openNewWindow, waitASecond
 */

"use strict";

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

let didOpen = false;
const expectedURI = "https://example.com/notificationTarget";
let { promise, resolve } = Promise.withResolvers();

add_setup(async function () {
  NotificationScheduler._idleService.disabled = true;
  NotificationManager._PER_TIME_UNIT = 1;
  NotificationScheduler.observe(null, "active");
  // PlacesUtils when executing the CTA needs the profile.
  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI(uri) {
      didOpen = true;
      resolve();
      Assert.equal(
        uri.spec,
        expectedURI,
        "Should only receive load request got test specific URI"
      );
    },
  };

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );
  registerCleanupFunction(async () => {
    await resetWindow();
    NotificationScheduler._idleService.disabled = false;
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
    await PlacesUtils.history.clear();
  });
});

add_task(async function test_showWhenOffFullyScreenXLinux() {
  ({ promise, resolve } = Promise.withResolvers());
  await moveWindowTo(-(window.screen.width * 2), 0);

  showNotification({ type: "donation_browser" });

  await waitASecond();

  await promise;

  Assert.ok(didOpen, "browser was opened");

  didOpen = false;

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffFullyScreenX() {
  ({ promise, resolve } = Promise.withResolvers());
  await moveWindowTo(-(window.screen.width * 2), 0);

  showNotification({ type: "donation_browser" });

  await waitASecond();

  Assert.ok(!didOpen, "browser was not opened when offscreen");

  await moveWindowTo(0, 0);

  await promise;

  Assert.ok(didOpen, "browser was opened");

  await resetWindow();

  didOpen = false;
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen150XLinux() {
  ({ promise, resolve } = Promise.withResolvers());
  await moveWindowTo(-150, 0);

  await showNotification({ type: "donation_browser" });

  await promise;

  Assert.ok(didOpen, "browser was opened");

  didOpen = false;

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffScreen150X() {
  ({ promise, resolve } = Promise.withResolvers());
  await moveWindowTo(-150, 0);

  await showNotification({ type: "donation_browser" });

  Assert.ok(!didOpen, "browser was not opened when offscreen");

  await moveWindowTo(0, 0);

  await promise;

  Assert.ok(didOpen, "browser was opened");

  await resetWindow();

  didOpen = false;
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen100X() {
  ({ promise, resolve } = Promise.withResolvers());
  await moveWindowTo(-100, 0);

  await showNotification({ type: "donation_browser" });

  await promise;

  Assert.ok(didOpen, "browser was opened");

  Assert.ok(didOpen, "browser was opened");

  await resetWindow();

  didOpen = false;
});

add_task(async function test_showWhenOffFullyScreenYLinux() {
  ({ promise, resolve } = Promise.withResolvers());
  await moveWindowTo(0, window.screen.height * 3);

  await showNotification({ type: "donation_browser" });

  await promise;

  Assert.ok(didOpen, "browser was opened");

  didOpen = false;

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffFullyScreenY() {
  ({ promise, resolve } = Promise.withResolvers());
  await moveWindowTo(0, window.screen.height * 3);

  await showNotification({ type: "donation_browser" });

  Assert.ok(!didOpen, "browser was not opened when offscreen");

  await moveWindowTo(0, 0);

  await promise;

  Assert.ok(didOpen, "browser was opened");

  await resetWindow();

  didOpen = false;
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen150YLinux() {
  ({ promise, resolve } = Promise.withResolvers());
  await moveWindowTo(0, window.screen.availHeight - window.outerHeight + 150);

  await showNotification({ type: "donation_browser" });

  await promise;

  Assert.ok(didOpen, "browser was opened");

  didOpen = false;

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffScreen150Y() {
  ({ promise, resolve } = Promise.withResolvers());
  await moveWindowTo(
    0,
    window.screen.availHeight -
      window.outerHeight +
      150 +
      window.screen.availTop
  );

  await showNotification({ type: "donation_browser" });

  Assert.ok(!didOpen, "browser was not opened when offscreen");

  await moveWindowTo(window.screen.availLeft, window.top.availTop);

  await promise;

  Assert.ok(didOpen, "browser was opened");

  await resetWindow();

  didOpen = false;
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen100Y() {
  ({ promise, resolve } = Promise.withResolvers());
  await moveWindowTo(0, window.screen.availHeight - window.outerHeight + 100);

  await showNotification({ type: "donation_browser" });

  await promise;

  Assert.ok(didOpen, "browser was opened");

  await resetWindow();

  didOpen = false;
});
