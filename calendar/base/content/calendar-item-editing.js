/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calAlarmUtils.jsm");
Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");

/**
 * Takes a job and makes sure the dispose function on it is called. If there is
 * no dispose function or the job is null, ignore it.
 *
 * @param job       The job to dispose.
 */
function disposeJob(job) {
    if (job && job.dispose) {
        job.dispose();
    }
}

/**
 * Sets the default values for new items, taking values from either the passed
 * parameters or the preferences
 *
 * @param aItem         The item to set up
 * @param aCalendar     (optional) The calendar to apply.
 * @param aStartDate    (optional) The start date to set.
 * @param aEndDate      (optional) The end date/due date to set.
 * @param aInitialDate  (optional) The reference date for the date pickers
 * @param aForceAllday  (optional) Force the event/task to be an allday item.
 */
function setDefaultItemValues(aItem, aCalendar=null, aStartDate=null, aEndDate=null, aInitialDate=null, aForceAllday=false) {
    function endOfDay(aDate) {
        let eod = aDate ? aDate.clone() : cal.now();
        eod.hour = Preferences.get("calendar.view.dayendhour", 19);
        eod.minute = 0;
        eod.second = 0;
        return eod;
    }
    function startOfDay(aDate) {
        let sod = aDate ? aDate.clone() : cal.now();
        sod.hour = Preferences.get("calendar.view.daystarthour", 8);
        sod.minute = 0;
        sod.second = 0;
        return sod;
    }

    let initialDate = aInitialDate ? aInitialDate.clone() : cal.now();
    initialDate.isDate = true;

    if (cal.isEvent(aItem)) {
        if (aStartDate) {
            aItem.startDate = aStartDate.clone();
            if (aStartDate.isDate && !aForceAllday) {
                // This is a special case where the date is specified, but the
                // time is not. To take care, we setup up the time to our
                // default event start time.
                aItem.startDate = cal.getDefaultStartDate(aItem.startDate);
            } else if (aForceAllday) {
                // If the event should be forced to be allday, then don't set up
                // any default hours and directly make it allday.
                aItem.startDate.isDate = true;
                aItem.startDate.timezone = cal.floating();
            }
        } else {
            // If no start date was passed, then default to the next full hour
            // of today, but with the date of the selected day
            aItem.startDate = cal.getDefaultStartDate(initialDate);
        }

        if (aEndDate) {
            aItem.endDate = aEndDate.clone();
            if (aForceAllday) {
                // XXX it is currently not specified, how callers that force all
                // day should pass the end date. Right now, they should make
                // sure that the end date is 00:00:00 of the day after.
                aItem.endDate.isDate = true;
                aItem.endDate.timezone = cal.floating();
            }
        } else {
            aItem.endDate = aItem.startDate.clone();
            if (!aForceAllday) {
                // If the event is not all day, then add the default event
                // length.
                aItem.endDate.minute += Preferences.get("calendar.event.defaultlength", 60);
            } else {
                // All day events need to go to the beginning of the next day.
                aItem.endDate.day++;
            }
        }

        // Free/busy status is only valid for events, must not be set for tasks.
        aItem.setProperty("TRANSP", cal.getEventDefaultTransparency(aForceAllday));

    } else if (cal.isToDo(aItem)) {
        let now = cal.now();
        let initDate = initialDate ? initialDate.clone() : now;
        initDate.isDate = false;
        initDate.hour = now.hour;
        initDate.minute = now.minute;
        initDate.second = now.second;

        if (aStartDate) {
            aItem.entryDate = aStartDate.clone();
        } else {
            let defaultStart = Preferences.get("calendar.task.defaultstart", "none");
            if (Preferences.get("calendar.alarms.onfortodos", 0) == 1 && defaultStart == "none") {
                // start date is required if we want to set an alarm
                defaultStart = "offsetcurrent";
            }

            let units = Preferences.get("calendar.task.defaultstartoffsetunits", "minutes");
            if (!["days", "hours", "minutes"].includes(units)) {
                units = "minutes";
            }
            let startOffset = cal.createDuration();
            startOffset[units] = Preferences.get("calendar.task.defaultstartoffset", 0);
            let start;

            switch (defaultStart) {
                case "none":
                    break;
                case "startofday":
                    start = startOfDay(initDate);
                    break;
                case "tomorrow":
                    start = startOfDay(initDate);
                    start.day++;
                    break;
                case "nextweek":
                    start = startOfDay(initDate);
                    start.day += 7;
                    break;
                case "offsetcurrent":
                    start = initDate.clone();
                    start.addDuration(startOffset);
                    break;
                case "offsetnexthour":
                    start = initDate.clone();
                    start.second = 0;
                    start.minute = 0;
                    start.hour++;
                    start.addDuration(startOffset);
                    break;
            }

            if (start) {
                aItem.entryDate = start;
            }
        }

        if (aEndDate) {
            aItem.dueDate = aEndDate.clone();
        } else {
            let defaultDue = Preferences.get("calendar.task.defaultdue", "none");

            let units = Preferences.get("calendar.task.defaultdueoffsetunits", "minutes");
            if (!["days", "hours", "minutes"].includes(units)) {
                units = "minutes";
            }
            let dueOffset = cal.createDuration();
            dueOffset[units] = Preferences.get("calendar.task.defaultdueoffset", 0);

            let start = aItem.entryDate ? aItem.entryDate.clone() : initDate.clone();
            let due;

            switch (defaultDue) {
                case "none":
                    break;
                case "endofday":
                    due = endOfDay(start);
                    // go to tomorrow if we're past the end of today
                    if (start.compare(due) > 0) {
                        due.day++;
                    }
                    break;
                case "tomorrow":
                    due = endOfDay(start);
                    due.day++;
                    break;
                case "nextweek":
                    due = endOfDay(start);
                    due.day += 7;
                    break;
                case "offsetcurrent":
                    due = start.clone();
                    due.addDuration(dueOffset);
                    break;
                case "offsetnexthour":
                    due = start.clone();
                    due.second = 0;
                    due.minute = 0;
                    due.hour++;
                    due.addDuration(dueOffset);
                    break;
            }

            if (aItem.entryDate && due && aItem.entryDate.compare(due) > 0) {
                // due can't be earlier than start date.
                due = aItem.entryDate;
            }

            if (due) {
                aItem.dueDate = due;
            }
        }
    }

    // Calendar
    aItem.calendar = aCalendar || getSelectedCalendar();

    // Alarms
    cal.alarms.setDefaultValues(aItem);
}

