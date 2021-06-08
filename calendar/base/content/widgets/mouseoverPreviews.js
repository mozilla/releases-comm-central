/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Code which generates event and task (todo) preview tooltips/titletips
 *  when the mouse hovers over either the event list, the task list, or
 *  an event or task box in one of the grid views.
 *
 *   (Portions of this code were previously in calendar.js and unifinder.js,
 *   some of it duplicated.)
 */

/* exported onMouseOverItem, showToolTip, getPreviewForItem,
             getEventStatusString, getToDoStatusString */

/* import-globals-from ../calendar-ui-utils.js */

/**
 * PUBLIC: This changes the mouseover preview based on the start and end dates
 * of an occurrence of a (one-time or recurring) calEvent or calToDo.
 * Used by all grid views.
 */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * PUBLIC: Displays a tooltip with details when hovering over an item in the views
 *
 * @param   {DOMEvent} occurrenceBoxMouseEvent  the triggering event
 * @returns {boolean}                           true, if the tooltip is displayed
 */
function onMouseOverItem(occurrenceBoxMouseEvent) {
  if ("occurrence" in occurrenceBoxMouseEvent.currentTarget) {
    // occurrence of repeating event or todo
    let occurrence = occurrenceBoxMouseEvent.currentTarget.occurrence;
    const toolTip = document.getElementById("itemTooltip");
    return showToolTip(toolTip, occurrence);
  }
  return false;
}

/**
 * PUBLIC: Displays a tooltip for a given item
 *
 * @param  {Node}               aTooltip  the node to hold the tooltip
 * @param  {CalIEvent|calIToDo} aItem     the item to create the tooltip for
 * @returns {boolean}                     true, if the tooltip is displayed
 */
function showToolTip(aToolTip, aItem) {
  if (aItem) {
    let holderBox = getPreviewForItem(aItem);
    if (holderBox) {
      while (aToolTip.lastChild) {
        aToolTip.lastChild.remove();
      }
      aToolTip.appendChild(holderBox);
      return true;
    }
  }
  return false;
}

/**
 * PUBLIC:  Called when a user hovers over a todo element and the text for the
 * mouse over is changed.
 *
 * @param {calIToDo} toDoItem    the item to create the preview for
 * @param {boolean}  aIsTooltip  enabled if used for tooltip composition (default)
 */
function getPreviewForItem(aItem, aIsTooltip = true) {
  if (aItem.isEvent()) {
    return getPreviewForEvent(aItem, aIsTooltip);
  } else if (aItem.isTodo()) {
    return getPreviewForTask(aItem, aIsTooltip);
  }
  return null;
}

/**
 * PUBLIC: Returns the string for status (none), Tentative, Confirmed, or
 * Cancelled for a given event
 *
 * @param   {calIEvent} aEvent The event
 * @returns {String}           The string for the status property of the event
 */
function getEventStatusString(aEvent) {
  switch (aEvent.status) {
    // Event status value keywords are specified in RFC2445sec4.8.1.11
    case "TENTATIVE":
      return cal.l10n.getCalString("statusTentative");
    case "CONFIRMED":
      return cal.l10n.getCalString("statusConfirmed");
    case "CANCELLED":
      return cal.l10n.getCalString("eventStatusCancelled");
    default:
      return "";
  }
}

/**
 * PUBLIC: Returns the string for status (none), NeedsAction, InProcess,
 * Cancelled, orCompleted for a given ToDo
 *
 * @param   {calIToDo} aToDo   The ToDo
 * @returns {String}           The string for the status property of the event
 */
function getToDoStatusString(aToDo) {
  switch (aToDo.status) {
    // Todo status keywords are specified in RFC2445sec4.8.1.11
    case "NEEDS-ACTION":
      return cal.l10n.getCalString("statusNeedsAction");
    case "IN-PROCESS":
      return cal.l10n.getCalString("statusInProcess");
    case "CANCELLED":
      return cal.l10n.getCalString("todoStatusCancelled");
    case "COMPLETED":
      return cal.l10n.getCalString("statusCompleted");
    default:
      return "";
  }
}

/**
 * PRIVATE: Called when a user hovers over a todo element and the text for the
 * mouse overis changed.
 *
 * @param {calIToDo} toDoItem    the item to create the preview for
 * @param {boolean}  aIsTooltip  enabled if used for tooltip composition (default)
 */
