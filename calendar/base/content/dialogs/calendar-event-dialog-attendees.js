/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement */
/* import-globals-from ../calendar-ui-utils.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalAttendee: "resource:///modules/CalAttendee.jsm",
});

var readOnly = false;

// The UI elements in this dialog. Initialised in the DOMContentLoaded handler.
var attendeeList;
var dayHeaderInner;
var dayHeaderOuter;
var freebusyGrid;
var freebusyGridBackground;
var freebusyGridInner;

// displayStartTime is midnight before the first displayed date, in the default timezone.
// displayEndTime is midnight after the last displayed date, in the default timezone.
// Initialised in the load event handler.
var displayStartTime;
var displayEndTime;
var numberDaysDisplayed;
var numberDaysDisplayedPref = Services.prefs.getIntPref("calendar.view.attendees.visibleDays", 16);
var showOnlyWholeDays = Services.prefs.getBoolPref(
  "calendar.view.attendees.showOnlyWholeDays",
  false
);
var dayStartHour = Services.prefs.getIntPref("calendar.view.daystarthour", 8);
var dayEndHour = Services.prefs.getIntPref("calendar.view.dayendhour", 17);

var updateByFunction = false; // To avoid triggering eventListener on timePicker which would lead to an error when triggering.

var previousStartTime;
var previousEndTime;
var previousTimezone;

var displayStartHour = 0; // Display start hour.
var displayEndHour = 24; // Display end hour.
var showCompleteDay = true; // Display of the whole day.

var defaultEventLength = Services.prefs.getIntPref("calendar.event.defaultlength", 60);

var zoom = {
  zoomInButton: null,
  zoomOutButton: null,
  levels: [
    {
      // Total width in pixels of one day.
      dayWidth: 360,
      // Number of major columns a day is divided into. Each dividing line is labelled.
      columnCount: 4,
      // Duration of each major column.
      columnDuration: cal.createDuration("PT6H"),
      // The width in pixels of one column.
      columnWidth: 90,
      // The width in pixels of one second.
      secondWidth: 360 / 24 / 3600,
      // Which background grid to show.
      gridClass: "threeMinorColumns",
    },
    {
      dayWidth: 720,
      columnCount: 8,
      columnDuration: cal.createDuration("PT3H"),
      columnWidth: 90,
      secondWidth: 720 / 24 / 3600,
      gridClass: "threeMinorColumns",
    },
    {
      dayWidth: 1440,
      columnCount: 24,
      columnDuration: cal.createDuration("PT1H"),
      columnWidth: 60,
      secondWidth: 1440 / 24 / 3600,
      gridClass: "twoMinorColumns",
    },
    {
      dayWidth: 2880,
      columnCount: 48,
      columnDuration: cal.createDuration("PT30M"),
      columnWidth: 60,
      secondWidth: 2880 / 24 / 3600,
      gridClass: "twoMinorColumns",
    },
  ],
  currentLevel: null,

  init() {
    this.zoomInButton = document.getElementById("zoom-in-button");
    this.zoomOutButton = document.getElementById("zoom-out-button");

    this.zoomInButton.addEventListener("command", () => this.level++);
    this.zoomOutButton.addEventListener("command", () => this.level--);
  },
  get level() {
    return this.currentLevel;
  },
  set level(newZoomLevel) {
    if (newZoomLevel < 0) {
      newZoomLevel = 0;
    } else if (newZoomLevel >= this.levels.length) {
      newZoomLevel = this.levels.length - 1;
    }
    this.zoomInButton.disabled = newZoomLevel == this.levels.length - 1;
    this.zoomOutButton.disabled = newZoomLevel == 0;

    if (!showCompleteDay) {
      // To block to be in max dezoom in reduced display mode.
      this.zoomOutButton.disabled = newZoomLevel == 1;

      if (
        (dayEndHour - dayStartHour) % this.levels[this.currentLevel - 1].columnDuration.hours !=
        0
      ) {
        // To avoid being in zoom level where the interface is not adapted.
        this.zoomOutButton.disabled = true;
      }
    }

    if (newZoomLevel == this.currentLevel) {
      return;
    }
    this.currentLevel = newZoomLevel;
    displayEndTime = displayStartTime.clone();

    emptyGrid();
    for (let attendee of attendeeList.getElementsByTagName("event-attendee")) {
      attendee.clearFreeBusy();
    }

    for (let gridClass of ["twoMinorColumns", "threeMinorColumns"]) {
      if (this.levels[newZoomLevel].gridClass == gridClass) {
        dayHeaderInner.classList.add(gridClass);
        freebusyGridInner.classList.add(gridClass);
      } else {
        dayHeaderInner.classList.remove(gridClass);
        freebusyGridInner.classList.remove(gridClass);
      }
    }
    fillGrid();
    eventBar.update(true);
  },
  get dayWidth() {
    return this.levels[this.currentLevel].dayWidth;
  },
  get columnCount() {
    return this.levels[this.currentLevel].columnCount;
  },
  get columnDuration() {
    return this.levels[this.currentLevel].columnDuration;
  },
  get columnWidth() {
    return this.levels[this.currentLevel].columnWidth;
  },
  get secondWidth() {
    return this.levels[this.currentLevel].secondWidth;
  },
};

var eventBar = {
  dragDistance: 0,
  dragStartX: null,
  eventBarBottom: "event-bar-bottom",
  eventBarTop: "event-bar-top",

  init() {
    this.eventBarBottom = document.getElementById("event-bar-bottom");
    this.eventBarTop = document.getElementById("event-bar-top");

    let outer = document.getElementById("outer");
    outer.addEventListener("dragstart", this);
    outer.addEventListener("dragover", this);
    outer.addEventListener("dragend", this);
  },
  handleEvent(event) {
    switch (event.type) {
      case "dragstart": {
        this.dragStartX = event.clientX + freebusyGrid.scrollLeft;
        let img = document.createElement("img");
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        event.dataTransfer.setDragImage(img, 0, 0);
        event.dataTransfer.effectAllowed = "move";
        break;
      }
      case "dragover": {
        // Snap dragging movements to half of a minor column width.
        this.dragDistance =
          Math.round((event.clientX + freebusyGrid.scrollLeft - this.dragStartX) / 15) * 15;

        // Prevent the event from being dragged outside the grid.
        if (
          this.eventBarBottom.offsetLeft + this.dragDistance >= freebusyGrid.scrollLeft &&
          // We take the size of the event not to exceed on the right side.
          this.eventBarBottom.offsetLeft + this.eventBarBottom.offsetWidth + this.dragDistance <=
            zoom.levels[zoom.currentLevel].dayWidth * numberDaysDisplayed
        ) {
          this.eventBarTop.style.transform = this.eventBarBottom.style.transform = `translateX(${this.dragDistance}px)`;
        }
        break;
      }
      case "dragend": {
        updateByFunction = true;
        let positionFromStart = this.eventBarBottom.offsetLeft + this.dragDistance;
        this.dragStartX = null;
        this.eventBarTop.style.transform = this.eventBarBottom.style.transform = null;

        let { startValue, endValue } = dateTimePickerUI;
        let durationEvent;

        // If the user goes into the past, the user will be able to use part of the hour before the beginning of the day.
        // Ex: Start time of the day: 8am, End time of the day: 5:00 pm
        // If the user moves the slot in the past but does not go to the end of the day time, they will be able to use the 7am to 8am time (except for the first shift corresponding to the minimum travel time).
        // There is the same principle for the end of the day, but it will be for the hour following the end of the day.

        // If we go back in time, we will have to calculate with endValue.
        if (this.dragDistance < 0) {
          durationEvent = startValue.subtractDate(endValue);

          endValue = this.getDateFromPosition(
            positionFromStart + this.eventBarBottom.offsetWidth,
            startValue.timezone
          );

          startValue = endValue.clone();
          startValue.addDuration(durationEvent);
          // If you move backwards, you have to check again. Otherwise a move to the last hour of the day will date the previous hour of the start of the day.
          // We will do our tests with the calendar timezone and not the event timezone.
          let startValueDefaultTimezone = startValue.getInTimezone(cal.dtz.defaultTimezone);
          if (!showCompleteDay) {
            if (
              !(
                (startValueDefaultTimezone.hour >= displayStartHour ||
                  (startValueDefaultTimezone.hour == displayStartHour - 1 &&
                    startValueDefaultTimezone.minute > 0)) &&
                startValueDefaultTimezone.hour < displayEndHour
              )
            ) {
              let hoursHidden = 24 - displayEndHour + displayStartHour;
              let reducDayDuration = cal.createDuration("-PT" + hoursHidden + "H");
              startValue.addDuration(reducDayDuration);
              endValue.addDuration(reducDayDuration);
            }
          }

          if (dateTimePickerUI.allDay.checked) {
            // BUG in icaljs
            startValue.hour = 0;
            startValue.minute = 0;
            dateTimePickerUI.startValue = startValue;
            endValue.hour = 0;
            endValue.minute = 0;
            dateTimePickerUI.endValue = endValue;
            dateTimePickerUI.saveOldValues();
            endValue.day++; // For display only.
          } else {
            dateTimePickerUI.startValue = startValue;
            dateTimePickerUI.endValue = endValue;
          }
        } else {
          // If we go forward in time, we will have to calculate with startValue.
          durationEvent = endValue.subtractDate(startValue);

          startValue = this.getDateFromPosition(positionFromStart, startValue.timezone);
          endValue = startValue.clone();

          if (dateTimePickerUI.allDay.checked) {
            // BUG in icaljs
            startValue.hour = 0;
            startValue.minute = 0;
            dateTimePickerUI.startValue = startValue;
            endValue.addDuration(durationEvent);
            endValue.hour = 0;
            endValue.minute = 0;
            dateTimePickerUI.endValue = endValue;
            dateTimePickerUI.saveOldValues();
            endValue.day++; // For display only.
          } else {
            dateTimePickerUI.startValue = startValue;
            endValue.addDuration(durationEvent);
            dateTimePickerUI.endValue = endValue;
          }
        }

        updateChange();
        updateByFunction = false;
        setLeftAndWidth(this.eventBarTop, startValue, endValue);
        setLeftAndWidth(this.eventBarBottom, startValue, endValue);

        updatePreviousValues();
        updateRange();
        break;
      }
    }
  },
  update(shouldScroll) {
    let { startValueForDisplay, endValueForDisplay } = dateTimePickerUI;
    if (dateTimePickerUI.allDay.checked) {
      endValueForDisplay.day++;
    }
    setLeftAndWidth(this.eventBarTop, startValueForDisplay, endValueForDisplay);
    setLeftAndWidth(this.eventBarBottom, startValueForDisplay, endValueForDisplay);

    if (shouldScroll) {
      let scrollPoint =
        this.eventBarBottom.offsetLeft -
        (dayHeaderOuter.clientWidthDouble - this.eventBarBottom.clientWidthDouble) / 2;
      if (scrollPoint < 0) {
        scrollPoint = 0;
      }
      dayHeaderOuter.scrollTo(scrollPoint, 0);
      freebusyGrid.scrollTo(scrollPoint, freebusyGrid.scrollTop);
    }
  },
  getDateFromPosition(posX, timezone) {
    let numberOfDays = Math.floor(posX / zoom.dayWidth);
    let remainingOffset = posX - numberOfDays * zoom.dayWidth;

    let duration = cal.createDuration();
    duration.inSeconds = numberOfDays * 60 * 60 * 24 + remainingOffset / zoom.secondWidth;

    let date = displayStartTime.clone();
    // In case of full display, do not keep the fact that displayStartTime is allDay.
    if (showCompleteDay) {
      date.isDate = false;
      date.hour = 0;
      date.minute = 0;
    }
    date = date.getInTimezone(timezone); // We reapply the time zone of the event.
    date.addDuration(duration);
    return date;
  },
};

var dateTimePickerUI = {
  allDay: "all-day",
  start: "event-starttime",
  startZone: "timezone-starttime",
  end: "event-endtime",
  endZone: "timezone-endtime",

  init() {
    for (let key of ["allDay", "start", "startZone", "end", "endZone"]) {
      this[key] = document.getElementById(this[key]);
    }
  },
  addListeners() {
    this.allDay.addEventListener("command", () => this.changeAllDay());
    this.start.addEventListener("change", () => eventBar.update(false));
    this.startZone.addEventListener("click", () => this.editTimezone(this.startZone));
    this.endZone.addEventListener("click", () => this.editTimezone(this.endZone));
  },

  get startValue() {
    return cal.dtz.jsDateToDateTime(this.start.value, this.startZone._zone);
  },
  set startValue(value) {
    // Set the zone first, because the change in time will trigger an update.
    this.startZone._zone = value.timezone;
    this.startZone.value = value.timezone.displayName || value.timezone.tzid;
    this.start.value = cal.dtz.dateTimeToJsDate(value.getInTimezone(cal.dtz.floating));
  },
  get startValueForDisplay() {
    return this.startValue.getInTimezone(cal.dtz.defaultTimezone);
  },
  get endValue() {
    return cal.dtz.jsDateToDateTime(this.end.value, this.endZone._zone);
  },
  set endValue(value) {
    // Set the zone first, because the change in time will trigger an update.
    this.endZone._zone = value.timezone;
    this.endZone.value = value.timezone.displayName || value.timezone.tzid;
    this.end.value = cal.dtz.dateTimeToJsDate(value.getInTimezone(cal.dtz.floating));
  },
  get endValueForDisplay() {
    return this.endValue.getInTimezone(cal.dtz.defaultTimezone);
  },

  changeAllDay() {
    updateByFunction = true;
    let allDay = this.allDay.checked;
    if (allDay) {
      document.getElementById("event-starttime").setAttribute("timepickerdisabled", true);
      document.getElementById("event-endtime").setAttribute("timepickerdisabled", true);
    } else {
      document.getElementById("event-starttime").removeAttribute("timepickerdisabled");
      document.getElementById("event-endtime").removeAttribute("timepickerdisabled");
    }

    if (allDay) {
      previousTimezone = this.startValue.timezone;
      // Store date-times and related timezones so we can restore
      // if the user unchecks the "all day" checkbox.
      this.saveOldValues();

      let { startValue, endValue } = this;

      // When events that end at 0:00 become all-day events, we need to
      // subtract a day from the end date because the real end is midnight.
      if (endValue.hour == 0 && endValue.minute == 0) {
        let tempStartValue = startValue.clone();
        let tempEndValue = endValue.clone();
        tempStartValue.isDate = true;
        tempEndValue.isDate = true;
        tempStartValue.day++;
        if (tempEndValue.compare(tempStartValue) >= 0) {
          endValue.day--;
        }
      }

      // In order not to have an event on the day shifted because of the timezone applied to the event, we pass the event in the current timezone.
      endValue = endValue.getInTimezone(cal.dtz.defaultTimezone);
      startValue = startValue.getInTimezone(cal.dtz.defaultTimezone);
      startValue.isDate = true;
      endValue.isDate = true;
      this.endValue = endValue;
      this.startValue = startValue;
      zoom.level = 0;
    } else if (this.start._oldValue && this.end._oldValue) {
      // Restore date-times previously stored.

      // Case of all day events that lasts several days or that has been changed to another day
      if (
        this.start._oldValue.getHours() == 0 &&
        this.start._oldValue.getMinutes() == 0 &&
        this.end._oldValue.getHours() == 0 &&
        this.end._oldValue.getMinutes() == 0
      ) {
        let saveMinutes = this.end._oldValue.getMinutes();
        this.start._oldValue.setHours(
          cal.dtz.getDefaultStartDate(window.arguments[0].startTime).hour
        );
        this.end._oldValue.setHours(
          cal.dtz.getDefaultStartDate(window.arguments[0].startTime).hour
        );
        let minutes = saveMinutes + defaultEventLength;
        this.end._oldValue.setMinutes(minutes);
      }

      // Restoration of the old time zone.
      if (previousTimezone) {
        this.startZone._zone = previousTimezone;
        this.startZone.value = previousTimezone.displayName || previousTimezone.tzid;
        this.endZone._zone = previousTimezone;
        this.endZone.value = previousTimezone.displayName || previousTimezone.tzid;
      }

      this.restoreOldValues();
      if (this.start.value.getTime() == this.end.value.getTime()) {
        // If you uncheck all day event, to avoid having an event with a duration of 0 minutes.
        this.end.value = new Date(this.end.value.getTime() + defaultEventLength * 60000);
      }
    } else {
      // The checkbox has been unchecked for the first time, the event
      // was an "All day" type, so we have to set default values.
      let startValue = cal.dtz.getDefaultStartDate(window.initialStartDateValue);
      let endValue = startValue.clone();
      endValue.minute += defaultEventLength;
      this.startValue = startValue;
      this.endValue = endValue;
    }
    updateByFunction = false;
    updatePreviousValues();
    updateRange();
  },
  editTimezone(target) {
    let field = target == this.startZone ? "startValue" : "endValue";
    let originalValue = this[field];

    let args = {
      calendar: window.arguments[0].calendar,
      time: originalValue,
      onOk: newValue => {
        this[field] = newValue;
      },
    };

    // Open the dialog modally
    openDialog(
      "chrome://calendar/content/calendar-event-dialog-timezone.xhtml",
      "_blank",
      "chrome,titlebar,modal,resizable",
      args
    );
  },
  /**
   * Store date-times and related timezones so we can restore.
   * if the user unchecks the "all day" checkbox.
   */
  saveOldValues() {
    this.start._oldValue = new Date(this.start.value);
    this.end._oldValue = new Date(this.end.value);
  },
  restoreOldValues() {
    this.end.value = this.end._oldValue;
    this.start.value = this.start._oldValue;
  },
};

