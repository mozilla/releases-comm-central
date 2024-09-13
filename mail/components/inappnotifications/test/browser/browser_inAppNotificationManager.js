/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { InAppNotifications } = ChromeUtils.importESModule(
  "resource:///modules/InAppNotifications.sys.mjs"
);
const { NotificationManager } = ChromeUtils.importESModule(
  "resource:///modules/NotificationManager.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let browser, manager;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/inappnotifications/test/browser/files/inAppNotificationManager.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("inAppNotificationManager.xhtml")
  );
  tab.browser.focus();
  browser = tab.browser;
  manager = browser.contentWindow.document.querySelector(
    `in-app-notification-manager`
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

/**
 * Dispatch the event to show a new notification on the notification manager.
 *
 * @param {string} id
 * @param {string} title
 * @param {string} description
 */
function showNotification(id, title, description) {
  InAppNotifications.notificationManager.dispatchEvent(
    new CustomEvent(NotificationManager.NEW_NOTIFICATION_EVENT, {
      detail: {
        id,
        title,
        description,
        CTA: "Click here",
        URL: "https://example.com",
        type: "donation",
        severity: 4,
      },
    })
  );
}

/**
 * Dispatch the event to clear all notifications on the notification manager.
 */
function hideNotification() {
  InAppNotifications.notificationManager.dispatchEvent(
    new CustomEvent(NotificationManager.CLEAR_NOTIFICATION_EVENT)
  );
}

add_task(function test_initialManagerTree() {
  Assert.equal(manager.childElementCount, 0, "Should have no children");
});

add_task(function test_showAndHideNotification() {
  showNotification("test", "Test", "Test notification");

  const notification = manager.querySelector("in-app-notification");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should have one notification child"
  );
  Assert.ok(notification, "Should find a notification");

  hideNotification();

  Assert.equal(manager.childElementCount, 0, "Should have no more children");

  showNotification("test2", "Another test", "A new one already");

  const newNotification = manager.querySelector("in-app-notification");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should have a notification again"
  );
  Assert.ok(newNotification, "Should find another notification");
  Assert.notStrictEqual(
    newNotification,
    notification,
    "Should create a new notification"
  );

  hideNotification();
});

add_task(function test_showNotificationReplaces() {
  showNotification("test", "Test", "Test notification");

  const notification = manager.querySelector("in-app-notification");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should have one notification child"
  );
  Assert.ok(notification, "Should find a notification");

  showNotification("test2", "Another test", "A new one already");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should still only have one notification"
  );

  const newNotification = manager.querySelector("in-app-notification");

  Assert.ok(newNotification, "Should still find a notification");
  Assert.notStrictEqual(
    newNotification,
    notification,
    "Should replace notification"
  );

  hideNotification();
});

add_task(function test_disconnected() {
  manager.remove();

  showNotification("test", "Test", "Test notification");

  Assert.equal(
    manager.childElementCount,
    0,
    "Should not show a notification when disconnected"
  );

  browser.contentWindow.document.body.append(manager);

  showNotification("test", "Test", "Test notification");
  manager.remove();

  hideNotification();

  Assert.equal(
    manager.childElementCount,
    1,
    "Should not hide notification when disconnected"
  );

  browser.contentWindow.document.body.append(manager);
  hideNotification();
});

add_task(function test_unload() {
  browser.contentWindow.dispatchEvent(new Event("unload"));

  showNotification("test", "Test", "Test notification");

  Assert.equal(
    manager.childElementCount,
    0,
    "Should not show a notification after the document said it is unloading"
  );

  manager.connectedCallback();

  showNotification("test", "Test", "Test notification");
  browser.contentWindow.dispatchEvent(new Event("unload"));

  hideNotification();

  Assert.equal(
    manager.childElementCount,
    1,
    "Should not hide notification after the document said it is unloading"
  );

  manager.connectedCallback();
  hideNotification();
});
