/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad, onAccept, onCancel, zoomWithButtons, updateStartTime,
 *          endWidget, updateEndTime, editStartTimezone, editEndTimezone,
 *          changeAllDay, onNextSlot, onPreviousSlot, onFreebusyTimebarInit,
 *          setFreebusyTimebarTime, onAttendeesInputKeyPress, onAttendeesInputBlur
 */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gStartDate = null;
var gEndDate = null;
var gStartTimezone = null;
var gEndTimezone = null;
var gDuration = null;
var gStartHour = 0;
var gEndHour = 24;
var gIsReadOnly = false;
var gIsInvitation = false;
var gIgnoreUpdate = true;
var gDisplayTimezone = true;
var gUndoStack = [];
var gForce24Hours = false;
var gZoomFactor = 100;

/**
 * Sets up the attendee dialog
 */
function onLoad() {
  // set calendar-event-freebusy-timebar date and time properties
  setFreebusyTimebarTime();

  // set up some calendar-event-freebusy-timebar properties
  onFreebusyTimebarInit();

  onCalendarEventAttendeesListLoad();

  // first of all, attach all event handlers
  window.addEventListener("resize", onResize, true);
  window.addEventListener("rowchange", onRowChange, true);
  window.addEventListener("DOMAttrModified", onAttrModified, true);
  window.addEventListener("timebar", onTimebar, true);
  window.addEventListener("timechange", onTimeChange, true);

  // As long as DOMMouseScroll is still implemented, we need to keep it
  // around to make sure scrolling is blocked.
  window.addEventListener("wheel", onMouseScroll, true);
  window.addEventListener("DOMMouseScroll", onMouseScroll, true);

  let args = window.arguments[0];
  let startTime = args.startTime;
  let endTime = args.endTime;
  let calendar = args.calendar;

  gDisplayTimezone = args.displayTimezone;

  onChangeCalendar(calendar);

  let zoom = document.getElementById("zoom-menulist");
  let zoomOut = document.getElementById("zoom-out-button");
  let zoomIn = document.getElementById("zoom-in-button");

  // Make sure zoom factor is set up correctly (from persisted value)
  setZoomFactor(zoom.value);
  if (gZoomFactor == 100) {
    // if zoom factor was not changed, make sure it is applied at least once
    applyCurrentZoomFactor();
  }

  initTimeRange();

  // Check if an all-day event has been passed in (to adapt endDate).
  if (startTime.isDate) {
    startTime = startTime.clone();
    endTime = endTime.clone();

    endTime.day--;

    // for all-day events we expand to 24hrs, set zoom-factor to 25%
    // and disable the zoom-control.
    setForce24Hours(true);
    zoom.value = "400";
    zoom.setAttribute("disabled", "true");
    zoomOut.setAttribute("disabled", "true");
    zoomIn.setAttribute("disabled", "true");
    setZoomFactor(zoom.value);
  }

  loadDateTime(startTime, endTime);
  propagateDateTime();
  onResize();
  // Set the scroll bar at where the event is
  scrollToCurrentTime();
  updateButtons();

  // attach an observer to get notified of changes
  // that are relevant to this dialog.
  let prefObserver = {
    observe(aSubject, aTopic, aPrefName) {
      switch (aPrefName) {
        case "calendar.view.daystarthour":
        case "calendar.view.dayendhour":
          initTimeRange();
          propagateDateTime();
          break;
      }
    },
  };
  Services.prefs.addObserver("calendar.", prefObserver);
  window.addEventListener("unload", () => {
    Services.prefs.removeObserver("calendar.", prefObserver);
  });

  opener.setCursor("auto");
  self.focus();
}

/**
 * This function should be called when the accept button was pressed on the
 * attendee dialog. Calls the accept function specified in the window arguments.
 */
document.addEventListener("dialogaccept", () => {
  let attendees = document.getElementById("attendees-list");
  window.arguments[0].onOk(
    attendees.attendees,
    attendees.organizer,
    gStartDate.getInTimezone(gStartTimezone),
    gEndDate.getInTimezone(gEndTimezone)
  );
});

/**
 * Function called when zoom buttons (+/-) are clicked.
 *
 * @param aZoomOut      true -> zoom out; false -> zoom in.
 */
function zoomWithButtons(aZoomOut) {
  let zoom = document.getElementById("zoom-menulist");
  if (aZoomOut && zoom.selectedIndex < 4) {
    zoom.selectedIndex++;
  } else if (!aZoomOut && zoom.selectedIndex > 0) {
    zoom.selectedIndex--;
  }
  setZoomFactor(zoom.value);
}

