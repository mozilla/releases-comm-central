/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement */
/* import-globals-from ../calendar-ui-utils.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
var { MailUtils } = ChromeUtils.importESModule("resource:///modules/MailUtils.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
var lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(
      ["calendar/calendar.ftl", "calendar/calendar-event-dialog-attendees.ftl"],
      true
    )
);
ChromeUtils.defineESModuleGetters(this, {
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
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
    for (const attendee of attendeeList.getElementsByTagName("event-attendee")) {
      attendee.clearFreeBusy();
    }

    for (const gridClass of ["twoMinorColumns", "threeMinorColumns"]) {
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

    const outer = document.getElementById("outer");
    outer.addEventListener("dragstart", this);
    outer.addEventListener("dragover", this);
    outer.addEventListener("dragend", this);
  },
  handleEvent(event) {
    switch (event.type) {
      case "dragstart": {
        this.dragStartX = event.clientX + freebusyGrid.scrollLeft;
        const img = document.createElement("img");
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
          this.eventBarTop.style.transform =
            this.eventBarBottom.style.transform = `translateX(${this.dragDistance}px)`;
        }
        break;
      }
      case "dragend": {
        updateByFunction = true;
        const positionFromStart = this.eventBarBottom.offsetLeft + this.dragDistance;
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
          const startValueDefaultTimezone = startValue.getInTimezone(cal.dtz.defaultTimezone);
          if (!showCompleteDay) {
            if (
              !(
                (startValueDefaultTimezone.hour >= displayStartHour ||
                  (startValueDefaultTimezone.hour == displayStartHour - 1 &&
                    startValueDefaultTimezone.minute > 0)) &&
                startValueDefaultTimezone.hour < displayEndHour
              )
            ) {
              const hoursHidden = 24 - displayEndHour + displayStartHour;
              const reducDayDuration = cal.createDuration("-PT" + hoursHidden + "H");
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
    const { startValueForDisplay, endValueForDisplay } = dateTimePickerUI;
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
      freebusyGrid.scrollTo(scrollPoint, freebusyGrid.scrollTop);
      dayHeaderOuter.scrollLeft = freebusyGrid.scrollLeft;
    }
  },
  getDateFromPosition(posX, timezone) {
    const numberOfDays = Math.floor(posX / zoom.dayWidth);
    const remainingOffset = posX - numberOfDays * zoom.dayWidth;

    const duration = cal.createDuration();
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
    for (const key of ["allDay", "start", "startZone", "end", "endZone"]) {
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
    const allDay = this.allDay.checked;
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
        const tempStartValue = startValue.clone();
        const tempEndValue = endValue.clone();
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
        const saveMinutes = this.end._oldValue.getMinutes();
        this.start._oldValue.setHours(
          cal.dtz.getDefaultStartDate(window.arguments[0].startTime).hour
        );
        this.end._oldValue.setHours(
          cal.dtz.getDefaultStartDate(window.arguments[0].startTime).hour
        );
        const minutes = saveMinutes + defaultEventLength;
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
      const startValue = cal.dtz.getDefaultStartDate(window.initialStartDateValue);
      const endValue = startValue.clone();
      endValue.minute += defaultEventLength;
      this.startValue = startValue;
      this.endValue = endValue;
    }
    updateByFunction = false;
    updatePreviousValues();
    updateRange();
  },
  editTimezone(target) {
    const field = target == this.startZone ? "startValue" : "endValue";
    const originalValue = this[field];

    const args = {
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
      const row = event.target.closest("event-attendee");
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
      { startTime, endTime, displayTimezone, calendar, organizer, attendees: existingAttendees },
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
      const tempStartTime = startTime.clone();
      const tempEndTime = endTime.clone();
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
    const difference = startTime.subtractDate(displayStartTime);
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

    readOnly = calendar.isReadOnly;
    zoom.level = 2;
    layout();
    eventBar.update(true);
    dateTimePickerUI.addListeners();
    addEventListener("resize", layout);

    dateTimePickerUI.start.addEventListener("change", function () {
      if (!updateByFunction) {
        updateEndDate();
        if (dateTimePickerUI.allDay.checked) {
          dateTimePickerUI.saveOldValues();
        }
        updateRange();
      }
    });
    dateTimePickerUI.end.addEventListener("change", function () {
      if (!updateByFunction) {
        checkDate();
        dateTimePickerUI.saveOldValues();
        updateChange();
        updateRange();
      }
    });

    const attendees = Array.from(existingAttendees);

    // If there are no existing attendees, we assume that this is the first time
    // others are being invited. By default, the organizer is added as an
    // attendee, letting the organizer remove themselves if that isn't desired.
    if (attendees.length == 0) {
      if (organizer) {
        attendees.push(organizer);
      } else {
        const organizerId = calendar.getProperty("organizerId");
        if (organizerId) {
          // We explicitly don't mark this attendee as organizer, as that has
          // special meaning in ical.js. This represents the organizer as a
          // potential attendee of the event and can be removed by the organizer
          // through the interface if they do not plan on attending. By default,
          // the organizer has accepted.
          const organizerAsAttendee = new CalAttendee();
          organizerAsAttendee.id = cal.email.removeMailTo(organizerId);
          organizerAsAttendee.commonName = calendar.getProperty("organizerCN");
          organizerAsAttendee.role = "REQ-PARTICIPANT";
          organizerAsAttendee.participationStatus = "ACCEPTED";
          attendees.push(organizerAsAttendee);
        }
      }
    }

    // Add all provided attendees to the attendee list.
    for (const attendee of attendees) {
      const attendeeElement = attendeeList.appendChild(document.createXULElement("event-attendee"));
      attendeeElement.attendee = attendee;
    }

    // Add a final empty row for user input.
    attendeeList.appendChild(document.createXULElement("event-attendee")).focus();
    updateVerticalScrollbars();
  },
  { once: true }
);

window.addEventListener("dialogaccept", () => {
  // Build the list of attendees which have been filled in.
  const attendeeElements = attendeeList.getElementsByTagName("event-attendee");
  const attendees = Array.from(attendeeElements)
    .map(element => element.attendee)
    .filter(attendee => !!attendee.id);

  const [{ organizer: existingOrganizer, calendar, onOk }] = window.arguments;

  // Determine the organizer of the event. If there are no attendees other than
  // the organizer, we want to leave it as a personal event with no organizer.
  // Only set that value if other attendees have been added.
  let organizer;

  const organizerId = existingOrganizer?.id ?? calendar.getProperty("organizerId");
  if (organizerId) {
    const nonOrganizerAttendees = attendees.filter(attendee => attendee.id != organizerId);
    if (nonOrganizerAttendees.length != 0) {
      if (existingOrganizer) {
        organizer = existingOrganizer;
      } else {
        organizer = new CalAttendee();
        organizer.id = cal.email.removeMailTo(organizerId);
        organizer.commonName = calendar.getProperty("organizerCN");
        organizer.isOrganizer = true;
      }
    } else {
      // Since we don't set the organizer if the event is personal, don't add
      // the organizer as an attendee either.
      attendees.length = 0;
    }
  }

  const { startValue, endValue } = dateTimePickerUI;
  if (dateTimePickerUI.allDay.checked) {
    startValue.isDate = true;
    endValue.isDate = true;
  }

  onOk(attendees, organizer, startValue, endValue);
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
    for (const attendee of attendeeList.getElementsByTagName("event-attendee")) {
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
      const callback = function () {
        Services.prompt.alert(
          null,
          document.title,
          lazy.l10n.formatValueSync("warning-end-before-start")
        );
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
  const duration = previousEndTime.subtractDate(previousStartTime);

  const endDatePrev = dateTimePickerUI.startValue.clone();
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
  const spacer = document.getElementById("spacer");
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
  } else {
    dayHeaderOuter.style.overflowY = null;
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

  const oldEndTime = displayEndTime.clone();

  while (
    dayHeaderInner.childElementCount < numberDaysDisplayed ||
    dayHeaderOuter.scrollWidth < dayHeaderOuter.clientWidth
  ) {
    dayHeaderInner.appendChild(document.createXULElement("calendar-day")).date = displayEndTime;
    displayEndTime.addDuration(cal.createDuration("P1D"));
  }

  freebusyGridInner.style.width = dayHeaderInner.childElementCount * zoom.dayWidth + "px";
  if (displayEndTime.compare(oldEndTime) > 0) {
    for (const attendee of attendeeList.getElementsByTagName("event-attendee")) {
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

  const difference = startTime.subtractDate(displayStartTime);

  if (displayStartTime.timezoneOffset != startTime.timezoneOffset) {
    // Time changes.
    const diffTimezone = cal.createDuration();
    diffTimezone.inSeconds = startTime.timezoneOffset - displayStartTime.timezoneOffset;
    // We add the difference to the date difference otherwise the following calculations will be incorrect.
    difference.addDuration(diffTimezone);
  }

  if (!showCompleteDay) {
    // Start date of the day displayed for the date of the object being processed.
    const currentDateStartHour = startTime.clone();
    currentDateStartHour.hour = displayStartHour;
    currentDateStartHour.minute = 0;

    const dayToDayDuration = currentDateStartHour.subtractDate(displayStartTime);
    if (currentDateStartHour.timezoneOffset != displayStartTime.timezoneOffset) {
      // Time changes.
      const diffTimezone = cal.createDuration();
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
  const dateStart = dateTimePickerUI.startValue;
  const dateEnd = dateTimePickerUI.endValue;

  const dateStartDefaultTimezone = dateStart.getInTimezone(cal.dtz.defaultTimezone);
  const dateEndDefaultTimezone = dateEnd.getInTimezone(cal.dtz.defaultTimezone);

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
      for (const gridClass of ["twoMinorColumns", "threeMinorColumns"]) {
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
  const dateStart = dateTimePickerUI.startValue;
  const dateEnd = dateTimePickerUI.endValue;

  const dateStartDefaultTimezone = dateStart.getInTimezone(cal.dtz.defaultTimezone);
  const dateEndDefaultTimezone = dateEnd.getInTimezone(cal.dtz.defaultTimezone);

  const durationEvent = dateEnd.subtractDate(dateStart);

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
    for (const attendee of attendeeList.getElementsByTagName("event-attendee")) {
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
    static #DEFAULT_ROLE = "REQ-PARTICIPANT";
    static #DEFAULT_USER_TYPE = "INDIVIDUAL";

    static #roleCycle = ["REQ-PARTICIPANT", "OPT-PARTICIPANT", "NON-PARTICIPANT", "CHAIR"];
    static #userTypeCycle = ["INDIVIDUAL", "GROUP", "RESOURCE", "ROOM"];

    #attendee = null;
    #roleIcon = null;
    #userTypeIcon = null;
    #input = null;

    // Because these divs have no reference back to the corresponding attendee,
    // we currently have to expose this in order to test that free/busy updates
    // happen appropriately.
    _freeBusyDiv = null;

    connectedCallback() {
      // Initialize a default attendee.
      this.#attendee = new CalAttendee();
      this.#attendee.role = EventAttendee.#DEFAULT_ROLE;
      this.#attendee.userType = EventAttendee.#DEFAULT_USER_TYPE;

      // Set up participation role icon. Its image is a grid of icons, the
      // display of which is determined by CSS rules defined in
      // calendar-attendees.css based on its class and "attendeerole" attribute.
      this.#roleIcon = this.appendChild(document.createElement("img"));
      this.#roleIcon.classList.add("role-icon");
      this.#roleIcon.setAttribute(
        "src",
        "chrome://calendar/skin/shared/calendar-event-dialog-attendees.png"
      );
      this.#updateRoleIcon();
      this.#roleIcon.addEventListener("click", this);

      // Set up calendar user type icon. Its image is a grid of icons, the
      // display of which is determined by CSS rules defined in
      // calendar-attendees.css based on its class and "usertype" attribute.
      this.#userTypeIcon = this.appendChild(document.createElement("img"));
      this.#userTypeIcon.classList.add("usertype-icon");
      this.#userTypeIcon.setAttribute("src", "chrome://calendar/skin/shared/attendee-icons.png");
      this.#updateUserTypeIcon();
      this.#userTypeIcon.addEventListener("click", this);

      this.#input = this.appendChild(document.createElement("input", { is: "autocomplete-input" }));
      this.#input.classList.add("plain");
      this.#input.setAttribute("autocompletesearch", "addrbook ldap");
      this.#input.setAttribute("autocompletesearchparam", "{}");
      this.#input.setAttribute("forcecomplete", "true");
      this.#input.setAttribute("timeout", "200");
      this.#input.setAttribute("completedefaultindex", "true");
      this.#input.setAttribute("completeselectedindex", "true");
      this.#input.setAttribute("minresultsforpopup", "1");
      this.#input.addEventListener("change", this);
      this.#input.addEventListener("keydown", this);

      this._freeBusyDiv = freebusyGridInner.appendChild(document.createElement("div"));
      this._freeBusyDiv.classList.add("freebusy-row");
    }

    disconnectedCallback() {
      this._freeBusyDiv.remove();
    }

    /**
     * Get the attendee for this row. The attendee will be cloned to prevent
     * accidental modification, which could cause the UI to fall out of sync.
     *
     * @returns {calIAttendee} - The attendee for this row.
     */
    get attendee() {
      return this.#attendee.clone();
    }

    /**
     * Set the attendee for this row.
     *
     * @param {calIAttendee} attendee - The new attendee for this row.
     */
    set attendee(attendee) {
      this.#attendee = attendee.clone();

      // Update display values of the icons and input box.
      this.#updateRoleIcon();
      this.#updateUserTypeIcon();

      // If the attendee has a name set, build a display string from their name
      // and email; otherwise, we can use the email address as is.
      const attendeeEmail = cal.email.removeMailTo(this.#attendee.id);
      if (this.#attendee.commonName) {
        this.#input.value = MailServices.headerParser
          .makeMailboxObject(this.#attendee.commonName, attendeeEmail)
          .toString();
      } else {
        this.#input.value = attendeeEmail;
      }

      this.updateFreeBusy(displayStartTime, displayEndTime);
    }

    /** Removes all free/busy information from this row. */
    clearFreeBusy() {
      while (this._freeBusyDiv.lastChild) {
        this._freeBusyDiv.lastChild.remove();
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
      const addresses = MailServices.headerParser.makeFromDisplayAddress(this.#input.value);
      if (addresses.length === 0) {
        return;
      }

      const calendar = cal.email.prependMailTo(addresses[0].email);

      const pendingDiv = this._freeBusyDiv.appendChild(document.createElement("div"));
      pendingDiv.classList.add("pending");
      setLeftAndWidth(pendingDiv, from, to);

      cal.freeBusyService.getFreeBusyIntervals(
        calendar,
        from,
        to,
        Ci.calIFreeBusyInterval.BUSY_ALL,
        {
          onResult: (operation, results) => {
            for (const result of results) {
              const freeBusyType = Number(result.freeBusyType); // For some reason this is a string.
              if (freeBusyType == Ci.calIFreeBusyInterval.FREE) {
                continue;
              }

              const block = this._freeBusyDiv.appendChild(document.createElement("div"));
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
      this.#input.focus();
    }

    handleEvent(event) {
      if (event.type == "change") {
        const nextElement = this.nextElementSibling;
        if (this.#input.value) {
          /**
           * Given structured address data, build it into a collection of
           * mailboxes, resolving any groups into individual mailboxes in the
           * process.
           *
           * @param {Map<string, msgIAddressObject>} accumulatorMap - A map from
           *   attendee ID to the corresponding mailbox.
           * @param {msgIAddressObject} address - Structured representation of
           *   an RFC 5322 address to resolve to one or more mailboxes.
           * @returns {Map<string, msgIAddressObject>} - A map containing all
           *   entries from the provided map as well as any individual
           *   mailboxes resolved from the provided address.
           */
          function resolveAddressesToMailboxes(accumulatorMap, address) {
            const list = MailUtils.findListInAddressBooks(address.name);
            if (list) {
              // If the address was for a group, collect each mailbox from that
              // group, recursively if necessary.
              return list.childCards
                .map(card => {
                  card.QueryInterface(Ci.nsIAbCard);

                  return MailServices.headerParser.makeMailboxObject(
                    card.displayName,
                    card.primaryEmail
                  );
                })
                .reduce(resolveAddressesToMailboxes, accumulatorMap);
            }

            // The address data was a single mailbox; add it to the map.
            return accumulatorMap.set(address.email, address);
          }

          // Take the addresses in the input and resolve them into individual
          // mailboxes for attendees.
          const attendeeAddresses = MailServices.headerParser.makeFromDisplayAddress(
            this.#input.value
          );
          const resolvedMailboxes = attendeeAddresses.reduce(
            resolveAddressesToMailboxes,
            new Map()
          );

          // We want to ensure that this row and its attendee is preserved if
          // the attendee is still in the list; otherwise, we may throw away
          // what we already know about them (e.g., required vs. optional or
          // RSVP status).
          const attendeeEmail = this.#attendee.id && cal.email.removeMailTo(this.#attendee.id);
          if (attendeeEmail && resolvedMailboxes.has(attendeeEmail)) {
            // Update attendee name from mailbox and ensure we don't duplicate
            // the row.
            const mailbox = resolvedMailboxes.get(attendeeEmail);
            this.#attendee.commonName = mailbox.name;
            resolvedMailboxes.delete(attendeeEmail);
          } else {
            // The attendee for this row was not found in the revised list of
            // mailboxes, so remove the row from the attendee list.
            nextElement?.focus();
            this.remove();
          }

          // For any mailboxes beyond that representing the current attendee,
          // add a new row immediately following this one (or its previous
          // location if removed).
          for (const [email, mailbox] of resolvedMailboxes) {
            const newAttendee = new CalAttendee();
            newAttendee.id = cal.email.prependMailTo(email);
            newAttendee.role = EventAttendee.#DEFAULT_ROLE;
            newAttendee.userType = EventAttendee.#DEFAULT_USER_TYPE;

            if (mailbox.name && mailbox.name != mailbox.email) {
              newAttendee.commonName = mailbox.name;
            }

            const newRow = attendeeList.insertBefore(
              document.createXULElement("event-attendee"),
              nextElement
            );
            newRow.attendee = newAttendee;
          }

          // If there are no rows following, create an empty row for the next attendee.
          if (!nextElement) {
            attendeeList.appendChild(document.createXULElement("event-attendee")).focus();
            freebusyGrid.scrollTop = attendeeList.scrollTop;
          }
        } else if (this.nextElementSibling) {
          // This row is now empty, but there are additional rows (and thus an
          // empty row for new entries). Remove this row and focus the next.
          this.nextElementSibling.focus();
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
          const nextIndex = (values.indexOf(current) + 1) % values.length;
          return values[nextIndex];
        };

        const target = event.target;
        if (target == this.#roleIcon) {
          this.#attendee.role = cycle(EventAttendee.#roleCycle, this.#attendee.role);
          this.#updateRoleIcon();
        } else if (target == this.#userTypeIcon) {
          if (!this.#attendee.isOrganizer) {
            this.#attendee.userType = cycle(EventAttendee.#userTypeCycle, this.#attendee.userType);
            this.#updateUserTypeIcon();
          }
        }
      } else if (event.type == "keydown" && event.key == "ArrowRight") {
        const nextElement = this.nextElementSibling;
        if (this.#input.value) {
          if (!nextElement) {
            attendeeList.appendChild(document.createXULElement("event-attendee"));
          }
        } else if (this.nextElementSibling) {
          // No value but not the last row? Remove.
          this.remove();
        }
      }
    }

    /**
     * Update the tooltip and icon of the role icon node to match the current
     * role for this row's attendee.
     */
    #updateRoleIcon() {
      const role = this.#attendee.role ?? EventAttendee.#DEFAULT_ROLE;
      const roleValueToStringKeyMap = {
        "REQ-PARTICIPANT": "event-attendee-role-required",
        "OPT-PARTICIPANT": "event-attendee-role-optional",
        "NON-PARTICIPANT": "event-attendee-role-nonparticipant",
        CHAIR: "event-attendee-role-chair",
      };

      let tooltip;
      let tooltipArgs = undefined;
      if (role in roleValueToStringKeyMap) {
        tooltip = roleValueToStringKeyMap[role];
      } else {
        tooltip = "event-attendee-role-unknown";
        tooltipArgs = { role };
      }

      document.l10n.setAttributes(this.#roleIcon, tooltip, tooltipArgs);
    }

    /**
     * Update the tooltip and icon of the user type icon node to match the
     * current user type for this row's attendee.
     */
    #updateUserTypeIcon() {
      const userType = this.#attendee.userType ?? EventAttendee.#DEFAULT_USER_TYPE;
      const userTypeValueToStringKeyMap = {
        INDIVIDUAL: "event-attendee-usertype-individual",
        GROUP: "event-attendee-usertype-group",
        RESOURCE: "event-attendee-usertype-resource",
        ROOM: "event-attendee-usertype-room",
        // UNKNOWN and any unrecognized user types are handled below.
      };

      let tooltip;
      let tooltipArgs = undefined;
      if (userType in userTypeValueToStringKeyMap) {
        tooltip = userTypeValueToStringKeyMap[userType];
      } else {
        tooltip = "event-attendee-usertype-unknown";
        tooltipArgs = { userType };
      }

      document.l10n.setAttributes(this.#userTypeIcon, tooltip, tooltipArgs);
    }
  }
  customElements.define("event-attendee", EventAttendee);

  /**
   * Represents a group of columns for a single day on the grid. The element itself is the column
   * header, and this class holds reference to elements on the grid that provide the background
   * coloring for the day. The elements are removed automatically if this element is removed.
   */
  class CalendarDay extends MozXULElement {
    connectedCallback() {
      const dayLabelContainer = this.appendChild(document.createXULElement("box"));
      dayLabelContainer.setAttribute("pack", "center");

      this.dayLabel = dayLabelContainer.appendChild(document.createXULElement("label"));
      this.dayLabel.classList.add("day-label");

      const columnContainer = this.appendChild(document.createXULElement("box"));

      // A half-column-wide spacer to align labels with the dividing grid lines.
      columnContainer.appendChild(document.createXULElement("box")).style.width =
        zoom.columnWidth / 2 + "px";

      const column = displayEndTime.clone();
      column.isDate = false;
      for (let i = 1; i < zoom.columnCount; i++) {
        column.addDuration(zoom.columnDuration);

        const columnBox = columnContainer.appendChild(document.createXULElement("box"));
        columnBox.style.width = zoom.columnWidth + "px";
        columnBox.setAttribute("align", "center");

        const columnLabel = columnBox.appendChild(document.createXULElement("label"));
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

      const datePlus1 = value.clone();
      if (!showCompleteDay) {
        // To avoid making a 24 hour day in reduced display.
        const hoursToShow = dayEndHour - dayStartHour;
        datePlus1.addDuration(cal.createDuration("PT" + hoursToShow + "H"));
      } else {
        datePlus1.addDuration(cal.createDuration("P1D"));
      }

      const dayOffPref = [
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
        const dayStart = value.clone();
        dayStart.isDate = false;
        dayStart.hour = dayStartHour;
        const beforeStartDiv = this.dayColumn.appendChild(document.createElement("div"));
        beforeStartDiv.classList.add("time-off");
        setLeftAndWidth(beforeStartDiv, this.mDate, dayStart);
        beforeStartDiv.style.left = "0";
      }
      if (dayEndHour < 24) {
        const dayEnd = value.clone();
        dayEnd.isDate = false;
        dayEnd.hour = dayEndHour;
        const afterEndDiv = this.dayColumn.appendChild(document.createElement("div"));
        afterEndDiv.classList.add("time-off");
        setLeftAndWidth(afterEndDiv, dayEnd, datePlus1);
        afterEndDiv.style.left = null;
        afterEndDiv.style.right = "0";
      }
    }
  }
  customElements.define("calendar-day", CalendarDay);
}
