/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals reset, showNotification, waitForNotification, waitForMinimize
 * NotificationManager, NotificationScheduler, moveWindowTo, waitASecond
 * resetWindow
 */

"use strict";

add_setup(async function () {
  NotificationManager._PER_TIME_UNIT = 1;
  NotificationScheduler.observe(null, "active");
  NotificationScheduler._idleService.disabled = true;

  registerCleanupFunction(async () => {
    NotificationScheduler._idleService.disabled = false;
    await reset();
  });
});

add_task(async function test_showDefault() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "1 message is shown in the window"
  );

  await reset();
});

add_task(async function test_dontShowUntilUserActiveFromIdle() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );
  NotificationScheduler.observe(null, "idle");

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "message is not shown when user idle"
  );

  NotificationScheduler.observe(null, "active");

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when user becomes active"
  );

  await reset();
});

add_task(async function test_dontShowUntilUserActiveFromIdleDaily() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );
  NotificationScheduler.observe(null, "idle-daily");

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "message is not shown when user idle"
  );

  NotificationScheduler.observe(null, "active");

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when user becomes active"
  );

  await reset();
});

add_task(async function test_dontShowWhenMinimized() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );
  window.minimize();

  await waitForMinimize();

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "message is not shown when minimized"
  );

  window.restore();

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when restored"
  );

  await reset();
});

add_task(async function test_showWhenResizedToFit() {
  window.resizeTo(window.screen.availWidth - 50, window.screen.availHeight);

  await waitASecond();

  await moveWindowTo(window.screen.width - window.outerWidth + 150, 0);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no notifications are on screen"
  );

  await moveWindowTo(window.screen.width - window.outerWidth + 150, 0);

  await waitASecond();

  await showNotification();

  await waitASecond();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "message is not shown when offscreen"
  );

  window.resizeBy(-150, 0);

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when window is resized to fit on screen"
  );

  await resetWindow();
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenResizedToFitLinux() {
  window.resizeTo(window.screen.availWidth - 50, window.screen.availHeight);

  await waitASecond();

  await moveWindowTo(window.screen.width - window.outerWidth + 150, 0);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no notifications are on screen"
  );

  await moveWindowTo(window.screen.width - window.outerWidth + 150, 0);

  await waitASecond();

  await showNotification();

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown in linux when offscreen"
  );

  await resetWindow();
}).skip(AppConstants.platform !== "linux");
