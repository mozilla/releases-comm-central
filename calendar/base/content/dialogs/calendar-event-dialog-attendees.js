/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement */
/* import-globals-from ../calendar-ui-utils.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalAttendee: "resource:///modules/CalAttendee.jsm",
});

var freeBusyService = cal.getFreeBusyService();
var timezoneService = cal.getTimezoneService();

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
      columnCount: 12,
      columnDuration: cal.createDuration("PT2H"),
      columnWidth: 120,
      secondWidth: 1440 / 24 / 3600,
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
        this.eventBarTop.style.transform = this.eventBarBottom.style.transform = `translateX(${this.dragDistance}px)`;
        break;
      }
      case "dragend": {
        this.dragStartX = null;
        this.eventBarTop.style.transform = this.eventBarBottom.style.transform = null;

        let duration = cal.createDuration();
        duration.inSeconds = this.dragDistance / zoom.secondWidth;

        let { startValue, endValue } = dateTimePickerUI;
        startValue.addDuration(duration);
        dateTimePickerUI.startValue = startValue;
        endValue.addDuration(duration);
        dateTimePickerUI.endValue = endValue;

        setLeftAndWidth(this.eventBarTop, startValue, endValue);
        setLeftAndWidth(this.eventBarBottom, startValue, endValue);
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
    this.end.addEventListener("change", () => eventBar.update(false));
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
    let allDay = this.allDay.checked;
    document.getElementById("event-starttime").toggleAttribute("timepickerdisabled", allDay);
    document.getElementById("event-endtime").toggleAttribute("timepickerdisabled", allDay);

    if (allDay) {
      // Store date-times and related timezones so we can restore
      // if the user unchecks the "all day" checkbox.
      this.start._oldValue = new Date(this.start.value);
      this.end._oldValue = new Date(this.end.value);

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

      startValue.isDate = true;
      endValue.isDate = true;
      this.startValue = startValue;
      this.endValue = endValue;
    } else if (this.start._oldValue && this.end._oldValue) {
      // Restore date-times previously stored.
      this.start.value = this.start._oldValue;
      this.end.value = this.end._oldValue;
    } else {
      // The checkbox has been unchecked for the first time, the event
      // was an "All day" type, so we have to set default values.
      let startValue = cal.dtz.getDefaultStartDate(window.initialStartDateValue);
      let endValue = startValue.clone();
      endValue.minute += Services.prefs.getIntPref("calendar.event.defaultlength", 60);
      this.startValue = startValue;
      this.endValue = endValue;
    }
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
    dateTimePickerUI.allDay.checked = startTime.isDate;
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
    zoom.level = 0;
    layout();
    eventBar.update(true);
    dateTimePickerUI.addListeners();
    addEventListener("resize", layout);

    attendeeList.appendChild(document.createXULElement("event-attendee")).focus();
    updateVerticalScrollbars();
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
  let oldEndTime = displayEndTime.clone();

  while (
    dayHeaderInner.childElementCount < 5 ||
    dayHeaderOuter.scrollWidth <= dayHeaderOuter.clientWidth
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
  element.style.left = startTime.subtractDate(displayStartTime).inSeconds * zoom.secondWidth + "px";
  element.style.width = endTime.subtractDate(startTime).inSeconds * zoom.secondWidth + "px";
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
      this.input.setAttribute("completedefaultindex", "true");
      this.input.setAttribute("completeselectedindex", "true");
      this.input.setAttribute("minresultsforpopup", "1");
      this.input.addEventListener("change", this);

      this.freeBusyDiv = freebusyGridInner.appendChild(document.createElement("div"));
      this.freeBusyDiv.classList.add("freebusy-row");
    }
    disconnectedCallback() {
      this.freeBusyDiv.remove();
    }

    /** @return {calIAttendee} - Attendee object for this row. */
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

    /** @return {String} - The user-visible string representing this row's attendee. */
    get value() {
      return this.input.value;
    }
    /** @param {String} value - The user-visible string representing this row's attendee. */
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
      let addresses = MailServices.headerParser.parseEncodedHeader(this.input.value);
      if (!addresses || addresses.length === 0) {
        return;
      }

      let calendar = `mailto:${addresses[0].email}`;

      let pendingDiv = this.freeBusyDiv.appendChild(document.createElement("div"));
      pendingDiv.classList.add("pending");
      setLeftAndWidth(pendingDiv, from, to);

      freeBusyService.getFreeBusyIntervals(calendar, from, to, Ci.calIFreeBusyInterval.BUSY_ALL, {
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
      });
      this.dispatchEvent(new CustomEvent("freebusy-update-started"));
    }

    focus() {
      this.scrollIntoView();
      this.input.focus();
    }
    handleEvent(event) {
      if (event.type == "change") {
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
      columnContainer
        .appendChild(document.createXULElement("box"))
        .setAttribute("width", zoom.columnWidth / 2);

      let column = displayEndTime.clone();
      column.isDate = false;
      for (let i = 1; i < zoom.columnCount; i++) {
        column.addDuration(zoom.columnDuration);

        let columnBox = columnContainer.appendChild(document.createXULElement("box"));
        columnBox.setAttribute("width", zoom.columnWidth);
        columnBox.setAttribute("align", "center");

        let columnLabel = columnBox.appendChild(document.createXULElement("label"));
        columnLabel.classList.add("hour-label");
        columnLabel.setAttribute("flex", "1");
        columnLabel.setAttribute("value", cal.dtz.formatter.formatTime(column));
      }

      // A half-column-wide (minus 1px) spacer to align labels with the dividing grid lines.
      columnContainer
        .appendChild(document.createXULElement("box"))
        .setAttribute("width", zoom.columnWidth / 2 - 1);
    }

    disconnectedCallback() {
      if (this.dayColumn) {
        this.dayColumn.remove();
      }
    }

    /** @return {calIDateTime} - The day this group of columns represents. */
    get date() {
      return this.mDate;
    }
    /** @param {calIDateTime} value - The day this group of columns represents. */
    set date(value) {
      this.mDate = value.clone();
      this.dayLabel.value = cal.dtz.formatter.formatDateShort(this.mDate);

      let datePlus1 = value.clone();
      datePlus1.addDuration(cal.createDuration("P1D"));
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

      let dayStartHour = Services.prefs.getIntPref("calendar.view.daystarthour");
      let dayEndHour = Services.prefs.getIntPref("calendar.view.dayendhour");

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