function getPreviewForTask(toDoItem, aIsTooltip = true) {
  if (toDoItem) {
    const vbox = document.createXULElement("vbox");
    vbox.setAttribute("class", "tooltipBox");
    if (aIsTooltip) {
      // tooltip appears above or below pointer, so may have as little as
      // one half the screen height available (avoid top going off screen).
      vbox.maxHeight = Math.floor(screen.height / 2);
    } else {
      vbox.setAttribute("flex", "1");
    }
    boxInitializeHeaderTable(vbox);

    let hasHeader = false;

    if (toDoItem.title) {
      boxAppendLabeledText(vbox, "tooltipTitle", toDoItem.title);
      hasHeader = true;
    }

    let location = toDoItem.getProperty("LOCATION");
    if (location) {
      boxAppendLabeledText(vbox, "tooltipLocation", location);
      hasHeader = true;
    }

    // First try to get calendar name appearing in tooltip
    if (toDoItem.calendar.name) {
      let calendarNameString = toDoItem.calendar.name;
      boxAppendLabeledText(vbox, "tooltipCalName", calendarNameString);
    }

    if (toDoItem.entryDate && toDoItem.entryDate.isValid) {
      boxAppendLabeledDateTime(vbox, "tooltipStart", toDoItem.entryDate);
      hasHeader = true;
    }

    if (toDoItem.dueDate && toDoItem.dueDate.isValid) {
      boxAppendLabeledDateTime(vbox, "tooltipDue", toDoItem.dueDate);
      hasHeader = true;
    }

    if (toDoItem.priority && toDoItem.priority != 0) {
      let priorityInteger = parseInt(toDoItem.priority, 10);
      let priorityString;

      // These cut-offs should match calendar-event-dialog.js
      if (priorityInteger >= 1 && priorityInteger <= 4) {
        priorityString = cal.l10n.getCalString("highPriority");
      } else if (priorityInteger == 5) {
        priorityString = cal.l10n.getCalString("normalPriority");
      } else {
        priorityString = cal.l10n.getCalString("lowPriority");
      }
      boxAppendLabeledText(vbox, "tooltipPriority", priorityString);
      hasHeader = true;
    }

    if (toDoItem.status && toDoItem.status != "NONE") {
      let status = getToDoStatusString(toDoItem);
      boxAppendLabeledText(vbox, "tooltipStatus", status);
      hasHeader = true;
    }

    if (
      toDoItem.status != null &&
      toDoItem.percentComplete != 0 &&
      toDoItem.percentComplete != 100
    ) {
      boxAppendLabeledText(vbox, "tooltipPercent", String(toDoItem.percentComplete) + "%");
      hasHeader = true;
    } else if (toDoItem.percentComplete == 100) {
      if (toDoItem.completedDate == null) {
        boxAppendLabeledText(vbox, "tooltipPercent", "100%");
      } else {
        boxAppendLabeledDateTime(vbox, "tooltipCompleted", toDoItem.completedDate);
      }
      hasHeader = true;
    }

    let description = toDoItem.descriptionText;
    if (description) {
      // display wrapped description lines like body of message below headers
      if (hasHeader) {
        boxAppendBodySeparator(vbox);
      }
      boxAppendBody(vbox, description, aIsTooltip);
    }

    return vbox;
  }
  return null;
}

/**
 * PRIVATE: Called when mouse moves over a different, or  when mouse moves over
 * event in event list. The instStartDate is date of instance displayed at event
 * box (recurring or multiday events may be displayed by more than one event box
 * for different days), or null if should compute next instance from now.
 *
 * @param {calIEvent} aEvent       the item to create the preview for
 * @param {boolean}   aIsTooltip   enabled if used for tooltip composition (default)
 */
function getPreviewForEvent(aEvent, aIsTooltip = true) {
  let event = aEvent;
  const vbox = document.createXULElement("vbox");
  vbox.setAttribute("class", "tooltipBox");
  if (aIsTooltip) {
    // tooltip appears above or below pointer, so may have as little as
    // one half the screen height available (avoid top going off screen).
    vbox.maxHeight = Math.floor(screen.height / 2);
  } else {
    vbox.setAttribute("flex", "1");
  }
  boxInitializeHeaderTable(vbox);

  if (event) {
    if (event.title) {
      boxAppendLabeledText(vbox, "tooltipTitle", aEvent.title);
    }

    let location = event.getProperty("LOCATION");
    if (location) {
      boxAppendLabeledText(vbox, "tooltipLocation", location);
    }
    if (!(event.startDate && event.endDate)) {
      // Event may be recurrent event.   If no displayed instance specified,
      // use next instance, or previous instance if no next instance.
      event = getCurrentNextOrPreviousRecurrence(event);
    }
    boxAppendLabeledDateTimeInterval(vbox, "tooltipDate", event);

    // First try to get calendar name appearing in tooltip
    if (event.calendar.name) {
      let calendarNameString = event.calendar.name;
      boxAppendLabeledText(vbox, "tooltipCalName", calendarNameString);
    }

    if (event.status && event.status != "NONE") {
      let statusString = getEventStatusString(event);
      boxAppendLabeledText(vbox, "tooltipStatus", statusString);
    }

    if (event.organizer && event.getAttendees().length > 0) {
      let organizer = event.organizer;
      boxAppendLabeledText(vbox, "tooltipOrganizer", organizer);
    }

    let description = event.descriptionText;
    if (description) {
      boxAppendBodySeparator(vbox);
      // display wrapped description lines, like body of message below headers
      boxAppendBody(vbox, description, aIsTooltip);
    }
    return vbox;
  }
  return null;
}

/**
 * PRIVATE: Append a separator, a thin space between header and body.
 *
 * @param {Node}  vbox  box to which to append separator.
 */
