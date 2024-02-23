/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../calendar-management.js */
/* import-globals-from ../calendar-views-utils.js */

/* globals goUpdateCommand */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
var { CalTransactionManager } = ChromeUtils.import("resource:///modules/CalTransactionManager.jsm");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(this, {
  CalAddTransaction: "resource:///modules/CalTransactionManager.jsm",
  CalDeleteTransaction: "resource:///modules/CalTransactionManager.jsm",
  CalModifyTransaction: "resource:///modules/CalTransactionManager.jsm",
});

/* exported modifyEventWithDialog, undo, redo, setContextPartstat */

/**
 * The global calendar transaction manager.
 *
 * @type {CalTransactionManager}
 */
var gCalTransactionMgr = CalTransactionManager.getInstance();

/**
 * If a batch transaction is active, it is stored here.
 *
 * @type {CalBatchTransaction?}
 */
var gCalBatchTransaction = null;

/**
 * Sets the default values for new items, taking values from either the passed
 * parameters or the preferences.
 *
 * @param {calIItemBase} aItem - The item to set up.
 * @param {?calICalendar} aCalendar - The calendar to apply.
 * @param {?calIDateTime} aStartDate - The start date to set.
 * @param {?calIDateTime} aEndDate - The end date/due date to set.
 * @param {?calIDateTime} aInitialDate - The reference date for the date pickers.
 * @param {boolean} [aForceAllday=false] - Force the event/task to be an all-day item.
 * @param {calIAttendee[]} aAttendees - Attendees to add, if `aItem` is an event.
 */
