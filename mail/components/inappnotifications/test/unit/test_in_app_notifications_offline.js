/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { InAppNotifications } = ChromeUtils.importESModule(
  "resource:///modules/InAppNotifications.sys.mjs"
);
const { NotificationManager } = ChromeUtils.importESModule(
  "resource:///modules/NotificationManager.sys.mjs"
);
const { clearInterval, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
const { NotificationUpdater } = ChromeUtils.importESModule(
  "resource:///modules/NotificationUpdater.sys.mjs"
);
const { OfflineNotifications } = ChromeUtils.importESModule(
  "resource:///modules/OfflineNotifications.sys.mjs"
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
      severity: 1,
      targeting: {},
      type: "donation",
    },
    {
      id: "bar",
      title: "dolor sit amet",
      start_at: startDate,
      end_at: endDate,
      severity: 5,
      targeting: {},
      type: "donation",
    },
  ];
}

let bakedNotifications = [];

add_setup(async () => {
  do_get_profile();
  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI() {},
  };

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );
  registerCleanupFunction(async () => {
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
    await PlacesUtils.history.clear();
  });
  await InAppNotifications.init(true);
  bakedNotifications = await OfflineNotifications.getDefaultNotifications();

  NotificationManager._PER_TIME_UNIT = 1;

  registerCleanupFunction(() => {
    clearInterval(NotificationUpdater._interval);
    clearTimeout(InAppNotifications._showNotificationTimer);
  });
});

add_task(
  {
    skip_if: () => bakedNotifications.length === 0,
  },
  function test_initWithBuiltinNotifications() {
    Assert.deepEqual(
      InAppNotifications._jsonFile.data.notifications,
      bakedNotifications,
      "Should initialize to baked notifications if available"
    );
    const notifications = InAppNotifications.getNotifications();
    Assert.lessOrEqual(
      notifications.length,
      bakedNotifications.length,
      "Should at most get as many notifications as are built in"
    );
    Assert.equal(
      typeof InAppNotifications._jsonFile.data.seeds,
      "object",
      "Seeds should be an object"
    );
    Assert.equal(
      Object.keys(InAppNotifications._jsonFile.data.seeds).length,
      bakedNotifications.length,
      "Should generate a seed for each built in notification"
    );
    for (const notification of bakedNotifications) {
      Assert.ok(
        Object.hasOwn(InAppNotifications._jsonFile.data.seeds, notification.id),
        `Should have seed for built in notification ${notification.id}`
      );
    }
  }
);

add_task(async function test_updateNotifications() {
  const mockData = getMockNotifications();
  InAppNotifications.updateNotifications(mockData);
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    mockData,
    "Should save data to notifications"
  );

  InAppNotifications.markAsInteractedWith(mockData[0].id);
  InAppNotifications._getSeed(mockData[0].id);

  Assert.greater(
    InAppNotifications._jsonFile.data.interactedWith.length,
    0,
    "Has interacted notifications"
  );
  Assert.greater(
    Object.keys(InAppNotifications._jsonFile.data.seeds).length,
    0,
    "Has seed for notifications"
  );

  await InAppNotifications.updateNotifications([]);
  const bakedIds = bakedNotifications.map(({ id }) => id);
  Assert.deepEqual(
    InAppNotifications.getNotifications().filter(
      ({ id }) => !bakedIds.includes(id)
    ),
    [],
    "Should have cleared notifications"
  );
  Assert.deepEqual(
    InAppNotifications._jsonFile.data.interactedWith.filter(({ id }) =>
      bakedIds.includes(id)
    ),
    [],
    "Should have cleared interacted with notifications"
  );
  if (bakedNotifications.length === 0) {
    Assert.deepEqual(
      InAppNotifications._jsonFile.data.seeds,
      {},
      "Should have cleared seeds"
    );
  } else {
    Assert.equal(
      Object.keys(InAppNotifications._jsonFile.data.seeds).length,
      bakedNotifications.length,
      "Should only retain seeds of baked notifications"
    );
    Assert.ok(
      !Object.hasOwn(InAppNotifications._jsonFile.data.seeds, mockData[0].id),
      "Should no longer have seed of mock data notification"
    );
  }
});