function boxAppendBodySeparator(vbox) {
  const separator = document.createXULElement("separator");
  separator.setAttribute("class", "tooltipBodySeparator");
  vbox.appendChild(separator);
}

/**
 * PRIVATE: Append description to box for body text. Rendered as HTML.
 * Indentation and line breaks are preserved.
 *
 * @param {Node} box              Box to which to append the body.
 * @param {string} textString     Text of the body.
 * @param {boolean} aIsTooltip    True for "tooltip" and false for "conflict-dialog" case.
 */
function boxAppendBody(box, textString, aIsTooltip) {
  let type = aIsTooltip ? "description" : "vbox";
  let xulDescription = document.createXULElement(type);
  xulDescription.setAttribute("class", "tooltipBody");
  if (!aIsTooltip) {
    xulDescription.setAttribute("flex", "1");
  }
  let docFragment = cal.view.textToHtmlDocumentFragment(textString, document);
  xulDescription.appendChild(docFragment);
  box.appendChild(xulDescription);
}

/**
 * PRIVATE: Use dateFormatter to format date and time,
 * and to header table append a row containing localized Label: date.
 *
 * @param {Node}         box            The node to add the date label to
 * @param {String}       labelProperty  The label
 * @param {calIDateTime} date           The datetime object to format and add
 */
function boxAppendLabeledDateTime(box, labelProperty, date) {
  date = date.getInTimezone(cal.dtz.defaultTimezone);
  let formattedDateTime = cal.dtz.formatter.formatDateTime(date);
  boxAppendLabeledText(box, labelProperty, formattedDateTime);
}

/**
 * PRIVATE: Use dateFormatter to format date and time interval,
 * and to header table append a row containing localized Label: interval.
 *
 * @param box               contains header table.
 * @param labelProperty     name of property for localized field label.
 * @param item              the event or task
 */
function boxAppendLabeledDateTimeInterval(box, labelProperty, item) {
  let dateString = cal.dtz.formatter.formatItemInterval(item);
  boxAppendLabeledText(box, labelProperty, dateString);
}

/**
 * PRIVATE: create empty 2-column table for header fields, and append it to box.
 *
 * @param  {Node}  box  The node to create a column table for
 */
function boxInitializeHeaderTable(box) {
  let table = document.createElementNS("http://www.w3.org/1999/xhtml", "table");
  table.setAttribute("class", "tooltipHeaderTable");
  box.appendChild(table);
}

/**
 * PRIVATE: To headers table, append a row containing Label: value, where label
 * is localized text for labelProperty.
 *
 * @param box               box containing headers table
 * @param labelProperty     name of property for localized name of header
 * @param textString        value of header field.
 */
function boxAppendLabeledText(box, labelProperty, textString) {
  let labelText = cal.l10n.getCalString(labelProperty);
  let table = box.querySelector("table");
  let row = document.createElementNS("http://www.w3.org/1999/xhtml", "tr");

  row.appendChild(createTooltipHeaderLabel(labelText));
  row.appendChild(createTooltipHeaderDescription(textString));

  table.appendChild(row);
}

/**
 * PRIVATE: Creates an element for field label (for header table)
 *
 * @param   {String} text  The text to display in the node
 * @returns {Node}         The node
 */
function createTooltipHeaderLabel(text) {
  let labelCell = document.createElementNS("http://www.w3.org/1999/xhtml", "th");
  labelCell.setAttribute("class", "tooltipHeaderLabel");
  labelCell.textContent = text;
  return labelCell;
}

/**
 * PRIVATE: Creates an element for field value (for header table)
 *
 * @param   {String} text  The text to display in the node
 * @returns {Node}         The node
 */
function createTooltipHeaderDescription(text) {
  let descriptionCell = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
  descriptionCell.setAttribute("class", "tooltipHeaderDescription");
  descriptionCell.textContent = text;
  return descriptionCell;
}

/**
 * PRIVATE: If now is during an occurrence, return the occurrence. If now is
 * before an occurrence, return the next occurrence or otherwise the previous
 * occurrence.
 *
 * @param   {calIEvent}  calendarEvent   The text to display in the node
 * @returns {mixed}                      Returns a calIDateTime for the detected
 *                                        occurrence or calIEvent, if this is a
 *                                        non-recurring event
 */
function getCurrentNextOrPreviousRecurrence(calendarEvent) {
  if (!calendarEvent.recurrenceInfo) {
    return calendarEvent;
  }

  let dur = calendarEvent.duration.clone();
  dur.isNegative = true;

  // To find current event when now is during event, look for occurrence
  // starting duration ago.
  let probeTime = cal.dtz.now();
  probeTime.addDuration(dur);

  let occ = calendarEvent.recurrenceInfo.getNextOccurrence(probeTime);

  if (!occ) {
    let occs = calendarEvent.recurrenceInfo.getOccurrences(
      calendarEvent.startDate,
      probeTime,
      0,
      {}
    );
    occ = occs[occs.length - 1];
  }
  return occ;
}
