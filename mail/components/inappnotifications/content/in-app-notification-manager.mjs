/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

//TODO Should be enabled once element is implemented.
// import { InAppNotification } from "./in-app-notification.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  InAppNotifications: "resource:///modules/InAppNotifications.sys.mjs",
  NotificationManager: "resource:///modules/NotificationManager.sys.mjs",
});

/**
 * Manager element creating in-app notifications.
 */
class InAppNotificationManager extends HTMLElement {
  /**
   * @type {?InAppNotification}
   */
  #activeNotification = null;

  connectedCallback() {
    lazy.InAppNotifications.notificationManager.addEventListener(
      lazy.NotificationManager.NEW_NOTIFICATION_EVENT,
      this
    );
    window.addEventListener("unload", this, { once: true });
  }

  disconnectedCallback() {
    this.#removeManagerListeners();
    window.removeEventListener("unload", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "unload":
        this.#removeManagerListeners();
        break;
      case lazy.NotificationManager.NEW_NOTIFICATION_EVENT:
        this.showNotification(event.detail);
        break;
    }
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
  }

  /**
   * Display a new in-app notification. Replaces the existing notification.
   *
   * TODO: consider making this and hideNotification private methods.
   *
   * @param {object} notification  - Notification data from the back-end.
   */
  showNotification(notification) {
    const notificationElement = document.createElement("in-app-notification");

    //TODO Unconditionally expect this to be a method once in-app-notification
    // element is implemented. Not commented out so |notification| is used.
    notificationElement.setNotificationData?.(notification);

    if (this.#activeNotification) {
      this.#activeNotification.replaceWith(notificationElement);
    } else {
      this.append(notificationElement);
    }

    this.#activeNotification = notificationElement;
  }

  /**
   * Remove any notification currently displayed.
   */
  hideNotification() {
    this.#activeNotification?.remove();
    this.#activeNotification = null;
  }
}

customElements.define("in-app-notification-manager", InAppNotificationManager);