window.addEventListener(
  "DOMContentLoaded",
  () => {
    attendeeList = document.getElementById("attendee-list");
    dayHeaderInner = document.getElementById("day-header-inner");
    dayHeaderOuter = document.getElementById("day-header-outer");
    freebusyGrid = document.getElementById("freebusy-grid");
    freebusyGridBackground = document.getElementById("freebusy-grid-background");
    freebusyGridInner = document.getElementById("freebusy-grid-inner");

    if (numberDaysDisplayedPref < 5) {
      Services.prefs.setIntPref("calendar.view.attendees.visibleDays", 16);
      numberDaysDisplayedPref = 16;
    }
    numberDaysDisplayed = numberDaysDisplayedPref;

    eventBar.init();
    dateTimePickerUI.init();
    zoom.init();

    attendeeList.addEventListener("scroll", () => {
      if (freebusyGrid._mouseIsOver) {
        return;
      }
      freebusyGrid.scrollTop = attendeeList.scrollTop;
    });
    attendeeList.addEventListener("keypress", event => {
      if (event.target.popupOpen) {
        return;
      }
      let row = event.target.closest("event-attendee");
      if (event.key == "ArrowUp" && row.previousElementSibling) {
        event.preventDefault();
        row.previousElementSibling.focus();
      } else if (["ArrowDown", "Enter"].includes(event.key) && row.nextElementSibling) {
        event.preventDefault();
        row.nextElementSibling.focus();
      }
    });

    freebusyGrid.addEventListener("mouseover", () => {
      freebusyGrid._mouseIsOver = true;
    });
    freebusyGrid.addEventListener("mouseout", () => {
      freebusyGrid._mouseIsOver = false;
    });
    freebusyGrid.addEventListener("scroll", () => {
      if (!freebusyGrid._mouseIsOver) {
        return;
      }
      dayHeaderOuter.scrollLeft = freebusyGrid.scrollLeft;
      attendeeList.scrollTop = freebusyGrid.scrollTop;
    });
  },
  { once: true }
);