/**
 * Loads the passed start and end dates, fills global variables that give
 * information about the state of the dialog.
 *
 * @param aStartDate        The date/time the grid should start at.
 * @param aEndDate          The date/time the grid should end at.
 */
function loadDateTime(aStartDate, aEndDate) {
  gDuration = aEndDate.subtractDate(aStartDate);
  let kDefaultTimezone = cal.dtz.defaultTimezone;
  gStartTimezone = aStartDate.timezone;
  gEndTimezone = aEndDate.timezone;
  gStartDate = aStartDate.getInTimezone(kDefaultTimezone);
  gEndDate = aEndDate.getInTimezone(kDefaultTimezone);
  gStartDate.makeImmutable();
  gEndDate.makeImmutable();
}

/**
 * Sets up the time grid using the global start and end dates.
 */
function propagateDateTime() {
  // Fill the controls
  updateDateTime();

  // Tell the timebar about the new start/enddate
  let timebar = document.getElementById("timebar");
  timebar.startDate = gStartDate;
  timebar.endDate = gEndDate;
  timebar.refresh();

  // Tell the selection-bar about the new start/enddate
  let selectionbar = document.getElementById("selection-bar");
  selectionbar.startDate = gStartDate;
  selectionbar.endDate = gEndDate;
  selectionbar.update();

  // Tell the freebusy grid about the new start/enddate
  let grid = document.getElementById("freebusy-grid");

  let refresh =
    grid.startDate == null ||
    grid.startDate.compare(gStartDate) != 0 ||
    grid.endDate == null ||
    grid.endDate.compare(gEndDate) != 0;
  grid.startDate = gStartDate;
  grid.endDate = gEndDate;
  if (refresh) {
    grid.forceRefresh();
  }

  // Expand to 24hrs if the new range is outside of the default range.
  let kDefaultTimezone = cal.dtz.defaultTimezone;
  let startTime = gStartDate.getInTimezone(kDefaultTimezone);
  let endTime = gEndDate.getInTimezone(kDefaultTimezone);
  if (
    startTime.hour < gStartHour ||
    startTime.hour >= gEndHour ||
    endTime.hour >= gEndHour ||
    startTime.day != endTime.day ||
    startTime.isDate
  ) {
    setForce24Hours(true);
  }
}

/**
 * This function requires gStartDate and gEndDate and the respective timezone
 * variables to be initialized. It updates the date/time information displayed in
 * the dialog from the above noted variables.
 */
function updateDateTime() {
  // Convert to default timezone if the timezone option
  // is *not* checked, otherwise keep the specific timezone
  // and display the labels in order to modify the timezone.
  if (gDisplayTimezone) {
    let startTime = gStartDate.getInTimezone(gStartTimezone);
    let endTime = gEndDate.getInTimezone(gEndTimezone);

    if (startTime.isDate) {
      document.getElementById("all-day").setAttribute("checked", "true");
    }

    // In the case where the timezones are different but
    // the timezone of the endtime is "UTC", we convert
    // the endtime into the timezone of the starttime.
    if (startTime && endTime) {
      if (!cal.data.compareObjects(startTime.timezone, endTime.timezone)) {
        if (endTime.timezone.isUTC) {
          endTime = endTime.getInTimezone(startTime.timezone);
        }
      }
    }

    // Before feeding the date/time value into the control we need
    // to set the timezone to 'floating' in order to avoid the
    // automatic conversion back into the OS timezone.
    startTime.timezone = cal.dtz.floating;
    endTime.timezone = cal.dtz.floating;

    document.getElementById("event-starttime").value = cal.dtz.dateTimeToJsDate(startTime);
    document.getElementById("event-endtime").value = cal.dtz.dateTimeToJsDate(endTime);
  } else {
    let kDefaultTimezone = cal.dtz.defaultTimezone;

    let startTime = gStartDate.getInTimezone(kDefaultTimezone);
    let endTime = gEndDate.getInTimezone(kDefaultTimezone);

    if (startTime.isDate) {
      document.getElementById("all-day").setAttribute("checked", "true");
    }

    // Before feeding the date/time value into the control we need
    // to set the timezone to 'floating' in order to avoid the
    // automatic conversion back into the OS timezone.
    startTime.timezone = cal.dtz.floating;
    endTime.timezone = cal.dtz.floating;

    document.getElementById("event-starttime").value = cal.dtz.dateTimeToJsDate(startTime);
    document.getElementById("event-endtime").value = cal.dtz.dateTimeToJsDate(endTime);
  }

  updateTimezone();
  updateAllDay();
}

