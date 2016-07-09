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

/* exported onMouseOverItem, showToolTip */

/** PUBLIC
 *
 *  This changes the mouseover preview based on the start and end dates
 *  of an occurrence of a (one-time or recurring) calEvent or calToDo.
 *  Used by all grid views.
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

function showToolTip(aToolTip, aItem) {
    if (aItem) {
        let holderBox;
        if (isEvent(aItem)) {
            holderBox = getPreviewForEvent(aItem);
        } else if (isToDo(aItem)) {
            holderBox = getPreviewForTask(aItem);
        }
        if (holderBox) {
            removeChildren(aToolTip);
            aToolTip.appendChild(holderBox);
            return true;
        }
    }
    return false;
}

/**
 *  Called when a user hovers over a todo element and the text for the mouse over is changed.
 */
function getPreviewForTask(toDoItem) {
    if (toDoItem) {
        const vbox = document.createElement("vbox");
        vbox.setAttribute("class", "tooltipBox");
        // tooltip appears above or below pointer, so may have as little as
        // one half the screen height available (avoid top going off screen).
        vbox.maxHeight = Math.floor(screen.height / 2);
        boxInitializeHeaderGrid(vbox);

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
                priorityString = calGetString("calendar", "highPriority"); // high priority
            } else if (priorityInteger == 5) {
                priorityString = calGetString("calendar", "normalPriority"); // normal priority
            } else {
                priorityString = calGetString("calendar", "lowPriority"); // low priority
            }
            boxAppendLabeledText(vbox, "tooltipPriority", priorityString);
            hasHeader = true;
        }

        if (toDoItem.status && toDoItem.status != "NONE") {
            let status = getToDoStatusString(toDoItem);
            boxAppendLabeledText(vbox, "tooltipStatus", status);
            hasHeader = true;
        }

        if (toDoItem.status != null && toDoItem.percentComplete != 0 && toDoItem.percentComplete != 100) {
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

        let description = toDoItem.getProperty("DESCRIPTION");
        if (description) {
            // display wrapped description lines like body of message below headers
            if (hasHeader) {
                boxAppendBodySeparator(vbox);
            }
            boxAppendBody(vbox, description);
        }

        return vbox;
    } else {
        return null;
    }
}

/**
 *  Called when mouse moves over a different, or
 *  when mouse moves over event in event list.
 *  The instStartDate is date of instance displayed at event box
 *  (recurring or multiday events may be displayed by more than one event box
 *  for different days), or null if should compute next instance from now.
 */
function getPreviewForEvent(aEvent) {
    let event = aEvent;
    const vbox = document.createElement("vbox");
    vbox.setAttribute("class", "tooltipBox");
    // tooltip appears above or below pointer, so may have as little as
    // one half the screen height available (avoid top going off screen).
    vbox.maxHeight = Math.floor(screen.height / 2);
    boxInitializeHeaderGrid(vbox);

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

        if (event.organizer && event.getAttendees({}).length > 0) {
            let organizer = event.organizer;
            boxAppendLabeledText(vbox, "tooltipOrganizer", organizer);
        }

        let description = event.getProperty("DESCRIPTION");
        if (description) {
            boxAppendBodySeparator(vbox);
            // display wrapped description lines, like body of message below headers
            boxAppendBody(vbox, description);
        }
        return vbox;
    } else {
        return null;
    }
}


/** String for event status: (none), Tentative, Confirmed, or Cancelled **/
function getEventStatusString(calendarEvent) {
    switch (calendarEvent.status) {
        // Event status value keywords are specified in RFC2445sec4.8.1.11
        case "TENTATIVE":
            return calGetString("calendar", "statusTentative");
        case "CONFIRMED":
            return calGetString("calendar", "statusConfirmed");
        case "CANCELLED":
            return calGetString("calendar", "eventStatusCancelled");
        default:
            return "";
    }
}

/** String for todo status: (none), NeedsAction, InProcess, Cancelled, or Completed **/
function getToDoStatusString(iCalToDo) {
    switch (iCalToDo.status) {
        // Todo status keywords are specified in RFC2445sec4.8.1.11
        case "NEEDS-ACTION":
            return calGetString("calendar", "statusNeedsAction");
        case "IN-PROCESS":
            return calGetString("calendar", "statusInProcess");
        case "CANCELLED":
            return calGetString("calendar", "todoStatusCancelled");
        case "COMPLETED":
            return calGetString("calendar", "statusCompleted");
        default:
            return "";
    }
}

