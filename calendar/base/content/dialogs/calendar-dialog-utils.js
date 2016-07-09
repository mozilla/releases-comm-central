/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gInTab, gMainWindow, gTabmail, intializeTabOrWindowVariables,
 *          dispose, setDialogId, loadReminders, saveReminder,
 *          commonUpdateReminder, updateLink, rearrangeAttendees
 */

Components.utils.import("resource://gre/modules/PluralForm.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/iteratorUtils.jsm");

Components.utils.import("resource://calendar/modules/calAlarmUtils.jsm");
Components.utils.import("resource://calendar/modules/calIteratorUtils.jsm");
Components.utils.import("resource://calendar/modules/calRecurrenceUtils.jsm");

// Variables related to whether we are in a tab or a window dialog.
var gInTab = false;
var gMainWindow = null;
var gTabmail = null;

/**
 * Initialize variables for tab vs window.
 */
function intializeTabOrWindowVariables() {
    let args = window.arguments[0];
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
    let args = window.arguments[0];
    if (args.job && args.job.dispose) {
        args.job.dispose();
    }
    resetDialogId(document.documentElement);
}

/**
 * Sets the id of a Dialog to another value to allow different window-icons to be displayed.
 * The original name is stored as new Attribute of the Dialog to set it back later.
 *
 * @param aDialog               The Dialog to be changed.
 * @param aNewId                The new ID as String.
 */
function setDialogId(aDialog, aNewId) {
    aDialog.setAttribute("originalId", aDialog.getAttribute("id"));
    aDialog.setAttribute("id", aNewId);
    applyPersitedProperties(aDialog);
}

/**
 * Sets the Dialog id back to previously stored one,
 * so that the persisted values are correctly saved.
 *
 * @param aDialog               The Dialog which is to be restored.
 */
function resetDialogId(aDialog) {
    let id = aDialog.getAttribute("originalId");
    if (id != "") {
        aDialog.setAttribute("id", id);
    }
    aDialog.removeAttribute("originalId");
}

/**
 * Apply the persisted properties from xulstore.json on a dialog based on the current dialog id.
 * This needs to be invoked after changing a dialog id while loading to apply the values for the
 * new dialog id.
 *
 * @param aDialog               The Dialog to apply the property values for
 */
function applyPersitedProperties(aDialog) {
    let xulStore = Components.classes["@mozilla.org/xul/xulstore;1"]
                             .getService(Components.interfaces.nsIXULStore);
    // first we need to detect which properties are persisted
    let persistedProps = aDialog.getAttribute("persist") || "";
    if (persistedProps == "") {
        return;
    }
    let propNames = persistedProps.split(" ");
    // now let's apply persisted values if applicable
    for (let propName of propNames) {
        if (xulStore.hasValue(aDialog.baseURI, aDialog.id, propName)) {
            aDialog.setAttribute(propName, xulStore.getValue(aDialog.baseURI, aDialog.id, propName));
        }
    }
}

/**
 * Create a calIAlarm from the given menuitem. The menuitem must have the
 * following attributes: unit, length, origin, relation.
 *
 * @param menuitem      The menuitem to create the alarm from.
 * @return              The calIAlarm with information from the menuitem.
 */
