/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onDismissAllAlarms, setupWindow, finishWindow, addWidgetFor,
 *         removeWidgetFor, onSelectAlarm, ensureCalendarVisible
 */

/* global MozElements */

/* import-globals-from ../item-editing/calendar-item-editing.js */

var { PluralForm } = ChromeUtils.importESModule("resource:///modules/PluralForm.sys.mjs");
var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

window.addEventListener("load", event => {
  setupWindow();
  window.arguments[0].wrappedJSObject.window_onLoad();
});
window.addEventListener("unload", finishWindow);
window.addEventListener("focus", onFocusWindow);
window.addEventListener("keypress", event => {
  if (event.key == "Escape") {
    window.close();
  }
});

var gShutdownDetected = false;

/**
 * Detects the "mail-unloading-messenger" notification to prevent snoozing items
 * as well as closes this window when the main window is closed. Not doing so can
 * cause data loss with CalStorageCalendar.
 */
var gShutdownObserver = {
  observe() {
    const windows = Array.from(Services.wm.getEnumerator("mail:3pane"));
    if (windows.filter(win => !win.closed).length == 0) {
      gShutdownDetected = true;
      window.close();
    }
  },
};

addEventListener("DOMContentLoaded", () => {
  document.getElementById("alarm-snooze-all-popup").addEventListener("snooze", event => {
    snoozeAllItems(event.detail);
  });
});

ChromeUtils.defineLazyGetter(this, "gReadOnlyNotification", () => {
  return new MozElements.NotificationBox(element => {
    element.setAttribute("notificationside", "top");
    document.getElementById("readonly-notification").append(element);
  });
});

/**
 * Helper function to get the alarm service and cache it.
 *
 * @returns The alarm service component
 */
function getAlarmService() {
  if (!("mAlarmService" in window)) {
    window.mAlarmService = Cc["@mozilla.org/calendar/alarm-service;1"].getService(
      Ci.calIAlarmService
    );
  }
  return window.mAlarmService;
}

/**
 * Event handler for the 'snooze' event. Snoozes the given alarm by the given
 * number of minutes using the alarm service.
 *
 * @param event     The snooze event
 */
function onSnoozeAlarm(event) {
  // reschedule alarm:
  const duration = getDuration(event.detail);
  if (aboveSnoozeLimit(duration)) {
    // we prevent snoozing too far if the alarm wouldn't be displayed
    return;
  }
  getAlarmService().snoozeAlarm(event.target.item, event.target.alarm, duration);
}

/**
 * Event handler for the 'dismiss' event. Dismisses the given alarm using the
 * alarm service.
 *
 * @param event     The snooze event
 */
function onDismissAlarm(event) {
  getAlarmService().dismissAlarm(event.target.item, event.target.alarm);
}

/**
 * Called to dismiss all alarms in the alarm window.
 */
function onDismissAllAlarms() {
  // removes widgets on the fly:
  const alarmRichlist = document.getElementById("alarm-richlist");
  const parentItems = {};
  const widgets = [];

  // Make a copy of the child nodes as they get modified live
  for (const node of alarmRichlist.children) {
    // Check if the node is a valid alarm and is still part of DOM
    if (
      node.parentNode &&
      node.item &&
      node.alarm &&
      !(node.item.parentItem.hashId in parentItems)
    ) {
      // We only need to acknowledge one occurrence for repeating items
      parentItems[node.item.parentItem.hashId] = node.item.parentItem;
      widgets.push({ item: node.item, alarm: node.alarm });
    }
  }
  for (const widget of widgets) {
    getAlarmService().dismissAlarm(widget.item, widget.alarm);
  }
}

/**
 * Event handler fired when the alarm widget's "Details..." label was clicked.
 * Open the event dialog in the most recent Thunderbird window.
 *
 * @param event     The itemdetails event.
 */
