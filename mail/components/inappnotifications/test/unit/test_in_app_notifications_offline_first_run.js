/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const { InAppNotifications } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/inappnotifications/modules/InAppNotifications.sys.mjs"
);
const { NotificationManager } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/inappnotifications/modules/NotificationManager.sys.mjs"
);
const { clearInterval, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
const { NotificationUpdater } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/inappnotifications/modules/NotificationUpdater.sys.mjs"
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

  MockExternalProtocolService.init();

  await InAppNotifications.init(true);

  NotificationManager._PER_TIME_UNIT = 1;

  registerCleanupFunction(async () => {
    NotificationUpdater._clearStateForTests();
    clearTimeout(InAppNotifications._showNotificationTimer);
    Services.prefs.clearUserPref(
      "datareporting.policy.dataSubmissionPolicyAcceptedVersion"
    );
    MockExternalProtocolService.reset();
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