/**
 * This function requires gStartDate and gEndDate and the respective timezone
 * variables to be initialized. It updates the timezone information displayed in
 * the dialog from the above noted variables.
 */
function updateTimezone() {
  gIgnoreUpdate = true;

  if (gDisplayTimezone) {
    let startTimezone = gStartTimezone;
    let endTimezone = gEndTimezone;
    let equalTimezones = false;
    if (
      startTimezone &&
      endTimezone &&
      (cal.data.compareObjects(startTimezone, endTimezone) || endTimezone.isUTC)
    ) {
      equalTimezones = true;
    }

    let tzStart = document.getElementById("timezone-starttime");
    let tzEnd = document.getElementById("timezone-endtime");
    if (startTimezone) {
      tzStart.removeAttribute("collapsed");
      tzStart.value = startTimezone.displayName || startTimezone.tzid;
    } else {
      tzStart.setAttribute("collapsed", "true");
    }

    // we never display the second timezone if both are equal
    if (endTimezone != null && !equalTimezones) {
      tzEnd.removeAttribute("collapsed");
      tzEnd.value = endTimezone.displayName || endTimezone.tzid;
    } else {
      tzEnd.setAttribute("collapsed", "true");
    }
  } else {
    document.getElementById("timezone-starttime").setAttribute("collapsed", "true");
    document.getElementById("timezone-endtime").setAttribute("collapsed", "true");
  }

  gIgnoreUpdate = false;
}

/**
 * Updates gStartDate from the start time picker "event-starttime"
 */
function updateStartTime() {
  if (gIgnoreUpdate) {
    return;
  }

  let startWidgetId = "event-starttime";

  let startWidget = document.getElementById(startWidgetId);

  // jsDate is always in OS timezone, thus we create a calIDateTime
  // object from the jsDate representation and simply set the new
  // timezone instead of converting.
  let timezone = gDisplayTimezone ? gStartTimezone : cal.dtz.defaultTimezone;
  let start = cal.dtz.jsDateToDateTime(startWidget.value, timezone);

  gStartDate = start.clone();
  start.addDuration(gDuration);
  gEndDate = start.getInTimezone(gEndTimezone);

  let allDayElement = document.getElementById("all-day");
  let allDay = allDayElement.getAttribute("checked") == "true";
  if (allDay) {
    gStartDate.isDate = true;
    gEndDate.isDate = true;
  }

  propagateDateTime();
}

/**
 * Updates gEndDate from the end time picker "event-endtime"
 */
function updateEndTime() {
  if (gIgnoreUpdate) {
    return;
  }

  let startWidgetId = "event-starttime";
  let endWidgetId = "event-endtime";

  let startWidget = document.getElementById(startWidgetId);
  let endWidget = document.getElementById(endWidgetId);

  let saveStartTime = gStartDate;
  let saveEndTime = gEndDate;
  let kDefaultTimezone = cal.dtz.defaultTimezone;

  gStartDate = cal.dtz.jsDateToDateTime(
    startWidget.value,
    gDisplayTimezone ? gStartTimezone : cal.dtz.defaultTimezone
  );

  let timezone = gEndTimezone;
  if (timezone.isUTC && gStartDate && !cal.data.compareObjects(gStartTimezone, gEndTimezone)) {
    timezone = gStartTimezone;
  }
  gEndDate = cal.dtz.jsDateToDateTime(
    endWidget.value,
    gDisplayTimezone ? timezone : kDefaultTimezone
  );

  let allDayElement = document.getElementById("all-day");
  let allDay = allDayElement.getAttribute("checked") == "true";
  if (allDay) {
    gStartDate.isDate = true;
    gEndDate.isDate = true;
  }

  // Calculate the new duration of start/end-time.
  // don't allow for negative durations.
  let warning = false;
  if (gEndDate.compare(gStartDate) >= 0) {
    gDuration = gEndDate.subtractDate(gStartDate);
  } else {
    gStartDate = saveStartTime;
    gEndDate = saveEndTime;
    warning = true;
  }

  propagateDateTime();

  if (warning) {
    let callback = function() {
      Services.prompt.alert(null, document.title, cal.l10n.getCalString("warningEndBeforeStart"));
    };
    setTimeout(callback, 1);
  }
}

/**
 * Prompts the user to pick a new timezone for the starttime. The dialog is
 * opened modally.
 */