function onItemDetails(event) {
  // We want this to happen in a calendar window if possible. Otherwise open
  // it using our window.
  const calWindow = cal.window.getCalendarWindow();
  if (calWindow) {
    calWindow.modifyEventWithDialog(event.target.item, true);
  } else {
    modifyEventWithDialog(event.target.item, true);
  }
}

/**
 * Sets up the alarm dialog, initializing the default snooze length and setting
 * up the relative date update timer.
 */
var gRelativeDateUpdateTimer;
function setupWindow() {
  // We want to update when we are at 0 seconds past the minute. To do so, use
  // setTimeout to wait until we are there, then setInterval to execute every
  // minute. Since setInterval is not totally exact, we may run into problems
  // here. I hope not!
  const current = new Date();

  const timeout = (60 - current.getSeconds()) * 1000;
  gRelativeDateUpdateTimer = setTimeout(() => {
    updateRelativeDates();
    gRelativeDateUpdateTimer = setInterval(updateRelativeDates, 60 * 1000);
  }, timeout);

  // Configure the shutdown observer.
  Services.obs.addObserver(gShutdownObserver, "mail-unloading-messenger");

  // Give focus to the alarm richlist after onload completes. See bug 103197
  setTimeout(onFocusWindow, 0);
}

/**
 * Unload function for the alarm dialog. If applicable, snooze the remaining
 * alarms and clean up the relative date update timer.
 */
function finishWindow() {
  Services.obs.removeObserver(gShutdownObserver, "mail-unloading-messenger");

  if (gShutdownDetected) {
    return;
  }

  const alarmRichlist = document.getElementById("alarm-richlist");

  if (alarmRichlist.children.length > 0) {
    // If there are still items, the window wasn't closed using dismiss
    // all/snooze all. This can happen when the closer is clicked or escape
    // is pressed. Snooze all remaining items using the default snooze
    // property.
    let snoozePref = Services.prefs.getIntPref("calendar.alarms.defaultsnoozelength", 0);
    if (snoozePref <= 0) {
      snoozePref = 5;
    }

    snoozeAllItems(snoozePref);
  }

  // Stop updating the relative time
  clearTimeout(gRelativeDateUpdateTimer);
}

/**
 * Set up the focused element. If no element is focused, then switch to the
 * richlist.
 */
function onFocusWindow() {
  if (!document.commandDispatcher.focusedElement) {
    document.getElementById("alarm-richlist").focus();
  }
}

/**
 * Timer callback to update all relative date labels
 */
function updateRelativeDates() {
  const alarmRichlist = document.getElementById("alarm-richlist");
  for (const node of alarmRichlist.children) {
    if (node.item && node.alarm) {
      node.updateRelativeDateLabel();
    }
  }
}

/**
 * Function to snooze all alarms the given number of minutes.
 *
 * @param aDurationMinutes    The duration in minutes
 */
function snoozeAllItems(aDurationMinutes) {
  const duration = getDuration(aDurationMinutes);
  if (aboveSnoozeLimit(duration)) {
    // we prevent snoozing too far if the alarm wouldn't be displayed
    return;
  }

  const alarmRichlist = document.getElementById("alarm-richlist");
  const parentItems = {};

  // Make a copy of the child nodes as they get modified live
  for (const node of alarmRichlist.children) {
    // Check if the node is a valid alarm and is still part of DOM
    if (
      node.parentNode &&
      node.item &&
      node.alarm &&
      cal.acl.isCalendarWritable(node.item.calendar) &&
      cal.acl.userCanModifyItem(node.item) &&
      !(node.item.parentItem.hashId in parentItems)
    ) {
      // We only need to acknowledge one occurrence for repeating items
      parentItems[node.item.parentItem.hashId] = node.item.parentItem;
      getAlarmService().snoozeAlarm(node.item, node.alarm, duration);
    }
  }
  // we need to close the widget here explicitly because the dialog will stay
  // opened if there a still not snoozable alarms
  document.getElementById("alarm-snooze-all-button").firstElementChild.hidePopup();
}