/**
 * PRIVATE: Append a separator, a thin space between header and body.
 *
 * @param vbox      box to which to append separator.
 */
function boxAppendBodySeparator(vbox) {
    const separator = document.createElement("separator");
    separator.setAttribute("class", "tooltipBodySeparator");
    vbox.appendChild(separator);
}

/**
 * PRIVATE: Append description to box for body text.  Text may contain
 * paragraphs; line indent and line breaks will be preserved by CSS.
 * @param box           box to which to append body
 * @param textString    text of body
 */
function boxAppendBody(box, textString) {
    let textNode = document.createTextNode(textString);
    let xulDescription = document.createElement("description");
    xulDescription.setAttribute("class", "tooltipBody");
    xulDescription.appendChild(textNode);
    box.appendChild(xulDescription);
}

/**
 * PRIVATE: Use dateFormatter to format date and time,
 * and to header grid append a row containing localized Label: date.
 */
function boxAppendLabeledDateTime(box, labelProperty, date) {
    date = date.getInTimezone(calendarDefaultTimezone());
    let formattedDateTime = getDateFormatter().formatDateTime(date);
    boxAppendLabeledText(box, labelProperty, formattedDateTime);
}

/**
 * PRIVATE: Use dateFormatter to format date and time interval,
 * and to header grid append a row containing localized Label: interval.
 * @param box               contains header grid.
 * @param labelProperty     name of property for localized field label.
 * @param item              the event or task
 */
function boxAppendLabeledDateTimeInterval(box, labelProperty, item) {
    let dateString = getDateFormatter().formatItemInterval(item);
    boxAppendLabeledText(box, labelProperty, dateString);
}

/**
 * PRIVATE: create empty 2-column grid for header fields,
 * and append it to box.
 */
function boxInitializeHeaderGrid(box) {
    let grid = document.createElement("grid");
    grid.setAttribute("class", "tooltipHeaderGrid");
    let rows;
    {
        let columns = document.createElement("columns");
        {
            let labelColumn = document.createElement("column");
            labelColumn.setAttribute("class", "tooltipLabelColumn");
            columns.appendChild(labelColumn);
            let valueColumn = document.createElement("column");
            valueColumn.setAttribute("class", "tooltipValueColumn");
            columns.appendChild(valueColumn);
        }
        grid.appendChild(columns);
        rows = document.createElement("rows");
        grid.appendChild(rows);
    }
    box.appendChild(grid);
}

/**
 * PRIVATE: To headers grid, append a row containing Label: value,
 * where label is localized text for labelProperty.
 * @param box               box containing headers grid
 * @param labelProperty     name of property for localized name of header
 * @param textString        value of header field.
 */
function boxAppendLabeledText(box, labelProperty, textString) {
    let labelText = calGetString("calendar", labelProperty);
    let rows = box.getElementsByTagNameNS(box.namespaceURI, "rows")[0];
    let row = document.createElement("row");

    row.appendChild(createTooltipHeaderLabel(labelText));
    row.appendChild(createTooltipHeaderDescription(textString));

    rows.appendChild(row);
}

/** PRIVATE: create element for field label (for header grid). **/
function createTooltipHeaderLabel(text) {
    let label = document.createElement("label");
    label.setAttribute("class", "tooltipHeaderLabel");
    label.appendChild(document.createTextNode(text));
    return label;
}

/** PRIVATE: create element for field value (for header grid). **/
function createTooltipHeaderDescription(text) {
    let label = document.createElement("description");
    label.setAttribute("class", "tooltipHeaderDescription");
    label.appendChild(document.createTextNode(text));
    return label;
}

/**
 * If now is during an occurrence, return the occurrence.
 * Else if now is before an occurrence, return the next occurrence.
 * Otherwise return the previous occurrence.
 */
function getCurrentNextOrPreviousRecurrence(calendarEvent) {
    if (!calendarEvent.recurrenceInfo) {
        return calendarEvent;
    }

    let dur = calendarEvent.duration.clone();
    dur.isNegative = true;

    // To find current event when now is during event, look for occurrence
    // starting duration ago.
    let probeTime = now();
    probeTime.addDuration(dur);

    let occ = calendarEvent.recurrenceInfo.getNextOccurrence(probeTime);

    if (!occ) {
        let occs = calendarEvent.recurrenceInfo.getOccurrences(calendarEvent.startDate, probeTime, 0, {});
        occ = occs[occs.length - 1];
    }
    return occ;
}
