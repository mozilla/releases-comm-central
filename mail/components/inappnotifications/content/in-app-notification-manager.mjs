/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { defineLazyCustomElement } from "chrome://messenger/content/CustomElementUtils.mjs";

defineLazyCustomElement(
  "in-app-notification",
  "chrome://messenger/content/in-app-notification.mjs"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  InAppNotifications: "resource:///modules/InAppNotifications.sys.mjs",
  NotificationManager: "resource:///modules/NotificationManager.sys.mjs",
});

/**
 * Manager element creating in-app notifications.
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
  }

  handleEvent(event) {
    switch (event.type) {
      case "unload":
        this.#removeManagerListeners();
        break;
      case lazy.NotificationManager.NEW_NOTIFICATION_EVENT:
        this.#showNotification(event.detail);
        break;
      case lazy.NotificationManager.CLEAR_NOTIFICATION_EVENT:
        this.#hideNotification();
        break;
      case "focusout":
        this.#saveFocus(event);
        break;
      case "ctaclick":
        if (event.button === 0) {
          this.#focusElement?.focus();
          lazy.InAppNotifications.notificationManager.executeNotificationCTA(
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
   * Display a new in-app notification. Replaces the existing notification.
   *
   * @param {object} notification  - Notification data from the back-end.
   */
  #showNotification(notification) {
    const notificationElement = document.createElement("in-app-notification");

    notificationElement.setNotificationData(notification);

    if (this.#activeNotification) {
      this.#activeNotification.replaceWith(notificationElement);
    } else {
      this.append(notificationElement);
    }

    window.addEventListener("focusout", this);
    this.#activeNotification = notificationElement;
  }

  /**
   * Remove any notification currently displayed.
   */
  #hideNotification() {
    window.removeEventListener("focusout", this);
    this.#activeNotification?.remove();
    this.#activeNotification = null;
    this.#focusElement?.focus();
  }
}

customElements.define("in-app-notification-manager", InAppNotificationManager);