/**
 * Receive a calIDuration object for a given number of minutes
 *
 * @param  {long}           aMinutes     The number of minutes
 * @returns {calIDuration}
 */
function getDuration(aMinutes) {
  const MINUTESINWEEK = 7 * 24 * 60;

  // converting to weeks if any is required to avoid an integer overflow of duration.minutes as
  // this is of type short
  const weeks = Math.floor(aMinutes / MINUTESINWEEK);
  aMinutes -= weeks * MINUTESINWEEK;

  const duration = cal.createDuration();
  duration.minutes = aMinutes;
  duration.weeks = weeks;
  duration.normalize();
  return duration;
}

/**
 * Check whether the snooze period exceeds the current limitation of the AlarmService and prompt
 * the user with a message if so
 *
 * @param   {calIDuration}   aDuration   The duration to snooze
 * @returns {boolean}
 */
function aboveSnoozeLimit(aDuration) {
  const LIMIT = Ci.calIAlarmService.MAX_SNOOZE_MONTHS;

  const currentTime = cal.dtz.now().getInTimezone(cal.dtz.UTC);
  const limitTime = currentTime.clone();
  limitTime.month += LIMIT;

  const durationUntilLimit = limitTime.subtractDate(currentTime);
  if (aDuration.compare(durationUntilLimit) > 0) {
    const msg = PluralForm.get(LIMIT, cal.l10n.getCalString("alarmSnoozeLimitExceeded"));
    cal.showError(msg.replace("#1", LIMIT), window);
    return true;
  }
  return false;
}

/**
 * Sets up the window title, counting the number of alarms in the window.
 */
function setupTitle() {
  const alarmRichlist = document.getElementById("alarm-richlist");
  const reminders = alarmRichlist.children.length;

  const title = PluralForm.get(reminders, cal.l10n.getCalString("alarmWindowTitle.label"));
  document.title = title.replace("#1", reminders);
}

/**
 * Comparison function for the start date of a calendar item and
 * the start date of a calendar-alarm-widget.
 *
 * @param aItem                 A calendar item for the comparison of the start date property
 * @param aWidgetItem           The alarm widget item for the start date comparison with the given calendar item
 * @returns 1 - if the calendar item starts before the calendar-alarm-widget
 *                             -1 - if the calendar-alarm-widget starts before the calendar item
 *                              0 - otherwise
 */
function widgetAlarmComptor(aItem, aWidgetItem) {
  if (aItem == null || aWidgetItem == null) {
    return -1;
  }

  // Get the dates to compare
  const aDate = aItem[cal.dtz.startDateProp(aItem)];
  const bDate = aWidgetItem[cal.dtz.startDateProp(aWidgetItem)];

  return aDate.compare(bDate);
}

/**
 * Add an alarm widget for the passed alarm and item.
 *
 * @param aItem       The calendar item to add a widget for.
 * @param aAlarm      The alarm to add a widget for.
 */
function addWidgetFor(aItem, aAlarm) {
  const widget = document.createXULElement("richlistitem", {
    is: "calendar-alarm-widget-richlistitem",
  });
  const alarmRichlist = document.getElementById("alarm-richlist");

  // Add widgets sorted by start date ascending
  cal.data.binaryInsertNode(alarmRichlist, widget, aItem, widgetAlarmComptor, false);

  widget.item = aItem;
  widget.alarm = aAlarm;
  widget.addEventListener("snooze", onSnoozeAlarm);
  widget.addEventListener("dismiss", onDismissAlarm);
  widget.addEventListener("itemdetails", onItemDetails);

  setupTitle();
  doReadOnlyChecks();

  if (!alarmRichlist.userSelectedWidget) {
    // Always select first widget of the list.
    // Since the onselect event causes scrolling,
    // we don't want to process the event when adding widgets.
    alarmRichlist.suppressOnSelect = true;
    alarmRichlist.selectedItem = alarmRichlist.firstElementChild;
    alarmRichlist.suppressOnSelect = false;
  }

  window.focus();
  window.getAttention();
}