function setDefaultItemValues(
  aItem,
  aCalendar = null,
  aStartDate = null,
  aEndDate = null,
  aInitialDate = null,
  aForceAllday = false,
  aAttendees = []
) {
  function endOfDay(aDate) {
    const eod = aDate ? aDate.clone() : cal.dtz.now();
    eod.hour = Services.prefs.getIntPref("calendar.view.dayendhour", 19);
    eod.minute = 0;
    eod.second = 0;
    return eod;
  }
  function startOfDay(aDate) {
    const sod = aDate ? aDate.clone() : cal.dtz.now();
    sod.hour = Services.prefs.getIntPref("calendar.view.daystarthour", 8);
    sod.minute = 0;
    sod.second = 0;
    return sod;
  }

  const initialDate = aInitialDate ? aInitialDate.clone() : cal.dtz.now();
  initialDate.isDate = true;

  if (aItem.isEvent()) {
    if (aStartDate) {
      aItem.startDate = aStartDate.clone();
      if (aStartDate.isDate && !aForceAllday) {
        // This is a special case where the date is specified, but the
        // time is not. To take care, we setup up the time to our
        // default event start time.
        aItem.startDate = cal.dtz.getDefaultStartDate(aItem.startDate);
      } else if (aForceAllday) {
        // If the event should be forced to be allday, then don't set up
        // any default hours and directly make it allday.
        aItem.startDate.isDate = true;
        aItem.startDate.timezone = cal.dtz.floating;
      }
    } else {
      // If no start date was passed, then default to the next full hour
      // of today, but with the date of the selected day
      aItem.startDate = cal.dtz.getDefaultStartDate(initialDate);
    }

    if (aEndDate) {
      aItem.endDate = aEndDate.clone();
      if (aForceAllday) {
        // XXX it is currently not specified, how callers that force all
        // day should pass the end date. Right now, they should make
        // sure that the end date is 00:00:00 of the day after.
        aItem.endDate.isDate = true;
        aItem.endDate.timezone = cal.dtz.floating;
      }
    } else {
      aItem.endDate = aItem.startDate.clone();
      if (aForceAllday) {
        // All day events need to go to the beginning of the next day.
        aItem.endDate.day++;
      } else {
        // If the event is not all day, then add the default event
        // length.
        aItem.endDate.minute += Services.prefs.getIntPref("calendar.event.defaultlength", 60);
      }
    }

    // Free/busy status is only valid for events, must not be set for tasks.
    aItem.setProperty("TRANSP", cal.item.getEventDefaultTransparency(aForceAllday));

    for (const attendee of aAttendees) {
      aItem.addAttendee(attendee);
    }
  } else if (aItem.isTodo()) {
    const now = cal.dtz.now();
    const initDate = initialDate ? initialDate.clone() : now;
    initDate.isDate = false;
    initDate.hour = now.hour;
    initDate.minute = now.minute;
    initDate.second = now.second;

    if (aStartDate) {
      aItem.entryDate = aStartDate.clone();
    } else {
      let defaultStart = Services.prefs.getStringPref("calendar.task.defaultstart", "none");
      if (
        Services.prefs.getIntPref("calendar.alarms.onfortodos", 0) == 1 &&
        defaultStart == "none"
      ) {
        // start date is required if we want to set an alarm
        defaultStart = "offsetcurrent";
      }

      let units = Services.prefs.getStringPref("calendar.task.defaultstartoffsetunits", "minutes");
      if (!["days", "hours", "minutes"].includes(units)) {
        units = "minutes";
      }
      const startOffset = cal.createDuration();
      startOffset[units] = Services.prefs.getIntPref("calendar.task.defaultstartoffset", 0);
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
      const defaultDue = Services.prefs.getStringPref("calendar.task.defaultdue", "none");

      let units = Services.prefs.getStringPref("calendar.task.defaultdueoffsetunits", "minutes");
      if (!["days", "hours", "minutes"].includes(units)) {
        units = "minutes";
      }
      const dueOffset = cal.createDuration();
      dueOffset[units] = Services.prefs.getIntPref("calendar.task.defaultdueoffset", 0);

      const start = aItem.entryDate ? aItem.entryDate.clone() : initDate.clone();
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
 * @param {?calICalendar} calendar - The calendar to create the event in
 * @param {?calIDateTime} startDate - The event's start date.
 * @param {?calIDateTime} endDate - The event's end date.
 * @param {?string} summary - The event's title.
 * @param {?calIEvent} event - A template event to show in the dialog
 * @param {?boolean} forceAllDay - Make sure the event shown in the dialog is an all-day event.
 * @param {?calIAttendee} attendees - Attendees to add to the event.
 */
function createEventWithDialog(
  calendar,
  startDate,
  endDate,
  summary,
  event,
  forceAllDay,
  attendees
) {
  const onNewEvent = function (item, opcalendar, originalItem, listener, extresponse = null) {
    if (item.id) {
      // If the item already has an id, then this is the result of
      // saving the item without closing, and then saving again.
      doTransaction("modify", item, opcalendar, originalItem, listener, extresponse);
    } else {
      // Otherwise, this is an addition
      doTransaction("add", item, opcalendar, null, listener, extresponse);
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

    if (forceAllDay) {
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
    event = new CalEvent();

    const refDate = currentView().selectedDay?.clone();
    setDefaultItemValues(event, calendar, startDate, endDate, refDate, forceAllDay, attendees);
    if (summary) {
      event.title = summary;
    }
  }
  openEventDialog(event, event.calendar, "new", onNewEvent);
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
  const onNewItem = function (item, opcalendar, originalItem, listener, extresponse = null) {
    if (item.id) {
      // If the item already has an id, then this is the result of
      // saving the item without closing, and then saving again.
      doTransaction("modify", item, opcalendar, originalItem, listener, extresponse);
    } else {
      // Otherwise, this is an addition
      doTransaction("add", item, opcalendar, null, listener, extresponse);
    }
  };

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
    todo = new CalTodo();
    setDefaultItemValues(todo, calendar, null, dueDate, initialDate);

    if (summary) {
      todo.title = summary;
    }
  }

  openEventDialog(todo, calendar, "new", onNewItem, initialDate);
}

/**
 * Opens the passed event item for viewing. This enables the modify callback in
 * openEventDialog so invitation responses can be edited.
 *
 * @param {calIItemBase} item - The calendar item to view.
 */
function openEventDialogForViewing(item) {
  function onDialogComplete(newItem, calendar, originalItem, listener, extresponse) {
    doTransaction("modify", newItem, calendar, originalItem, listener, extresponse);
  }
  openEventDialog(item, item.calendar, "view", onDialogComplete);
}

/**
 * Modifies the passed event in the event dialog.
 *
 * @param aItem                 The item to modify.
 * @param aPromptOccurrence     If the user should be prompted to select if the
 *                                parent item or occurrence should be modified.
 * @param initialDate           (optional) The initial date for new task datepickers
 * @param aCounterProposal      (optional) An object representing the counterproposal
 *        {
 *            {JsObject} result: {
 *                type: {String} "OK"|"OUTDATED"|"NOTLATESTUPDATE"|"ERROR"|"NODIFF"
 *                descr: {String} a technical description of the problem if type is ERROR or NODIFF,
 *                                otherwise an empty string
 *            },
 *            (empty if result.type = "ERROR"|"NODIFF"){Array} differences: [{
 *                property: {String} a property that is subject to the proposal
 *                proposed: {String} the proposed value
 *                original: {String} the original value
 *            }]
 *        }
 */
function modifyEventWithDialog(aItem, aPromptOccurrence, initialDate = null, aCounterProposal) {
  const dlg = cal.item.findWindow(aItem);
  if (dlg) {
    dlg.focus();
    return;
  }

  const onModifyItem = function (item, calendar, originalItem, listener, extresponse = null) {
    doTransaction("modify", item, calendar, originalItem, listener, extresponse);
  };

  let item = aItem;
  let response;
  if (aPromptOccurrence !== false) {
    [item, , response] = promptOccurrenceModification(aItem, true, "edit");
  }

  if (item && (response || response === undefined)) {
    openEventDialog(item, item.calendar, "modify", onModifyItem, initialDate, aCounterProposal);
  }
}

/**
 * @callback onDialogComplete
 *
 * @param {calIItemBase} newItem
 * @param {calICalendar} calendar
 * @param {calIItemBase} originalItem
 * @param {?calIOperationListener} listener
 * @param {?object} extresponse
 */

/**
 * Opens the event dialog with the given item (task OR event).
 *
 * @param {calIItemBase} calendarItem - The item to open the dialog with.
 * @param {calICalendar} calendar - The calendar to open the dialog with.
 * @param {string} mode - The operation the dialog should do
 *                                       ("new", "view", "modify").
 * @param {onDialogComplete} callback - The callback to call when the dialog
 *                                       has completed.
 * @param {?calIDateTime} initialDate - The initial date for new task
 *                                       datepickers.
 * @param {?object} counterProposal - An object representing the
 *                                       counterproposal - see description
 *                                       for modifyEventWithDialog().
 */
function openEventDialog(
  calendarItem,
  calendar,
  mode,
  callback,
  initialDate = null,
  counterProposal
) {
  const dlg = cal.item.findWindow(calendarItem);
  if (dlg) {
    dlg.focus();
    return;
  }

  // Set up some defaults
  mode = mode || "new";
  calendar = calendar || getSelectedCalendar();
  let calendars = cal.manager.getCalendars();
  calendars = calendars.filter(cal.acl.isCalendarWritable);

  let isItemSupported;
  if (calendarItem.isTodo()) {
    isItemSupported = function (aCalendar) {
      return aCalendar.getProperty("capabilities.tasks.supported") !== false;
    };
  } else if (calendarItem.isEvent()) {
    isItemSupported = function (aCalendar) {
      return aCalendar.getProperty("capabilities.events.supported") !== false;
    };
  }

  // Filter out calendars that don't support the given calendar item
  calendars = calendars.filter(isItemSupported);

  // Filter out calendar/items that we cannot write to/modify
  if (mode == "new") {
    calendars = calendars.filter(cal.acl.userCanAddItemsToCalendar);
  } else if (mode == "modify") {
    calendars = calendars.filter(aCalendar => {
      /* If the calendar is the item calendar, we check that the item
       * can be modified. If the calendar is NOT the item calendar, we
       * check that the user can remove items from that calendar and
       * add items to the current one.
       */
      const isSameCalendar = calendarItem.calendar == aCalendar;
      const canModify = cal.acl.userCanModifyItem(calendarItem);
      const canMoveItems =
        cal.acl.userCanDeleteItemsFromCalendar(calendarItem.calendar) &&
        cal.acl.userCanAddItemsToCalendar(aCalendar);

      return isSameCalendar ? canModify : canMoveItems;
    });
  }

  if (
    mode == "new" &&
    (!cal.acl.isCalendarWritable(calendar) ||
      !cal.acl.userCanAddItemsToCalendar(calendar) ||
      !isItemSupported(calendar))
  ) {
    if (calendars.length < 1) {
      // There are no writable calendars or no calendar supports the given
      // item. Don't show the dialog.
      return;
    }
    // Pick the first calendar that supports the item and is writable
    calendar = calendars[0];
    if (calendarItem) {
      // XXX The dialog currently uses the items calendar as a first
      // choice. Since we are shortly before a release to keep
      // regression risk low, explicitly set the item's calendar here.
      calendarItem.calendar = calendars[0];
    }
  }

  // Setup the window arguments
  const args = {};
  args.calendarEvent = calendarItem;
  args.calendar = calendar;
  args.mode = mode;
  args.onOk = callback;
  args.initialStartDateValue = initialDate || cal.dtz.getDefaultStartDate();
  args.counterProposal = counterProposal;
  args.inTab = Services.prefs.getBoolPref("calendar.item.editInTab", false);
  // this will be called if file->new has been selected from within the dialog
  args.onNewEvent = function (opcalendar) {
    createEventWithDialog(opcalendar, null, null);
  };
  args.onNewTodo = function (opcalendar) {
    createTodoWithDialog(opcalendar);
  };

  // the dialog will reset this to auto when it is done loading.
  window.setCursor("wait");

  // Ask the provider if this item is an invitation. If this is the case,
  // we'll open the summary dialog since the user is not allowed to change
  // the details of the item.
  const isInvitation =
    calendar.supportsScheduling && calendar.getSchedulingSupport().isInvitation(calendarItem);

  // open the dialog modeless
  let url;
  const isEditable = mode == "modify" && !isInvitation && cal.acl.userCanModifyItem(calendarItem);

  if (cal.acl.isCalendarWritable(calendar) && (mode == "new" || isEditable)) {
    // Currently the read-only summary dialog is never opened in a tab.
    if (args.inTab) {
      url = "chrome://calendar/content/calendar-item-iframe.xhtml";
    } else {
      url = "chrome://calendar/content/calendar-event-dialog.xhtml";
    }
  } else {
    url = "chrome://calendar/content/calendar-summary-dialog.xhtml";
    args.inTab = false;
    args.isInvitation = isInvitation;
  }

  if (args.inTab) {
    args.url = url;
    const tabmail = document.getElementById("tabmail");
    const tabtype = args.calendarEvent.isEvent() ? "calendarEvent" : "calendarTask";
    tabmail.openTab(tabtype, args);
  } else {
    // open in a window
    openDialog(url, "_blank", "chrome,titlebar,toolbar,resizable", args);
  }
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
 * @param aItem                         The item or array of items to check.
 * @param aNeedsFuture                  If true, the future item is parsed.
 *                                        This parameter can for example be
 *                                        false if a deletion is being made.
 * @param aAction                       Either "edit" or "delete". Sets up
 *                                          the labels in the occurrence prompt
 * @returns [modifiedItem, futureItem, promptResponse]
 *                                      modifiedItem is a single item or array
 *                                        of items depending on the past aItem
 *
 *                                        If "this and all following" was chosen,
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

  const futureItems = false;
  let pastItems = [];
  let returnItem = null;
  let type = CANCEL;
  const items = Array.isArray(aItem) ? aItem : [aItem];

  // Check if this actually is an instance of a recurring event
  if (items.every(item => item == item.parentItem)) {
    type = MODIFY_PARENT;
  } else if (aItem && items.length) {
    // Prompt the user. Setting modal blocks the dialog until it is closed. We
    // use rv to pass our return value.
    const rv = { value: CANCEL, items, action: aAction };
    window.openDialog(
      "chrome://calendar/content/calendar-occurrence-prompt.xhtml",
      "PromptOccurrenceModification",
      "centerscreen,chrome,modal,titlebar",
      rv
    );
    type = rv.value;
  }

  switch (type) {
    case MODIFY_PARENT:
      pastItems = items.map(item => item.parentItem);
      break;
    case MODIFY_FOLLOWING:
      // TODO tbd in a different bug
      throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
    case MODIFY_OCCURRENCE:
      pastItems = items;
      break;
    case CANCEL:
      // Since we have not set past or futureItem, the return below will
      // take care.
      break;
  }
  if (aItem) {
    returnItem = Array.isArray(aItem) ? pastItems : pastItems[0];
  }
  return [returnItem, futureItems, type];
}

// Undo/Redo code

/**
 * Create and commit a transaction with the given arguments to the transaction
 * manager. Also updates the undo/redo menu.
 *
 * @param action       The action to do.
 * @param item         The new item to add/modify/delete
 * @param calendar     The calendar to do the transaction on
 * @param oldItem      (optional) some actions require an old item
 * @param observer     (optional) the observer to call when complete.
 * @param extResponse  (optional) JS object with additional parameters for sending itip messages
 *                                (see also description of checkAndSend in calItipUtils.jsm)
 */
async function doTransaction(action, item, calendar, oldItem, observer, extResponse = null) {
  // This is usually a user-initiated transaction, so make sure the calendar
  // this transaction is happening on is visible.
  top.ensureCalendarVisible(calendar);

  const manager = gCalBatchTransaction || gCalTransactionMgr;
  let trn;
  switch (action) {
    case "add":
      trn = new CalAddTransaction(item, calendar, oldItem, extResponse);
      break;
    case "modify":
      trn = new CalModifyTransaction(item, calendar, oldItem, extResponse);
      break;
    case "delete":
      trn = new CalDeleteTransaction(item, calendar, oldItem, extResponse);
      break;
    default:
      throw new Components.Exception(
        `Invalid action specified "${action}"`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
  }

  await manager.commit(trn);

  // If a batch transaction is active, do not update the menu as
  // endBatchTransaction() will take care of that.
  if (gCalBatchTransaction) {
    return;
  }

  observer?.onTransactionComplete(trn.item, trn.oldItem);
  updateUndoRedoMenu();
}

/**
 * Undo the last operation done through the transaction manager.
 */
function undo() {
  if (canUndo()) {
    gCalTransactionMgr.undo();
    updateUndoRedoMenu();
  }
}

/**
 * Redo the last undone operation in the transaction manager.
 */
function redo() {
  if (canRedo()) {
    gCalTransactionMgr.redo();
    updateUndoRedoMenu();
  }
}

/**
 * Start a batch transaction on the transaction manager.
 */
function startBatchTransaction() {
  gCalBatchTransaction = gCalTransactionMgr.beginBatch();
}

/**
 * End a previously started batch transaction. NOTE: be sure to call this in a
 * try-catch-finally-block in case you have code that could fail between
 * startBatchTransaction and this call.
 */
function endBatchTransaction() {
  gCalBatchTransaction = null;
  updateUndoRedoMenu();
}

/**
 * Checks if the last operation can be undone (or if there is a last operation
 * at all).
 */
function canUndo() {
  return gCalTransactionMgr.canUndo();
}

/**
 * Checks if the last undone operation can be redone.
 */
function canRedo() {
  return gCalTransactionMgr.canRedo();
}

/**
 * Update the undo and redo commands.
 */
function updateUndoRedoMenu() {
  goUpdateCommand("cmd_undo");
  goUpdateCommand("cmd_redo");
}

/**
 * Updates the partstat of the calendar owner for specified items triggered by a
 * context menu operation
 *
 * For a documentation of the expected bahaviours for  different use cases of
 * dealing with context menu partstat actions, see also setupAttendanceMenu(...)
 * in calendar-ui-utils.js
 *
 * @param {EventTarget}  aTarget   the target of the triggering event
 * @param {Array}        aItems    an array of calEvent or calIToDo items
 */
function setContextPartstat(aTarget, aItems) {
  /**
   * Provides the participation representing the user for a provided item
   *
   * @param   {calEvent|calTodo}  aItem  The calendar item to inspect
   * @returns {?calIAttendee} An calIAttendee object or null if no
   *                                       participant was detected
   */
  function getParticipant(aItem) {
    let party = null;
    if (cal.itip.isInvitation(aItem)) {
      party = cal.itip.getInvitedAttendee(aItem);
    } else if (aItem.organizer && aItem.getAttendees().length) {
      const calOrgId = aItem.calendar.getProperty("organizerId");
      if (calOrgId.toLowerCase() == aItem.organizer.id.toLowerCase()) {
        party = aItem.organizer;
      }
    }
    return party;
  }

  startBatchTransaction();
  try {
    // TODO: make sure we overwrite the partstat of all occurrences in
    // the selection, if the partstat of the respective master item is
    // changed - see matrix in the doc block of setupAttendanceMenu(...)
    // in calendar-ui-utils.js

    for (let oldItem of aItems) {
      // Skip this item if its calendar is read only.
      if (oldItem.calendar.readOnly) {
        continue;
      }
      if (aTarget.getAttribute("scope") == "all-occurrences") {
        oldItem = oldItem.parentItem;
      }
      const attendee = getParticipant(oldItem);
      if (attendee) {
        // skip this item if the partstat for the participant hasn't
        // changed. otherwise we would always perform update operations
        // for recurring events on both, the master and the occurrence
        // item
        const partStat = aTarget.getAttribute("respvalue");
        if (attendee.participationStatus == partStat) {
          continue;
        }

        const newItem = oldItem.clone();
        const newAttendee = attendee.clone();
        newAttendee.participationStatus = partStat;
        if (newAttendee.isOrganizer) {
          newItem.organizer = newAttendee;
        } else {
          newItem.removeAttendee(attendee);
          newItem.addAttendee(newAttendee);
        }

        let extResponse = null;
        if (aTarget.hasAttribute("respmode")) {
          const mode = aTarget.getAttribute("respmode");
          const itipMode = Ci.calIItipItem[mode];
          extResponse = { responseMode: itipMode };
        }

        doTransaction("modify", newItem, newItem.calendar, oldItem, null, extResponse);
      }
    }
  } catch (e) {
    cal.ERROR("Error setting partstat: " + e + "\r\n");
  } finally {
    endBatchTransaction();
  }
}
