/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals NotificationScheduler, NotificationManager, InAppNotifications,
 * showNotification, waitForNotification
 */

"use strict";
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

let manager;

add_setup(async function () {
  NotificationManager._PER_TIME_UNIT = 1;
  NotificationScheduler.observe(null, "active");
  NotificationScheduler._resolveStartupDelay();
  await NotificationScheduler._startupDelayPromise;
  await TestUtils.waitForTick();
  NotificationScheduler._idleService.disabled = true;
  manager = document.querySelector("in-app-notification-manager");

  registerCleanupFunction(() => {
    hideNotification();
  });
});

/**
 * Dispatch the event to clear all notifications on the notification manager.
 */
function hideNotification() {
  InAppNotifications.notificationManager.dispatchEvent(
    new CustomEvent(NotificationManager.CLEAR_NOTIFICATION_EVENT)
  );
}

add_task(function test_initialManagerTree() {
  Assert.equal(manager.childElementCount, 0, "Should have no children");
});

add_task(async function test_showAndHideNotification() {
  await showNotification();
  manager = document.querySelector("in-app-notification-manager");

  const notification = manager.querySelector("in-app-notification");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should have one notification child"
  );
  Assert.ok(notification, "Should find a notification");

  hideNotification();

  Assert.equal(manager.childElementCount, 0, "Should have no more children");

  await showNotification();

  await waitForNotification(true);

  const newNotification = manager.querySelector("in-app-notification");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should have a notification again"
  );
  Assert.ok(newNotification, "Should find another notification");
  Assert.notStrictEqual(
    newNotification,
    notification,
    "Should create a new notification"
  );

  hideNotification();
});

add_task(async function test_showNotificationReplaces() {
  await showNotification();

  const notification = manager.querySelector("in-app-notification");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should have one notification child"
  );
  Assert.ok(notification, "Should find a notification");

  await showNotification();

  Assert.equal(
    manager.childElementCount,
    1,
    "Should still only have one notification"
  );

  const newNotification = manager.querySelector("in-app-notification");

  Assert.ok(newNotification, "Should still find a notification");
  Assert.notStrictEqual(
    newNotification,
    notification,
    "Should replace notification"
  );

  hideNotification();
});

add_task(async function test_ctaClick() {
  const spy = sinon.spy(
    InAppNotifications.notificationManager,
    "executeNotificationCTA"
  );
  await showNotification({ id: "ctatest" });

  const ctaButton =
    manager.firstElementChild.shadowRoot.firstElementChild.shadowRoot.querySelector(
      'a[is="in-app-notification-button"]'
    );
  const eventPromise = BrowserTestUtils.waitForEvent(ctaButton, "ctaclick");

  EventUtils.synthesizeMouseAtCenter(ctaButton, {}, window);
  await eventPromise;

  Assert.equal(spy.callCount, 1, "Should call cta callback on manager once");
  Assert.ok(spy.calledWith("ctatest"));

  spy.restore();
  hideNotification();
}).skip(Cu.isInAutomation); //TODO Bug 1921222: Fix test timeout in automation.

add_task(async function test_closeClick() {
  const spy = sinon.spy(
    InAppNotifications.notificationManager,
    "dismissNotification"
  );
  await showNotification({ id: "closetest" });

  const closeButton =
    manager.firstElementChild.shadowRoot.firstElementChild.shadowRoot.querySelector(
      'button[is="in-app-notification-close-button"]'
    );
  const eventPromise = BrowserTestUtils.waitForEvent(
    closeButton,
    "notificationclose"
  );

  EventUtils.synthesizeMouseAtCenter(closeButton, {}, window);
  await eventPromise;

  Assert.equal(spy.callCount, 1, "Should call close callback on manager once");
  Assert.ok(spy.calledWith("closetest"));

  spy.restore();
  hideNotification();
}).skip(Cu.isInAutomation); //TODO Bug 1921222: Fix test timeout in automation.

add_task(async function test_keyboardShortcut() {
  await showNotification();
  manager.dispatchEvent(
    new KeyboardEvent("keydown", {
      altKey: true,
      shiftKey: true,
      code: "KeyJ",
      bubbles: true,
      composed: true,
    })
  );

  const notification = manager.firstElementChild;

  // The in-app-notification is reported as having focus because the container
  // that really has focus is in the shadow root.
  Assert.equal(
    document.activeElement,
    notification,
    "The notification has focus"
  );

  hideNotification();
});