window.addEventListener(
  "load",
  () => {
    let [
      { startTime, endTime, displayTimezone, calendar, organizer, attendees },
    ] = window.arguments;

    if (startTime.isDate) {
      // Shift in the display because of the timezone in case of an all day event when the interface is launched.
      startTime = startTime.getInTimezone(cal.dtz.defaultTimezone);
      endTime = endTime.getInTimezone(cal.dtz.defaultTimezone);
    }

    dateTimePickerUI.allDay.checked = startTime.isDate;
    if (dateTimePickerUI.allDay.checked) {
      document.getElementById("event-starttime").setAttribute("timepickerdisabled", true);
      document.getElementById("event-endtime").setAttribute("timepickerdisabled", true);
    }
    dateTimePickerUI.startValue = startTime;

    // When events that end at 0:00 become all-day events, we need to
    // subtract a day from the end date because the real end is midnight.
    if (startTime.isDate && endTime.hour == 0 && endTime.minute == 0) {
      let tempStartTime = startTime.clone();
      let tempEndTime = endTime.clone();
      tempStartTime.isDate = true;
      tempEndTime.isDate = true;
      tempStartTime.day++;
      if (tempEndTime.compare(tempStartTime) >= 0) {
        endTime.day--;
      }
    }
    dateTimePickerUI.endValue = endTime;

    previousStartTime = dateTimePickerUI.startValue;
    previousEndTime = dateTimePickerUI.endValue;

    if (dateTimePickerUI.allDay.checked) {
      dateTimePickerUI.saveOldValues();
    }

    if (displayTimezone) {
      dateTimePickerUI.startZone.parentNode.hidden = false;
      dateTimePickerUI.endZone.parentNode.hidden = false;
    }

    displayStartTime = cal.dtz.now();
    displayStartTime.isDate = true;
    displayStartTime.icalString; // BUG in icaljs

    // Choose the days to display. We always display at least 5 days, more if
    // the window is large enough. If the event is in the past, use the day of
    // the event as the first day. If it's today, tomorrow, or the next day,
    // use today as the first day, otherwise show two days before the event
    // (and therefore also two days after it).
    let difference = startTime.subtractDate(displayStartTime);
    if (difference.isNegative) {
      displayStartTime = startTime.clone();
      displayStartTime.isDate = true;
      displayStartTime.icalString; // BUG in icaljs
    } else if (difference.compare(cal.createDuration("P2D")) > 0) {
      displayStartTime = startTime.clone();
      displayStartTime.isDate = true;
      displayStartTime.icalString; // BUG in icaljs
      displayStartTime.day -= 2;
    }
    displayStartTime = displayStartTime.getInTimezone(cal.dtz.defaultTimezone);
    displayEndTime = displayStartTime.clone();

    if (organizer) {
      let organizerElement = attendeeList.appendChild(document.createXULElement("event-attendee"));
      organizerElement.attendee = organizer;
    } else {
      let organizerId = calendar.getProperty("organizerId");
      if (organizerId) {
        let organizerElement = attendeeList.appendChild(
          document.createXULElement("event-attendee")
        );
        organizerElement.value = organizerId.replace(/^mailto:/, "");
        organizerElement.isOrganizer = true;
      }
    }
    for (let attendee of attendees) {
      let attendeeElement = attendeeList.appendChild(document.createXULElement("event-attendee"));
      attendeeElement.attendee = attendee;
    }

    readOnly = calendar.isReadOnly;
    zoom.level = 2;
    layout();
    eventBar.update(true);
    dateTimePickerUI.addListeners();
    addEventListener("resize", layout);

    attendeeList.appendChild(document.createXULElement("event-attendee")).focus();
    updateVerticalScrollbars();

    dateTimePickerUI.start.addEventListener("change", function(event) {
      if (!updateByFunction) {
        updateEndDate();
        if (dateTimePickerUI.allDay.checked) {
          dateTimePickerUI.saveOldValues();
        }
        updateRange();
      }
    });
    dateTimePickerUI.end.addEventListener("change", function(event) {
      if (!updateByFunction) {
        checkDate();
        dateTimePickerUI.saveOldValues();
        updateChange();
        updateRange();
      }
    });
  },
  { once: true }
);

