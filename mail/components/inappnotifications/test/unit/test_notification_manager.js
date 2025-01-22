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
const { clearTimeout, setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const SAFETY_MARGIN_MS = 100000;

function getMockNotifications(count = 2) {
  const now = Date.now();
  const startDate = new Date(now - SAFETY_MARGIN_MS).toISOString();
  const endDate = new Date(now + SAFETY_MARGIN_MS).toISOString();
  const notificationArray = [];

  for (let i = 0; i < count; i++) {
    notificationArray.push({
      id: `${i}`,
      title: "dolor sit amet",
      start_at: startDate,
      end_at: endDate,
      severity: 1,
      URL: "about:blank",
      targeting: {},
    });
  }

  return notificationArray;
}

let didOpen = false;
let expectedURI = "about:blank";

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
        expectedURI,
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
  Assert.equal(notification.id, "0", "Should pick the first notification");
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
    "0",
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
  Assert.equal(notification.id, "0", "Should pick the first notification");

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
  Assert.equal(notification.id, "0", "Should pick the first notification");

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
  Assert.equal(notification.id, "0", "Should pick the first notification");

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

add_task(async function test_showDonationsBrowserNotification() {
  didOpen = false;
  const now = Date.now();
  const notifications = [
    {
      id: "olddonation",
      type: "donation_browser",
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

add_task(async function test_showDonationsTabNotification() {
  didOpen = false;
  const now = Date.now();
  const notifications = [
    {
      id: "tabdonation",
      type: "donation_tab",
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
    "tabdonation",
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
    "0",
    "Should get the current notification immediately"
  );

  notificationManager.removeEventListener(
    NotificationManager.NEW_NOTIFICATION_EVENT,
    eventHandler
  );
  notificationManager.updatedNotifications([]);
});

add_task(async function test_executeNotificationCTA_formatURL() {
  didOpen = false;
  const notificationManager = new NotificationManager();
  const mockNotifications = getMockNotifications();
  const url = "https://example.com/%LOCALE%/file.json";
  mockNotifications[0].URL = url;
  expectedURI = Services.urlFormatter.formatURL(url);
  notificationManager.updatedNotifications(mockNotifications);
  const { detail: notification } = await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  Assert.equal(notification.id, "0", "Should pick the first notification");

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

add_task(async function test_maxNotificationsPerDay() {
  const notificationManager = new NotificationManager();
  const notifications = getMockNotifications(7);
  const timeUnit = NotificationManager._PER_TIME_UNIT;
  let notification;
  let newNotificationEvent = BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );

  notificationManager._MAX_MS_BETWEEN_NOTIFICATIONS = 100;
  NotificationManager._PER_TIME_UNIT = 1000 * 10;
  notificationManager.updatedNotifications(notifications);
  const startTime = Date.now();

  for (let i = 0; i <= 5; i++) {
    ({ detail: notification } = await newNotificationEvent);
    Assert.equal(notification.id, `${i}`, "correct notification shown");

    newNotificationEvent = BrowserTestUtils.waitForEvent(
      notificationManager,
      NotificationManager.NEW_NOTIFICATION_EVENT,
      false,
      ({ detail }) => detail.id === `${i + 1}`
    );

    notifications.shift();
    notification = null;
    notificationManager.updatedNotifications(notifications);
  }

  newNotificationEvent.then(({ detail }) => {
    notification = detail;
  });

  // Wait one second to make sure another notification is not shown.
  /* eslint-disable-next-line mozilla/no-arbitrary-setTimeout */
  await new Promise(resolve => setTimeout(resolve, 1000));

  Assert.equal(notification, null, "No new notifications shown");

  await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.REQUEST_NOTIFICATIONS_EVENT
  );

  Assert.ok(true, "Scheduled notification shown");
  Assert.greaterOrEqual(
    Date.now(),
    startTime + 1000 * 10,
    "Message shown after _PER_TIME_UNIT"
  );

  Assert.lessOrEqual(
    Date.now(),
    startTime + 1000 * 11,
    "Message shown after _PER_TIME_UNIT"
  );

  NotificationManager._PER_TIME_UNIT = timeUnit;
});
