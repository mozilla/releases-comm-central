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
const { NotificationScheduler } = ChromeUtils.importESModule(
  "resource:///modules/NotificationScheduler.sys.mjs"
);

let count = 0;

/**
 * Dispatch the event to show a new notification on the notification manager and
 *  wait for it to be visible.
 *
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.title
 * @param {string} options.description
 * @param {string} options.type
 * @param {boolean} options.wait - Wait for new notification event.
 */
async function showNotification({
  id = `IAN-${count++}`,
  title = "IAN TITLE",
  description = "IAN Description",
  type = "donation",
  wait = true,
} = {}) {
  const noUi = ["donation_tab", "donation_browser"].includes(type);
  let eventPromise = Promise.resolve();

  if (!noUi && wait) {
    eventPromise = BrowserTestUtils.waitForEvent(
      InAppNotifications.notificationManager,
      NotificationManager.NEW_NOTIFICATION_EVENT,
      false,
      event => event.detail.id === id
    );
  }

  InAppNotifications.updateNotifications([
    {
      id,
      title,
      description,
      URL: "https://example.com/notificationTarget",
      CTA: "Click me!",
      severity: 1,
      type,
      start_at: new Date(Date.now() - 100000).toISOString(),
      end_at: new Date(Date.now() + 9999999999).toISOString(),
      targeting: {},
    },
  ]);

  await eventPromise;
}

/**
 * Wait for the window to be minimized.
 */
async function waitForMinimize() {
  await TestUtils.waitForCondition(() => {
    return window.document.hidden;
  }, "window is minimized");
}

/**
 * Dispatch the event to clear all notifications on the notification manager,
 * wait for no notifications to be showing, and reset the observer status of the
 * scheduler
 */
async function reset() {
  InAppNotifications.updateNotifications([]);

  await waitForNotification(false);

  NotificationScheduler.observe(null, "active");

  await waitForNotification(false);
}

const { outerWidth, outerHeight } = window;
/**
 * Move the window to the origin along with normal reset.
 */
async function resetWindow() {
  window.resizeTo(outerWidth, outerHeight);
  await moveWindowTo(window.screen.availLeft, window.screen.availTop);
  await reset();
}

/**
 * Wait for a notification to be shown or hidden.
 *
 * @param {boolean} show - If we should wait for the notification to be shown or
 *  hidden.
 * @param {window} win - The window to wait for the notification within.
 */
async function waitForNotification(show, win = window) {
  await TestUtils.waitForCondition(
    () => {
      const notification = win.document.querySelector("in-app-notification");
      return show ? notification : !notification;
    },
    `notification is ${show ? "visible" : "hidden"}`
  );
}

/**
 * Open a new window the same size as the current window and wait for it to be
 * ready.
 *
 * @param {object} options
 * @param {boolean} options.cover - If the new window should cover the current
 *   window.
 * @returns {window}
 */
async function openNewWindow({ cover = true } = {}) {
  const windowLeft = window.screen.left + (cover ? 0 : window.outerWidth + 1);
  const newWindow = window.open(
    "chrome://messenger/content/messenger.xhtml",
    "_blank",
    `chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar,width=${window.outerWidth},height=${window.outerHeight},left=${windowLeft},top=${window.screen.top}`
  );

  await TestUtils.waitForCondition(() => {
    return !!newWindow.document.querySelector("in-app-notification-manager");
  }, "window is ready");

  await SimpleTest.promiseFocus(newWindow);

  return newWindow;
}

/**
 * Wait an amount of time for something to NOT happen.
 *
 * @param {number} time - The amount of time to wait.
 */
async function waitASecond(time = 1000) {
  /* eslint-disable-next-line mozilla/no-arbitrary-setTimeout */
  await new Promise(resolve => setTimeout(resolve, time));
}

/**
 *
 * @param {number} x - The number of pixels to move the window in the x
 *  direction.
 * @param {number} y - The number of pixels to move the window in the y
 *  direction.
 */
async function moveWindowTo(x, y) {
  let timeout;

  const { promise, resolve } = Promise.withResolvers();

  // The scheduler debounces for one second when moving so we do 1100ms.
  function debounce() {
    clearTimeout(timeout);

    /* eslint-disable-next-line mozilla/no-arbitrary-setTimeout */
    timeout = setTimeout(resolve, 1100);
  }

  debounce();
  window.windowRoot.addEventListener("MozUpdateWindowPos", debounce);

  window.moveTo(x, y);

  await promise;
}
