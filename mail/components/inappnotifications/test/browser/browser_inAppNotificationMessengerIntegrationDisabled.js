/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(function test_documentContainsTemplates() {
  Assert.equal(
    document.querySelectorAll("#inAppNotificationContainerTemplate").length,
    1,
    "Contains 1 container template"
  );
  Assert.equal(
    document.querySelectorAll("#inAppNotificationTemplate").length,
    1,
    "Contains 1 notification template"
  );
  Assert.equal(
    document.querySelectorAll("#inAppNotificationCloseButtonTemplate").length,
    1,
    "Contains 1 close button template"
  );
});

add_task(async function test_documentContainsManagerWhenPrefTrue() {
  Assert.equal(
    document.querySelectorAll("in-app-notification-manager").length,
    0,
    "Does not contain notification element"
  );
});

add_task(async function test_disabledTelemetryProbe() {
  Assert.ok(
    !(await Glean.inappnotifications.preferences[
      "mail.inappnotifications.enabled"
    ].testGetValue()),
    "Telemetry should show notifications disabled based on enabled prefrence"
  );
});