window.addEventListener("dialogaccept", () => {
  let attendees = [];
  let attendeeElements = attendeeList.getElementsByTagName("event-attendee");
  let organizer = attendeeElements[0].attendee;
  for (let i = 1; i < attendeeElements.length; i++) {
    let attendee = attendeeElements[i].attendee;
    if (attendee) {
      attendees.push(attendee);
    }
  }
  let { startValue, endValue } = dateTimePickerUI;
  if (dateTimePickerUI.allDay.checked) {
    startValue.isDate = true;
    endValue.isDate = true;
  }
  window.arguments[0].onOk(attendees, organizer, startValue, endValue);
});

/**
 * Passing the event change on dateTimePickerUI.end.addEventListener in function, to limit the creations of interface
 * in case of change of day + hour (example at the time of a drag and drop), it was going to trigger the event 2 times: once for the hour and once the day
 */
function updateChange() {
  if (
    previousStartTime.getInTimezone(cal.dtz.defaultTimezone).day ==
      dateTimePickerUI.startValue.getInTimezone(cal.dtz.defaultTimezone).day &&
    previousStartTime.getInTimezone(cal.dtz.defaultTimezone).month ==
      dateTimePickerUI.startValue.getInTimezone(cal.dtz.defaultTimezone).month &&
    previousStartTime.getInTimezone(cal.dtz.defaultTimezone).year ==
      dateTimePickerUI.endValue.getInTimezone(cal.dtz.defaultTimezone).year &&
    previousEndTime.getInTimezone(cal.dtz.defaultTimezone).day ==
      dateTimePickerUI.startValue.getInTimezone(cal.dtz.defaultTimezone).day &&
    previousEndTime.getInTimezone(cal.dtz.defaultTimezone).month ==
      dateTimePickerUI.startValue.getInTimezone(cal.dtz.defaultTimezone).month &&
    previousEndTime.getInTimezone(cal.dtz.defaultTimezone).year ==
      dateTimePickerUI.endValue.getInTimezone(cal.dtz.defaultTimezone).year
  ) {
    eventBar.update(false);
  } else {
    displayStartTime = dateTimePickerUI.startValue.getInTimezone(cal.dtz.defaultTimezone);

    displayStartTime.day -= 1;
    displayStartTime.isDate = true;

    displayEndTime = displayStartTime.clone();

    emptyGrid();
    for (let attendee of attendeeList.getElementsByTagName("event-attendee")) {
      attendee.clearFreeBusy();
    }

    layout();
    eventBar.update(true);
  }
  previousStartTime = dateTimePickerUI.startValue;
  previousEndTime = dateTimePickerUI.endValue;
}

/**
 * Handler function to be used when the Start time or End time of the event have
 * changed.
 * If the end date is earlier than the start date, an error is displayed and the user's modification is cancelled
 */