function createReminderFromMenuitem(aMenuitem) {
    let reminder = aMenuitem.reminder || cal.createAlarm();
    // clone immutable reminders if necessary to set default values
    let isImmutable = !reminder.isMutable;
    if (isImmutable) {
        reminder = reminder.clone();
    }
    let offset = cal.createDuration();
    offset[aMenuitem.getAttribute("unit")] = aMenuitem.getAttribute("length");
    offset.normalize();
    offset.isNegative = (aMenuitem.getAttribute("origin") == "before");
    reminder.related = (aMenuitem.getAttribute("relation") == "START" ?
                        reminder.ALARM_RELATED_START : reminder.ALARM_RELATED_END);
    reminder.offset = offset;
    reminder.action = getDefaultAlarmType();
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
 */
function editReminder() {
    let customItem = document.getElementById("reminder-custom-menuitem");
    let args = {};
    args.reminders = customItem.reminders;
    args.item = window.calendarItem;
    args.timezone = window.gStartTimezone ||
                    window.gEndTimezone ||
                    calendarDefaultTimezone();

    args.calendar = getCurrentCalendar();

    // While these are "just" callbacks, the dialog is opened modally, so aside
    // from whats needed to set up the reminders, nothing else needs to be done.
    args.onOk = function(reminders) {
        customItem.reminders = reminders;
    };
    args.onCancel = function() {
        document.getElementById("item-alarm").selectedIndex = gLastAlarmSelection;
    };

    window.setCursor("wait");

    // open the dialog modally
    openDialog(
        "chrome://calendar/content/calendar-event-dialog-reminder.xul",
        "_blank",
        "chrome,titlebar,modal,resizable",
        args);
}

/**
 * Update the reminder details from the selected alarm. This shows a string
 * describing the reminder set, or nothing in case a preselected reminder was
 * chosen.
 */
function updateReminderDetails() {
    // find relevant elements in the document
    let reminderList = document.getElementById("item-alarm");
    let reminderMultipleLabel = document.getElementById("reminder-multiple-alarms-label");
    let iconBox = document.getElementById("reminder-icon-box");
    let reminderSingleLabel = document.getElementById("reminder-single-alarms-label");
    let reminders = document.getElementById("reminder-custom-menuitem").reminders || [];
    let calendar = getCurrentCalendar();
    let actionValues = calendar.getProperty("capabilities.alarms.actionValues") || ["DISPLAY"];
    let actionMap = {};
    for (let action of actionValues) {
        actionMap[action] = true;
    }

    // Filter out any unsupported action types.
    reminders = reminders.filter(x => x.action in actionMap);

    if (reminderList.value == "custom") {
        // Depending on how many alarms we have, show either the "Multiple Alarms"
        // label or the single reminder label.
        setElementValue(reminderMultipleLabel,
                        reminders.length < 2 && "true",
                        "hidden");
        setElementValue(reminderSingleLabel,
                        reminders.length > 1 && "true",
                        "hidden");

        cal.alarms.addReminderImages(iconBox, reminders);

        // If there is only one reminder, display the reminder string
        if (reminders.length == 1) {
            setElementValue(reminderSingleLabel,
                            reminders[0].toString(window.calendarItem));
        }
    } else {
        hideElement(reminderMultipleLabel);
        hideElement(reminderSingleLabel);
        if (reminderList.value == "none") {
            // No reminder selected means show no icons.
            removeChildren(iconBox);
        } else {
            // This is one of the predefined dropdown items. We should show a
            // single icon in the icons box to tell the user what kind of alarm
            // this will be.
            let mockAlarm = cal.createAlarm();
            mockAlarm.action = getDefaultAlarmType();
            cal.alarms.addReminderImages(iconBox, [mockAlarm]);
        }
    }
}

var gLastAlarmSelection = 0;

function matchCustomReminderToMenuitem(reminder) {
    let defaultAlarmType = getDefaultAlarmType();
    let reminderList = document.getElementById("item-alarm");
    let reminderPopup = reminderList.firstChild;
    if (reminder.related != Components.interfaces.calIAlarm.ALARM_RELATED_ABSOLUTE &&
        reminder.offset &&
        reminder.action == defaultAlarmType) {
        // Exactly one reminder thats not absolute, we may be able to match up
        // popup items.
        let relation = (reminder.related == reminder.ALARM_RELATED_START ? "START" : "END");
        let origin;

        // If the time duration for offset is 0, means the reminder is '0 minutes before'
        if (reminder.offset.inSeconds == 0 || reminder.offset.isNegative) {
            origin = "before";
        } else {
            origin = "after";
        }

        let unitMap = {
            days: 86400,
            hours: 3600,
            minutes: 60
        };

        for (let menuitem of reminderPopup.childNodes) {
            if (menuitem.localName == "menuitem" &&
                menuitem.hasAttribute("length") &&
                menuitem.getAttribute("origin") == origin &&
                menuitem.getAttribute("relation") == relation) {
                let unitMult = unitMap[menuitem.getAttribute("unit")] || 1;
                let length = menuitem.getAttribute("length") * unitMult;

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
 * Load an item's reminders into the dialog
 *
 * @param reminders     An array of calIAlarms to load.
 */
function loadReminders(reminders) {
    // select 'no reminder' by default
    let reminderList = document.getElementById("item-alarm");
    let customItem = document.getElementById("reminder-custom-menuitem");
    reminderList.selectedIndex = 0;
    gLastAlarmSelection = 0;

    if (!reminders || !reminders.length) {
        // No reminders selected, we are done
        return;
    }

    if (reminders.length > 1 ||
        !matchCustomReminderToMenuitem(reminders[0])) {
        // If more than one alarm is selected, or we didn't find a matching item
        // above, then select the "custom" item and attach the item's reminders to
        // it.
        reminderList.value = "custom";
        customItem.reminders = reminders;
    }

    // remember the selected index
    gLastAlarmSelection = reminderList.selectedIndex;
}

/**
 * Save the selected reminder into the passed item.
 *
 * @param item      The item save the reminder into.
 */
function saveReminder(item) {
    // We want to compare the old alarms with the new ones. If these are not
    // the same, then clear the snooze/dismiss times
    let oldAlarmMap = {};
    for (let alarm of item.getAlarms({})) {
        oldAlarmMap[alarm.icalString] = true;
    }

    // Clear the alarms so we can add our new ones.
    item.clearAlarms();

    let reminderList = document.getElementById("item-alarm");
    if (reminderList.value != "none") {
        let menuitem = reminderList.selectedItem;
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
            reminders = [createReminderFromMenuitem(menuitem)];
        }

        let alarmCaps = item.calendar.getProperty("capabilities.alarms.actionValues") ||
                        ["DISPLAY"];
        let alarmActions = {};
        for (let action of alarmCaps) {
            alarmActions[action] = true;
        }

        // Make sure only alarms are saved that work in the given calendar.
        reminders.filter(x => x.action in alarmActions)
                 .forEach(item.addAlarm, item);
    }

    // Compare alarms to see if something changed.
    for (let alarm of item.getAlarms({})) {
        let ics = alarm.icalString;
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
        let cmp = "X-MOZ-SNOOZE-TIME";

        // Recurring item alarms potentially have more snooze props, remove them
        // all.
        let propIterator = fixIterator(item.propertyEnumerator, Components.interfaces.nsIProperty);
        let propsToDelete = [];
        for (let prop in propIterator) {
            if (prop.name.startsWith(cmp)) {
                propsToDelete.push(prop.name);
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
 * @return      The default alarm type.
 */
function getDefaultAlarmType() {
    let calendar = getCurrentCalendar();
    let alarmCaps = calendar.getProperty("capabilities.alarms.actionValues") ||
                    ["DISPLAY"];
    return (alarmCaps.includes("DISPLAY") ? "DISPLAY" : alarmCaps[0]);
}

/**
 * Get the currently selected calendar. For dialogs with a menulist of
 * calendars, this is the currently chosen calendar, otherwise its the fixed
 * calendar from the window's item.
 *
 * @return      The currently selected calendar.
 */
function getCurrentCalendar() {
    let calendarNode = document.getElementById("item-calendar");
    return (calendarNode && calendarNode.selectedItem
                                ? calendarNode.selectedItem.calendar
                                : window.calendarItem.calendar);
}

/**
 * Common update functions for both event dialogs. Called when a reminder has
 * been selected from the menulist.
 *
 * @param aSuppressDialogs     If true, controls are updated without prompting
 *                               for changes with the dialog
 */
function commonUpdateReminder(aSuppressDialogs) {
    // if a custom reminder has been selected, we show the appropriate
    // dialog in order to allow the user to specify the details.
    // the result will be placed in the 'reminder-custom-menuitem' tag.
    let reminderList = document.getElementById("item-alarm");
    if (reminderList.value == "custom") {
        // Clear the reminder icons first, this will make sure that while the
        // dialog is open the default reminder image is not shown which may
        // confuse users.
        removeChildren("reminder-icon-box");

        // show the dialog. This call blocks until the dialog is closed. Don't
        // pop up the dialog if aSuppressDialogs was specified or if this
        // happens during initialization of the dialog
        if (!aSuppressDialogs && reminderList.hasAttribute("last-value")) {
            editReminder();
        }

        if (reminderList.value == "custom") {
            // Only do this if the 'custom' item is still selected. If the edit
            // reminder dialog was canceled then the previously selected
            // menuitem is selected, which may not be the custom menuitem.

            // If one or no reminders were selected, we have a chance of mapping
            // them to the existing elements in the dropdown.
            let customItem = reminderList.selectedItem;
            if (customItem.reminders.length == 0) {
                // No reminder was selected
                reminderList.value = "none";
            } else if (customItem.reminders.length == 1) {
                // We might be able to match the custom reminder with one of the
                // default menu items.
                matchCustomReminderToMenuitem(customItem.reminders[0]);
            }
        }
    }

    // remember the current reminder drop down selection index.
    gLastAlarmSelection = reminderList.selectedIndex;
    reminderList.setAttribute("last-value", reminderList.value);

    // possibly the selected reminder conflicts with the item.
    // for example an end-relation combined with a task without duedate
    // is an invalid state we need to take care of. we take the same
    // approach as with recurring tasks. in case the reminder is related
    // to the entry date we check the entry date automatically and disable
    // the checkbox. the same goes for end related reminder and the due date.
    if (isToDo(window.calendarItem)) {
        // In general, (re-)enable the due/entry checkboxes. This will be
        // changed in case the alarms are related to START/END below.
        enableElementWithLock("todo-has-duedate", "reminder-lock");
        enableElementWithLock("todo-has-entrydate", "reminder-lock");

        let menuitem = reminderList.selectedItem;
        if (menuitem.value != "none") {
            // In case a reminder is selected, retrieve the array of alarms from
            // it, or create one from the currently selected menuitem.
            let reminders = menuitem.reminders || [createReminderFromMenuitem(menuitem)];

            // If a reminder is related to the entry date...
            if (reminders.some(x => x.related == x.ALARM_RELATED_START)) {
                // ...automatically check 'has entrydate'.
                if (!getElementValue("todo-has-entrydate", "checked")) {
                    setElementValue("todo-has-entrydate", "true", "checked");

                    // Make sure gStartTime is properly initialized
                    updateEntryDate();
                }

                // Disable the checkbox to indicate that we need the entry-date.
                disableElementWithLock("todo-has-entrydate", "reminder-lock");
            }

            // If a reminder is related to the due date...
            if (reminders.some(x => x.related == x.ALARM_RELATED_END)) {
                // ...automatically check 'has duedate'.
                if (!getElementValue("todo-has-duedate", "checked")) {
                    setElementValue("todo-has-duedate", "true", "checked");

                    // Make sure gStartTime is properly initialized
                    updateDueDate();
                }

                // Disable the checkbox to indicate that we need the entry-date.
                disableElementWithLock("todo-has-duedate", "reminder-lock");
            }
        }
    }
    updateReminderDetails();
}

/**
 * Updates the related link on the dialog. Currently only used by the
 * read-only summary dialog.
 */
function updateLink() {
    function hideOrShow(aBool) {
        setElementValue("event-grid-link-row", !aBool && "true", "hidden");
        let separator = document.getElementById("event-grid-link-separator");
        if (separator) {
            // The separator is not there in the summary dialog
            setElementValue("event-grid-link-separator", !aBool && "true", "hidden");
        }
    }

    let itemUrlString = window.calendarItem.getProperty("URL") || "";
    let linkCommand = document.getElementById("cmd_toggle_link");


    if (linkCommand) {
        // Disable if there is no url
        setElementValue(linkCommand,
                        !itemUrlString.length && "true",
                        "disabled");
    }

    if ((linkCommand && linkCommand.getAttribute("checked") != "true") ||
        !itemUrlString.length) {
        // Hide if there is no url, or the menuitem was chosen so that the url
        // should be hidden
        hideOrShow(false);
    } else {
        let handler, uri;
        try {
            uri = makeURL(itemUrlString);
            handler = Services.io.getProtocolHandler(uri.scheme);
        } catch (e) {
            // No protocol handler for the given protocol, or invalid uri
            hideOrShow(false);
            return;
        }

        // Only show if its either an internal protcol handler, or its external
        // and there is an external app for the scheme
        handler = cal.wrapInstance(handler, Components.interfaces.nsIExternalProtocolHandler);
        hideOrShow(!handler || handler.externalAppExistsForScheme(uri.scheme));

        setTimeout(() => {
            // HACK the url-link doesn't crop when setting the value in onLoad
            setElementValue("url-link", itemUrlString);
            setElementValue("url-link", itemUrlString, "href");
        }, 0);
    }
}

/*
 * setup attendees in event and summary dialog
 */
function setupAttendees() {
    let attBox = document.getElementById("item-attendees-box");
    let attBoxRows = attBox.getElementsByClassName("item-attendees-row");

    if (window.attendees && window.attendees.length > 0) {
        // cloning of the template nodes
        let selector = "#item-attendees-box-template .item-attendees-row";
        let clonedRow = document.querySelector(selector).cloneNode(false);
        selector = "#item-attendees-box-template .item-attendees-row box:nth-of-type(1)";
        let clonedCell = document.querySelector(selector).cloneNode(true);
        selector = "#item-attendees-box-template .item-attendees-row box:nth-of-type(2)";
        let clonedSpacer = document.querySelector(selector).cloneNode(false);

        // determining of attendee box setup
        let inRow = window.attendeesInRow || -1;
        if (inRow == -1) {
            inRow = determineAttendeesInRow();
            window.attendeesInRow = inRow;
        } else {
            while (attBoxRows.length > 0) {
                attBox.removeChild(attBoxRows[0]);
            }
        }

        // set up of the required nodes
        let maxRows = Math.ceil(window.attendees.length / inRow);
        let inLastRow = window.attendees.length - ((maxRows - 1) * inRow);
        let attCount = 0;
        while (attBox.getElementsByClassName("item-attendees-row").length < maxRows) {
            let newRow = clonedRow.cloneNode(false);
            let row = attBox.appendChild(newRow);
            row.removeAttribute("hidden");
            let rowCount = attBox.getElementsByClassName("item-attendees-row").length;
            let reqAtt = rowCount == maxRows ? inLastRow : inRow;
            // we add as many attendee cells as required
            while (row.childNodes.length < reqAtt) {
                let newCell = clonedCell.cloneNode(true);
                let cell = row.appendChild(newCell);
                let icon = cell.getElementsByTagName("img")[0];
                let text = cell.getElementsByTagName("label")[0];
                let attendee = window.attendees[attCount];

                let label = (attendee.commonName && attendee.commonName.length)
                            ? attendee.commonName : attendee.toString();
                let userType = attendee.userType || "INDIVIDUAL";
                let role = attendee.role || "REQ-PARTICIPANT";
                let partstat = attendee.participationStatus || "NEEDS-ACTION";

                icon.setAttribute("partstat", partstat);
                icon.setAttribute("usertype", userType);
                icon.setAttribute("role", role);
                cell.setAttribute("attendeeid", attendee.id);
                cell.removeAttribute("hidden");

                let userTypeString = cal.calGetString("calendar", "dialog.tooltip.attendeeUserType2." + userType,
                                                      [attendee.toString()]);
                let roleString = cal.calGetString("calendar", "dialog.tooltip.attendeeRole2." + role,
                                                  [userTypeString]);
                let partstatString = cal.calGetString("calendar", "dialog.tooltip.attendeePartStat2." + partstat,
                                                      [label]);
                let tooltip = cal.calGetString("calendar", "dialog.tooltip.attendee.combined",
                                               [roleString, partstatString]);

                let del = cal.resolveDelegation(attendee, window.attendees);
                if (del.delegators != "") {
                    del.delegators = cal.calGetString("calendar",
                                                      "dialog.attendee.append.delegatedFrom",
                                                      [del.delegators]);
                    label += " " + del.delegators;
                    tooltip += " " + del.delegators;
                }
                if (del.delegatees != "") {
                    del.delegatees = cal.calGetString("calendar",
                                                      "dialog.attendee.append.delegatedTo",
                                                      [del.delegatees]);
                    tooltip += " " + del.delegatees;
                }

                text.setAttribute("value", label);
                cell.setAttribute("tooltiptext", tooltip);
                attCount++;
            }
            // we fill the row with placeholders if required
            if (attBox.getElementsByClassName("item-attendees-row").length > 1 && inRow > 1) {
                while (row.childNodes.length < inRow) {
                    let newSpacer = clonedSpacer.cloneNode(true);
                    newSpacer.removeAttribute("hidden");
                    row.appendChild(newSpacer);
                }
            }
        }

        // determining of the max width of an attendee label - this needs to
        // be done only once and is obsolete in case of resizing
        if (!window.maxLabelWidth) {
            let maxWidth = 0;
            for (let cell of attBox.getElementsByClassName("item-attendees-cell")) {
                cell = cell.cloneNode(true);
                cell.removeAttribute("flex");
                cell.getElementsByTagName("label")[0].removeAttribute("flex");
                maxWidth = cell.clientWidth > maxWidth ? cell.clientWidth : maxWidth;
            }
            window.maxLabelWidth = maxWidth;
        }
    } else {
        while (attBoxRows.length > 0) {
            attBox.removeChild(attBoxRows[0]);
        }
    }
}

/**
 * Re-arranges the attendees on dialog resizing in event and summary dialog
 */
function rearrangeAttendees() {
    if (window.attendees && window.attendees.length > 0 && window.attendeesInRow) {
        let inRow = determineAttendeesInRow();
        if (inRow != window.attendeesInRow) {
            window.attendeesInRow = inRow;
            setupAttendees();
        }
    }
}

/**
 * Calculates the number of columns to distribute attendees for event and summary dialog
 */
function determineAttendeesInRow() {
    // as default value a reasonable high value is appropriate
    // it will be recalculated anyway.
    let minWidth = window.maxLabelWidth || 200;
    let inRow = Math.floor(document.width / minWidth);
    return inRow > 1 ? inRow : 1;
}
