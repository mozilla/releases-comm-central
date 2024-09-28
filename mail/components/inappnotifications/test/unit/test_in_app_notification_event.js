/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { InAppNotificationEvent } = ChromeUtils.importESModule(
  "chrome://messenger/content/InAppNotificationEvent.mjs"
);

add_task(function test_eventInit() {
  const mouseEvent = new MouseEvent("click", {
    button: 0,
    buttons: 1,
    screenX: 10,
    screenY: 42,
  });
  const notificationEvent = new InAppNotificationEvent("test", mouseEvent, 7);
  Assert.equal(notificationEvent.type, "test", "Should have custom type");
  Assert.strictEqual(
    notificationEvent.button,
    0,
    "Should inherit button from mouse event"
  );
  Assert.equal(
    notificationEvent.buttons,
    1,
    "Should inherit buttons from mouse event"
  );
  Assert.equal(
    notificationEvent.screenX,
    10,
    "Should inherit screenX from mouse event"
  );
  Assert.equal(
    notificationEvent.screenY,
    42,
    "Should inherit screenY from mouse event"
  );
  Assert.equal(
    notificationEvent.notificationId,
    7,
    "Should have extra notificationId property"
  );
});
