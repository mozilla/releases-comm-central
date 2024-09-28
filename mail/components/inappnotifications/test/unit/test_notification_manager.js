/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { NotificationManager } = ChromeUtils.importESModule(
  "resource:///modules/NotificationManager.sys.mjs"
);
const { BrowserTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/BrowserTestUtils.sys.mjs"
);
const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);

const SAFETY_MARGIN_MS = 100000;

function getMockNotifications() {
  const now = Date.now();
  const startDate = new Date(now - SAFETY_MARGIN_MS).toISOString();
  const endDate = new Date(now + SAFETY_MARGIN_MS).toISOString();
  return [
    {
      id: "foo",
      title: "lorem ipsum",
      start_at: startDate,
      end_at: endDate,
      severity: 4,
      URL: "about:blank",
      targeting: {},
    },
    {
      id: "bar",
      title: "dolor sit amet",
      start_at: startDate,
      end_at: endDate,
      severity: 1,
      URL: "about:blank",
      targeting: {},
    },
  ];
}

let didOpen = false;

add_setup(async function () {
  // PlacesUtils when executing the CTA needs the profile.
  do_get_profile();
  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI(uri) {
      didOpen = true;
      Assert.equal(
        uri.spec,
        "about:blank",
        "Should only receive about blank load request"
      );
    },
  };

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );
  registerCleanupFunction(async () => {
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
    await PlacesUtils.history.clear();
  });
});

add_task(function test_staticSurface() {
  Assert.equal(
    typeof NotificationManager.NEW_NOTIFICATION_EVENT,
    "string",
    "New notification event constant should be a string"
  );
  Assert.equal(
    typeof NotificationManager.CLEAR_NOTIFICATION_EVENT,
    "string",
    "Clear notification event constant should be a string"
  );
  Assert.equal(
    typeof NotificationManager.NOTIFICATION_INTERACTION_EVENT,
    "string",
    "Notification interaction event constant should be a string"
  );
  Assert.equal(
    typeof NotificationManager.REQUEST_NOTIFICATIONS_EVENT,
    "string",
    "Request notifications event constant should be a string"
  );
});

add_task(async function test_updatedNotifications() {
  const notificationManager = new NotificationManager();
  const newNotificationEvent = BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  const notifications = getMockNotifications();
  const notificationsClone = structuredClone(notifications);
  notificationManager.updatedNotifications(notifications);
  const { detail: notification } = await newNotificationEvent;
  Assert.equal(notification.id, "bar", "Should pick the second notification");
  Assert.deepEqual(
    notifications,
    notificationsClone,
    "Notifications array should not be modified by updatedNotifications"
  );

  const clearNotificationEvent = BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.CLEAR_NOTIFICATION_EVENT
  );
  notificationManager.updatedNotifications([]);
  await clearNotificationEvent;

  notificationManager.addEventListener(
    NotificationManager.CLEAR_NOTIFICATION_EVENT,
    () => {
      Assert.ok(false, "Should not emit a clear again");
    }
  );
  notificationManager.updatedNotifications([]);
});

add_task(async function test_newNotificationReemit() {
  const notificationManager = new NotificationManager();
  notificationManager.updatedNotifications(getMockNotifications());

  const { detail: notification } = await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  Assert.equal(
    notification.id,
    "bar",
    "Should get the current notification immediately"
  );

  const { detail: notification2 } = await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  Assert.deepEqual(
    notification2,
    notification,
    "Should get the same notification again"
  );

  notificationManager.updatedNotifications([]);
});

add_task(async function test_notificationEndTimer() {
  const now = Date.now();
  const notifications = [
    {
      id: "test",
      start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
      end_at: new Date(now + 100).toISOString(),
      severity: 5,
    },
  ];
  const notificationManager = new NotificationManager();
  notificationManager.updatedNotifications(notifications);
  const { detail: notification } = await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  Assert.equal(notification.id, "test", "Should pick the notification");
  const requestNotificationsEvent = BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.REQUEST_NOTIFICATIONS_EVENT
  );
  await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.CLEAR_NOTIFICATION_EVENT
  );
  await requestNotificationsEvent;
  Assert.greaterOrEqual(
    Date.now(),
    now + 100,
    "Should wait until the notification expired"
  );
});

add_task(async function test_updatedNotification_removeCurrentNotification() {
  const notificationManager = new NotificationManager();
  const notifications = getMockNotifications();
  notificationManager.updatedNotifications(notifications);

  const { detail: currentNotification } = await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );

  const currentIndex = notifications.indexOf(currentNotification);
  const reducedNotifications = notifications.toSpliced(currentIndex, 1);
  notificationManager.updatedNotifications(reducedNotifications);
  const { detail: newNotification } = await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  Assert.notEqual(
    newNotification.id,
    currentNotification.id,
    "Should get a new notification since the current one no longer exists"
  );

  notificationManager.updatedNotifications([]);
});

