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

add_setup(async () => {
  do_get_profile();
  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI() {
      Assert.ok(
        false,
        "Should not try to load an URI with the external protocol service"
      );
    },
  };
  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );

  await InAppNotifications.init(true);

  NotificationManager._PER_TIME_UNIT = 1;

  registerCleanupFunction(async () => {
    clearInterval(NotificationUpdater._interval);
    clearTimeout(InAppNotifications._showNotificationTimer);
    Services.prefs.clearUserPref(
      "datareporting.policy.dataSubmissionPolicyAcceptedVersion"
    );
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
    await PlacesUtils.history.clear();
  });
});

add_task(async function test_initializedData() {
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    [],
    "Should initialize notifications with an empty array"
  );
  Assert.deepEqual(
    InAppNotifications._jsonFile.data.seeds,
    {},
    "Should initialize seeds"
  );
  Assert.ok(NotificationUpdater._timeout, "Should schedule an update interval");
});
