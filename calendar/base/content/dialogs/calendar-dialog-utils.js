/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gInTab, gMainWindow, gTabmail, intializeTabOrWindowVariables,
 *          dispose, setDialogId, loadReminders, saveReminder,
 *          commonUpdateReminder, updateLink,
 *          adaptScheduleAgent, sendMailToOrganizer,
 *          openAttachmentFromItemSummary,
 */

/* import-globals-from ../item-editing/calendar-item-iframe.js */
/* import-globals-from ../calendar-ui-utils.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { openLinkExternally } = ChromeUtils.importESModule("resource:///modules/LinkHelper.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAlarm: "resource:///modules/CalAlarm.sys.mjs",
});

// Variables related to whether we are in a tab or a window dialog.
var gInTab = false;
var gMainWindow = null;
var gTabmail = null;

/**
 * Initialize variables for tab vs window.
 */
function intializeTabOrWindowVariables() {
  const args = window.arguments[0];
  gInTab = args.inTab;
  if (gInTab) {
    gTabmail = parent.document.getElementById("tabmail");
    gMainWindow = parent;
  } else {
    gMainWindow = parent.opener;
  }
}

/**
 * Dispose of controlling operations of this event dialog. Uses
 * window.arguments[0].job.dispose()
 */
function dispose() {
  const args = window.arguments[0];
  if (args.job && args.job.dispose) {
    args.job.dispose();
  }
}

/**
 * Sets the id of a Dialog to another value to allow different CSS styles
 * to be used.
 *
 * @param aDialog               The Dialog to be changed.
 * @param aNewId                The new ID as String.
 */
function setDialogId(aDialog, aNewId) {
  aDialog.setAttribute("id", aNewId);
  applyPersistedProperties(aDialog);
}

/**
 * Apply the persisted properties from xulstore.json on a dialog based on the current dialog id.
 * This needs to be invoked after changing a dialog id while loading to apply the values for the
 * new dialog id.
 *
 * @param aDialog               The Dialog to apply the property values for
 */
function applyPersistedProperties(aDialog) {
  const xulStore = Services.xulStore;
  // first we need to detect which properties are persisted
  const persistedProps = aDialog.getAttribute("persist") || "";
  if (persistedProps == "") {
    return;
  }
  const propNames = persistedProps.split(" ");
  let { outerWidth: width, outerHeight: height } = aDialog;
  let doResize = false;
  // now let's apply persisted values if applicable
  for (const propName of propNames) {
    if (xulStore.hasValue(aDialog.baseURI, aDialog.id, propName)) {
      const propValue = xulStore.getValue(aDialog.baseURI, aDialog.id, propName);
      if (propName == "width") {
        width = propValue;
        doResize = true;
      } else if (propName == "height") {
        height = propValue;
        doResize = true;
      } else {
        aDialog.setAttribute(propName, propValue);
      }
    }
  }

  if (doResize) {
    aDialog.ownerGlobal.resizeTo(width, height);
  }
}

/**
 * Create a calIAlarm from the given menuitem. The menuitem must have the
 * following attributes: unit, length, origin, relation.
 *
 * @param {Element} aMenuitem - The menuitem to create the alarm from.
 * @param {calICalendar} aCalendar - The calendar for getting the default alarm type.
 * @returns The calIAlarm with information from the menuitem.
 */
function createReminderFromMenuitem(aMenuitem, aCalendar) {
  let reminder = aMenuitem.reminder || new CalAlarm();
  // clone immutable reminders if necessary to set default values
  const isImmutable = !reminder.isMutable;
  if (isImmutable) {
    reminder = reminder.clone();
  }
  const offset = cal.createDuration();
  offset[aMenuitem.getAttribute("unit")] = aMenuitem.getAttribute("length");
  offset.normalize();
  offset.isNegative = aMenuitem.getAttribute("origin") == "before";
  reminder.related =
    aMenuitem.getAttribute("relation") == "START"
      ? Ci.calIAlarm.ALARM_RELATED_START
      : Ci.calIAlarm.ALARM_RELATED_END;
  reminder.offset = offset;
  reminder.action = getDefaultAlarmType(aCalendar);
  // make reminder immutable in case it was before
  if (isImmutable) {
    reminder.makeImmutable();
  }
  return reminder;
}