function editStartTimezone() {
  let tzStart = document.getElementById("timezone-starttime");
  if (tzStart.hasAttribute("disabled")) {
    return;
  }

  let self = this;
  let args = {};
  args.calendar = window.arguments[0].calendar;
  args.time = gStartDate.getInTimezone(gStartTimezone);
  args.onOk = function(datetime) {
    let equalTimezones = false;
    if (gStartTimezone && gEndTimezone && cal.data.compareObjects(gStartTimezone, gEndTimezone)) {
      equalTimezones = true;
    }
    gStartTimezone = datetime.timezone;
    if (equalTimezones) {
      gEndTimezone = datetime.timezone;
    }
    self.propagateDateTime();
  };

  // Open the dialog modally
  openDialog(
    "chrome://calendar/content/calendar-event-dialog-timezone.xhtml",
    "_blank",
    "chrome,titlebar,modal,resizable",
    args
  );
}

/**
 * Prompts the user to pick a new timezone for the endtime. The dialog is
 * opened modally.
 */
function editEndTimezone() {
  let tzStart = document.getElementById("timezone-endtime");
  if (tzStart.hasAttribute("disabled")) {
    return;
  }

  let self = this;
  let args = {};
  args.calendar = window.arguments[0].calendar;
  args.time = gEndDate.getInTimezone(gEndTimezone);
  args.onOk = function(datetime) {
    if (gStartTimezone && gEndTimezone && cal.data.compareObjects(gStartTimezone, gEndTimezone)) {
      gStartTimezone = datetime.timezone;
    }
    gEndTimezone = datetime.timezone;
    self.propagateDateTime();
  };

  // Open the dialog modally
  openDialog(
    "chrome://calendar/content/calendar-event-dialog-timezone.xhtml",
    "_blank",
    "chrome,titlebar,modal,resizable",
    args
  );
}

/**
 * Updates the dialog controls in case the window's event is an allday event, or
 * was set to one in the attendee dialog.
 *
 * This for example disables the timepicker since its not needed.
 */
function updateAllDay() {
  if (gIgnoreUpdate) {
    return;
  }

  let allDayElement = document.getElementById("all-day");
  let allDay = allDayElement.getAttribute("checked") == "true";
  let startpicker = document.getElementById("event-starttime");
  let endpicker = document.getElementById("event-endtime");

  let tzStart = document.getElementById("timezone-starttime");
  let tzEnd = document.getElementById("timezone-endtime");

  // Disable the timezone links if 'allday' is checked OR the
  // calendar of this item is read-only. In any other case we
  // enable the links.
  if (allDay) {
    startpicker.setAttribute("timepickerdisabled", "true");
    endpicker.setAttribute("timepickerdisabled", "true");

    tzStart.setAttribute("disabled", "true");
    tzEnd.setAttribute("disabled", "true");
    tzStart.classList.remove("text-link");
    tzEnd.classList.remove("text-link");
  } else {
    startpicker.removeAttribute("timepickerdisabled");
    endpicker.removeAttribute("timepickerdisabled");

    tzStart.removeAttribute("disabled");
    tzEnd.removeAttribute("disabled");
    tzStart.classList.add("text-link");
    tzEnd.classList.add("text-link");
  }
}

/**
 * Changes the global variables to adapt for the change of the allday checkbox.
 *
 * XXX Function names are all very similar here. This needs some consistency!
 */
function changeAllDay() {
  let allDayElement = document.getElementById("all-day");
  let allDay = allDayElement.getAttribute("checked") == "true";

  gStartDate = gStartDate.clone();
  gEndDate = gEndDate.clone();

  gStartDate.isDate = allDay;
  gEndDate.isDate = allDay;

  propagateDateTime();

  // After propagating the modified times we enforce some constraints
  // on the zoom-factor. In case this events is now said to be all-day,
  // we automatically enforce a 25% zoom-factor and disable the control.
  let zoom = document.getElementById("zoom-menulist");
  let zoomOut = document.getElementById("zoom-out-button");
  let zoomIn = document.getElementById("zoom-in-button");
  if (allDay) {
    zoom.value = "400";
    zoom.setAttribute("disabled", "true");
    zoomOut.setAttribute("disabled", "true");
    zoomIn.setAttribute("disabled", "true");
    setZoomFactor(zoom.value);
    setForce24Hours(true);
  } else {
    zoom.removeAttribute("disabled");
    zoomOut.removeAttribute("disabled");
    zoomIn.removeAttribute("disabled");
  }
}

/**
 * Handler function used when the window is resized.
 */