/**
 * Remove the alarm widget for the passed alarm and item.
 *
 * @param aItem       The calendar item to remove the alarm widget for.
 * @param aAlarm      The alarm to remove the widget for.
 */
function removeWidgetFor(aItem, aAlarm) {
  const hashId = aItem.hashId;
  const alarmRichlist = document.getElementById("alarm-richlist");
  const nodes = alarmRichlist.children;
  let notfound = true;
  for (let i = nodes.length - 1; notfound && i >= 0; --i) {
    const widget = nodes[i];
    if (
      widget.item &&
      widget.item.hashId == hashId &&
      widget.alarm &&
      widget.alarm.icalString == aAlarm.icalString
    ) {
      if (widget.selected) {
        // Advance selection if needed
        widget.control.selectedItem = widget.previousElementSibling || widget.nextElementSibling;
      }

      widget.removeEventListener("snooze", onSnoozeAlarm);
      widget.removeEventListener("dismiss", onDismissAlarm);
      widget.removeEventListener("itemdetails", onItemDetails);

      widget.remove();
      doReadOnlyChecks();
      closeIfEmpty();
      notfound = false;
    }
  }

  // Update the title
  setupTitle();
  closeIfEmpty();
}

/**
 * Enables/disables the 'snooze all' button and displays or removes a r/o
 * notification based on the readability of the calendars of the alarms visible
 * in the alarm list
 */
function doReadOnlyChecks() {
  let countRO = 0;
  const alarmRichlist = document.getElementById("alarm-richlist");
  for (const node of alarmRichlist.children) {
    if (!cal.acl.isCalendarWritable(node.item.calendar) || !cal.acl.userCanModifyItem(node.item)) {
      countRO++;
    }
  }

  // we disable the button if there are only alarms for not-writable items
  const snoozeAllButton = document.getElementById("alarm-snooze-all-button");
  snoozeAllButton.disabled = countRO && countRO == alarmRichlist.children.length;
  if (snoozeAllButton.disabled) {
    const tooltip = cal.l10n.getString("calendar-alarms", "reminderDisabledSnoozeButtonTooltip");
    snoozeAllButton.setAttribute("tooltiptext", tooltip);
  } else {
    snoozeAllButton.removeAttribute("tooltiptext");
  }

  const notification = gReadOnlyNotification.getNotificationWithValue("calendar-readonly");
  if (countRO && !notification) {
    const message = cal.l10n.getString("calendar-alarms", "reminderReadonlyNotification", [
      snoozeAllButton.label,
    ]);
    gReadOnlyNotification.appendNotification(
      "calendar-readonly",
      {
        label: message,
        priority: gReadOnlyNotification.PRIORITY_WARNING_MEDIUM,
      },
      null
    );
  } else if (notification && !countRO) {
    gReadOnlyNotification.removeNotification(notification);
  }
}

/**
 * Close the alarm dialog if there are no further alarm widgets
 */
function closeIfEmpty() {
  const alarmRichlist = document.getElementById("alarm-richlist");

  // we don't want to close if the alarm service is still loading, as the
  // removed alarms may be immediately added again.
  if (!alarmRichlist.hasChildNodes() && !getAlarmService().isLoading) {
    window.close();
  }
}

/**
 * Handler function called when an alarm entry in the richlistbox is selected
 *
 * @param event         The DOM event from the click action
 */
function onSelectAlarm(event) {
  const richList = document.getElementById("alarm-richlist");
  if (richList == event.target) {
    richList.ensureElementIsVisible(richList.getSelectedItem(0));
    richList.userSelectedWidget = true;
  }
}

function ensureCalendarVisible(aCalendar) {
  // This function is called on the alarm dialog from calendar-item-editing.js.
  // Normally, it makes sure that the calendar being edited is made visible,
  // but the alarm dialog is too far away from the calendar views that it
  // makes sense to force visibility for the calendar. Therefore, do nothing.
}