function checkDate() {
  if (dateTimePickerUI.startValue && dateTimePickerUI.endValue) {
    if (dateTimePickerUI.endValue.compare(dateTimePickerUI.startValue) > -1) {
      updatePreviousValues();
    } else {
      // Don't allow for negative durations.
      let callback = function() {
        Services.prompt.alert(null, document.title, cal.l10n.getCalString("warningEndBeforeStart"));
      };
      setTimeout(callback, 1);
      dateTimePickerUI.endValue = previousEndTime;
      dateTimePickerUI.startValue = previousStartTime;
    }
  }
}

/**
 * Update the end date of the event if the user changes the start date via the timepicker.
 */
function updateEndDate() {
  let duration = previousEndTime.subtractDate(previousStartTime);

  let endDatePrev = dateTimePickerUI.startValue.clone();
  endDatePrev.addDuration(duration);

  updateByFunction = true;

  dateTimePickerUI.endValue = endDatePrev;

  updateChange();
  updatePreviousValues();

  updateByFunction = false;
}

/**
 * Updated previous values that are used to return to the previous state if the end date is before the start date
 */
function updatePreviousValues() {
  previousStartTime = dateTimePickerUI.startValue;
  previousEndTime = dateTimePickerUI.endValue;
}

/**
 * Lays out the window on load or resize. Fills the grid and sets the size of some elements that
 * can't easily be done with a stylesheet.
 */
function layout() {
  fillGrid();
  let spacer = document.getElementById("spacer");
  spacer.style.height = `${dayHeaderOuter.clientHeight + 1}px`;
  freebusyGridInner.style.minHeight = freebusyGrid.clientHeight + "px";
  updateVerticalScrollbars();
}

/**
 * Checks if the grid has a vertical scrollbar and updates the header to match.
 */
function updateVerticalScrollbars() {
  if (freebusyGrid.scrollHeight > freebusyGrid.clientHeight) {
    dayHeaderOuter.style.overflowY = "scroll";
    dayHeaderInner.style.overflowY = "scroll";
  } else {
    dayHeaderOuter.style.overflowY = null;
    dayHeaderInner.style.overflowY = null;
  }
}

/**
 * Clears the grid.
 */
function emptyGrid() {
  while (dayHeaderInner.lastChild) {
    dayHeaderInner.lastChild.remove();
  }
}

/**
 * Ensures at least five days are represented on the grid. If the window is wide enough, more days
 * are shown.
 */
function fillGrid() {
  setTimeRange();

  if (!showCompleteDay) {
    displayEndTime.isDate = false;
    displayEndTime.hour = dayStartHour;
    displayEndTime.minute = 0;
    displayStartTime.isDate = false;
    displayStartTime.hour = dayStartHour;
    displayStartTime.minute = 0;
  } else {
    // BUG in icaljs
    displayEndTime.isDate = true;
    displayEndTime.hour = 0;
    displayEndTime.minute = 0;
    displayStartTime.isDate = true;
    displayStartTime.hour = 0;
    displayStartTime.minute = 0;
  }

  let oldEndTime = displayEndTime.clone();

  while (
    dayHeaderInner.childElementCount < numberDaysDisplayed ||
    dayHeaderOuter.scrollWidth < dayHeaderOuter.clientWidth
  ) {
    dayHeaderInner.appendChild(document.createXULElement("calendar-day")).date = displayEndTime;
    displayEndTime.addDuration(cal.createDuration("P1D"));
  }

  freebusyGridInner.style.width = dayHeaderInner.childElementCount * zoom.dayWidth + "px";
  if (displayEndTime.compare(oldEndTime) > 0) {
    for (let attendee of attendeeList.getElementsByTagName("event-attendee")) {
      attendee.updateFreeBusy(oldEndTime, displayEndTime);
    }
  }
}

/**
 * Aligns element horizontally on the grid to match the time period it represents.
 *
 * @param {Element} element - The element to align.
 * @param {calIDateTime} startTime - The start time to be represented.
 * @param {calIDateTime} endTime - The end time to be represented.
 */
function setLeftAndWidth(element, startTime, endTime) {
  element.style.left = getOffsetLeft(startTime) + "px";
  element.style.width = getOffsetLeft(endTime) - getOffsetLeft(startTime) + "px";
}

/**
 * Determines the offset in pixels from the first day displayed.
 *
 * @param {calIDateTime} startTime - The start time to be represented.
 */
function getOffsetLeft(startTime) {
  let coordinates = 0;
  startTime = startTime.getInTimezone(cal.dtz.defaultTimezone);

  let difference = startTime.subtractDate(displayStartTime);

  if (displayStartTime.timezoneOffset != startTime.timezoneOffset) {
    // Time changes.
    let diffTimezone = cal.createDuration();
    diffTimezone.inSeconds = startTime.timezoneOffset - displayStartTime.timezoneOffset;
    // We add the difference to the date difference otherwise the following calculations will be incorrect.
    difference.addDuration(diffTimezone);
  }

  if (!showCompleteDay) {
    // Start date of the day displayed for the date of the object being processed.
    let currentDateStartHour = startTime.clone();
    currentDateStartHour.hour = displayStartHour;
    currentDateStartHour.minute = 0;

    let dayToDayDuration = currentDateStartHour.subtractDate(displayStartTime);
    if (currentDateStartHour.timezoneOffset != displayStartTime.timezoneOffset) {
      // Time changes.
      let diffTimezone = cal.createDuration();
      diffTimezone.inSeconds =
        currentDateStartHour.timezoneOffset - displayStartTime.timezoneOffset;
      // We add the difference to the date difference otherwise the following calculations will be incorrect.
      dayToDayDuration.addDuration(diffTimezone);
    }

    if (startTime.hour < displayStartHour) {
      // The date starts before the start time of the day, we do not take into consideration the time before the start of the day.
      coordinates = (dayToDayDuration.weeks * 7 + dayToDayDuration.days) * zoom.dayWidth;
    } else if (startTime.hour >= displayEndHour) {
      // The event starts after the end of the day, we do not take into consideration the time before the following day.
      coordinates = (dayToDayDuration.weeks * 7 + dayToDayDuration.days + 1) * zoom.dayWidth;
    } else {
      coordinates =
        (difference.weeks * 7 + difference.days) * zoom.dayWidth +
        (difference.hours * 60 * 60 + difference.minutes * 60 + difference.seconds) *
          zoom.secondWidth;
    }
  } else {
    coordinates = difference.inSeconds * zoom.secondWidth;
  }

  return coordinates;
}

/**
 * Set the time range, setting the start and end hours from the prefs, or
 * to 24 hrs if the event is outside the range from the prefs.
 */