function onResize() {
  // Don't do anything if we haven't been initialized.
  if (!gStartDate || !gEndDate) {
    return;
  }

  let grid = document.getElementById("freebusy-grid");
  grid.fitDummyRows();

  let gridScrollbar = document.getElementById("horizontal-scrollbar");
  gridScrollbar.setAttribute("maxpos", grid.scrollWidth - grid.clientWidth);
  gridScrollbar.setAttribute("pageincrement", grid.clientWidth);

  let selectionbar = document.getElementById("selection-bar");
  selectionbar.padTo(grid.scrollWidth);

  let attendees = document.getElementById("attendees-list");
  let attendeesScrollbar = document.getElementById("vertical-scrollbar");
  let box = document.getElementById("vertical-scrollbar-box");
  attendees.fitDummyRows();
  let attRatio = attendees.getBoundingClientRect().height / attendees.documentSize;
  let attMaxpos = attendeesScrollbar.getAttribute("maxpos");
  if (attRatio < 1) {
    box.removeAttribute("collapsed");
    let attInc = (attMaxpos * attRatio) / (1 - attRatio);
    attendeesScrollbar.setAttribute("pageincrement", attInc);
  } else {
    box.setAttribute("collapsed", "true");
  }
}

/**
 * Handler function to call when changing the calendar used in this dialog.
 *
 * @param calendar      The calendar to change to.
 */
function onChangeCalendar(calendar) {
  let args = window.arguments[0];

  // set 'mIsReadOnly' if the calendar is read-only
  if (calendar && calendar.readOnly) {
    gIsReadOnly = true;
  }

  // assume we're the organizer [in case that the calendar
  // does not support the concept of identities].
  gIsInvitation = false;
  calendar = cal.wrapInstance(args.item.calendar, Ci.calISchedulingSupport);
  if (calendar) {
    gIsInvitation = calendar.isInvitation(args.item);
  }

  if (gIsReadOnly || gIsInvitation) {
    document.getElementById("next-slot").setAttribute("disabled", "true");
    document.getElementById("previous-slot").setAttribute("disabled", "true");
  }

  let freebusy = document.getElementById("freebusy-grid");
  freebusy.onChangeCalendar(calendar);
}

/**
 * Updates the slot buttons.
 */
function updateButtons() {
  let previousButton = document.getElementById("previous-slot");
  if (gUndoStack.length > 0) {
    previousButton.removeAttribute("disabled");
  } else {
    previousButton.setAttribute("disabled", "true");
  }
}

/**
 * Handler function called to advance to the next slot.
 */
function onNextSlot() {
  // Store the current setting in the undo-stack.
  let currentSlot = {};
  currentSlot.startTime = gStartDate;
  currentSlot.endTime = gEndDate;
  gUndoStack.push(currentSlot);

  // Ask the grid for the next possible timeslot.
  let grid = document.getElementById("freebusy-grid");
  let duration = gEndDate.subtractDate(gStartDate);
  let start = grid.nextSlot();
  let end = start.clone();
  end.addDuration(duration);
  if (start.isDate) {
    end.day++;
  }
  gStartDate = start.clone();
  gEndDate = end.clone();
  let endDate = gEndDate.clone();

  // Check if an all-day event has been passed in (to adapt endDate).
  if (gStartDate.isDate) {
    gEndDate.day--;
  }
  gStartDate.makeImmutable();
  gEndDate.makeImmutable();
  endDate.makeImmutable();

  propagateDateTime();

  // Scroll the grid/timebar such that the current time is visible
  scrollToCurrentTime();

  updateButtons();
}

/**
 * Handler function called to advance to the previous slot.
 */
function onPreviousSlot() {
  let previousSlot = gUndoStack.pop();
  if (!previousSlot) {
    return;
  }

  // In case the new starttime happens to be scheduled
  // on a different day, we also need to update the
  // complete freebusy information and appropriate
  // underlying arrays holding the information.
  let refresh = previousSlot.startTime.day != gStartDate.day;

  gStartDate = previousSlot.startTime.clone();
  gEndDate = previousSlot.endTime.clone();

  propagateDateTime();

  // scroll the grid/timebar such that the current time is visible
  scrollToCurrentTime();

  updateButtons();

  if (refresh) {
    let grid = document.getElementById("freebusy-grid");
    grid.forceRefresh();
  }
}

/**
 * Scrolls the time grid to a position where the time of the item in question is
 * visible.
 */
function scrollToCurrentTime() {
  let timebar = document.getElementById("timebar");
  let ratio = (gStartDate.hour - gStartHour - 1) * timebar.step;
  if (ratio <= 0.0) {
    ratio = 0.0;
  }
  if (ratio >= 1.0) {
    ratio = 1.0;
  }
  let scrollbar = document.getElementById("horizontal-scrollbar");
  let maxpos = scrollbar.getAttribute("maxpos");
  scrollbar.setAttribute("curpos", ratio * maxpos);
}

