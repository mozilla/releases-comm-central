/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals showNotification, resetWindow, waitForNotification, waitForMinimize,
 * NotificationScheduler, moveWindowTo, openNewWindow, waitASecond
 */

"use strict";

add_setup(async function () {
  NotificationManager._PER_TIME_UNIT = 1;
  NotificationScheduler._startupDelay = 0;
  NotificationScheduler._idleService.disabled = true;
  NotificationScheduler.observe(null, "active");

  registerCleanupFunction(async () => {
    NotificationScheduler._idleService.disabled = false;
    await resetWindow();
  });
});

add_task(async function test_showWhenFullyOffScreenXLinux() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await moveWindowTo(-(window.screen.width * 2), 0);

  await showNotification();
  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when on screen"
  );

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenFullyOffScreenX() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await moveWindowTo(-(window.screen.width * 2), 0);

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "message is not shown when offscreen"
  );

  await moveWindowTo(0, 0);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when on screen"
  );

  await resetWindow();
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen150XLinux() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await moveWindowTo(-150, 0);

  await showNotification();

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when on screen"
  );

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffScreen150X() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await moveWindowTo(-150, 0);

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "message is not shown when offscreen"
  );

  await moveWindowTo(0, 0);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when on screen"
  );

  await resetWindow();
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen100X() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await moveWindowTo(-100, 0);

  await showNotification();

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when on screen"
  );

  await resetWindow();
});

add_task(async function test_showWhenFullyOffScreenYLinux() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await moveWindowTo(0, window.screen.height * 3);

  await showNotification();

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when on screen"
  );

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenFullyOffScreenY() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await moveWindowTo(0, window.screen.height * 3);

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "message is not shown when offscreen"
  );

  await moveWindowTo(0, 0);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when on screen"
  );

  await resetWindow();
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen150YLinux() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await moveWindowTo(0, window.screen.height - window.outerHeight + 150);

  await showNotification();

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when on screen"
  );

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffScreen150Y() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await moveWindowTo(
    0,
    window.screen.availHeight -
      window.outerHeight +
      150 +
      window.screen.availTop
  );

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "message is not shown when offscreen"
  );

  await moveWindowTo(0, 0);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when on screen"
  );

  await resetWindow();
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen100Y() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await moveWindowTo(0, window.screen.availHeight - window.outerHeight + 100);

  await showNotification();

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when on screen"
  );

  await resetWindow();
});