add_task(async function test_updatedNotifications_stillUpToDate() {
  const notificationManager = new NotificationManager();
  const notifications = getMockNotifications();
  notificationManager.updatedNotifications(notifications);
  const { detail: notification } = await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  Assert.equal(notification.id, "bar", "Should pick the second notification");

  let gotNotification = false;
  notificationManager.addEventListener(
    notificationManager.NEW_NOTIFICATION_EVENT,
    event => {
      Assert.ok(
        !gotNotification,
        "Should get exactly one new notification event"
      );
      if (!gotNotification) {
        Assert.deepEqual(event.detail, notification);
        gotNotification = true;
      }
    }
  );

  notificationManager.updatedNotifications(notifications);
  const { detail: notification2 } = await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  Assert.deepEqual(
    notification2,
    notification,
    "Should still have the same notification picked"
  );

  notificationManager.updatedNotifications([]);
});

add_task(async function test_executeNotificationCTA() {
  didOpen = false;
  const notificationManager = new NotificationManager();
  notificationManager.updatedNotifications(getMockNotifications());
  const { detail: notification } = await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  Assert.equal(notification.id, "bar", "Should pick the second notification");

  const notificationInteractionEvent = BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NOTIFICATION_INTERACTION_EVENT
  );
  const clearNotificationEvent = BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.CLEAR_NOTIFICATION_EVENT
  );
  notificationManager.executeNotificationCTA(notification.id);
  const { detail: notificationId } = await notificationInteractionEvent;
  Assert.equal(
    notificationId,
    notification.id,
    "Should have interacted with the notification"
  );
  Assert.ok(didOpen, "Should open URL externally");
  await clearNotificationEvent;
  await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.REQUEST_NOTIFICATIONS_EVENT
  );

  notificationManager.updatedNotifications([]);
});

add_task(function test_executeNotificationCTA_noop() {
  const notificationManager = new NotificationManager();
  notificationManager.addEventListener(
    NotificationManager.NOTIFICATION_INTERACTION_EVENT,
    () => {
      Assert.ok(false, "Should not get any interaction event");
    }
  );
  notificationManager.executeNotificationCTA("foo");

  notificationManager.updatedNotifications(getMockNotifications());

  notificationManager.executeNotificationCTA("baz");

  notificationManager.updatedNotifications([]);
});

add_task(async function test_dismissNotification() {
  const notificationManager = new NotificationManager();
  notificationManager.updatedNotifications(getMockNotifications());
  const { detail: notification } = await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  Assert.equal(notification.id, "bar", "Should pick the second notification");

  const notificationInteractionEvent = BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NOTIFICATION_INTERACTION_EVENT
  );
  const clearNotificationEvent = BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.CLEAR_NOTIFICATION_EVENT
  );
  notificationManager.dismissNotification(notification.id);
  const { detail: notificationId } = await notificationInteractionEvent;
  Assert.equal(
    notificationId,
    notification.id,
    "Should have interacted with the notification"
  );
  await clearNotificationEvent;
  await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.REQUEST_NOTIFICATIONS_EVENT
  );

  notificationManager.updatedNotifications([]);
});

add_task(function test_dismissNotification_noop() {
  const notificationManager = new NotificationManager();
  notificationManager.addEventListener(
    NotificationManager.NOTIFICATION_INTERACTION_EVENT,
    () => {
      Assert.ok(false, "Should not get any interaction event");
    }
  );
  notificationManager.dismissNotification("foo");

  notificationManager.updatedNotifications(getMockNotifications());

  notificationManager.dismissNotification("baz");

  notificationManager.updatedNotifications([]);
});

add_task(async function test_showDonationsOldNotification() {
  didOpen = false;
  const now = Date.now();
  const notifications = [
    {
      id: "olddonation",
      type: "donations_old",
      start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
      end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
      URL: "about:blank",
      CTA: "Appeal",
      severity: 5,
    },
  ];
  const notificationManager = new NotificationManager();
  notificationManager.addEventListener(
    NotificationManager.NEW_NOTIFICATION_EVENT,
    () => {
      Assert.ok(false, "Should not get any new notification event");
    }
  );

  const notificationInteractionEvent = BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NOTIFICATION_INTERACTION_EVENT
  );
  const clearNotificationEvent = BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.CLEAR_NOTIFICATION_EVENT
  );
  notificationManager.updatedNotifications(notifications);

  const { detail: notificationId } = await notificationInteractionEvent;
  Assert.equal(
    notificationId,
    "olddonation",
    "Should have interacted with the notification"
  );
  await clearNotificationEvent;
  Assert.ok(didOpen, "Should open URL externally");

  notificationManager.updatedNotifications([]);
});

add_task(async function test_newNotificationReemit_handleEvent() {
  const notificationManager = new NotificationManager();
  notificationManager.updatedNotifications(getMockNotifications());

  const { promise, resolve } = Promise.withResolvers();
  const eventHandler = {
    handleEvent(event) {
      Assert.strictEqual(this, eventHandler, "Should preserve this context");
      resolve(event);
    },
  };
  notificationManager.addEventListener(
    NotificationManager.NEW_NOTIFICATION_EVENT,
    eventHandler
  );

  const { detail: notification } = await promise;
  Assert.equal(
    notification.id,
    "bar",
    "Should get the current notification immediately"
  );

  notificationManager.removeEventListener(
    NotificationManager.NEW_NOTIFICATION_EVENT,
    eventHandler
  );
  notificationManager.updatedNotifications([]);
});