/**
 * Sets the zoom factor for the time grid
 *
 * @param aValue        The zoom factor to set.
 * @return              aValue (for chaining)
 */
function setZoomFactor(aValue) {
  // Correct zoom factor, if needed
  aValue = parseInt(aValue, 10) || 100;

  if (gZoomFactor == aValue) {
    return aValue;
  }

  gZoomFactor = aValue;
  applyCurrentZoomFactor();
  return aValue;
}

/**
 * applies the current zoom factor for the time grid
 */
function applyCurrentZoomFactor() {
  let timebar = document.getElementById("timebar");
  timebar.zoomFactor = gZoomFactor;
  // After sepearating window.arguments logic from custom element
  // it is necessary to call this method to set up some properties of
  // calendar-event-freebusy-timebar element.
  onFreebusyTimebarInit();
  let selectionbar = document.getElementById("selection-bar");
  selectionbar.zoomFactor = gZoomFactor;
  let grid = document.getElementById("freebusy-grid");
  grid.zoomFactor = gZoomFactor;

  // Calling onResize() will update the scrollbars and everything else
  // that needs to adopt the previously made changes. We need to call
  // this after the changes have actually been made...
  onResize();
}

/**
 * Force the time grid to show 24 hours.
 *
 * @param aValue        If true, the view will be forced to 24 hours.
 * @return              aValue (for chaining)
 */
function setForce24Hours(aValue) {
  if (gForce24Hours == aValue) {
    return aValue;
  }

  gForce24Hours = aValue;
  initTimeRange();
  let timebar = document.getElementById("timebar");
  timebar.force24Hours = gForce24Hours;
  // After sepearating window.arguments logic from custom element
  // it is necessary to call this method to set up some properties of
  // calendar-event-freebusy-timebar element.
  onFreebusyTimebarInit();
  let selectionbar = document.getElementById("selection-bar");
  selectionbar.force24Hours = gForce24Hours;
  let grid = document.getElementById("freebusy-grid");
  grid.force24Hours = gForce24Hours;

  // Calling onResize() will update the scrollbars and everything else
  // that needs to adopt the previously made changes. We need to call
  // this after the changes have actually been made...
  onResize();

  return aValue;
}

/**
 * Initialize the time range, setting the start and end hours from the prefs, or
 * to 24 hrs if gForce24Hours is set.
 */
function initTimeRange() {
  if (gForce24Hours) {
    gStartHour = 0;
    gEndHour = 24;
  } else {
    gStartHour = Services.prefs.getIntPref("calendar.view.daystarthour", 8);
    gEndHour = Services.prefs.getIntPref("calendar.view.dayendhour", 19);
  }
}

/**
 * Handler function for the "modify" event, emitted from the calendar-event-attendees-list
 * binding. event.details is an array of objects containing the user's email
 * (calid) and a flag that tells if the user has entered text before the last
 * onModify was called (dirty).
 *
 * @param event     The DOM event that caused the modification.
 */
function onModify(event) {
  onResize();
  document.getElementById("freebusy-grid").onModify(event);
}

/**
 * Handler function for the "rowchange" event, emitted from the calendar-event-attendees-list
 * binding. event.details is the row that was changed to.
 *
 * @param event     The DOM event caused by the row change.
 */
function onRowChange(event) {
  let scrollbar = document.getElementById("vertical-scrollbar");
  let attendees = document.getElementById("attendees-list");
  let maxpos = scrollbar.getAttribute("maxpos");
  scrollbar.setAttribute("curpos", (event.details / attendees.mMaxAttendees) * maxpos);
}

/**
 * Handler function to take care of mouse scrolling on the window
 *
 * @param event     The wheel event caused by scrolling.
 */
function onMouseScroll(event) {
  // ignore mouse scrolling for now...
  event.stopPropagation();
}

/**
 * Handler function to take care of attribute changes on the window
 *
 * @param event     The DOMAttrModified event caused by this change.
 */
