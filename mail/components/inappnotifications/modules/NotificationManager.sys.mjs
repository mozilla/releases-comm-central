/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  openLinkExternally: "resource:///modules/LinkHelper.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  requestIdleCallback: "resource://gre/modules/Timer.sys.mjs",
  cancelIdleCallback: "resource://gre/modules/Timer.sys.mjs",
});

/**
 * Makes sure any pending notifications are shown one after another (as the user
 * interacts with them or they expire). Requires updatedNotifications to be
 * called at least once, as soon as there are available notifications. From then
 * on it will work through the available notifications, until none are left and
 * it will wait for a call to updatedNotifications again.
 *
 * @fires newnotification - Has the notification to display in the detail.
 * @fires clearnotification - Sent when no notification should be shown.
 * @fires notificationinteractedwith - Emitted when a notification has been
 *   interacted with.
 * @fires requestnotifications - Emitted to request an update on
 *   the currently available notifications. Listeners should call
 *   updatedNotifications with an array of the notifications.
 */
export class NotificationManager extends EventTarget {
  static NEW_NOTIFICATION_EVENT = "newnotification";
  static CLEAR_NOTIFICATION_EVENT = "clearnotification";
  static NOTIFICATION_INTERACTION_EVENT = "notificationinteractedwith";
  static REQUEST_NOTIFICATIONS_EVENT = "requestnotifications";

  /**
   * Milliseconds between the next attempt of showing a notification after the
   * user interacted with a notification. If the application is idle before that
   * or we refresh the information from the server we might show a notifiation
   * earlier.
   *
   * @type {number}
   */
  static #MAX_MS_BETWEEN_NOTIFICATIONS = 1000 * 60;

  /**
   * Check if a notification has UI that should be shown. The only notification
   * type that doesn't have UI is the "donations_old" type, which imitates the
   * appeal behavior, where we open a webseite in the user's browser.
   *
   * @param {object} notification
   * @returns {boolean} If this notification should show a popup in the UI.
   */
  static #isNotificationWithUI(notification) {
    return notification.type !== "donations_old";
  }

  /**
   * @type {?object}
   */
  #_currentNotification = null;

  get #currentNotification() {
    return this.#_currentNotification;
  }

  set #currentNotification(notification) {
    if (this.#_currentNotification == notification) {
      return;
    }
    this.#_currentNotification = notification;
    if (notification) {
      if (NotificationManager.#isNotificationWithUI(notification)) {
        this.dispatchEvent(
          new CustomEvent(NotificationManager.NEW_NOTIFICATION_EVENT, {
            detail: notification,
          })
        );
      } else if (notification.URL) {
        this.executeNotificationCTA(notification.id);
      }
    } else {
      this.dispatchEvent(
        new CustomEvent(NotificationManager.CLEAR_NOTIFICATION_EVENT)
      );
    }
  }

  /**
   * @type {?number}
   */
  #timer;

  /**
   * @type {?number}
   */
  #idleCallback;

  /**
   * Called when the user clicks on the call to action of a notification.
   *
   * @param {string} notificationId - ID of the notification.
   */
  executeNotificationCTA(notificationId) {
    if (notificationId !== this.#currentNotification?.id) {
      console.warn(
        `Interaction with notification ${notificationId} that shouldn't be visible`
      );
      return;
    }
    this.dispatchEvent(
      new CustomEvent(NotificationManager.NOTIFICATION_INTERACTION_EVENT, {
        detail: notificationId,
      })
    );
    lazy.openLinkExternally(this.#currentNotification.URL);
    this.#currentNotification = null;
    this.#pickSoon();
  }

  /**
   * Called when the user dismissed a notification.
   *
   * @param {string} notificationId - ID of the notification that was dismissed.
   */
  dismissNotification(notificationId) {
    if (notificationId !== this.#currentNotification?.id) {
      console.warn(
        `Notification ${notificationId} was not expected to be visible`
      );
      return;
    }
    this.dispatchEvent(
      new CustomEvent(NotificationManager.NOTIFICATION_INTERACTION_EVENT, {
        detail: notificationId,
      })
    );
    this.#currentNotification = null;
    this.#pickSoon();
  }

  /**
   * Let this manager know that the notifications available for in-app
   * notifications have been updated. Checks if the displayed notification
   * candidate should change.
   *
   * Picks the best notification for display and emits events related to it.
   *
   * @param {object[]} notifications
   */
  updatedNotifications(notifications) {
    const [firstCandidate] = notifications.toSorted(
      (a, b) => a.severity - b.severity
    );
    // We got an update, we no longer need new notifications.
    if (this.#idleCallback) {
      lazy.cancelIdleCallback(this.#idleCallback);
      this.#idleCallback = null;
    }
    // Check if the current notification is still a good choice.
    if (
      this.#currentNotification &&
      firstCandidate &&
      (this.#currentNotification.id === firstCandidate.id ||
        (this.#currentNotification.severity <= firstCandidate.severity &&
          notifications.some(
            notification => notification.id === this.#currentNotification.id
          )))
    ) {
      return;
    }
    // We're going to change the visible notification, stop the timer of the
    // current one.
    if (this.#timer) {
      lazy.clearTimeout(this.#timer);
      this.#timer = null;
    }
    if (!firstCandidate) {
      this.#currentNotification = null;
      return;
    }
    // Set up for displaying a new notification.
    this.#currentNotification = firstCandidate;
    this.#timer = lazy.setTimeout(
      this.#notificationExpired,
      Date.parse(firstCandidate.end_at) - Date.now() + 100
    );
  }

  /**
   * Callback when the current notification expired.
   */
  #notificationExpired = () => {
    this.#timer = null;
    this.#currentNotification = null;
    this.dispatchEvent(
      new CustomEvent(NotificationManager.REQUEST_NOTIFICATIONS_EVENT)
    );
  };

  /**
   * Pick a new notification soon.
   */
  #pickSoon() {
    this.#idleCallback = lazy.requestIdleCallback(this.#idleCallbackExpired, {
      timeout: NotificationManager.#MAX_MS_BETWEEN_NOTIFICATIONS,
    });
  }

  #idleCallbackExpired = () => {
    this.#idleCallback = null;
    this.dispatchEvent(
      new CustomEvent(NotificationManager.REQUEST_NOTIFICATIONS_EVENT)
    );
  };

  addEventListener(eventName, listener, ...details) {
    super.addEventListener(eventName, listener, ...details);
    // Re-emit the new notification event to the newly registered listener.
    if (
      eventName === NotificationManager.NEW_NOTIFICATION_EVENT &&
      this.#currentNotification &&
      NotificationManager.#isNotificationWithUI(this.#currentNotification)
    ) {
      listener(
        new CustomEvent(NotificationManager.NEW_NOTIFICATION_EVENT, {
          detail: this.#currentNotification,
        })
      );
    }
  }
}
