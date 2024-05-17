/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { InAppNotifications } = ChromeUtils.importESModule(
  "resource:///modules/InAppNotifications.sys.mjs"
);
const { NotificationManager } = ChromeUtils.importESModule(
  "resource:///modules/NotificationManager.sys.mjs"
);
const { BrowserTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/BrowserTestUtils.sys.mjs"
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
      severity: 1,
    },
    {
      id: "bar",
      title: "dolor sit amet",
      start_at: startDate,
      end_at: endDate,
      severity: 5,
    },
  ];
}

add_setup(async () => {
  do_get_profile();
  await InAppNotifications.init();
});

add_task(function test_initializedData() {
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    [],
    "Should initialize notifications with an empty array"
  );
  Assert.ok(
    InAppNotifications.notificationManager instanceof NotificationManager,
    "Should expose a NotificationManager instance"
  );
});

add_task(async function test_noReinitialization() {
  const currentNotificationManager = InAppNotifications.notificationManager;
  await InAppNotifications.init();
  Assert.strictEqual(
    InAppNotifications.notificationManager,
    currentNotificationManager,
    "Should not initialize a new notification manager"
  );
});

add_task(function test_updateNotifications() {
  const mockData = getMockNotifications();
  InAppNotifications.updateNotifications(mockData);
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    mockData,
    "Should save data to notifications"
  );
  Assert.ok(
    Number.isInteger(InAppNotifications._jsonFile.data.lastUpdate),
    "Last update should be an integer"
  );
  Assert.lessOrEqual(
    InAppNotifications._jsonFile.data.lastUpdate,
    Date.now(),
    "Last update should be a timestamp in the past"
  );

  InAppNotifications.updateNotifications([]);
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    [],
    "Should have cleared notifications"
  );
});

add_task(function test_markAsInteractedWith() {
  const mockData = getMockNotifications();
  InAppNotifications.updateNotifications(mockData);
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    mockData,
    "Should have all notifications"
  );
  Assert.deepEqual(
    InAppNotifications._jsonFile.data.interactedWith,
    [],
    "Should start without any notifications having been interacted with"
  );

  InAppNotifications.markAsInteractedWith("foo");

  InAppNotifications.updateNotifications(mockData);
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    [mockData[1]],
    "Should only have uninteracted notifications"
  );

  InAppNotifications.markAsInteractedWith("foo");
  Assert.deepEqual(
    InAppNotifications._jsonFile.data.interactedWith,
    ["foo"],
    "Should only store the ID once"
  );

  InAppNotifications.updateNotifications([]);
  Assert.deepEqual(
    InAppNotifications._jsonFile.data.interactedWith,
    [],
    "Should clear interaction store when there are no notifications"
  );
});

add_task(function test_getNotifications_expiry() {
  const now = Date.now();
  const mockData = [
    {
      id: "foo",
      title: "lorem ipsum",
      start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
      end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
    },
    {
      id: "future bar",
      title: "dolor sit amet",
      start_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
      end_at: new Date(now + 2 * SAFETY_MARGIN_MS).toISOString(),
    },
    {
      id: "past bar",
      title: "back home now",
      start_at: new Date(now - 2 * SAFETY_MARGIN_MS).toISOString(),
      end_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
    },
    {
      id: "invalid",
      title: "invalid date strings",
      start_at: "foo",
      end_at: "bar",
    },
  ];
  InAppNotifications.updateNotifications(mockData);
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    [mockData[0]],
    "Should have only current notifications"
  );

  InAppNotifications.updateNotifications([]);
});

add_task(function test_notificationInteractionEvent() {
  const mockData = getMockNotifications();
  InAppNotifications.updateNotifications(mockData);

  InAppNotifications.notificationManager.dispatchEvent(
    new CustomEvent(NotificationManager.NOTIFICATION_INTERACTION_EVENT, {
      detail: mockData[0].id,
    })
  );

  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    [mockData[1]],
    "Should no longer include the first notification"
  );

  InAppNotifications.updateNotifications([]);
});

add_task(async function test_requestNotifictionsEvent() {
  const mockData = getMockNotifications();
  InAppNotifications.updateNotifications(mockData);
  InAppNotifications.notificationManager.updatedNotifications([]);

  const newNotificationEvent = BrowserTestUtils.waitForEvent(
    InAppNotifications.notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT
  );
  InAppNotifications.notificationManager.dispatchEvent(
    new CustomEvent(NotificationManager.REQUEST_NOTIFICATIONS_EVENT)
  );
  const { detail: notification } = await newNotificationEvent;
  Assert.deepEqual(notification, mockData[0], "Should pick first notification");
});