function onAttrModified(event) {
  if (event.attrName == "width") {
    let selectionbar = document.getElementById("selection-bar");
    selectionbar.setWidth(selectionbar.getBoundingClientRect().width);
    return;
  }

  // Synchronize grid and attendee list
  let target = event.originalTarget;
  if (target.classList.contains("textbox-addressingWidget") && event.attrName == "focused") {
    let attendees = document.getElementById("attendees-list");
    if (event.newValue == "true") {
      let grid = document.getElementById("freebusy-grid");
      if (grid.firstVisibleRow != attendees.firstVisibleRow) {
        grid.firstVisibleRow = attendees.firstVisibleRow;
      }
    }
    if (!target.lastListCheckedValue || target.lastListCheckedValue != target.value) {
      attendees.resolvePotentialList(target);
      target.lastListCheckedValue = target.value;
    }
  }

  if (event.originalTarget.localName == "scrollbar") {
    let scrollbar = event.originalTarget;
    if (scrollbar.hasAttribute("maxpos")) {
      if (scrollbar.getAttribute("id") == "vertical-scrollbar") {
        let attendees = document.getElementById("attendees-list");
        let grid = document.getElementById("freebusy-grid");
        if (event.attrName == "curpos") {
          let maxpos = scrollbar.getAttribute("maxpos");
          attendees.ratio = event.newValue / maxpos;
        }
        grid.firstVisibleRow = attendees.firstVisibleRow;
      } else if (scrollbar.getAttribute("id") == "horizontal-scrollbar") {
        if (event.attrName == "curpos") {
          let timebar = document.getElementById("timebar");
          let grid = document.getElementById("freebusy-grid");
          let selectionbar = document.getElementById("selection-bar");
          timebar.scrollTo(event.newValue, 0);
          grid.scrollTo(event.newValue, grid.scrollTop);
          selectionbar.scrollTo(event.newValue, 0);
        }
      }
    }
  }
}

/**
 * Handler function for initializing the selection bar, event usually emitted
 * from the freebusy-timebar binding.
 *
 * @param event     The "timebar" event with details and height property.
 */
function onTimebar(event) {
  document.getElementById("selection-bar").init(event.details, event.height);

  // we need to enforce several layout constraints which can't be modelled
  // with plain xul and css, at least as far as i know.
  let timebar = document.getElementById("timebar");
  let scrollbar = document.getElementById("horizontal-scrollbar");
  let dialog = document.getElementById("calendar-event-dialog-attendees-v2");
  dialog.style.setProperty("--spacer-top-height", timebar.getBoundingClientRect().height + "px");
  dialog.style.setProperty(
    "--spacer-bottom-height",
    scrollbar.getBoundingClientRect().height + "px"
  );
}

/**
 * Handler function to update controls when the time has changed on the
 * selection bar.
 *
 * @param event     The "timechange" event with startDate and endDate
 *                    properties.
 */
function onTimeChange(event) {
  let start = event.startDate.getInTimezone(gStartTimezone);
  let end = event.endDate.getInTimezone(gEndTimezone);

  loadDateTime(start, end);

  // fill the controls
  updateDateTime();

  // tell the timebar about the new start/enddate
  let timebar = document.getElementById("timebar");
  timebar.startDate = gStartDate;
  timebar.endDate = gEndDate;
  timebar.refresh();

  // tell the freebusy grid about the new start/enddate
  let grid = document.getElementById("freebusy-grid");

  let refresh =
    grid.startDate == null ||
    grid.startDate.compare(gStartDate) != 0 ||
    grid.endDate == null ||
    grid.endDate.compare(gEndDate) != 0;
  grid.startDate = gStartDate;
  grid.endDate = gEndDate;
  if (refresh) {
    grid.forceRefresh();
  }
}

/**
 * This listener is used in calendar-event-dialog-attendees-custom-elements.js inside the
 * calendar-event-freebusy-grid custom element.
 */
function calFreeBusyListener(aFbElement, aBinding) {
  this.mFbElement = aFbElement;
  this.mBinding = aBinding;
}

calFreeBusyListener.prototype = {
  onResult(aRequest, aEntries) {
    if (aRequest && !aRequest.isPending) {
      // Find request in list of pending requests and remove from queue:
      this.mBinding.mPendingRequests = this.mBinding.mPendingRequests.filter(
        aOp => aRequest.id != aOp.id
      );
    }
    if (aEntries) {
      this.mFbElement.onFreeBusy(aEntries);
    }
  },
};

function setFreebusyTimebarTime() {
  const timebar = document.getElementById("timebar");
  let args = window.arguments[0];
  let startTime = args.startTime;
  let endTime = args.endTime;

  timebar.initTimeRange();

  // The basedate is the date/time from which the display
  // of the timebar starts. The range is the number of days
  // we should be able to show. The start- and enddate
  // is the time the event is scheduled for.
  let kDefaultTimezone = cal.dtz.defaultTimezone;
  timebar.startDate = startTime.getInTimezone(kDefaultTimezone);
  timebar.endDate = endTime.getInTimezone(kDefaultTimezone);
  timebar.mRange = Number(timebar.getAttribute("range"));
}

