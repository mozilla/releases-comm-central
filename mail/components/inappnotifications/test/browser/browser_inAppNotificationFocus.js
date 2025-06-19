/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals reset, showNotification, waitForNotification, waitForMinimize
 * NotificationManager, NotificationScheduler, InAppNotifications
 */

"use strict";

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

add_setup(async () => {
  MockExternalProtocolService.init();

  NotificationScheduler.observe(null, "active");

  await TestUtils.waitForTick();

  registerCleanupFunction(async () => {
    await InAppNotifications.updateNotifications([]);
    MockExternalProtocolService.cleanup();
  });
});

add_task(async function test_maintainsFocusWhenOpened() {
  const searchBar = document.querySelector("global-search-bar");
  searchBar.focus();

  await showNotification();

  await waitForNotification(true);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "Notification Shown"
  );

  Assert.equal(
    searchBar,
    document.activeElement,
    "the search bar still has focus"
  );

  InAppNotifications.updateNotifications([]);

  await waitForNotification(false);
});

add_task(async function test_maintainsFocusWhenClosed() {
  await showNotification();

  await waitForNotification(true);

  const searchBar = document.querySelector("global-search-bar");
  searchBar.focus();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "Notification Shown"
  );

  EventUtils.synthesizeMouseAtCenter(
    document
      .querySelector("in-app-notification")
      .shadowRoot.querySelector("in-app-notification-container")
      .shadowRoot.querySelector('[is="in-app-notification-close-button"]'),
    {}
  );

  Assert.equal(
    searchBar,
    document.activeElement,
    "the search bar still has focus"
  );

  InAppNotifications.updateNotifications([]);

  await waitForNotification(false);
});

add_task(async function test_doesNotStoreFocusElementInsideNotification() {
  await showNotification();

  await waitForNotification(true);

  const searchBar = document.querySelector("global-search-bar");
  searchBar.focus();

  const container = document
    .querySelector("in-app-notification")
    .shadowRoot.querySelector("in-app-notification-container").shadowRoot;

  container.querySelector(".in-app-notification-container").focus();

  EventUtils.synthesizeMouseAtCenter(
    container.querySelector('[is="in-app-notification-close-button"]'),
    {}
  );

  Assert.equal(
    searchBar,
    document.activeElement,
    "the search bar still has focus"
  );

  await InAppNotifications.updateNotifications([]);

  await waitForNotification(false);
});
