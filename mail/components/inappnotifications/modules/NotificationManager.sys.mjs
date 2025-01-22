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
   * The maximum number of notifications shown per day. This prevents spam from
   * either a misconfigured notifications payload or from use of an alternate
   * notification server.
   *
   * @type {number}
   */
  static #MAX_NOTIFICATIONS_PER_DAY = 6;

  /**
   * The timestamps of when the last #MAX_NOTIFICATIONS_PER_DAY notifications
   * were shown. This is used to check to make sure that no more than the
   * #MAX_NOTIFICATIONS_PER_DAY
   * notifications are shown
   *
   * @type {number[]}
   */
  #notificationHistory = [];

  /**
   * Milliseconds between the next attempt of showing a notification after the
   * user interacted with a notification. If the application is idle before that
   * or we refresh the information from the server we might show a notifiation
   * earlier.
   *
   * @private
   * @type {number}
   */
  static _MAX_MS_BETWEEN_NOTIFICATIONS = 1000 * 60;

  /**
   * The unit of time in MS, for which notifications are limited. This defaults
   * to 1 day but can be modified to make testing possible.
   *
   * @private
   * @type {number}
   */
  static _PER_TIME_UNIT = 1000 * 60 * 60 * 24;

  /**
   * Check if a notification has UI that should be shown. The only notification
   * types that don't have UI are the "donation_browser" or "donation_tab"
   * types, which imitate the appeal behavior, where we open a website. Setting
   * name and private explicitly to work around jsdoc parsing issue.
   *
   * @name NotificationManager.isNotificationWithUI
   * @private
   * @param {object} notification
   * @returns {boolean} If this notification should show a popup in the UI.
   */
  static #isNotificationWithUI(notification) {
    return !["donation_browser", "donation_tab"].includes(notification.type);
  }

  /**
   * @type {?object}
   */
  #_currentNotification = null;

  /**
   * Timestamp when the current notification was selected.
   *
   * @type {number}
   */
  #notificationSelectedTimestamp = 0;

  get #currentNotification() {
    return this.#_currentNotification;
  }

  set #currentNotification(notification) {
    if (this.#_currentNotification == notification) {
      return;
    }
    this.#_currentNotification = notification;
    if (notification) {
      this.#notificationHistory.push(Date.now());

      if (
        this.#notificationHistory.length >
        NotificationManager.#MAX_NOTIFICATIONS_PER_DAY
      ) {
        this.#notificationHistory.shift();
      }
      this.#notificationSelectedTimestamp = Date.now();
      if (NotificationManager.#isNotificationWithUI(notification)) {
        this.dispatchEvent(
          new CustomEvent(NotificationManager.NEW_NOTIFICATION_EVENT, {
            detail: notification,
          })
        );

        Glean.inappnotifications.shown.record({
          notification_id: notification.id,
        });
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
   * @returns {number} Amount of seconds the notification was selected this
   *   session.
   */
  #getActiveNotificationDuration() {
    return Math.floor(
      (Date.now() - this.#notificationSelectedTimestamp) / 1000
    );
  }

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

    const formattedURL = Services.urlFormatter.formatURL(
      this.#currentNotification.URL
    );
    const needsTabmail = this.#currentNotification.type === "donation_tab";
    const tabmail =
      needsTabmail &&
      Services.wm
        .getMostRecentWindow("mail:3pane")
        ?.document.getElementById("tabmail");

    // Fall back to opening a browser window if we don't have a tabmail.
    if (this.#currentNotification.type !== "donation_tab" || !tabmail) {
      lazy.openLinkExternally(formattedURL);
    } else {
      tabmail.openTab("contentTab", {
        url: formattedURL,
        background: false,
        linkHandler: "single-page",
      });
      tabmail.ownerGlobal.focus();
    }

    Glean.inappnotifications.interaction.record({
      notification_id: notificationId,
      active_this_session: this.#getActiveNotificationDuration(),
    });
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
    Glean.inappnotifications.closed.record({
      notification_id: notificationId,
      active_this_session: this.#getActiveNotificationDuration(),
    });
    lazy.clearTimeout(this.#timer);
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
    // Sort by severity, then start_at then percent_chance
    const [firstCandidate] = notifications.sort((a, b) => {
      if (a.severity === b.severity) {
        const aStart = Date.parse(a.start_at);
        const bStart = Date.parse(b.start_at);

        if (aStart === bStart) {
          return a.percent_chance - b.percent_chance;
        }
        return aStart - bStart;
      }
      return a.severity - b.severity;
    });

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
      if (this.#currentNotification) {
        Glean.inappnotifications.dismissed.record({
          notification_id: this.#currentNotification.id,
          active_this_session: this.#getActiveNotificationDuration(),
        });
      }
      this.#currentNotification = null;
      return;
    }

    // Check how many notifications we have shown in the last 24 hours. If
    // six or more notifications have already been shown reschedule.
    if (
      this.#notificationHistory.length ===
        NotificationManager.#MAX_NOTIFICATIONS_PER_DAY &&
      this.#notificationHistory[0] >
        Date.now() - NotificationManager._PER_TIME_UNIT
    ) {
      this.#rescheduleNotification();
      return;
    }
    // Set up for displaying a new notification.
    this.#currentNotification = firstCandidate;
    this.#timer = lazy.setTimeout(
      this.#notificationExpired,
      Date.parse(firstCandidate.end_at) - Date.now() + 100
    );
  }

  #rescheduleNotification() {
    this.#timer = lazy.setTimeout(
      () =>
        this.dispatchEvent(
          new CustomEvent(NotificationManager.REQUEST_NOTIFICATIONS_EVENT)
        ),
      this.#notificationHistory[0] +
        NotificationManager._PER_TIME_UNIT -
        Date.now()
    );
  }

  /**
   * Callback when the current notification expired.
   */
  #notificationExpired = () => {
    Glean.inappnotifications.dismissed.record({
      notification_id: this.#currentNotification.id,
      active_this_session: this.#getActiveNotificationDuration(),
    });
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
      timeout: this._MAX_MS_BETWEEN_NOTIFICATIONS,
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
      const event = new CustomEvent(
        NotificationManager.NEW_NOTIFICATION_EVENT,
        {
          detail: this.#currentNotification,
        }
      );
      if (listener.handleEvent) {
        listener.handleEvent(event);
      } else {
        listener(event);
      }
    }
  }
}
