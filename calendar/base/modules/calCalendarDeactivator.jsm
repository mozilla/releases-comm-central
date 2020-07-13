/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["calendarDeactivator"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * Handles deactivation of calendar UI and background processes/services (such
 * as the alarms service) when users do not want to use calendar functionality.
 * Also handles re-activation when users change their mind.
 *
 * If all of a user's calendars are disabled (e.g. calendar > properties >
 * "turn this calendar on") then full calendar functionality is deactivated.
 * If one or more calendars are enabled then full calendar functionality is
 * activated.
 *
 * Note we use "disabled"/"enabled" for a user's individual calendars and
 * "deactivated"/"activated" for the calendar component as a whole.
 *
 * @implements {calICalendarManagerObserver}
 * @implements {calIObserver}
 */
var calendarDeactivator = {
  windows: new Set(),
  calendars: null,
  isCalendarActivated: null,
  QueryInterface: ChromeUtils.generateQI(["calICalendarManagerObserver", "calIObserver"]),

  initializeDeactivator() {
    let manager = cal.getCalendarManager();
    this.calendars = new Set(manager.getCalendars());
    manager.addObserver(this);
    manager.addCalendarObserver(this);
    this.isCalendarActivated = this.checkCalendarsEnabled();
  },

  /**
   * Register a window to allow future modifications, and set up the window's
   * deactivated/activated state. Deregistration is not required.
   *
   * @param {ChromeWindow} window - A ChromeWindow object.
   */
  registerWindow(window) {
    if (this.calendars === null) {
      this.initializeDeactivator();
    }
    this.windows.add(window);
    window.addEventListener("unload", () => this.windows.delete(window));

    if (this.isCalendarActivated) {
      window.document.documentElement.removeAttribute("calendar-deactivated");
    } else {
      this.refreshNotificationBoxes(window, false);
    }
  },

  /**
   * Check the enabled state of all of the user's calendars.
   *
   * @return {boolean} True if any calendars are enabled, false if all are disabled.
   */
  checkCalendarsEnabled() {
    for (let calendar of this.calendars) {
      if (!calendar.getProperty("disabled")) {
        return true;
      }
    }
    return false;
  },

  /**
   * If needed, change the calendar activated/deactivated state and update the
   * UI and background processes/services accordingly.
   */
  refreshDeactivatedState() {
    let someCalsEnabled = this.checkCalendarsEnabled();

    if (someCalsEnabled == this.isCalendarActivated) {
      return;
    }

    for (let window of this.windows) {
      if (someCalsEnabled) {
        window.document.documentElement.removeAttribute("calendar-deactivated");
      } else {
        window.document.documentElement.setAttribute("calendar-deactivated", "");
      }
      this.refreshNotificationBoxes(window, someCalsEnabled);
    }

    if (someCalsEnabled) {
      Services.prefs.setBoolPref("calendar.itip.showImipBar", true);
    }

    this.isCalendarActivated = someCalsEnabled;
  },

  /**
   * Show or hide the notification boxes that appear at the top of the calendar
   * and tasks tabs when calendar functionality is deactivated.
   *
   * @param {ChromeWindow} window - A ChromeWindow object.
   * @param {boolean} calendarIsActivated - Whether any calendars are enabled.
   */
  refreshNotificationBoxes(window, calendarIsActivated) {
    let value = "calendarDeactivated";
    let notificationboxes = [
      [
        window.calendarTabType.modes.calendar.notificationbox,
        "calendar-deactivated-notification-events",
      ],
      [
        window.calendarTabType.modes.tasks.notificationbox,
        "calendar-deactivated-notification-tasks",
      ],
    ];

    for (let [notificationbox, messageName] of notificationboxes) {
      let existingNotification = notificationbox.getNotificationWithValue(value);

      if (calendarIsActivated) {
        notificationbox.removeNotification(existingNotification);
      } else if (!existingNotification) {
        let priority = notificationbox.PRIORITY_WARNING_MEDIUM;

        // Use Fluent's preferred async declarative, DOMLocalization API.
        let messageFragment = window.document.createDocumentFragment();
        let message = window.document.createElement("span");
        window.document.l10n.setAttributes(message, messageName);
        messageFragment.appendChild(message);
        notificationbox.appendNotification(messageFragment, value, null, priority, null);
      }
    }
  },

  // calICalendarManagerObserver methods
  onCalendarRegistered(calendar) {
    this.calendars.add(calendar);

    if (!this.isCalendarActivated && !calendar.getProperty("disabled")) {
      this.refreshDeactivatedState();
    }
  },

  onCalendarUnregistering(calendar) {
    this.calendars.delete(calendar);

    if (!calendar.getProperty("disabled")) {
      this.refreshDeactivatedState();
    }
  },
  onCalendarDeleting(calendar) {},

  // calIObserver methods
  onStartBatch() {},
  onEndBatch() {},
  onLoad() {},
  onAddItem(item) {},
  onModifyItem(newItem, oldItem) {},
  onDeleteItem(deletedItem) {},
  onError(calendar, errNo, message) {},

  onPropertyChanged(calendar, name, value, oldValue) {
    if (name == "disabled") {
      this.refreshDeactivatedState();
    }
  },

  onPropertyDeleting(calendar, name) {},
};