/**
 * Creates an event with the calendar event dialog.
 *
 * @param calendar      (optional) The calendar to create the event in
 * @param startDate     (optional) The event's start date.
 * @param endDate       (optional) The event's end date.
 * @param summary       (optional) The event's title.
 * @param event         (optional) A template event to show in the dialog
 * @param aForceAllDay  (optional) Make sure the event shown in the dialog is an
 *                                   allday event.
 */
function createEventWithDialog(calendar, startDate, endDate, summary, event, aForceAllday) {
    const kDefaultTimezone = calendarDefaultTimezone();

    var onNewEvent = function(item, calendar, originalItem, listener) {
        if (item.id) {
            // If the item already has an id, then this is the result of
            // saving the item without closing, and then saving again.
            doTransaction('modify', item, calendar, originalItem, listener);
        } else {
            // Otherwise, this is an addition
            doTransaction('add', item, calendar, null, listener);
        }
    };

    if (event) {
        if (!event.isMutable) {
            event = event.clone();
        }
        // If the event should be created from a template, then make sure to
        // remove the id so that the item obtains a new id when doing the
        // transaction
        event.id = null;

        if (aForceAllday) {
            event.startDate.isDate = true;
            event.endDate.isDate = true;
            if (event.startDate.compare(event.endDate) == 0) {
                // For a one day all day event, the end date must be 00:00:00 of
                // the next day.
                event.endDate.day++;
            }
        }

        if (!event.calendar) {
            event.calendar = calendar || getSelectedCalendar();
        }
    } else {
        event = cal.createEvent();

        let refDate = currentView().initialized && currentView().selectedDay.clone();
        setDefaultItemValues(event, calendar, startDate, endDate, refDate, aForceAllday);
        if (summary) {
            event.title = summary;
        }
    }
    openEventDialog(event, event.calendar, "new", onNewEvent, null);
}

/**
 * Creates a task with the calendar event dialog.
 *
 * @param calendar      (optional) The calendar to create the task in
 * @param dueDate       (optional) The task's due date.
 * @param summary       (optional) The task's title.
 * @param todo          (optional) A template task to show in the dialog.
 * @param initialDate   (optional) The initial date for new task datepickers
 */