function setTimeRange() {
  let dateStart = dateTimePickerUI.startValue;
  let dateEnd = dateTimePickerUI.endValue;

  let dateStartDefaultTimezone = dateStart.getInTimezone(cal.dtz.defaultTimezone);
  let dateEndDefaultTimezone = dateEnd.getInTimezone(cal.dtz.defaultTimezone);

  if (
    showOnlyWholeDays ||
    dateTimePickerUI.allDay.checked ||
    dateStartDefaultTimezone.hour < dayStartHour ||
    (dateStartDefaultTimezone.hour == dayEndHour && dateStartDefaultTimezone.minute > 0) ||
    dateStartDefaultTimezone.hour > dayEndHour ||
    (dateEndDefaultTimezone.hour == dayEndHour && dateEndDefaultTimezone.minute > 0) ||
    dateEndDefaultTimezone.hour > dayEndHour ||
    dateStartDefaultTimezone.day != dateEndDefaultTimezone.day
  ) {
    if (!showCompleteDay) {
      // We modify the levels to readapt them.
      for (let i = 0; i < zoom.levels.length; i++) {
        zoom.levels[i].columnCount =
          zoom.levels[i].columnCount * (24 / (dayEndHour - dayStartHour));
        zoom.levels[i].dayWidth = zoom.levels[i].columnCount * zoom.levels[i].columnWidth;
      }
    }
    displayStartHour = 0;
    displayEndHour = 24;
    showCompleteDay = true;

    // To reactivate the dezoom button if you were in dezoom max for a reduced display.
    zoom.zoomOutButton.disabled = zoom.currentLevel == 0;
  } else {
    if (zoom.currentLevel == 0) {
      // To avoid being in max dezoom in the reduced display mode.
      zoom.currentLevel++;
    }
    zoom.zoomOutButton.disabled = zoom.currentLevel == 1;

    if (zoom.currentLevel == 1 && (dayEndHour - dayStartHour) % zoom.columnDuration.hours != 0) {
      // To avoid being in zoom level where the interface is not adapted.
      zoom.currentLevel++;
      // Otherwise the class of the grid is not updated.
      for (let gridClass of ["twoMinorColumns", "threeMinorColumns"]) {
        if (zoom.levels[zoom.currentLevel].gridClass == gridClass) {
          dayHeaderInner.classList.add(gridClass);
          freebusyGridInner.classList.add(gridClass);
        } else {
          dayHeaderInner.classList.remove(gridClass);
          freebusyGridInner.classList.remove(gridClass);
        }
      }
    }

    if (
      (dayEndHour - dayStartHour) % zoom.levels[zoom.currentLevel - 1].columnDuration.hours !=
      0
    ) {
      zoom.zoomOutButton.disabled = true;
    }

    if (showCompleteDay) {
      // We modify the levels to readapt them.
      for (let i = 0; i < zoom.levels.length; i++) {
        zoom.levels[i].columnCount =
          zoom.levels[i].columnCount / (24 / (dayEndHour - dayStartHour));
        zoom.levels[i].dayWidth = zoom.levels[i].columnCount * zoom.levels[i].columnWidth;
      }
    }
    displayStartHour = dayStartHour;
    displayEndHour = dayEndHour;
    showCompleteDay = false;
  }
}

/**
 * Function to trigger a change of display type (reduced or full).
 */
