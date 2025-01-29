/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { OfflineNotifications } = ChromeUtils.importESModule(
  "resource:///modules/OfflineNotifications.sys.mjs"
);

// Properties required in the main notification object by the schema:
// https://github.com/thunderbird/thunderbird-notifications/blob/main/schema.json
const REQUIRED_PROPERTIES = [
  "id",
  "start_at",
  "end_at",
  "title",
  "description",
  "severity",
  "type",
  "targeting",
];

add_task(async function test_get_default_notifications() {
  const notifications = await OfflineNotifications.getDefaultNotifications();

  Assert.ok(Array.isArray(notifications), "Notifications should be an array");
  // Make sure the data looks like valid notifications.
  for (const notification of notifications) {
    for (const requiredProperty of REQUIRED_PROPERTIES) {
      Assert.ok(
        Object.hasOwn(notification, requiredProperty),
        `Expect ${requiredProperty} on ${
          notification.id || notifications.indexOf(notification)
        }`
      );
    }
    Assert.equal(
      typeof notification.id,
      "string",
      `id should be a string for ${notification.id}`
    );
    Assert.equal(
      typeof notification.type,
      "string",
      `type should be a string for ${notification.id}`
    );
    Assert.equal(
      typeof notification.title,
      "string",
      `title should be a string for ${notification.id}`
    );
    Assert.equal(
      typeof notification.description,
      "string",
      `description should be a string for ${notification.id}`
    );
    Assert.equal(
      typeof notification.targeting,
      "object",
      `targeting should be an object for ${notification.id}`
    );
    Assert.ok(
      Number.isInteger(notification.severity),
      `severity should be an integer for ${notification.id}`
    );
    Assert.ok(
      !Number.isNaN(Date.parse(notification.start_at)),
      `start_at should parse to a timestamp for ${notification.id}`
    );
    // Explicitly skip the baked test notification.
    if (notification.id === "BAKED-20250725-TEST") {
      continue;
    }
    Assert.greater(
      Date.parse(notification.end_at),
      Date.now(),
      `Notification should have a chance to be displayed for ${notification.id}`
    );
  }
});

add_task(async function test_get_default_notification_ids() {
  const notificationIds =
    await OfflineNotifications.getDefaultNotificationIds();
  const notifications = await OfflineNotifications.getDefaultNotifications();

  Assert.equal(
    notificationIds.size,
    notifications.length,
    "Notification ID set should have the same size as there are notifications"
  );
  Assert.ok(
    notifications.every(({ id }) => notificationIds.has(id)),
    "Every ID should be in the set"
  );
});
