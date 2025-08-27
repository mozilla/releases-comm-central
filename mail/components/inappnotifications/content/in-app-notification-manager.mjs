/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { defineLazyCustomElement } from "chrome://messenger/content/CustomElementUtils.mjs";

defineLazyCustomElement(
  "in-app-notification",
  "moz-src:///comm/mail/components/inappnotifications/content/in-app-notification.mjs"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  InAppNotifications:
    "moz-src:///comm/mail/components/inappnotifications/modules/InAppNotifications.sys.mjs",
  NotificationManager:
    "moz-src:///comm/mail/components/inappnotifications/modules/NotificationManager.sys.mjs",
  NotificationScheduler:
    "moz-src:///comm/mail/components/inappnotifications/modules/NotificationScheduler.sys.mjs",
});

/**
 * Manager element creating in-app notifications.
 *
 * @tagname in-app-notification-manager
 */
export class InAppNotificationManager extends HTMLElement {
  /**
   * @type {?InAppNotification}
   */
  #activeNotification = null;

  /**
   * @type {?HTMLElement}
   */
  #focusElement = null;

  connectedCallback() {
    if (!this.hasConnected) {
      this.addEventListener("ctaclick", this, { capture: true });
      this.addEventListener("notificationclose", this, { capture: true });
      this.hasConnected = true;
    }
    lazy.InAppNotifications.notificationManager.addEventListener(
      lazy.NotificationManager.NEW_NOTIFICATION_EVENT,
      this
    );
    lazy.InAppNotifications.notificationManager.addEventListener(
      lazy.NotificationManager.CLEAR_NOTIFICATION_EVENT,
      this
    );
    window.addEventListener("unload", this, { once: true });
  }

  disconnectedCallback() {
    this.#removeManagerListeners();
    window.removeEventListener("unload", this);
    window.removeEventListener("focusout", this);
    window.removeEventListener("keydown", this);
  }

  async handleEvent(event) {
    switch (event.type) {
      case "unload":
        this.#removeManagerListeners();
        break;
      case lazy.NotificationManager.NEW_NOTIFICATION_EVENT:
        try {
          await this.#showNotification(event.detail);
        } catch {
          // Do nothing, this means the notification was dismissed.
        }
        break;
      case lazy.NotificationManager.CLEAR_NOTIFICATION_EVENT:
        this.#hideNotification();
        break;
      case "focusout":
        this.#saveFocus(event);
        break;
      case "keydown":
        this.#handleKeydown(event);
        break;
      case "ctaclick":
        if (event.button === 0) {
          this.#focusElement?.focus();
          await lazy.InAppNotifications.notificationManager.executeNotificationCTA(
            event.notificationId
          );
        }
        break;
      case "notificationclose":
        if (event.button === 0) {
          lazy.InAppNotifications.notificationManager.dismissNotification(
            event.notificationId
          );
        }
        break;
    }
  }

  /**
   * Handles keydown events while notifications are shown to allow for a
   * keyboard shortcut to the notification.
   *
   * @param {KeyboardEvent} event
   */
  #handleKeydown(event) {
    if (
      event.code === "KeyJ" &&
      event.getModifierState("Alt") &&
      event.getModifierState("Shift")
    ) {
      document.querySelector("in-app-notification").focus();
    }
  }

  #saveFocus(event) {
    if (this.contains(event.target)) {
      return;
    }
    this.#focusElement = event.target;
  }

  /**
   * Remove all the event listeners attached to the NotificationManager instance
   * in the connectedCallback.
   */
  #removeManagerListeners() {
    lazy.InAppNotifications.notificationManager.removeEventListener(
      lazy.NotificationManager.NEW_NOTIFICATION_EVENT,
      this
    );
    lazy.InAppNotifications.notificationManager.removeEventListener(
      lazy.NotificationManager.CLEAR_NOTIFICATION_EVENT,
      this
    );
  }

  /**
   * Check if the user is active before displaying a notification. If the user
   * is not active delay showing the notification until they are. Displaying a
   * new in-app notification replaces the existing notification.
   *
   * @param {object} notification  - Notification data from the back-end.
   */
  async #showNotification(notification) {
    try {
      await lazy.NotificationScheduler.waitForActive({
        currentWindow: window,
        id: notification.id,
      });
    } catch {
      // Nothing to do here the promise was rejected. This happens for many
      // expected reasons like the window being unloaded, the notification
      // expiring, it being shown in another window etc.
      return;
    }

    const notificationElement = document.createElement("in-app-notification");

    notificationElement.setNotificationData(notification);

    if (this.#activeNotification) {
      this.#activeNotification.replaceWith(notificationElement);
    } else {
      this.append(notificationElement);
    }

    window.addEventListener("focusout", this);
    document.addEventListener("keydown", this);
    this.#activeNotification = notificationElement;
  }

  /**
   * Remove any notification currently displayed.
   */
  #hideNotification() {
    window.removeEventListener("focusout", this);
    document.removeEventListener("keydown", this);
    this.#activeNotification?.remove();
    this.#activeNotification = null;
    this.#focusElement?.focus();
  }
}

customElements.define("in-app-notification-manager", InAppNotificationManager);
