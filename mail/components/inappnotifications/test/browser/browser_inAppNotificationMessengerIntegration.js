/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { InAppNotificationManager } = ChromeUtils.importESModule(
  "chrome://messenger/content/in-app-notification-manager.mjs",
  { global: "current" }
);

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
  const manager = document.querySelectorAll(
    "body > .in-app-notification-root > in-app-notification-manager"
  );
  Assert.equal(
    manager.length,
    1,
    "Contains notification element in correct position"
  );

  Assert.ok(
    manager[0] instanceof InAppNotificationManager,
    "Is an instance of in-app-notification-manager"
  );
});
