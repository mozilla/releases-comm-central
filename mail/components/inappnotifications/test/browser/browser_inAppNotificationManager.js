/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

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

add_task(function test_initialManagerTree() {
  Assert.equal(manager.childElementCount, 0, "Should have no children");
});

add_task(function test_showAndHideNotification() {
  manager.showNotification({
    id: "test",
    title: "Test",
    description: "Test notification",
    CTA: "Click here",
    URL: "https://example.com",
    type: "donation",
    severity: 4,
  });

  const notification = manager.querySelector("in-app-notification");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should have one notification child"
  );
  Assert.ok(notification, "Should find a notification");

  manager.hideNotification();

  Assert.equal(manager.childElementCount, 0, "Should have no more children");

  manager.showNotification({
    id: "test2",
    title: "Another test",
    description: "A new one already",
    CTA: "Click here",
    URL: "https://example.com",
    type: "donation",
    severity: 4,
  });

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

  manager.hideNotification();
});

add_task(function test_showNotificationReplaces() {
  manager.showNotification({
    id: "test",
    title: "Test",
    description: "Test notification",
    CTA: "Click here",
    URL: "https://example.com",
    type: "donation",
    severity: 4,
  });

  const notification = manager.querySelector("in-app-notification");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should have one notification child"
  );
  Assert.ok(notification, "Should find a notification");

  manager.showNotification({
    id: "test2",
    title: "Another test",
    description: "A new one already",
    CTA: "Click here",
    URL: "https://example.com",
    type: "donation",
    severity: 4,
  });

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

  manager.hideNotification();
});
