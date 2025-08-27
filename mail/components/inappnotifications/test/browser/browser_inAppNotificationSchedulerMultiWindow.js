/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals reset, showNotification, waitForNotification, waitForMinimize,
 * NotificationScheduler, openNewWindow
 */

"use strict";

add_setup(async function () {
  NotificationManager._PER_TIME_UNIT = 1;
  NotificationScheduler._resolveStartupDelay();
  await NotificationScheduler._startupDelayPromise;
  await TestUtils.waitForTick();
  NotificationScheduler._idleService.disabled = true;
  NotificationScheduler.observe(null, "active");

  registerCleanupFunction(async () => {
    NotificationScheduler._idleService.disabled = false;
    await reset();
  });
});

add_task(async function test_dontShowWhenCovered() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  const newWindow = await openNewWindow({ cover: true });

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "message is not shown when covered"
  );

  window.focus();

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when uncovered"
  );

  await reset();
  await BrowserTestUtils.closeWindow(newWindow);
});

add_task(async function test_dontShowUntilCurrent() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );
  const newWindow = await openNewWindow({ cover: false });

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "message is not shown when covered"
  );

  await BrowserTestUtils.closeWindow(newWindow);

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when uncovered"
  );

  await reset();
});

add_task(async function test_opensAndClosesNotifcationInEveryWindow() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );

  await showNotification();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown"
  );

  const newWindow = await openNewWindow(false);

  await waitForNotification(true, newWindow);

  Assert.equal(
    newWindow.document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown"
  );

  const closeButton = newWindow.document
    .querySelector("in-app-notification")
    .shadowRoot.querySelector("in-app-notification-container")
    .shadowRoot.querySelector("button");

  EventUtils.synthesizeMouseAtCenter(closeButton, {}, newWindow);

  await waitForNotification(false, newWindow);

  Assert.equal(
    newWindow.document.querySelectorAll("in-app-notification").length,
    0,
    "message is dismissed"
  );

  await waitForNotification(false);

  await BrowserTestUtils.closeWindow(newWindow);

  await reset();
});

add_task(async function test_opensInNewWindowWhenFirstWindowMinimized() {
  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    0,
    "no messages showing"
  );
  window.minimize();

  await waitForMinimize();

  await showNotification();

  const newWindow = await openNewWindow(false);

  Assert.equal(
    newWindow.document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown"
  );

  window.restore();

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "message is shown when restored"
  );

  await reset();

  await BrowserTestUtils.closeWindow(newWindow);
});