function updateRange() {
  let dateStart = dateTimePickerUI.startValue;
  let dateEnd = dateTimePickerUI.endValue;

  let dateStartDefaultTimezone = dateStart.getInTimezone(cal.dtz.defaultTimezone);
  let dateEndDefaultTimezone = dateEnd.getInTimezone(cal.dtz.defaultTimezone);

  let durationEvent = dateEnd.subtractDate(dateStart);

  if (
    // Reduced -> Full.
    (!showCompleteDay &&
      (dateTimePickerUI.allDay.checked ||
        (dateStartDefaultTimezone.hour == displayEndHour && dateStartDefaultTimezone.minute > 0) ||
        dateStartDefaultTimezone.hour > displayEndHour ||
        (dateEndDefaultTimezone.hour == displayEndHour && dateEndDefaultTimezone.minute > 0) ||
        dateStartDefaultTimezone.hour < dayStartHour ||
        dateEndDefaultTimezone.hour > displayEndHour ||
        dateStartDefaultTimezone.day != dateEndDefaultTimezone.day)) ||
    // Full -> Reduced.
    (showCompleteDay &&
      dateStartDefaultTimezone.hour >= dayStartHour &&
      dateStartDefaultTimezone.hour < dayEndHour &&
      (dateEndDefaultTimezone.hour < dayEndHour ||
        (dateEndDefaultTimezone.hour == dayEndHour && dateEndDefaultTimezone.minute == 0)) &&
      dateStartDefaultTimezone.day == dateEndDefaultTimezone.day) ||
    durationEvent.days > numberDaysDisplayedPref ||
    (numberDaysDisplayed > numberDaysDisplayedPref && durationEvent.days < numberDaysDisplayedPref)
  ) {
    // We redo the grid if we change state (reduced -> full, full -> reduced or if you need to change the number of days displayed).
    displayStartTime = dateTimePickerUI.startValue.getInTimezone(cal.dtz.defaultTimezone);
    displayStartTime.isDate = true;
    displayStartTime.day--;

    displayEndTime = displayStartTime.clone();

    emptyGrid();
    for (let attendee of attendeeList.getElementsByTagName("event-attendee")) {
      attendee.clearFreeBusy();
    }

    if (durationEvent.days > numberDaysDisplayedPref) {
      numberDaysDisplayed = durationEvent.days + 2;
    } else {
      numberDaysDisplayed = numberDaysDisplayedPref;
    }
    layout();
    eventBar.update(true);
  }
}

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * Represents a row on the grid for a single attendee. The element itself is the row header, and
   * this class holds reference to any elements on the grid itself that represent the free/busy
   * status for this row's attendee. The free/busy elements are removed automatically if this
   * element is removed.
   */
  class EventAttendee extends MozXULElement {
    connectedCallback() {
      this.roleIcon = this.appendChild(document.createElement("img"));
      this.roleIcon.classList.add("role-icon");
      this.roleIcon.setAttribute(
        "src",
        "chrome://calendar/skin/shared/calendar-event-dialog-attendees.png"
      );
      this.roleIcon.setAttribute("attendeerole", "REQ-PARTICIPANT");
      this._updateTooltip(this.roleIcon);
      this.roleIcon.addEventListener("click", this);

      this.userTypeIcon = this.appendChild(document.createElement("img"));
      this.userTypeIcon.classList.add("usertype-icon");
      this.userTypeIcon.setAttribute("src", "chrome://calendar/skin/shared/attendee-icons.png");
      this.userTypeIcon.setAttribute("usertype", "INDIVIDUAL");
      this._updateTooltip(this.userTypeIcon);
      this.userTypeIcon.addEventListener("click", this);

      this.input = this.appendChild(document.createElement("input", { is: "autocomplete-input" }));
      this.input.classList.add("plain");
      this.input.setAttribute("autocompletesearch", "addrbook ldap");
      this.input.setAttribute("autocompletesearchparam", "{}");
      this.input.setAttribute("forcecomplete", "true");
      this.input.setAttribute("timeout", "200");
      this.input.setAttribute("completedefaultindex", "true");
      this.input.setAttribute("completeselectedindex", "true");
      this.input.setAttribute("minresultsforpopup", "1");
      this.input.addEventListener("change", this);
      this.input.addEventListener("keydown", this);
      this.input.addEventListener("input", this);
      this.input.addEventListener("click", this);

      this.freeBusyDiv = freebusyGridInner.appendChild(document.createElement("div"));
      this.freeBusyDiv.classList.add("freebusy-row");
    }
    disconnectedCallback() {
      this.freeBusyDiv.remove();
    }

    /** @returns {calIAttendee} - Attendee object for this row. */
    get attendee() {
      if (!this.value) {
        return null;
      }

      let address = MailServices.headerParser.makeFromDisplayAddress(this.value)[0];

      let attendee = new CalAttendee();
      attendee.id = cal.email.prependMailTo(address.email);
      if (address.name && address.name != address.email) {
        attendee.commonName = address.name;
      }
      attendee.isOrganizer = this.isOrganizer;
      attendee.role = this.roleIcon.getAttribute("attendeerole");
      let userType = this.userTypeIcon.getAttribute("usertype");
      attendee.userType = userType == "INDIVIDUAL" ? null : userType; // INDIVIDUAL is the default

      return attendee;
    }
    /** @param {calIAttendee} value - Attendee object for this row. */
    set attendee(value) {
      if (value.commonName) {
        this.value = MailServices.headerParser.makeMimeHeader([
          { name: value.commonName, email: value.id.replace(/^mailto:/, "") },
        ]);
      } else {
        this.value = value.id.replace(/^mailto:/, "");
      }
      this.isOrganizer = value.isOrganizer;
      this.roleIcon.setAttribute("attendeerole", value.role);
      this._updateTooltip(this.roleIcon);
      this.userTypeIcon.setAttribute("usertype", value.userType || "INDIVIDUAL");
      this._updateTooltip(this.userTypeIcon);
    }

    /** @returns {string} - The user-visible string representing this row's attendee. */
    get value() {
      return this.input.value;
    }
    /** @param {string} value - The user-visible string representing this row's attendee. */
    set value(value) {
      this.input.value = value;
    }

    /** Removes all free/busy information from this row. */
    clearFreeBusy() {
      while (this.freeBusyDiv.lastChild) {
        this.freeBusyDiv.lastChild.remove();
      }
    }
    /**
     * Queries the free/busy service for information about this row's attendee, and displays the
     * information on the grid if there is any.
     *
     * @param {calIDateTime} from - The start of a time period to query.
     * @param {calIDateTime} to - The end of a time period to query.
     */
    updateFreeBusy(from, to) {
      let addresses = MailServices.headerParser.makeFromDisplayAddress(this.input.value);
      if (addresses.length === 0) {
        return;
      }

      let calendar = `mailto:${addresses[0].email}`;

      let pendingDiv = this.freeBusyDiv.appendChild(document.createElement("div"));
      pendingDiv.classList.add("pending");
      setLeftAndWidth(pendingDiv, from, to);

      cal.freeBusyService.getFreeBusyIntervals(
        calendar,
        from,
        to,
        Ci.calIFreeBusyInterval.BUSY_ALL,
        {
          onResult: (operation, results) => {
            for (let result of results) {
              let freeBusyType = Number(result.freeBusyType); // For some reason this is a string.
              if (freeBusyType == Ci.calIFreeBusyInterval.FREE) {
                continue;
              }

              let block = this.freeBusyDiv.appendChild(document.createElement("div"));
              switch (freeBusyType) {
                case Ci.calIFreeBusyInterval.BUSY_TENTATIVE:
                  block.classList.add("tentative");
                  break;
                case Ci.calIFreeBusyInterval.BUSY_UNAVAILABLE:
                  block.classList.add("unavailable");
                  break;
                case Ci.calIFreeBusyInterval.UNKNOWN:
                  block.classList.add("unknown");
                  break;
                default:
                  block.classList.add("busy");
                  break;
              }
              setLeftAndWidth(block, result.interval.start, result.interval.end);
            }
            if (!operation.isPending) {
              this.dispatchEvent(new CustomEvent("freebusy-update-finished"));
              pendingDiv.remove();
            }
          },
        }
      );
      this.dispatchEvent(new CustomEvent("freebusy-update-started"));
    }

    focus() {
      this.scrollIntoView();
      this.input.focus();
    }
    handleEvent(event) {
      if (
        event.type == "change" ||
        (event.type == "keydown" && event.key == "Enter") ||
        // A click on the line of the input field.
        (event.type == "click" && event.target.nodeName == "input") ||
        // A click on an autocomplete suggestion.
        (event.type == "input" &&
          event.inputType == "insertReplacementText" &&
          event.explicitOriginalTarget != event.originalTarget)
      ) {
        let nextElement = this.nextElementSibling;
        if (this.value) {
          let entries = MailServices.headerParser.makeFromDisplayAddress(this.value);
          let expandedEntries = new Set();

          let expandEntry = entry => {
            let list = MailUtils.findListInAddressBooks(entry.name);
            if (list) {
              for (let card of list.childCards) {
                card.QueryInterface(Ci.nsIAbCard);
                expandEntry({ name: card.displayName, email: card.primaryEmail });
              }
            } else {
              expandedEntries.add(
                MailServices.headerParser.makeMimeAddress(entry.name, entry.email)
              );
            }
          };

          for (let entry of entries) {
            expandEntry(entry);
          }
          if (expandedEntries.size == 1) {
            this.value = expandedEntries.values().next().value;
          } else {
            this.remove();
            for (let entry of expandedEntries) {
              let memberElement = attendeeList.insertBefore(
                document.createXULElement("event-attendee"),
                nextElement
              );
              memberElement.value = entry;
              memberElement.updateFreeBusy(displayStartTime, displayEndTime);
            }
          }
          if (!nextElement) {
            attendeeList.appendChild(document.createXULElement("event-attendee")).focus();
            freebusyGrid.scrollTop = attendeeList.scrollTop;
          }
        } else if (this.nextElementSibling) {
          // No value but not the last row? Remove.
          this.remove();
        }

        updateVerticalScrollbars();

        if (this.parentNode) {
          this.clearFreeBusy();
          this.updateFreeBusy(displayStartTime, displayEndTime);
        }
      } else if (event.type == "click") {
        if (event.button != 0 || readOnly) {
          return;
        }

        const cycle = (values, current) => {
          let nextIndex = (values.indexOf(current) + 1) % values.length;
          return values[nextIndex];
        };

        let target = event.target;
        if (target == this.roleIcon) {
          let nextValue = cycle(EventAttendee.roleCycle, target.getAttribute("attendeerole"));
          target.setAttribute("attendeerole", nextValue);
          this._updateTooltip(target);
        } else if (target == this.userTypeIcon) {
          if (!this.isOrganizer) {
            let nextValue = cycle(EventAttendee.userTypeCycle, target.getAttribute("usertype"));
            target.setAttribute("usertype", nextValue);
            this._updateTooltip(target);
          }
        }
      } else if (event.type == "keydown" && event.key == "ArrowRight") {
        let nextElement = this.nextElementSibling;
        if (this.value) {
          if (!nextElement) {
            attendeeList.appendChild(document.createXULElement("event-attendee"));
          }
        } else if (this.nextElementSibling) {
          // No value but not the last row? Remove.
          this.remove();
        }
      }
    }
    _updateTooltip(targetIcon) {
      let tooltip;
      if (targetIcon == this.roleIcon) {
        let role = targetIcon.getAttribute("attendeerole");
        const roleMap = {
          "REQ-PARTICIPANT": "required",
          "OPT-PARTICIPANT": "optional",
          "NON-PARTICIPANT": "nonparticipant",
          CHAIR: "chair",
        };

        let roleNameString = "event.attendee.role." + (role in roleMap ? roleMap[role] : "unknown");
        tooltip = cal.l10n.getString(
          "calendar-event-dialog-attendees",
          roleNameString,
          role in roleMap ? [] : [role]
        );
      } else if (targetIcon == this.userTypeIcon) {
        let userType = targetIcon.getAttribute("usertype");
        const userTypeMap = {
          INDIVIDUAL: "individual",
          GROUP: "group",
          RESOURCE: "resource",
          ROOM: "room",
          // UNKNOWN is not handled.
        };

        let userTypeString =
          "event.attendee.usertype." +
          (userType in userTypeMap ? userTypeMap[userType] : "unknown");
        tooltip = cal.l10n.getString(
          "calendar-event-dialog-attendees",
          userTypeString,
          userType in userTypeMap ? [] : [userType]
        );
      } else {
        return;
      }
      targetIcon.setAttribute("title", tooltip);
    }
  }
  EventAttendee.roleCycle = ["REQ-PARTICIPANT", "OPT-PARTICIPANT", "NON-PARTICIPANT", "CHAIR"];
  EventAttendee.userTypeCycle = ["INDIVIDUAL", "GROUP", "RESOURCE", "ROOM"];
  customElements.define("event-attendee", EventAttendee);

  /**
   * Represents a group of columns for a single day on the grid. The element itself is the column
   * header, and this class holds reference to elements on the grid that provide the background
   * coloring for the day. The elements are removed automatically if this element is removed.
   */
  class CalendarDay extends MozXULElement {
    connectedCallback() {
      let dayLabelContainer = this.appendChild(document.createXULElement("box"));
      dayLabelContainer.setAttribute("pack", "center");

      this.dayLabel = dayLabelContainer.appendChild(document.createXULElement("label"));
      this.dayLabel.classList.add("day-label");

      let columnContainer = this.appendChild(document.createXULElement("box"));

      // A half-column-wide spacer to align labels with the dividing grid lines.
      columnContainer.appendChild(document.createXULElement("box")).style.width =
        zoom.columnWidth / 2 + "px";

      let column = displayEndTime.clone();
      column.isDate = false;
      for (let i = 1; i < zoom.columnCount; i++) {
        column.addDuration(zoom.columnDuration);

        let columnBox = columnContainer.appendChild(document.createXULElement("box"));
        columnBox.style.width = zoom.columnWidth + "px";
        columnBox.setAttribute("align", "center");

        let columnLabel = columnBox.appendChild(document.createXULElement("label"));
        columnLabel.classList.add("hour-label");
        columnLabel.setAttribute("flex", "1");
        columnLabel.setAttribute("value", cal.dtz.formatter.formatTime(column));
      }

      // A half-column-wide (minus 1px) spacer to align labels with the dividing grid lines.
      columnContainer.appendChild(document.createXULElement("box")).style.width =
        zoom.columnWidth / 2 - 1 + "px";
    }

    disconnectedCallback() {
      if (this.dayColumn) {
        this.dayColumn.remove();
      }
    }

    /** @returns {calIDateTime} - The day this group of columns represents. */
    get date() {
      return this.mDate;
    }
    /** @param {calIDateTime} value - The day this group of columns represents. */
    set date(value) {
      this.mDate = value.clone();
      this.dayLabel.value = cal.dtz.formatter.formatDateShort(this.mDate);

      let datePlus1 = value.clone();
      if (!showCompleteDay) {
        // To avoid making a 24 hour day in reduced display.
        let hoursToShow = dayEndHour - dayStartHour;
        datePlus1.addDuration(cal.createDuration("PT" + hoursToShow + "H"));
      } else {
        datePlus1.addDuration(cal.createDuration("P1D"));
      }

      let dayOffPref = [
        "calendar.week.d0sundaysoff",
        "calendar.week.d1mondaysoff",
        "calendar.week.d2tuesdaysoff",
        "calendar.week.d3wednesdaysoff",
        "calendar.week.d4thursdaysoff",
        "calendar.week.d5fridaysoff",
        "calendar.week.d6saturdaysoff",
      ][this.mDate.weekday];

      this.dayColumn = freebusyGridBackground.appendChild(document.createElement("div"));
      this.dayColumn.classList.add("day-column");
      setLeftAndWidth(this.dayColumn, this.mDate, datePlus1);
      if (Services.prefs.getBoolPref(dayOffPref)) {
        this.dayColumn.classList.add("day-off");
      }

      if (dayStartHour > 0) {
        let dayStart = value.clone();
        dayStart.isDate = false;
        dayStart.hour = dayStartHour;
        let beforeStartDiv = this.dayColumn.appendChild(document.createElement("div"));
        beforeStartDiv.classList.add("time-off");
        setLeftAndWidth(beforeStartDiv, this.mDate, dayStart);
        beforeStartDiv.style.left = "0";
      }
      if (dayEndHour < 24) {
        let dayEnd = value.clone();
        dayEnd.isDate = false;
        dayEnd.hour = dayEndHour;
        let afterEndDiv = this.dayColumn.appendChild(document.createElement("div"));
        afterEndDiv.classList.add("time-off");
        setLeftAndWidth(afterEndDiv, dayEnd, datePlus1);
        afterEndDiv.style.left = null;
        afterEndDiv.style.right = "0";
      }
    }
  }
  customElements.define("calendar-day", CalendarDay);
}
