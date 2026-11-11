/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

/**
 * A copy of the calendar values used by the calendar control.
 * The Redux store holds these plain values. Calendar operations use the
 * original `calICalendar` object outside the store.
 *
 * @typedef {object} CalendarEventCalendarData
 * @property {string} id - The calendar ID.
 * @property {string} name - The calendar name.
 */

/**
 * Returns a copy of the calendar ID and name for the control.
 *
 * @param {calICalendar} calendar - The calendar to read.
 * @returns {CalendarEventCalendarData} The calendar ID and name.
 */
export function snapshotCalendar(calendar) {
  return {
    id: calendar.id,
    name: calendar.name,
  };
}

/**
 * Checks the event restrictions on a calendar change.
 * The source calendar must separately be writable and permit deleting events.
 *
 * @param {calIEvent} event - The loaded event.
 * @returns {boolean} True if the user can modify the event and the event is
 *   neither an occurrence nor an invitation.
 */
export function canChangeEventCalendar(event) {
  return (
    !event.recurrenceId &&
    cal.acl.userCanModifyItem(event) &&
    !cal.itip.isInvitation(event)
  );
}

/**
 * Checks whether the source event permits a calendar change.
 *
 * An occurrence is one instance of a repeating event. The control permits a
 * change only for a whole event, including a whole repeating series.
 * Destination calendars have separate checks in `loadCalendarOptions`.
 *
 * @param {calIEvent} event - The loaded event with its source calendar.
 * @returns {boolean} True if the source is writable, the user can modify and
 *   delete the event, and the event is neither an occurrence nor an invitation.
 */
export function canMoveCalendarEvent(event) {
  // A move needs permission to remove the event from its source calendar.
  // Permission to edit the event alone is not sufficient.
  return (
    canChangeEventCalendar(event) &&
    cal.acl.isCalendarWritable(event.calendar) &&
    cal.acl.userCanDeleteItemsFromCalendar(event.calendar)
  );
}

/**
 * Returns whether the calendar supports events and permits adding one.
 * Reads the Calendar object because permissions can change after the dialog
 * copies the calendar's name and color for display. This check does not require
 * the calendar to be visible in the calendar view.
 *
 * @param {?calICalendar} calendar - The selected Calendar object, or null if
 *   the selected calendar no longer exists.
 * @returns {boolean} True if the calendar exists, is writable, supports events,
 *   and permits the user to add an item.
 */
export function canCreateCalendarEvent(calendar) {
  return !!(
    calendar &&
    cal.acl.isCalendarWritable(calendar) &&
    cal.acl.userCanAddItemsToCalendar(calendar) &&
    calendar.getProperty("capabilities.events.supported") !== false
  );
}

/**
 * Returns display data for calendars that allow new events and the supplied
 * default calendar.
 *
 * @param {?string} [defaultCalendarId=null] - The host window's default calendar
 *   ID.
 * @returns {{calendars: CalendarEventCalendarData[], defaultCalendar: ?CalendarEventCalendarData}}
 *   Calendar choices and data for the supplied default calendar.
 *   `defaultCalendar` is null if no calendar matches the supplied ID.
 */
export function loadCalendarOptions(defaultCalendarId = null) {
  // The manager returns calendars in list order.
  // Filtering the choices below preserves that order.
  const calendars = cal.manager.getCalendars();

  // Find the default before filtering. The dialog can display an unavailable
  // default when no calendar permits creating an event.
  const defaultCalendar = calendars.find(
    calendar => calendar.id == defaultCalendarId
  );

  // Include only visible calendars that allow new events.
  const usableCalendars = calendars.filter(
    calendar =>
      calendar.getProperty("calendar-main-in-composite") &&
      canCreateCalendarEvent(calendar)
  );

  return {
    calendars: usableCalendars.map(snapshotCalendar),
    defaultCalendar: defaultCalendar ? snapshotCalendar(defaultCalendar) : null,
  };
}

/**
 * Reports updated calendar choices when calendars or network status change.
 * The caller loads the initial choices separately and stops observation when
 * the dialog disconnects. Color changes use the shared CSS color tracker.
 *
 * @param {function(CalendarEventCalendarData[]): void} onChange - Receives the
 *   new choices after the calendar manager and providers finish their changes.
 * @param {?Window} [ownerWindow=null] - Stops observation when this window unloads.
 * @returns {function(): void} Stops observation and ignores any queued update.
 *   Calling the function again has no effect.
 */
export function observeCalendarOptions(onChange, ownerWindow = null) {
  let stopped = false;
  let pending = false;

  const refresh = () => {
    if (stopped || pending) {
      return;
    }

    pending = true;

    // Unregister and property-delete notifications arrive before the change.
    // Read choices after that change, and combine notifications from this turn.
    Promise.resolve().then(() => {
      pending = false;

      if (stopped) {
        return;
      }

      onChange(loadCalendarOptions().calendars);
    });
  };

  const observer = {
    QueryInterface: ChromeUtils.generateQI([
      "calICalendarManagerObserver",
      "calIObserver",
      "nsIObserver",
    ]),
    onCalendarRegistered: refresh,
    onCalendarUnregistering: refresh,
    onCalendarDeleting() {},
    onCalendarOrderChanged: refresh,
    onStartBatch() {},
    onEndBatch() {},
    onLoad: refresh,
    onAddItem() {},
    onModifyItem() {},
    onDeleteItem() {},
    onError() {},
    onPropertyChanged(_calendar, propertyName) {
      // Default selection belongs to each new create request. The color tracker
      // updates CSS without changing the choices stored in Redux.
      if (
        propertyName === "color" ||
        propertyName === "calendar-main-default"
      ) {
        return;
      }

      refresh();
    },
    onPropertyDeleting(calendar, propertyName) {
      this.onPropertyChanged(calendar, propertyName);
    },
    observe: refresh,
  };

  cal.manager.addObserver(observer);
  cal.manager.addCalendarObserver(observer);
  Services.obs.addObserver(observer, "network:offline-status-changed");

  const stopObserving = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    ownerWindow?.removeEventListener("unload", stopObserving);
    cal.manager.removeObserver(observer);
    cal.manager.removeCalendarObserver(observer);
    Services.obs.removeObserver(observer, "network:offline-status-changed");
  };

  // The dialog can remain in its document when the window closes.
  ownerWindow?.addEventListener("unload", stopObserving, { once: true });

  return stopObserving;
}