/**
 * This function opens the needed dialogs to edit the reminder. Note however
 * that calling this function from an extension is not recommended. To allow an
 * extension to open the reminder dialog, set the menulist "item-alarm" to the
 * custom menuitem and call updateReminder().
 *
 * @param {Element} reminderList - The reminder menu element.
 * @param {calIEvent | calIToDo} calendarItem - The calendar item.
 * @param {number} lastAlarmSelection - Index of previously selected item in the menu.
 * @param {calICalendar} calendar - The calendar to use.
 * @param {calITimezone} [timezone] - Timezone to use.
 */
function editReminder(
  reminderList,
  calendarItem,
  lastAlarmSelection,
  calendar,
  timezone = cal.dtz.defaultTimezone
) {
  const customItem = reminderList.querySelector(".reminder-custom-menuitem");

  const args = {
    reminders: customItem.reminders,
    item: calendarItem,
    timezone,
    calendar,
    // While these are "just" callbacks, the dialog is opened modally, so aside
    // from what's needed to set up the reminders, nothing else needs to be done.
    onOk(reminders) {
      customItem.reminders = reminders;
    },
    onCancel() {
      reminderList.selectedIndex = lastAlarmSelection;
    },
  };

  window.setCursor("wait");

  // open the dialog modally
  openDialog(
    "chrome://calendar/content/calendar-event-dialog-reminder.xhtml",
    "_blank",
    "chrome,titlebar,modal,resizable,centerscreen",
    args
  );
}

/**
 * Update the reminder details from the selected alarm. This shows a string
 * describing the reminder set, or nothing in case a preselected reminder was
 * chosen.
 *
 * @param {Element} reminderDetails - The reminder details element.
 * @param {Element} reminderList - The reminder menu element.
 * @param {calICalendar} calendar - The calendar.
 */
function updateReminderDetails(reminderDetails, reminderList, calendar) {
  // find relevant elements in the document
  const reminderMultipleLabel = reminderDetails.querySelector(".reminder-multiple-alarms-label");
  const iconBox = reminderDetails.querySelector(".alarm-icons-box");
  const reminderSingleLabel = reminderDetails.querySelector(".reminder-single-alarms-label");

  let reminders = reminderList.querySelector(".reminder-custom-menuitem").reminders || [];

  const actionValues = calendar.getProperty("capabilities.alarms.actionValues") || ["DISPLAY"];
  const actionMap = {};
  for (const action of actionValues) {
    actionMap[action] = true;
  }

  // Filter out any unsupported action types.
  reminders = reminders.filter(x => x.action in actionMap);

  if (reminderList.value == "custom") {
    // Depending on how many alarms we have, show either the "Multiple Alarms"
    // label or the single reminder label.
    reminderMultipleLabel.hidden = reminders.length < 2;
    reminderSingleLabel.hidden = reminders.length > 1;

    cal.alarms.addReminderImages(iconBox, reminders);

    // If there is only one reminder, display the reminder string
    if (reminders.length == 1) {
      reminderSingleLabel.value = reminders[0].toString(window.calendarItem);
    }
  } else {
    reminderMultipleLabel.setAttribute("hidden", "true");
    reminderSingleLabel.setAttribute("hidden", "true");
    if (reminderList.value == "none") {
      // No reminder selected means show no icons.
      while (iconBox.lastChild) {
        iconBox.lastChild.remove();
      }
    } else {
      // This is one of the predefined dropdown items. We should show a
      // single icon in the icons box to tell the user what kind of alarm
      // this will be.
      const mockAlarm = new CalAlarm();
      mockAlarm.action = getDefaultAlarmType(calendar);
      cal.alarms.addReminderImages(iconBox, [mockAlarm]);
    }
  }
}

