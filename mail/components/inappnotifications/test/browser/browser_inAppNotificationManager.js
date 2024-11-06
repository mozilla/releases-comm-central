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
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
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
  await SimpleTest.promiseFocus(tab.browser);
  browser = tab.browser;
  manager = browser.contentWindow.document.querySelector(
    `in-app-notification-manager`
  );

  registerCleanupFunction(() => {
    hideNotification();
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
async function showNotification(id, title, description) {
  const eventPromise = BrowserTestUtils.waitForEvent(
    InAppNotifications.notificationManager,
    NotificationManager.NEW_NOTIFICATION_EVENT,
    false,
    event => event.detail.id === id
  );
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
  await eventPromise;
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

add_task(async function test_showAndHideNotification() {
  await showNotification("test", "Test", "Test notification");

  const notification = manager.querySelector("in-app-notification");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should have one notification child"
  );
  Assert.ok(notification, "Should find a notification");

  hideNotification();

  Assert.equal(manager.childElementCount, 0, "Should have no more children");

  await showNotification("test2", "Another test", "A new one already");

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

add_task(async function test_showNotificationReplaces() {
  await showNotification("test", "Test", "Test notification");

  const notification = manager.querySelector("in-app-notification");

  Assert.equal(
    manager.childElementCount,
    1,
    "Should have one notification child"
  );
  Assert.ok(notification, "Should find a notification");

  await showNotification("test2", "Another test", "A new one already");

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

add_task(async function test_disconnected() {
  manager.remove();

  await showNotification("test", "Test", "Test notification");

  Assert.equal(
    manager.childElementCount,
    0,
    "Should not show a notification when disconnected"
  );

  browser.contentWindow.document.body.append(manager);

  await showNotification("test", "Test", "Test notification");
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

add_task(async function test_unload() {
  browser.contentWindow.dispatchEvent(new Event("unload"));

  await showNotification("test", "Test", "Test notification");

  Assert.equal(
    manager.childElementCount,
    0,
    "Should not show a notification after the document said it is unloading"
  );

  manager.connectedCallback();

  await showNotification("test", "Test", "Test notification");
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

add_task(async function test_ctaClick() {
  const spy = sinon.spy(
    InAppNotifications.notificationManager,
    "executeNotificationCTA"
  );
  await showNotification("ctatest", "Test", "Test notification");
  await SimpleTest.promiseFocus(browser);

  const ctaButton =
    manager.firstElementChild.shadowRoot.firstElementChild.shadowRoot.querySelector(
      'a[is="in-app-notification-button"]'
    );
  const eventPromise = BrowserTestUtils.waitForEvent(ctaButton, "ctaclick");

  EventUtils.synthesizeMouseAtCenter(ctaButton, {}, browser.contentWindow);
  await eventPromise;

  Assert.equal(spy.callCount, 1, "Should call cta callback on manager once");
  Assert.ok(spy.calledWith("ctatest"));

  spy.restore();
  hideNotification();
}).skip(Cu.isInAutomation); //TODO Bug 1921222: Fix test timeout in automation.

add_task(async function test_closeClick() {
  const spy = sinon.spy(
    InAppNotifications.notificationManager,
    "dismissNotification"
  );
  await showNotification("closetest", "Test", "Test notification");

  const closeButton =
    manager.firstElementChild.shadowRoot.firstElementChild.shadowRoot.querySelector(
      'button[is="in-app-notification-close-button"]'
    );
  const eventPromise = BrowserTestUtils.waitForEvent(
    closeButton,
    "notificationclose"
  );

  EventUtils.synthesizeMouseAtCenter(closeButton, {}, browser.contentWindow);
  await eventPromise;

  Assert.equal(spy.callCount, 1, "Should call close callback on manager once");
  Assert.ok(spy.calledWith("closetest"));

  spy.restore();
  hideNotification();
}).skip(Cu.isInAutomation); //TODO Bug 1921222: Fix test timeout in automation.

add_task(async function test_keyboardShortcut() {
  await showNotification("test", "Test", "Test notification");
  manager.dispatchEvent(
    new KeyboardEvent("keydown", {
      altKey: true,
      shiftKey: true,
      code: "KeyJ",
      bubbles: true,
      composed: true,
    })
  );

  const notification = manager.firstElementChild;

  // The in-app-notification is reported as having focus because the container
  // that really has focus is in the shadow root.
  Assert.equal(
    browser.contentWindow.document.activeElement,
    notification,
    "The notification has focus"
  );

  hideNotification();
});
