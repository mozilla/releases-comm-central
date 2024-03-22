/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { iterate } from "resource:///modules/calendar/utils/calIteratorUtils.sys.mjs";
import { data } from "resource:///modules/calendar/utils/calDataUtils.sys.mjs";
import { dtz } from "resource:///modules/calendar/utils/calDateTimeUtils.sys.mjs";

/**
 * Calendar item related functions
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.item namespace.

export var item = {
  /**
   * Calculcate difference between items.
   *
   * @param {calIItemBase[]} oldItems - Old items.
   * @param {calIItemBase[]} newItems - New items.
   * @returns {object} interdiff
   * @returns {calIItemBase[]} interdiff.deletedItems
   * @returns {calIItemBase[]} interdiff.addedItems
   * @returns {calIItemBase[]} interdiff.modifiedItems
   */
  interDiff(oldItems, newItems) {
    const addedItems = [];
    const modifiedItems = [];

    const initialItems = new Map(oldItems.map(item => [item.hashId, item]));
    for (const item of newItems) {
      if (initialItems.has(item.hashId)) {
        modifiedItems.push(item);
      } else {
        addedItems.push(item);
      }
      initialItems.delete(item.hashId);
    }
    const deletedItems = [...initialItems.values()];
    return { deletedItems, addedItems, modifiedItems };
  },

  /**
   * Checks if an item is supported by a Calendar.
   *
   * @param {calICalendar} aCalendar - The calendar to check.
   * @param {calIItemBase} aItem - The item; either a task or an event.
   * @returns {boolean} true if supported.
   */
  isItemSupported(aItem, aCalendar) {
    if (aItem.isTodo()) {
      return aCalendar.getProperty("capabilities.tasks.supported") !== false;
    } else if (aItem.isEvent()) {
      return aCalendar.getProperty("capabilities.events.supported") !== false;
    }
    return false;
  },

  /*
   * Checks whether a calendar supports events
   *
   * @param {calICalendar} aCalendar
   */
  isEventCalendar(aCalendar) {
    return aCalendar.getProperty("capabilities.events.supported") !== false;
  },

  /*
   * Checks whether a calendar supports tasks
   *
   * @param aCalendar
   */
  isTaskCalendar(aCalendar) {
    return aCalendar.getProperty("capabilities.tasks.supported") !== false;
  },

  /**
   * Checks whether the passed item fits into the demanded range.
   *
   * @param calendarItem               the item
   * @param rangeStart         (inclusive) range start or null (open range)
   * @param rangeStart         (exclusive) range end or null (open range)
   * @param returnDtstartOrDue returns item's start (or due) date in case
   *                           the item is in the specified Range; null otherwise.
   */
  checkIfInRange(calendarItem, rangeStart, rangeEnd, returnDtstartOrDue) {
    let startDate;
    let endDate;
    const queryStart = dtz.ensureDateTime(rangeStart);
    if (calendarItem.isEvent()) {
      startDate = calendarItem.startDate;
      if (!startDate) {
        // DTSTART mandatory
        // xxx todo: should we assert this case?
        return null;
      }
      endDate = calendarItem.endDate || startDate;
    } else {
      let dueDate = calendarItem.dueDate;
      startDate = calendarItem.entryDate || dueDate;
      if (!calendarItem.entryDate) {
        if (returnDtstartOrDue) {
          // DTSTART or DUE mandatory
          return null;
        }
        // 3.6.2. To-do Component
        // A "VTODO" calendar component without the "DTSTART" and "DUE" (or
        // "DURATION") properties specifies a to-do that will be associated
        // with each successive calendar date, until it is completed.
        const completedDate = dtz.ensureDateTime(calendarItem.completedDate);
        dueDate = dtz.ensureDateTime(dueDate);
        return (
          !completedDate ||
          !queryStart ||
          completedDate.compare(queryStart) > 0 ||
          (dueDate && dueDate.compare(queryStart) >= 0)
        );
      }
      endDate = dueDate || startDate;
    }

    const start = dtz.ensureDateTime(startDate);
    const end = dtz.ensureDateTime(endDate);
    const queryEnd = dtz.ensureDateTime(rangeEnd);

    if (start.compare(end) == 0) {
      if (
        (!queryStart || start.compare(queryStart) >= 0) &&
        (!queryEnd || start.compare(queryEnd) < 0)
      ) {
        return startDate;
      }
    } else if (
      (!queryEnd || start.compare(queryEnd) < 0) &&
      (!queryStart || end.compare(queryStart) > 0)
    ) {
      return startDate;
    }
    return null;
  },

  setItemProperty(calendarItem, propertyName, aValue, aCapability) {
    const isSupported =
      calendarItem.calendar.getProperty("capabilities." + aCapability + ".supported") !== false;
    const value = aCapability && !isSupported ? null : aValue;

    switch (propertyName) {
      case "startDate":
        if (
          (value.isDate && !calendarItem.startDate.isDate) ||
          (!value.isDate && calendarItem.startDate.isDate) ||
          !data.compareObjects(value.timezone, calendarItem.startDate.timezone) ||
          value.compare(calendarItem.startDate) != 0
        ) {
          calendarItem.startDate = value;
        }
        break;
      case "endDate":
        if (
          (value.isDate && !calendarItem.endDate.isDate) ||
          (!value.isDate && calendarItem.endDate.isDate) ||
          !data.compareObjects(value.timezone, calendarItem.endDate.timezone) ||
          value.compare(calendarItem.endDate) != 0
        ) {
          calendarItem.endDate = value;
        }
        break;
      case "entryDate":
        if (value == calendarItem.entryDate) {
          break;
        }
        if (
          (value && !calendarItem.entryDate) ||
          (!value && calendarItem.entryDate) ||
          value.isDate != calendarItem.entryDate.isDate ||
          !data.compareObjects(value.timezone, calendarItem.entryDate.timezone) ||
          value.compare(calendarItem.entryDate) != 0
        ) {
          calendarItem.entryDate = value;
        }
        break;
      case "dueDate":
        if (value == calendarItem.dueDate) {
          break;
        }
        if (
          (value && !calendarItem.dueDate) ||
          (!value && calendarItem.dueDate) ||
          value.isDate != calendarItem.dueDate.isDate ||
          !data.compareObjects(value.timezone, calendarItem.dueDate.timezone) ||
          value.compare(calendarItem.dueDate) != 0
        ) {
          calendarItem.dueDate = value;
        }
        break;
      case "isCompleted":
        if (value != calendarItem.isCompleted) {
          calendarItem.isCompleted = value;
        }
        break;
      case "PERCENT-COMPLETE": {
        let perc = parseInt(calendarItem.getProperty(propertyName), 10);
        if (isNaN(perc)) {
          perc = 0;
        }
        if (perc != value) {
          calendarItem.setProperty(propertyName, value);
        }
        break;
      }
      case "title":
        if (value != calendarItem.title) {
          calendarItem.title = value;
        }
        break;
      default:
        if (!value || value == "") {
          calendarItem.deleteProperty(propertyName);
        } else if (calendarItem.getProperty(propertyName) != value) {
          calendarItem.setProperty(propertyName, value);
        }
        break;
    }
  },

  /**
   * Returns the default transparency to apply for an event depending on whether its an all-day event
   *
   * @param aIsAllDay      If true, the default transparency for all-day events is returned
   */
  getEventDefaultTransparency(aIsAllDay) {
    let transp = null;
    if (aIsAllDay) {
      transp = Services.prefs.getBoolPref(
        "calendar.events.defaultTransparency.allday.transparent",
        false
      )
        ? "TRANSPARENT"
        : "OPAQUE";
    } else {
      transp = Services.prefs.getBoolPref(
        "calendar.events.defaultTransparency.standard.transparent",
        false
      )
        ? "TRANSPARENT"
        : "OPAQUE";
    }
    return transp;
  },

  /**
     * Compare two items by *content*, leaving out any revision information such as
     * X-MOZ-GENERATION, SEQUENCE, DTSTAMP, LAST-MODIFIED.

     * The format for the parameters to ignore object is:
     * { "PROPERTY-NAME": ["PARAM-NAME", ...] }
     *
     * If aIgnoreProps is not passed, these properties are ignored:
     *  X-MOZ-GENERATION, SEQUENCE, DTSTAMP, LAST-MODIFIED, X-MOZ-SEND-INVITATIONS
     *
     * If aIgnoreParams is not passed, these parameters are ignored:
     *  ATTENDEE: CN
     *  ORGANIZER: CN
     *
     * @param aFirstItem        The item to compare.
     * @param aSecondItem       The item to compare to.
     * @param aIgnoreProps      (optional) An array of parameters to ignore.
     * @param aIgnoreParams     (optional) An object describing which parameters to
     *                                     ignore.
     * @returns True, if items match.
     */
  compareContent(aFirstItem, aSecondItem, aIgnoreProps, aIgnoreParams) {
    const ignoreProps = arr2hash(
      aIgnoreProps || [
        "SEQUENCE",
        "DTSTAMP",
        "LAST-MODIFIED",
        "X-MOZ-GENERATION",
        "X-MICROSOFT-DISALLOW-COUNTER",
        "X-MOZ-SEND-INVITATIONS",
        "X-MOZ-SEND-INVITATIONS-UNDISCLOSED",
      ]
    );

    const ignoreParams = aIgnoreParams || { ATTENDEE: ["CN"], ORGANIZER: ["CN"] };
    for (const x in ignoreParams) {
      ignoreParams[x] = arr2hash(ignoreParams[x]);
    }

    function arr2hash(arr) {
      const hash = {};
      for (const x of arr) {
        hash[x] = true;
      }
      return hash;
    }

    // This doesn't have to be super correct rfc5545, it just needs to be
    // in the same order
    function normalizeComponent(comp) {
      let props = [];
      for (const prop of iterate.icalProperty(comp)) {
        if (!(prop.propertyName in ignoreProps)) {
          props.push(normalizeProperty(prop));
        }
      }
      props = props.sort();

      let comps = [];
      for (const subcomp of iterate.icalSubcomponent(comp)) {
        comps.push(normalizeComponent(subcomp));
      }
      comps = comps.sort();

      return comp.componentType + props.join("\r\n") + comps.join("\r\n");
    }

    function normalizeProperty(prop) {
      const params = [...iterate.icalParameter(prop)]
        .filter(
          ([k, v]) =>
            !(prop.propertyName in ignoreParams) || !(k in ignoreParams[prop.propertyName])
        )
        .map(([k, v]) => k + "=" + v)
        .sort();

      return prop.propertyName + ";" + params.join(";") + ":" + prop.valueAsIcalString;
    }

    return (
      normalizeComponent(aFirstItem.icalComponent) == normalizeComponent(aSecondItem.icalComponent)
    );
  },

  /**
   * Shifts an item by the given timely offset.
   *
   * @param calendarItem an item
   * @param offset an offset (calIDuration)
   */
  shiftOffset(calendarItem, offset) {
    // When modifying dates explicitly using the setters is important
    // since those may triggers e.g. calIRecurrenceInfo::onStartDateChange
    // or invalidate other properties. Moreover don't modify the date-time objects
    // without cloning, because changes cannot be calculated if doing so.
    if (calendarItem.isEvent()) {
      let date = calendarItem.startDate.clone();
      date.addDuration(offset);
      calendarItem.startDate = date;
      date = calendarItem.endDate.clone();
      date.addDuration(offset);
      calendarItem.endDate = date;
    } else {
      /* isToDo */
      if (calendarItem.entryDate) {
        const date = calendarItem.entryDate.clone();
        date.addDuration(offset);
        calendarItem.entryDate = date;
      }
      if (calendarItem.dueDate) {
        const date = calendarItem.dueDate.clone();
        date.addDuration(offset);
        calendarItem.dueDate = date;
      }
    }
  },

  /**
   * moves an item to another startDate
   *
   * @param aOldItem             The Item to be modified
   * @param aNewDate             The date at which the new item is going to start
   * @returns The modified item
   */
  moveToDate(aOldItem, aNewDate) {
    const newItem = aOldItem.clone();
    const start = (
      aOldItem[dtz.startDateProp(aOldItem)] || aOldItem[dtz.endDateProp(aOldItem)]
    ).clone();
    const isDate = start.isDate;
    start.resetTo(
      aNewDate.year,
      aNewDate.month,
      aNewDate.day,
      start.hour,
      start.minute,
      start.second,
      start.timezone
    );
    start.isDate = isDate;
    if (newItem[dtz.startDateProp(newItem)]) {
      newItem[dtz.startDateProp(newItem)] = start;
      const oldDuration = aOldItem.duration;
      if (oldDuration) {
        const oldEnd = aOldItem[dtz.endDateProp(aOldItem)];
        let newEnd = start.clone();
        newEnd.addDuration(oldDuration);
        newEnd = newEnd.getInTimezone(oldEnd.timezone);
        newItem[dtz.endDateProp(newItem)] = newEnd;
      }
    } else if (newItem[dtz.endDateProp(newItem)]) {
      newItem[dtz.endDateProp(newItem)] = start;
    }
    return newItem;
  },

  /**
   * Shortcut function to serialize an item (including all overridden items).
   */
  serialize(aItem) {
    const serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
      Ci.calIIcsSerializer
    );
    serializer.addItems([aItem]);
    return serializer.serializeToString();
  },

  /**
   * Centralized functions for accessing prodid and version
   */
  get productId() {
    return "-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN";
  },
  get productVersion() {
    return "2.0";
  },

  /**
   * This is a centralized function for setting the prodid and version on an
   * ical component.  This should be used whenever you need to set the prodid
   * and version on a calIcalComponent object.
   *
   * @param aIcalComponent        The ical component to set the prodid and
   *                                version on.
   */
  setStaticProps(aIcalComponent) {
    // Throw for an invalid parameter
    if (!aIcalComponent) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }
    // Set the prodid and version
    aIcalComponent.prodid = item.productId;
    aIcalComponent.version = item.productVersion;
  },

  /**
   * Search for already open item dialog.
   *
   * @param aItem     The item of the dialog to search for.
   */
  findWindow(aItem) {
    // check for existing dialog windows
    for (const dlg of Services.wm.getEnumerator("Calendar:EventDialog")) {
      if (
        dlg.arguments[0] &&
        dlg.arguments[0].mode == "modify" &&
        dlg.arguments[0].calendarEvent &&
        dlg.arguments[0].calendarEvent.hashId == aItem.hashId
      ) {
        return dlg;
      }
    }
    // check for existing summary windows
    for (const dlg of Services.wm.getEnumerator("Calendar:EventSummaryDialog")) {
      if (dlg.calendarItem && dlg.calendarItem.hashId == aItem.hashId) {
        return dlg;
      }
    }
    return null;
  },

  /**
   * sets the 'isDate' property of an item
   *
   * @param aItem         The Item to be modified
   * @param aIsDate       True or false indicating the new value of 'isDate'
   * @returns The modified item
   */
  setToAllDay(aItem, aIsDate) {
    let start = aItem[dtz.startDateProp(aItem)];
    let end = aItem[dtz.endDateProp(aItem)];
    if (start || end) {
      const calendarItem = aItem.clone();
      if (start && start.isDate != aIsDate) {
        start = start.clone();
        start.isDate = aIsDate;
        calendarItem[dtz.startDateProp(calendarItem)] = start;
      }
      if (end && end.isDate != aIsDate) {
        end = end.clone();
        end.isDate = aIsDate;
        calendarItem[dtz.endDateProp(calendarItem)] = end;
      }
      return calendarItem;
    }
    return aItem;
  },

  /**
   * This function return the progress state of a task:
   * completed, overdue, duetoday, inprogress, future
   *
   * @param aTask     The task to check.
   * @returns The progress atom.
   */
  getProgressAtom(aTask) {
    const nowdate = new Date();

    if (aTask.recurrenceInfo) {
      return "repeating";
    }

    if (aTask.isCompleted) {
      return "completed";
    }

    if (aTask.dueDate && aTask.dueDate.isValid) {
      if (dtz.dateTimeToJsDate(aTask.dueDate).getTime() < nowdate.getTime()) {
        return "overdue";
      } else if (
        aTask.dueDate.year == nowdate.getFullYear() &&
        aTask.dueDate.month == nowdate.getMonth() &&
        aTask.dueDate.day == nowdate.getDate()
      ) {
        return "duetoday";
      }
    }

    if (
      aTask.entryDate &&
      aTask.entryDate.isValid &&
      dtz.dateTimeToJsDate(aTask.entryDate).getTime() < nowdate.getTime()
    ) {
      return "inprogress";
    }

    return "future";
  },
};
