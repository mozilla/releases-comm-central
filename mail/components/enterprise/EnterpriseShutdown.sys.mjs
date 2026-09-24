/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  RelaunchEnforcer:
    "resource://gre/modules/enterprise/RelaunchEnforcer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const FORCED_SHUTDOWN_FLUSH_TIMEOUT_MS = 30_000;
const RELAUNCH_NOTIFICATION_ID = "enterprise-relaunch";

/**
 * Preserves Thunderbird state before a console-driven forced shutdown and
 * provides Thunderbird's relaunch warning UI.
 */
export const EnterpriseShutdown = {
  _preparationPromise: null,
  _notificationBoxes: new WeakMap(),

  /**
   * Flushes application state before ForcedQuitHandler requests the quit.
   *
   * @returns {Promise<void>} Resolves when Thunderbird is ready to quit.
   */
  beforeForcedQuit() {
    this._preparationPromise ??= this._flushState();
    return this._preparationPromise;
  },

  async _flushState() {
    await this._waitForSessionRestore();
    await this._flushComposeWindows();
  },

  async _waitForSessionRestore() {
    if ("sessionRestored" in Services.startup.getStartupInfo()) {
      return;
    }
    await new Promise(resolve => {
      const observer = () => {
        Services.obs.removeObserver(observer, "sessionstore-windows-restored");
        resolve();
      };
      Services.obs.addObserver(observer, "sessionstore-windows-restored");
    });
  },

  async _flushComposeWindows() {
    await Promise.all(
      Array.from(Services.wm.getEnumerator("msgcompose"), async win => {
        try {
          await this._flushComposeWindow(win);
        } catch (error) {
          console.error("EnterpriseShutdown: compose flush failed:", error);
        }

        // The save attempt has finished. Allow the impending forced quit to
        // close this window without displaying a prompt nobody can answer.
        if (!win.closed) {
          win.document.documentElement.dataset.enterpriseForcedShutdown =
            "true";
        }
      })
    );
  },

  /**
   * Silently persists unsaved changes in a compose window as a draft.
   *
   * The window remains open until the forced application quit occurs.
   *
   * @param {Window} win - Compose window to flush.
   * @returns {Promise<void>} Resolves after saving finishes or times out.
   */
  async _flushComposeWindow(win) {
    const deadline = Date.now() + FORCED_SHUTDOWN_FLUSH_TIMEOUT_MS;

    const isOperationInProgress = () =>
      win.gSendOperationInProgress ||
      win.gSaveOperationInProgress ||
      win.gAutoSavingInProgress;

    const waitForIdle = async () => {
      while (!win.closed && isOperationInProgress()) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          return false;
        }

        await new Promise(resolve =>
          lazy.setTimeout(resolve, Math.min(250, remaining))
        );
      }

      return true;
    };

    if (!(await waitForIdle())) {
      console.warn(
        "Timed out waiting for an existing compose operation during forced shutdown."
      );
      return;
    }

    if (
      win.closed ||
      !win.gMsgCompose ||
      (!win.gContentChanged &&
        !win.gMsgCompose.bodyModified &&
        !win.gReceiptOptionChanged &&
        !win.gDSNOptionChanged)
    ) {
      return;
    }

    await win.GenericSendMessage(Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft);

    if (!(await waitForIdle())) {
      console.warn("Timed out saving a compose draft during forced shutdown.");
    }
  },

  /**
   * Shows or updates the relaunch warning in every ready 3pane window.
   *
   * @param {object} details - RelaunchEnforcer warning details.
   * @param {"warning"|"imminent"} details.phase - Warning severity.
   * @param {number} details.restartAt - Restart deadline in epoch milliseconds.
   * @param {number} details.minutes - Whole minutes remaining.
   * @param {Function} details.restartNow - Requests the restart.
   * @returns {Promise<boolean>} Whether at least one warning is visible.
   */
  async showOrUpdateRelaunchWarning({ phase, restartAt, minutes, restartNow }) {
    let shown = false;
    for (const win of Services.wm.getEnumerator("mail:3pane")) {
      if (win.document.readyState !== "complete") {
        continue;
      }
      try {
        const box = this._getNotificationBox(win);
        const label = {
          "l10n-id":
            phase === "imminent"
              ? "enterprise-relaunch-imminent-message"
              : "enterprise-relaunch-warning-message",
          "l10n-args":
            phase === "imminent" ? { minutes } : { datetime: restartAt },
        };
        const priority =
          phase === "imminent"
            ? box.PRIORITY_CRITICAL_HIGH
            : box.PRIORITY_INFO_HIGH;
        const notification = box.getNotificationWithValue(
          RELAUNCH_NOTIFICATION_ID
        );
        if (notification) {
          notification.label = label;
          notification.priority = priority;
          notification.setAttribute(
            "type",
            phase === "imminent" ? "critical" : "info"
          );
        } else {
          await box.appendNotification(
            RELAUNCH_NOTIFICATION_ID,
            { label, priority },
            [
              {
                "l10n-id": "enterprise-relaunch-restart-now",
                callback() {
                  restartNow();
                  return true;
                },
              },
            ],
            false,
            false
          );
        }
        shown = true;
      } catch (error) {
        console.error("EnterpriseShutdown: relaunch warning failed:", error);
      }
    }
    return shown;
  },

  hideRelaunchWarning() {
    for (const win of Services.wm.getEnumerator("mail:3pane")) {
      const box = this._notificationBoxes.get(win);
      const notification = box?.getNotificationWithValue(
        RELAUNCH_NOTIFICATION_ID
      );
      if (notification) {
        box.removeNotification(notification, true);
      }
    }
  },

  isRelaunchWarningVisible() {
    let foundReadyWindow = false;

    for (const win of Services.wm.getEnumerator("mail:3pane")) {
      if (win.document.readyState !== "complete") {
        continue;
      }

      foundReadyWindow = true;

      if (
        !this._notificationBoxes
          .get(win)
          ?.getNotificationWithValue(RELAUNCH_NOTIFICATION_ID)
      ) {
        return false;
      }
    }

    return foundReadyWindow;
  },

  _getNotificationBox(win) {
    let box = this._notificationBoxes.get(win);
    if (!box) {
      box = new win.MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "bottom");
        win.document.getElementById("enterprise-notifications").append(element);
      });
      this._notificationBoxes.set(win, box);
    }
    return box;
  },
};

/**
 * Preserves Thunderbird state before a console-mandated forced quit.
 *
 * Exported for the "enterprise-forced-quit-hook" category.
 *
 * @returns {Promise<void>} Resolves when Thunderbird is ready to quit.
 */
export function beforeForcedQuit() {
  return EnterpriseShutdown.beforeForcedQuit();
}

/**
 * Registers Thunderbird's relaunch warning UI with RelaunchEnforcer.
 *
 * Exported for the "enterprise-relaunch-warning-ui" category.
 */
export function registerRelaunchWarningUI() {
  lazy.RelaunchEnforcer.registerWarningUIDelegate({
    showOrUpdate: details =>
      EnterpriseShutdown.showOrUpdateRelaunchWarning(details),
    hide: () => EnterpriseShutdown.hideRelaunchWarning(),
    isVisible: () => EnterpriseShutdown.isRelaunchWarningVisible(),
  });
}