function createTodoWithDialog(calendar, dueDate, summary, todo, initialDate) {
    const kDefaultTimezone = calendarDefaultTimezone();

    var onNewItem = function(item, calendar, originalItem, listener) {
        if (item.id) {
            // If the item already has an id, then this is the result of
            // saving the item without closing, and then saving again.
            doTransaction('modify', item, calendar, originalItem, listener);
        } else {
            // Otherwise, this is an addition
            doTransaction('add', item, calendar, null, listener);
        }
    }

    if (todo) {
        // If the todo should be created from a template, then make sure to
        // remove the id so that the item obtains a new id when doing the
        // transaction
        if (todo.id) {
            todo = todo.clone();
            todo.id = null;
        }

        if (!todo.calendar) {
            todo.calendar = calendar || getSelectedCalendar();
        }
    } else {
        todo = cal.createTodo();
        setDefaultItemValues(todo, calendar, null, dueDate, initialDate);

        if (summary) {
            todo.title = summary;
        }
    }

    openEventDialog(todo, calendar, "new", onNewItem, null, initialDate);
}



/**
 * Modifies the passed event in the event dialog.
 *
 * @param aItem                 The item to modify.
 * @param job                   (optional) The job object that controls this
 *                                           modification.
 * @param aPromptOccurrence     If the user should be prompted to select if the
 *                                parent item or occurrence should be modified.
 * @param initialDate           (optional) The initial date for new task datepickers
 */
function modifyEventWithDialog(aItem, job, aPromptOccurrence, initialDate) {
    let dlg = cal.findItemWindow(aItem);
    if (dlg) {
        dlg.focus();
        disposeJob(job);
        return;
    }

    let onModifyItem = function(item, calendar, originalItem, listener) {
        doTransaction('modify', item, calendar, originalItem, listener);
    };

    let item = aItem;
    let futureItem, response;
    if (aPromptOccurrence !== false) {
        [item, futureItem, response] = promptOccurrenceModification(aItem, true, "edit");
    }

    if (item && (response || response === undefined)) {
        openEventDialog(item, item.calendar, "modify", onModifyItem, job, initialDate);
    } else {
        disposeJob(job);
    }
}

/**
 * Opens the event dialog with the given item (task OR event)
 *
 * @param calendarItem      The item to open the dialog with
 * @param calendar          The calendar to open the dialog with.
 * @param mode              The operation the dialog should do ("new", "modify")
 * @param callback          The callback to call when the dialog has completed.
 * @param job               (optional) The job object for the modification.
 * @param initialDate       (optional) The initial date for new task datepickers
 */
function openEventDialog(calendarItem, calendar, mode, callback, job, initialDate) {
    let dlg = cal.findItemWindow(calendarItem);
    if (dlg) {
        dlg.focus();
        disposeJob(job);
        return;
    }

    // Set up some defaults
    mode = mode || "new";
    calendar = calendar || getSelectedCalendar();
    var calendars = getCalendarManager().getCalendars({});
    calendars = calendars.filter(isCalendarWritable);

    var isItemSupported;
    if (isToDo(calendarItem)) {
        isItemSupported = function isTodoSupported(aCalendar) {
            return (aCalendar.getProperty("capabilities.tasks.supported") !== false);
        };
    } else if (isEvent(calendarItem)) {
        isItemSupported = function isEventSupported(aCalendar) {
            return (aCalendar.getProperty("capabilities.events.supported") !== false);
        };
    }

    // Filter out calendars that don't support the given calendar item
    calendars = calendars.filter(isItemSupported);

    // Filter out calendar/items that we cannot write to/modify
    if (mode == "new") {
        calendars = calendars.filter(userCanAddItemsToCalendar);
    } else { /* modify */
        calendars = calendars.filter((aCalendar) => {
            /* If the calendar is the item calendar, we check that the item
             * can be modified. If the calendar is NOT the item calendar, we
             * check that the user can remove items from that calendar and
             * add items to the current one.
             */
            return (((calendarItem.calendar != aCalendar)
                     && userCanDeleteItemsFromCalendar(calendarItem.calendar)
                     && userCanAddItemsToCalendar(aCalendar))
                    || ((calendarItem.calendar == aCalendar)
                        && userCanModifyItem(calendarItem)));
        });
    }

    if (mode == "new"
        && (!isCalendarWritable(calendar)
            || !userCanAddItemsToCalendar(calendar)
            || !isItemSupported(calendar))) {
        if (calendars.length < 1) {
            // There are no writable calendars or no calendar supports the given
            // item. Don't show the dialog.
            disposeJob(job);
            return;
        } else  {
            // Pick the first calendar that supports the item and is writable
            calendar = calendars[0];
            if (calendarItem) {
                // XXX The dialog currently uses the items calendar as a first
                // choice. Since we are shortly before a release to keep
                // regression risk low, explicitly set the item's calendar here.
                calendarItem.calendar = calendars[0];
            }
        }
    }

    // Setup the window arguments
    var args = new Object();
    args.calendarEvent = calendarItem;
    args.calendar = calendar;
    args.mode = mode;
    args.onOk = callback;
    args.job = job;
    args.initialStartDateValue = (initialDate || getDefaultStartDate());

    // this will be called if file->new has been selected from within the dialog
    args.onNewEvent = function(calendar) {
        createEventWithDialog(calendar, null, null);
    };
    args.onNewTodo = function(calendar) {
        createTodoWithDialog(calendar);
    };

    // the dialog will reset this to auto when it is done loading.
    window.setCursor("wait");

    // ask the provide if this item is an invitation. if this is the case
    // we'll open the summary dialog since the user is not allowed to change
    // the details of the item.
    let wrappedCalendar = cal.wrapInstance(calendar, Components.interfaces.calISchedulingSupport);
    let isInvitation = wrappedCalendar && wrappedCalendar.isInvitation(calendarItem);

    // open the dialog modeless
    let url;
    if (isCalendarWritable(calendar)
        && (mode == "new"
            || (mode == "modify" && !isInvitation && userCanModifyItem((calendarItem))))) {
        url = "chrome://calendar/content/calendar-event-dialog.xul";
    } else {
        url = "chrome://calendar/content/calendar-summary-dialog.xul";
    }

    // reminder: event dialog should not be modal (cf bug 122671)
    var features;
    // keyword "dependent" should not be used (cf bug 752206)
    if (Services.appinfo.OS == "WINNT") {
        features = "chrome,titlebar,resizable";
    } else if (Services.appinfo.OS == "Darwin") {
        features = "chrome,titlebar,resizable,minimizable=no";
    } else {
        // All other targets, mostly Linux flavors using gnome.
        features = "chrome,titlebar,resizable,minimizable=no,dialog=no";
    }

    openDialog(url, "_blank", features, args);
}

