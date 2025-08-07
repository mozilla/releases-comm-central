/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// TODO: Update once linting is updated to handle moz-src
/* eslint-disable-next-line import/no-unresolved */
import { NotificationManager } from "moz-src:///comm/mail/components/inappnotifications/modules/NotificationManager.sys.mjs";
import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  setInterval: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
});

export const NotificationScheduler = {
  /**
   * Callbacks for the current promise
   *
   * @type {Set<Function>}
   */
  _callbacks: new Set(),

  /**
   * Current state of the promise.
   *
   * @type {boolean}
   */
  fulfilled: false,

  /**
   * Notification id of the current promise.
   *
   *  @type {string}
   */
  id: null,

  /**
   * If the user is currently active.
   *
   * @type {boolean}
   */
  active: false,

  /**
   * The threshold in px for how much of the window can be offscreen and still show
   * a notification.
   *
   *  @type {number}
   */
  _windowThreshold: 120,

  /**
   * Notifications should not be shown until the startup timeout is complete.
   *
   * @type {Promise<null>}
   */
  _ready: null,

  /**
   * The amount of time in milleseconds to delay the first notification after
   * application startup.
   *
   * @type {number}
   */
  _startupDelay: 1000 * 60 * 2,

  /**
   * Initialize the notification scheduler with the current notificationManager
   * setup the idle callback and the interaction event listeners that are global.
   *
   * @param {NotificationManager} notificationManager - The current notification
   *  manager used by inAppNotifications.
   */

  init(notificationManager) {
    try {
      this._idleService = Cc[
        "@mozilla.org/widget/useridleservice;1"
      ].getService(Ci.nsIUserIdleService);

      this._idleService.addIdleObserver(this, 30);
    } catch (error) {
      console.error(error);
    }

    if (this._idleService.idleTime < 5000) {
      this.active = true;
    }

    notificationManager.addEventListener(
      NotificationManager.NOTIFICATION_INTERACTION_EVENT,
      this
    );

    notificationManager.addEventListener(
      NotificationManager.CLEAR_NOTIFICATION_EVENT,
      this
    );

    const { promise, resolve } = Promise.withResolvers();
    this._ready = promise;

    lazy.setTimeout(resolve, this._startupDelay);

    Services.obs.addObserver(this, "xul-window-visible");
    Services.obs.addObserver(this, "document-shown");
    Services.obs.addObserver(this, "quit-application");
  },

  observe(_subject, topic) {
    let update = false;
    switch (topic) {
      case "active":
      case "idle":
      case "idle-daily": {
        // Just check for active because we only care if its active not which type
        // of idle it might be.
        const newState = topic === "active";
        update = this.active !== newState;
        this.active = newState;
        break;
      }
      case "document-shown":
      case "xul-window-visible":
        update = true;
        break;
      case "quit-application":
        // Remove the observer so that the idle service can be cleaned up.
        this._idleService.removeIdleObserver(this, 30);
        break;
      default:
        return;
    }

    if (!update) {
      return;
    }

    this._callbacks.forEach(callback => callback());
  },

  handleEvent() {
    this.reset();
  },

  /**
   * Reset the state of the scheduler for a new notification.
   *
   */
  reset() {
    this.fulfilled = true;

    // Check for any pending callbacks and call them to reject those promises.
    for (const callback of this._callbacks) {
      callback();
    }

    // Clear the callbacks and reset the current notification has been dismissed.
    this._callbacks = new Set();
    this.fulfilled = false;
    this.id = null;
  },

  /**
   * Check if the given window is on screen.
   *
   *  @param {window} usedWindow - The window to check position of.
   * @returns {boolean} If the window is visible
   */
  _checkScreen(usedWindow) {
    // Screen information and window positions are not reliable on Linux.
    // We err on the side of caution and thus assume the window is fully visible.
    if (AppConstants.platform === "linux") {
      return true;
    }

    const leftVisible =
      usedWindow.screenX >= usedWindow.screen.availLeft - this._windowThreshold;
    const rightVisible =
      usedWindow.screenX + usedWindow.outerWidth <=
      usedWindow.screen.availLeft +
        usedWindow.screen.availWidth +
        this._windowThreshold;
    const topVisible =
      usedWindow.screenY >= usedWindow.screen.availTop - this._windowThreshold;
    const bottomVisible =
      usedWindow.screenY + usedWindow.outerHeight <=
      usedWindow.screen.availTop +
        usedWindow.screen.availHeight +
        this._windowThreshold;

    return leftVisible && rightVisible && topVisible && bottomVisible;
  },

  /**
   * Returns a promise that is either resolved once all of the listeners report
   * that the user is active or reject once the notification has been interacted
   * with.
   *
   * @param {object} [waitForActiveOptions={}] - The options to waitForActive.
   * @param {?window} [waitForActiveOptions.currentWindow=null] - The window to listen
   *   for events on
   * @param {string} waitForActiveOptions.id - The id of the notification to
   *   show
   *
   * @returns {Promise<void>}
   */
  async waitForActive({ currentWindow = null, id } = {}) {
    // Create a state object based on the listeners passed in.
    const currentState = {
      active: this.active,
      focus: false,
      visible: false,
      onScreen: false,
    };
    // Create a promise to be awaited
    const { resolve, reject, promise } = Promise.withResolvers();
    // Another promise but that will only resolve when the first one is rejected
    // This is for skipping the ready promise if something invalidates this notification
    // before the promise is resolved (like remote notifications loading).
    const { resolve: skipReady, promise: rejection } = Promise.withResolvers();

    let interval;
    let timeout;

    // The following functions are inside this method for scoping reasons
    /**
     * The callback that is called whenever one of the states updates or the
     * promise is fulfilled
     *
     * @returns {void}
     */
    const callback = () => {
      if (this.fulfilled) {
        cleanup();
        return;
      }

      const activeWindow = Services.focus.activeWindow;
      const usedWindow = currentWindow || activeWindow;

      // Check if the window is visible on screen
      currentState.onScreen = usedWindow && this._checkScreen(usedWindow);

      // Set the current visible state
      currentState.visible = !usedWindow?.document.hidden;

      // Set the current idle or active state.
      currentState.active = this.active;
      // Set the current focus state
      currentState.focus = activeWindow === usedWindow;

      // If we dont have a currentWindow (donation_tab or donation_browser) we
      // can't listen for resize or move events on a window to know when to
      // recheck if the window is onScreen so we have to use an interval.
      if (!currentWindow && !currentState.onScreen && activeWindow) {
        interval = lazy.setInterval(callback, 5000);
      } else if (interval) {
        lazy.clearInterval(interval);
        interval = undefined;
      }

      // Check if all the listeners are true resolve the promise to show the
      // notification, then delete this promise from the active ones.
      if (Object.values(currentState).every(value => value)) {
        resolve();
        cleanup();
        this._callbacks.delete(callback);
        if (!this._callbacks.size) {
          this.id = null;
          this.fulfilled = false;
        }
      }
    };

    function cleanup() {
      reject(new Error(`Cleaning up active user lock for ${id}`));
      skipReady();

      if (timeout) {
        lazy.clearTimeout(timeout);
      }

      if (interval) {
        lazy.clearInterval(interval);
      }

      // If we were not sent a window bail and don't setup window listeners.
      if (!currentWindow) {
        return;
      }

      currentWindow.document.removeEventListener("visibilitychange", callback);
      currentWindow.removeEventListener("activate", handleUnload);
      currentWindow.windowRoot?.removeEventListener(
        "MozUpdateWindowPos",
        callback
      );
      currentWindow.removeEventListener("unload", handleUnload);
      currentWindow.removeEventListener("resize", callback);
    }

    // If we get a bew notifiction before the only one is dismissed update state.
    if (this.id && this.id !== id) {
      this.reset();
      this.id = id;
    }

    this._callbacks.add(callback);

    if (!currentWindow) {
      callback();
      await promise;

      return;
    }

    const handleUnload = () => {
      cleanup();
      this._callbacks.delete(callback);
    };

    function debounceCallback() {
      lazy.clearTimeout(timeout);

      timeout = lazy.setTimeout(callback, 1000);
    }

    // If we have a currentWindow listen for events on it
    // Monitor if the window has become active
    currentWindow.addEventListener("activate", callback);
    currentWindow.addEventListener("unload", handleUnload);

    // Monitor for changes from the visibility api
    currentWindow.document.addEventListener("visibilitychange", callback);

    // Monitor if the window is on screen
    currentWindow.addEventListener("resize", debounceCallback);
    currentWindow.windowRoot.addEventListener(
      "MozUpdateWindowPos",
      debounceCallback
    );

    // This allows the delay to be bypassed for tests.
    if (this._startupDelay) {
      // Don't await the _ready promise directly so we can skip this if `promise`
      // has been rejected while maintaining the original _ready promise.
      await Promise.race([this._ready, rejection]);
    }

    callback();

    await promise;
  },
};
