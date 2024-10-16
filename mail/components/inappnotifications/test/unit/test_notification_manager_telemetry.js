/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { NotificationManager } = ChromeUtils.importESModule(
  "resource:///modules/NotificationManager.sys.mjs"
);
const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);
const { BrowserTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/BrowserTestUtils.sys.mjs"
);
const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

add_setup(function test_setup() {
  // FOG needs a profile directory to put its data in.
  do_get_profile();

  // FOG needs to be initialized in order for data to flow.
  Services.fog.initializeFOG();

  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI(uri) {
      Assert.equal(
        uri.spec,
        "about:blank",
        "Should only receive about:blank load request"
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

add_task(function test_notification_shown() {
  Assert.equal(
    Glean.inappnotifications.shown.testGetValue(),
    undefined,
    "Should have no shown events yet"
  );

  const notificationManager = new NotificationManager();

  notificationManager.updatedNotifications([
    {
      id: "test",
      severity: 1,
      end_at: new Date(Date.now() + 100000).toISOString(),
    },
  ]);

  const events = Glean.inappnotifications.shown.testGetValue();

  Assert.equal(events.length, 1, "Should record one shown event");

  const [event] = events;

  Assert.equal(event.name, "shown", "Should have shown event");
  Assert.equal(
    event.extra.notification_id,
    "test",
    "Should have shown event for test notification"
  );
});

add_task(function test_notification_interaction() {
  Assert.equal(
    Glean.inappnotifications.interaction.testGetValue(),
    undefined,
    "Should have no interaction events yet"
  );

  const notificationManager = new NotificationManager();

  notificationManager.updatedNotifications([
    {
      id: "test",
      severity: 1,
      end_at: new Date(Date.now() + 100000).toISOString(),
      CTA: "click here",
      URL: "about:blank",
    },
  ]);
  notificationManager.executeNotificationCTA("test");

  const events = Glean.inappnotifications.interaction.testGetValue();

  Assert.equal(events.length, 1, "Should record one interaction event");

  const [event] = events;

  Assert.equal(event.name, "interaction", "Should have an interaction event");
  Assert.equal(
    event.extra.notification_id,
    "test",
    "Should have interaction event for test notification"
  );
  Assert.greaterOrEqual(
    Number.parseInt(event.extra.active_this_session, 10),
    0,
    "Should have an active duration recorded"
  );
});

add_task(function test_notification_closed() {
  Assert.equal(
    Glean.inappnotifications.closed.testGetValue(),
    undefined,
    "Should have no closed events yet"
  );

  const notificationManager = new NotificationManager();

  notificationManager.updatedNotifications([
    {
      id: "test",
      severity: 1,
      end_at: new Date(Date.now() + 100000).toISOString(),
    },
  ]);
  notificationManager.dismissNotification("test");

  const events = Glean.inappnotifications.closed.testGetValue();

  Assert.equal(events.length, 1, "Should record one close event");

  const [event] = events;

  Assert.equal(event.name, "closed", "Should have a close event");
  Assert.equal(
    event.extra.notification_id,
    "test",
    "Should have closed event for test notification"
  );
  Assert.greaterOrEqual(
    Number.parseInt(event.extra.active_this_session, 10),
    0,
    "Should have an active duration recorded"
  );
});

add_task(async function test_notification_closed() {
  Assert.equal(
    Glean.inappnotifications.dismissed.testGetValue(),
    undefined,
    "Should have no dismissed events yet"
  );

  const notificationManager = new NotificationManager();

  notificationManager.updatedNotifications([
    {
      id: "first",
      severity: 1,
      end_at: new Date(Date.now() + 1).toISOString(),
    },
  ]);
  await BrowserTestUtils.waitForEvent(
    notificationManager,
    NotificationManager.REQUEST_NOTIFICATIONS_EVENT
  );
  const dismissEvents = Glean.inappnotifications.dismissed.testGetValue();
  Assert.equal(
    dismissEvents.length,
    1,
    "Should have recorded a first dismissed event"
  );

  notificationManager.updatedNotifications([
    {
      id: "test",
      severity: 2,
      end_at: new Date(Date.now() + 100000).toISOString(),
    },
  ]);
  notificationManager.updatedNotifications([]);

  const clearEvents = Glean.inappnotifications.dismissed.testGetValue();
  Assert.equal(
    clearEvents.length,
    2,
    "Should collect dismissed events for two reasons"
  );

  const [firstEvent, clearEvent] = clearEvents;

  Assert.equal(firstEvent.name, "dismissed", "Should have dismissed event");
  Assert.equal(
    firstEvent.extra.notification_id,
    "first",
    "First dismiss event should be for expiring notification"
  );
  Assert.greaterOrEqual(
    Number.parseInt(firstEvent.extra.active_this_session, 10),
    0,
    "Should have an active duration recorded"
  );
  Assert.equal(
    clearEvent.name,
    "dismissed",
    "Should have another dismissed event"
  );
  Assert.equal(
    clearEvent.extra.notification_id,
    "test",
    "Second dismissed event should be for cleared notification"
  );
  Assert.greaterOrEqual(
    Number.parseInt(clearEvent.extra.active_this_session, 10),
    0,
    "Should have an active duration recorded"
  );
});

add_task(async function test_notification_active_this_session() {
  const notificationManager = new NotificationManager();
  const endAt = new Date(Date.now() + 100000).toISOString();
  notificationManager.updatedNotifications([
    {
      id: "test",
      severity: 2,
      end_at: endAt,
    },
  ]);

  // Wait for a moment.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1100));

  const shownCount = Glean.inappnotifications.shown.testGetValue()?.length ?? 0;

  // Simulate update with the same notifications, but new elements because JSON
  // parsing.
  notificationManager.updatedNotifications([
    {
      id: "test",
      severity: 2,
      end_at: endAt,
    },
  ]);

  Assert.equal(
    Glean.inappnotifications.shown.testGetValue()?.length ?? 0,
    shownCount,
    "Should not record another shown event for same notification"
  );

  notificationManager.updatedNotifications([]);

  const event = Glean.inappnotifications.dismissed.testGetValue().at(-1);

  Assert.greaterOrEqual(
    Number.parseInt(event.extra.active_this_session, 10),
    1,
    "Should be selected for at least a second"
  );
});