/**
 * Check whether a reminder matches one of the default menu items or not.
 *
 * @param {calIAlarm} reminder - The reminder to match to a menu item.
 * @param {Element} reminderList - The reminder menu element.
 * @param {calICalendar} calendar - The current calendar, to get the default alarm type.
 * @returns {boolean} True if the reminder matches a menu item, false if not.
 */
function matchCustomReminderToMenuitem(reminder, reminderList, calendar) {
  const defaultAlarmType = getDefaultAlarmType(calendar);
  const reminderPopup = reminderList.menupopup;
  if (
    reminder.related != Ci.calIAlarm.ALARM_RELATED_ABSOLUTE &&
    reminder.offset &&
    reminder.action == defaultAlarmType
  ) {
    // Exactly one reminder that's not absolute, we may be able to match up
    // popup items.
    const relation = reminder.related == Ci.calIAlarm.ALARM_RELATED_START ? "START" : "END";

    // If the time duration for offset is 0, means the reminder is '0 minutes before'
    const origin =
      reminder.offset.inSeconds == 0 || reminder.offset.isNegative ? "before" : "after";

    const unitMap = {
      days: 86400,
      hours: 3600,
      minutes: 60,
    };

    for (const menuitem of reminderPopup.children) {
      if (
        menuitem.localName == "menuitem" &&
        menuitem.hasAttribute("length") &&
        menuitem.getAttribute("origin") == origin &&
        menuitem.getAttribute("relation") == relation
      ) {
        const unitMult = unitMap[menuitem.getAttribute("unit")] || 1;
        const length = menuitem.getAttribute("length") * unitMult;

        if (Math.abs(reminder.offset.inSeconds) == length) {
          menuitem.reminder = reminder.clone();
          reminderList.selectedItem = menuitem;
          // We've selected an item, so we are done here.
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Load an item's reminders into the dialog.
 *
 * @param {calIAlarm[]} reminders - An array of alarms to load.
 * @param {Element} reminderList - The reminders menulist element.
 * @param {calICalendar} calendar - The calendar the item belongs to.
 * @returns {number} Index of the selected item in reminders menu.
 */
function loadReminders(reminders, reminderList, calendar) {
  // Select 'no reminder' by default.
  reminderList.selectedIndex = 0;

  if (!reminders || !reminders.length) {
    // No reminders selected, we are done
    return reminderList.selectedIndex;
  }

  if (
    reminders.length > 1 ||
    !matchCustomReminderToMenuitem(reminders[0], reminderList, calendar)
  ) {
    // If more than one alarm is selected, or we didn't find a matching item
    // above, then select the "custom" item and attach the item's reminders to
    // it.
    reminderList.value = "custom";
    reminderList.querySelector(".reminder-custom-menuitem").reminders = reminders;
  }

  // Return the selected index so it can be remembered.
  return reminderList.selectedIndex;
}

/**
 * Save the selected reminder into the passed item.
 *
 * @param {calIEvent | calITodo} item   The calendar item to save the reminder into.
 * @param {calICalendar} calendar - The current calendar.
 * @param {Element} reminderList - The reminder menu element.
 */
function saveReminder(item, calendar, reminderList) {
  // We want to compare the old alarms with the new ones. If these are not
  // the same, then clear the snooze/dismiss times
  const oldAlarmMap = {};
  for (const alarm of item.getAlarms()) {
    oldAlarmMap[alarm.icalString] = true;
  }

  // Clear the alarms so we can add our new ones.
  item.clearAlarms();

  if (reminderList.value != "none") {
    const menuitem = reminderList.selectedItem;
    let reminders;

    if (menuitem.reminders) {
      // Custom reminder entries carry their own reminder object with
      // them. Make sure to clone in case these are the original item's
      // reminders.

      // XXX do we need to clone here?
      reminders = menuitem.reminders.map(x => x.clone());
    } else {
      // Pre-defined entries specify the necessary information
      // as attributes attached to the menuitem elements.
      reminders = [createReminderFromMenuitem(menuitem, calendar)];
    }

    const alarmCaps = item.calendar.getProperty("capabilities.alarms.actionValues") || ["DISPLAY"];
    const alarmActions = {};
    for (const action of alarmCaps) {
      alarmActions[action] = true;
    }

    // Make sure only alarms are saved that work in the given calendar.
    reminders.filter(x => x.action in alarmActions).forEach(item.addAlarm, item);
  }

  // Compare alarms to see if something changed.
  for (const alarm of item.getAlarms()) {
    const ics = alarm.icalString;
    if (ics in oldAlarmMap) {
      // The new alarm is also in the old set, remember this
      delete oldAlarmMap[ics];
    } else {
      // The new alarm is not in the old set, this means the alarms
      // differ and we can break out.
      oldAlarmMap[ics] = true;
      break;
    }
  }

  // If the alarms differ, clear the snooze/dismiss properties
  if (Object.keys(oldAlarmMap).length > 0) {
    const cmp = "X-MOZ-SNOOZE-TIME";

    // Recurring item alarms potentially have more snooze props, remove them
    // all.
    const propsToDelete = [];
    for (const [name] of item.properties) {
      if (name.startsWith(cmp)) {
        propsToDelete.push(name);
      }
    }

    item.alarmLastAck = null;
    propsToDelete.forEach(item.deleteProperty, item);
  }
}

/**
 * Get the default alarm type for the currently selected calendar. If the
 * calendar supports DISPLAY alarms, this is the default. Otherwise it is the
 * first alarm action the calendar supports.
 *
 * @param {calICalendar} calendar - The calendar to use.
 * @returns {string} The default alarm type.
 */
function getDefaultAlarmType(calendar) {
  const alarmCaps = calendar.getProperty("capabilities.alarms.actionValues") || ["DISPLAY"];
  return alarmCaps.includes("DISPLAY") ? "DISPLAY" : alarmCaps[0];
}

/**
 * Common update functions for both event dialogs. Called when a reminder has
 * been selected from the menulist.
 *
 * @param {Element} reminderList - The reminders menu element.
 * @param {calIEvent | calITodo} calendarItem - The calendar item.
 * @param {number} lastAlarmSelection - Index of the previous selection in the reminders menu.
 * @param {Element} reminderDetails - The reminder details element.
 * @param {calITimezone} timezone - The relevant timezone.
 * @param {boolean} suppressDialogs - If true, controls are updated without prompting
 *                                    for changes with the dialog
 * @returns {number} Index of the item selected in the reminders menu.
 */
function commonUpdateReminder(
  reminderList,
  calendarItem,
  lastAlarmSelection,
  calendar,
  reminderDetails,
  timezone,
  suppressDialogs
) {
  // if a custom reminder has been selected, we show the appropriate
  // dialog in order to allow the user to specify the details.
  // the result will be placed in the 'reminder-custom-menuitem' tag.
  if (reminderList.value == "custom") {
    // Clear the reminder icons first, this will make sure that while the
    // dialog is open the default reminder image is not shown which may
    // confuse users.
    const iconBox = reminderDetails.querySelector(".alarm-icons-box");
    while (iconBox.lastChild) {
      iconBox.lastChild.remove();
    }

    // show the dialog. This call blocks until the dialog is closed. Don't
    // pop up the dialog if aSuppressDialogs was specified or if this
    // happens during initialization of the dialog
    if (!suppressDialogs && reminderList.hasAttribute("last-value")) {
      editReminder(reminderList, calendarItem, lastAlarmSelection, calendar, timezone);
    }

    if (reminderList.value == "custom") {
      // Only do this if the 'custom' item is still selected. If the edit
      // reminder dialog was canceled then the previously selected
      // menuitem is selected, which may not be the custom menuitem.

      // If one or no reminders were selected, we have a chance of mapping
      // them to the existing elements in the dropdown.
      const customItem = reminderList.selectedItem;
      if (customItem.reminders.length == 0) {
        // No reminder was selected
        reminderList.value = "none";
      } else if (customItem.reminders.length == 1) {
        // We might be able to match the custom reminder with one of the
        // default menu items.
        matchCustomReminderToMenuitem(customItem.reminders[0], reminderList, calendar);
      }
    }
  }

  reminderList.setAttribute("last-value", reminderList.value);

  // possibly the selected reminder conflicts with the item.
  // for example an end-relation combined with a task without duedate
  // is an invalid state we need to take care of. we take the same
  // approach as with recurring tasks. in case the reminder is related
  // to the entry date we check the entry date automatically and disable
  // the checkbox. the same goes for end related reminder and the due date.
  if (calendarItem.isTodo()) {
    // In general, (re-)enable the due/entry checkboxes. This will be
    // changed in case the alarms are related to START/END below.
    enableElementWithLock("todo-has-duedate", "reminder-lock");
    enableElementWithLock("todo-has-entrydate", "reminder-lock");

    const menuitem = reminderList.selectedItem;
    if (menuitem.value != "none") {
      // In case a reminder is selected, retrieve the array of alarms from
      // it, or create one from the currently selected menuitem.
      const reminders = menuitem.reminders || [createReminderFromMenuitem(menuitem, calendar)];

      // If a reminder is related to the entry date...
      if (reminders.some(x => x.related == Ci.calIAlarm.ALARM_RELATED_START)) {
        // ...automatically check 'has entrydate'.
        if (!document.getElementById("todo-has-entrydate").checked) {
          document.getElementById("todo-has-entrydate").checked = true;

          // Make sure gStartTime is properly initialized
          updateEntryDate();
        }

        // Disable the checkbox to indicate that we need the entry-date.
        disableElementWithLock("todo-has-entrydate", "reminder-lock");
      }

      // If a reminder is related to the due date...
      if (reminders.some(x => x.related == Ci.calIAlarm.ALARM_RELATED_END)) {
        // ...automatically check 'has duedate'.
        if (!document.getElementById("todo-has-duedate").checked) {
          document.getElementById("todo-has-duedate").checked = true;

          // Make sure gStartTime is properly initialized
          updateDueDate();
        }

        // Disable the checkbox to indicate that we need the entry-date.
        disableElementWithLock("todo-has-duedate", "reminder-lock");
      }
    }
  }
  updateReminderDetails(reminderDetails, reminderList, calendar);

  // Return the current reminder drop down selection index so it can be remembered.
  return reminderList.selectedIndex;
}

/**
 * Updates the related link on the dialog. Currently only used by the
 * read-only summary dialog.
 *
 * @param {string} itemUrlString - The calendar item URL as a string.
 * @param {Element} linkRow - The row containing the link.
 * @param {Element} urlLink - The link element itself.
 */
function updateLink(itemUrlString, linkRow, urlLink) {
  const linkCommand = document.getElementById("cmd_toggle_link");

  if (linkCommand) {
    // Disable if there is no url.
    linkCommand.disabled = !itemUrlString;
  }

  if ((linkCommand && linkCommand.getAttribute("checked") != "true") || !itemUrlString.length) {
    // Hide if there is no url, or the menuitem was chosen so that the url
    // should be hidden
    linkRow.hidden = true;
  } else {
    let handler, uri;
    try {
      uri = Services.io.newURI(itemUrlString);
      handler = Services.io.getProtocolHandler(uri.scheme);
    } catch (e) {
      // No protocol handler for the given protocol, or invalid uri
      linkRow.hidden = true;
      return;
    }

    // Only show if its either an internal protocol handler, or its external
    // and there is an external app for the scheme
    handler = cal.wrapInstance(handler, Ci.nsIExternalProtocolHandler);
    const show = !handler || handler.externalAppExistsForScheme(uri.scheme);
    linkRow.hidden = !show;

    setTimeout(() => {
      // HACK the url link doesn't crop when setting the value in onLoad
      urlLink.setAttribute("value", itemUrlString);
      urlLink.setAttribute("href", itemUrlString);
    }, 0);
  }
}

/**
 * Adapts the scheduling responsibility for caldav servers according to RfC 6638
 * based on forceEmailScheduling preference for the respective calendar
 *
 * @param {calIEvent|calIToDo} aItem - Item to apply the change on
 */
function adaptScheduleAgent(aItem) {
  if (
    aItem.calendar &&
    aItem.calendar.type == "caldav" &&
    aItem.calendar.getProperty("capabilities.autoschedule.supported")
  ) {
    const identity = aItem.calendar.getProperty("imip.identity");
    const orgEmail = identity && identity.QueryInterface(Ci.nsIMsgIdentity).email;
    const organizerAction =
      aItem.organizer && orgEmail && aItem.organizer.id == "mailto:" + orgEmail;
    if (aItem.calendar.getProperty("forceEmailScheduling")) {
      cal.LOG("Enforcing clientside email based scheduling.");
      // for attendees, we change schedule-agent only in case of an
      // organizer triggered action
      if (organizerAction) {
        aItem.getAttendees().forEach(aAttendee => {
          // overwriting must always happen consistently for all
          // attendees regarding SERVER or CLIENT but must not override
          // e.g. NONE, so we only overwrite if the param is set to
          // SERVER or doesn't exist
          if (
            aAttendee.getProperty("SCHEDULE-AGENT") == "SERVER" ||
            !aAttendee.getProperty("SCHEDULE-AGENT")
          ) {
            aAttendee.setProperty("SCHEDULE-AGENT", "CLIENT");
            aAttendee.deleteProperty("SCHEDULE-STATUS");
            aAttendee.deleteProperty("SCHEDULE-FORCE-SEND");
          }
        });
      } else if (
        aItem.organizer &&
        (aItem.organizer.getProperty("SCHEDULE-AGENT") == "SERVER" ||
          !aItem.organizer.getProperty("SCHEDULE-AGENT"))
      ) {
        // for organizer, we change the schedule-agent only in case of
        // an attendee triggered action
        aItem.organizer.setProperty("SCHEDULE-AGENT", "CLIENT");
        aItem.organizer.deleteProperty("SCHEDULE-STATUS");
        aItem.organizer.deleteProperty("SCHEDULE-FORCE-SEND");
      }
    } else if (organizerAction) {
      aItem.getAttendees().forEach(aAttendee => {
        if (aAttendee.getProperty("SCHEDULE-AGENT") == "CLIENT") {
          aAttendee.deleteProperty("SCHEDULE-AGENT");
        }
      });
    } else if (aItem.organizer && aItem.organizer.getProperty("SCHEDULE-AGENT") == "CLIENT") {
      aItem.organizer.deleteProperty("SCHEDULE-AGENT");
    }
  }
}

/**
 * Extracts the item's organizer and opens a compose window to send the
 * organizer an email.
 *
 * @param {calIEvent | calITodo} item - The calendar item.
 */
function sendMailToOrganizer(item) {
  cal.email.sendTo(
    cal.email.getAttendeeEmail(item.organizer, true),
    `Re: ${item.title}`,
    null,
    item.calendar.getProperty("imip.identity")
  );
}

/**
 * Opens an attachment.
 *
 * @param {AUTF8String}  aAttachmentId   The hashId of the attachment to open.
 * @param {calIEvent | calITodo} item    The calendar item.
 */
function openAttachmentFromItemSummary(aAttachmentId, item) {
  if (!aAttachmentId) {
    return;
  }
  const attachments = item
    .getAttachments()
    .filter(aAttachment => aAttachment.hashId == aAttachmentId);

  if (attachments.length && attachments[0].uri && attachments[0].uri.spec != "about:blank") {
    openLinkExternally(attachments[0].uri, { addToHistory: false });
  }
}