function onFreebusyTimebarInit() {
  const timebar = document.getElementById("timebar");
  let args = window.arguments[0];
  let startTime = args.startTime;
  let endTime = args.endTime;

  let kDefaultTimezone = cal.dtz.defaultTimezone;
  timebar.mStartDate = startTime.getInTimezone(kDefaultTimezone);
  timebar.mEndDate = endTime.getInTimezone(kDefaultTimezone);

  // Set the number of 'calendar-event-freebusy-day'-elements
  // we need to fill up the content box.
  // TODO: hardcoded value
  timebar.mNumDays = (4 * timebar.mZoomFactor) / 100;
  if (timebar.mNumDays < 2) {
    timebar.mNumDays = 2;
  }

  // Now create those elements and set their date property.
  let date = timebar.mStartDate.clone();
  let template = timebar.getElementsByTagName("calendar-event-freebusy-day")[0];
  template.force24Hours = timebar.mForce24Hours;
  template.zoomFactor = timebar.mZoomFactor;
  template.startDate = timebar.mStartDate;
  template.endDate = timebar.mEndDate;
  template.date = date;
  let parent = template.parentNode;
  if (parent.children.length <= 1) {
    let count = timebar.mNumDays - 1;
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        date.day++;
        let newNode = template.cloneNode(false);
        parent.appendChild(newNode);
        newNode.force24Hours = timebar.mForce24Hours;
        newNode.zoomFactor = timebar.mZoomFactor;
        newNode.startDate = timebar.mStartDate;
        newNode.endDate = timebar.mEndDate;
        newNode.date = date;
      }
    }
  }

  timebar.dispatchTimebarEvent();
}

function onCalendarEventAttendeesListLoad() {
  let attendeesList = document.getElementById("attendees-list");
  let args = window.arguments[0];
  let organizer = args.organizer;
  let attendees = args.attendees;
  let calendar = args.calendar;

  attendeesList.isReadOnly = calendar.readOnly;

  // assume we're the organizer [in case that the calendar
  // does not support the concept of identities].
  let organizerID = organizer && organizer.id ? organizer.id : calendar.getProperty("organizerId");

  calendar = cal.wrapInstance(calendar, Ci.calISchedulingSupport);
  attendeesList.isInvitation = calendar && calendar.isInvitation(args.item);

  let template = attendeesList.querySelector(".addressingWidgetItem");
  template.focus();

  if (attendeesList.isReadOnly || attendeesList.isInvitation) {
    attendeesList.setAttribute("disabled", "true");
  }

  // TODO: the organizer should show up in the attendee list, but this information
  // should be based on the organizer contained in the appropriate field of calIItemBase.
  // This is currently not supported, since we're still missing calendar identities.
  if (organizerID && organizerID != "") {
    if (organizer) {
      if (!organizer.id) {
        organizer.id = organizerID;
      }
      if (!organizer.role) {
        organizer.role = "CHAIR";
      }
      if (!organizer.participationStatus) {
        organizer.participationStatus = "ACCEPTED";
      }
    } else {
      organizer = attendeesList.createAttendee();
      organizer.id = organizerID;
      organizer.role = "CHAIR";
      organizer.participationStatus = "ACCEPTED";
    }
    if (!organizer.commonName || !organizer.commonName.length) {
      organizer.commonName = calendar.getProperty("organizerCN");
    }
    organizer.isOrganizer = true;
    attendeesList.appendAttendee(organizer, template, true);
  }

  let numRowsAdded = 0;
  if (attendees.length > 0) {
    for (let attendee of attendees) {
      attendeesList.appendAttendee(attendee, template, false);
      numRowsAdded++;
    }
  }
  if (numRowsAdded == 0) {
    attendeesList.appendAttendee(null, template, false);
  }

  // detach the template item from the listbox, but hold the reference.
  // until this function returns we add at least a single copy of this template back again.
  template.remove();

  attendeesList.setFocus(attendeesList.mMaxAttendees);

  window.addEventListener("modify", onModify, true);
  attendeesList.init();
}

function onAttendeesInputKeyPress(event, element) {
  if (event.key == "Enter" && element.value != "") {
    element.closest("calendar-event-attendees-list").returnHit(element);
  }
}

function onAttendeesInputBlur(element) {
  if (element.localName == "input") {
    element.closest("calendar-event-attendees-list").returnHit(element, true);
  }
}