/**
 * Prompts the user how the passed item should be modified. If the item is an
 * exception or already a parent item, the item is returned without prompting.
 * If "all occurrences" is specified, the parent item is returned. If "this
 * occurrence only" is specified, then aItem is returned. If "this and following
 * occurrences" is selected, aItem's parentItem is modified so that the
 * recurrence rules end (UNTIL) just before the given occurrence. If
 * aNeedsFuture is specified, a new item is made from the part that was stripped
 * off the passed item.
 *
 * EXDATEs and RDATEs that do not fit into the items recurrence are removed. If
 * the modified item or the future item only consist of a single occurrence,
 * they are changed to be single items.
 *
 * @param aItem                         The item to check.
 * @param aNeedsFuture                  If true, the future item is parsed.
 *                                        This parameter can for example be
 *                                        false if a deletion is being made.
 * @param aAction                       Either "edit" or "delete". Sets up
 *                                          the labels in the occurrence prompt
 * @return [modifiedItem, futureItem, promptResponse]
 *                                      If "this and all following" was chosen,
 *                                        an array containing the item *until*
 *                                        the given occurrence (modifiedItem),
 *                                        and the item *after* the given
 *                                        occurrence (futureItem).
 *
 *                                        If any other option was chosen,
 *                                        futureItem is null  and the
 *                                        modifiedItem is either the parent item
 *                                        or the passed occurrence, or null if
 *                                        the dialog was canceled.
 *
 *                                        The promptResponse parameter gives the
 *                                        response of the dialog as a constant.
 */
function promptOccurrenceModification(aItem, aNeedsFuture, aAction) {
    const CANCEL = 0;
    const MODIFY_OCCURRENCE = 1;
    const MODIFY_FOLLOWING = 2;
    const MODIFY_PARENT = 3;

    var futureItem = false;
    var pastItem;
    var type = CANCEL;

    // Check if this actually is an instance of a recurring event
    if (aItem == aItem.parentItem) {
        type = MODIFY_PARENT;
    } else if (aItem.parentItem.recurrenceInfo.getExceptionFor(aItem.recurrenceId)) {
        // If the user wants to edit an occurrence which is already an exception
        // always edit this single item.
        // XXX  Why? I think its ok to ask also for exceptions.
        type = MODIFY_OCCURRENCE;
    } else {
        // Prompt the user. Setting modal blocks the dialog until it is closed. We
        // use rv to pass our return value.
        var rv = { value: CANCEL, item: aItem, action: aAction};
        window.openDialog("chrome://calendar/content/calendar-occurrence-prompt.xul",
                          "PromptOccurrenceModification",
                          "centerscreen,chrome,modal,titlebar",
                          rv);
        type = rv.value;
    }

    switch (type) {
        case MODIFY_PARENT:
            pastItem = aItem.parentItem;
            break;
        case MODIFY_FOLLOWING:
            // TODO tbd in a different bug
            throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
            break;
        case MODIFY_OCCURRENCE:
            pastItem = aItem;
            break;
        case CANCEL:
            // Since we have not set past or futureItem, the return below will
            // take care.
            break;
    }

    return [pastItem, futureItem, type];
}

// Undo/Redo code

/**
 * Helper to return the transaction manager service.
 *
 * @return      The calITransactionManager service.
 */
function getTransactionMgr() {
    return Components.classes["@mozilla.org/calendar/transactionmanager;1"]
                     .getService(Components.interfaces.calITransactionManager);
}


/**
 * Create and commit a transaction with the given arguments to the transaction
 * manager. Also updates the undo/redo menu.
 *
 * @see                 calITransactionManager
 * @param aAction       The action to do.
 * @param aItem         The new item to add/modify/delete
 * @param aCalendar     The calendar to do the transaction on
 * @param aOldItem      (optional) some actions require an old item
 * @param aListener     (optional) the listener to call when complete.
 */
function doTransaction(aAction, aItem, aCalendar, aOldItem, aListener) {
    // This is usually a user-initiated transaction, so make sure the calendar
    // this transaction is happening on is visible.
    ensureCalendarVisible(aCalendar);

    // Now use the transaction manager to execute the action
    getTransactionMgr().createAndCommitTxn(aAction,
                                           aItem,
                                           aCalendar,
                                           aOldItem,
                                           aListener ? aListener : null);
    updateUndoRedoMenu();
}

/**
 * Undo the last operation done through the transaction manager.
 */
function undo() {
    if (canUndo()) {
        getTransactionMgr().undo();
        updateUndoRedoMenu();
    }
}

/**
 * Redo the last undone operation in the transaction manager.
 */
function redo() {
    if (canRedo()) {
        getTransactionMgr().redo();
        updateUndoRedoMenu();
    }
}

/**
 * Start a batch transaction on the transaction manager. Can be called multiple
 * times, which nests transactions.
 */
function startBatchTransaction() {
    getTransactionMgr().beginBatch();
}

/**
 * End a previously started batch transaction. NOTE: be sure to call this in a
 * try-catch-finally-block in case you have code that could fail between
 * startBatchTransaction and this call.
 */
function endBatchTransaction() {
    getTransactionMgr().endBatch();
    updateUndoRedoMenu();
}

/**
 * Checks if the last operation can be undone (or if there is a last operation
 * at all).
 */
function canUndo() {
    return getTransactionMgr().canUndo();
}

/**
 * Checks if the last undone operation can be redone.
 */
function canRedo() {
    return getTransactionMgr().canRedo();
}

/**
 * Update the undo and redo commands.
 */
function updateUndoRedoMenu() {
    goUpdateCommand("cmd_undo");
    goUpdateCommand("cmd_redo");
}

function setContextPartstat(value, scope, items) {
    startBatchTransaction();
    try {
        for each (let oldItem in items) {
            // Skip this item if its calendar is read only.
            if (oldItem.calendar.readOnly) {
                continue;
            }
            if (scope == "all-occurrences") {
                oldItem = oldItem.parentItem;
            }
            let attendee = null;
            if (cal.isInvitation(oldItem)) {
                // Check for the invited attendee first, this is more important
                attendee = cal.getInvitedAttendee(oldItem);
            } else if (oldItem.organizer && oldItem.getAttendees({}).length) {
                // Now check the organizer. This should be done last.
                let calOrgId = oldItem.calendar.getProperty("organizerId");
                if (calOrgId == oldItem.organizer.id) {
                    attendee = oldItem.organizer;
                }
            }

            if (attendee) {
                let newItem = oldItem.clone();
                let newAttendee = attendee.clone();

                newAttendee.participationStatus = value;
                if (newAttendee.isOrganizer) {
                    newItem.organizer = newAttendee;
                } else {
                    newItem.removeAttendee(attendee);
                    newItem.addAttendee(newAttendee);
                }

                doTransaction('modify', newItem, newItem.calendar, oldItem, null);
            }
        }
    } catch (e) {
        cal.ERROR("Error setting partstat: " + e);
    } finally {
        endBatchTransaction();
    }
}
