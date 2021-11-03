/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from widgets/mouseoverPreviews.js */
/* import-globals-from calendar-ui-utils.js */

/* global calendarNavigationBar, currentView, gCurrentMode, getSelectedCalendar,
   invokeEventDragSession, MozElements, MozXULElement, timeIndicator */

// Wrap in a block to prevent leaking to window scope.
{
  const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

  /**
   * The MozCalendarEventColumn widget used for displaying event boxes in one column per day.
   * It is used to make the week view layout in the calendar. It manages the layout of the
   * events given via add/deleteEvent.
   */
  class MozCalendarEventColumn extends MozXULElement {
    static get inheritedAttributes() {
      return {
        ".multiday-events-list": "context",
        ".timeIndicator": "orient",
        "calendar-event-box": "orient",
      };
    }
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <stack class="multiday-column-box-stack" flex="1">
            <box class="multiday-column-bg-box" flex="1"/>
            <html:ol class="multiday-events-list"></html:ol>
            <box class="timeIndicator" hidden="true"/>
            <box class="fgdragcontainer" flex="1">
              <box class="fgdragspacer">
                <spacer flex="1"/>
                <label class="fgdragbox-label fgdragbox-startlabel"/>
              </box>
              <box class="fgdragbox"/>
              <label class="fgdragbox-label fgdragbox-endlabel"/>
            </box>
          </stack>
          <calendar-event-box hidden="true"/>
        `)
      );
      this.bgbox = this.querySelector(".multiday-column-bg-box");
      this.eventsListElement = this.querySelector(".multiday-events-list");

      this.addEventListener("dblclick", event => {
        if (event.button != 0) {
          return;
        }

        if (this.calendarView.controller) {
          let newStart = this.getClickedDateTime(event);
          this.calendarView.controller.createNewEvent(null, newStart, null);
        }
      });

      this.addEventListener("click", event => {
        if (event.button != 0 && event.button != 2) {
          return;
        }

        if (event.button == 0 && !(event.ctrlKey || event.metaKey)) {
          this.calendarView.setSelectedItems([]);
          this.focus();
        } else if (event.button == 2) {
          let newStart = this.getClickedDateTime(event);
          this.calendarView.selectedDateTime = newStart;
        }
      });

      // Mouse down handler, in empty event column regions.  Starts sweeping out a new event.
      this.addEventListener("mousedown", event => {
        // Select this column.
        this.calendarView.selectedDay = this.mDate;

        // If the selected calendar is readOnly, we don't want any sweeping.
        let calendar = getSelectedCalendar();
        if (
          !cal.acl.isCalendarWritable(calendar) ||
          calendar.getProperty("capabilities.events.supported") === false
        ) {
          return;
        }

        // Only start sweeping out an event if the left button was clicked.
        if (event.button != 0) {
          return;
        }

        this.mDragState = {
          origColumn: this,
          dragType: "new",
          mouseOffset: 0,
          offset: null,
          shadows: null,
          limitStartMin: null,
          limitEndMin: null,
          jumpedColumns: 0,
        };

        // Snap interval: 15 minutes or 1 minute if modifier key is pressed.
        let snapIntMin =
          event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey ? 1 : 15;
        let interval = this.mPixPerMin * snapIntMin;

        if (this.getAttribute("orient") == "vertical") {
          this.mDragState.origLoc = event.screenY;
          this.mDragState.origMin =
            Math.floor((event.screenY - this.parentNode.screenY) / interval) * snapIntMin;
          this.mDragState.limitEndMin = this.mDragState.origMin;
          this.mDragState.limitStartMin = this.mDragState.origMin;
          this.fgboxes.dragspacer.setAttribute("height", this.mDragState.origMin * this.mPixPerMin);
        } else {
          this.mDragState.origLoc = event.screenX;
          this.mDragState.origMin =
            Math.floor((event.screenX - this.parentNode.screenX) / interval) * snapIntMin;
          this.fgboxes.dragspacer.setAttribute("width", this.mDragState.origMin * this.mPixPerMin);
        }

        document.calendarEventColumnDragging = this;

        window.addEventListener("mousemove", this.onEventSweepMouseMove);
        window.addEventListener("mouseup", this.onEventSweepMouseUp);
        window.addEventListener("keypress", this.onEventSweepKeypress);
      });

      // Fields.
      this.mPixPerMin = 0.6;

      this.mStartMin = 0;

      this.mEndMin = 24 * 60;

      this.mDayStartMin = 8 * 60;

      this.mDayEndMin = 17 * 60;

      /**
       * An internal collection of data for events.
       * @typedef {Object} EventData
       * @property {calItemBase} eventItem - The event item.
       * @property {Element} element - The displayed event in this column.
       * @property {boolean} selected - Whether the event is selected.
       * @property {boolean} needsUpdate - True whilst the eventItem has changed
       *   and we are still pending updating the 'element' property.
       */
      /**
       * Event data for all the events displayed in this column.
       * @type {Map<string, EventData} - A map from an event item's hashId to
       *   its data.
       */
      this.eventDataMap = new Map();

      this.mCalendarView = null;

      this.mDate = null;

      this.mTimezone = null;

      this.mDragState = null;

      this.mLayoutBatchCount = 0;

      // Since we'll often be getting many events in rapid succession, this
      // timer helps ensure that we don't re-compute the event map too many
      // times in a short interval, and therefore improves performance.
      this.mEventMapTimeout = null;

      // Whether the next added event should be created in the editing state.
      this.newEventNeedsEditing = false;
      // The hashId of the event we should set to editing in the next relayout.
      this.eventToEdit = null;

      this.mSelected = false;

      this.mFgboxes = null;

      this.mDayOff = false;

      this.mTimezone = cal.dtz.UTC;
      this.initializeAttributeInheritance();
    }

    // Properties.
    set pixelsPerMinute(val) {
      if (val <= 0.0) {
        val = 0.01;
      }
      if (val != this.mPixPerMin) {
        this.mPixPerMin = val;
        this.relayout();
      }
    }

    get pixelsPerMinute() {
      return this.mPixPerMin;
    }

    set selected(val) {
      this.mSelected = val;
      if (this.bgbox && this.bgbox.hasChildNodes()) {
        let child = this.bgbox.firstElementChild;
        while (child) {
          if (val) {
            child.setAttribute("selected", "true");
          } else {
            child.removeAttribute("selected");
          }
          child = child.nextElementSibling;
        }
      }
    }

    get selected() {
      return this.mSelected;
    }

    set date(val) {
      this.mDate = val;

      if (!cal.data.compareObjects(val.timezone, this.mTimezone)) {
        this.mTimezone = val.timezone;
        this.relayout();
      }
    }

    get date() {
      return this.mDate;
    }

    set calendarView(val) {
      this.mCalendarView = val;
    }

    get calendarView() {
      return this.mCalendarView;
    }

    get fgboxes() {
      if (this.mFgboxes == null) {
        this.mFgboxes = {
          box: this.querySelector(".fgdragcontainer"),
          dragbox: this.querySelector(".fgdragbox"),
          dragspacer: this.querySelector(".fgdragspacer"),
          startlabel: this.querySelector(".fgdragbox-startlabel"),
          endlabel: this.querySelector(".fgdragbox-endlabel"),
        };
      }
      return this.mFgboxes;
    }

    get timeIndicatorBox() {
      return this.querySelector(".timeIndicator");
    }

    get events() {
      return this.methods;
    }

    set dayOff(val) {
      this.mDayOff = val;
    }

    get dayOff() {
      return this.mDayOff;
    }

    /**
     * Set whether the calendar-event-box element for the given event item
     * should be displayed as selected or unselected.
     *
     * @param {calItemBase} eventItem - The event item.
     * @param {boolean} select - Whether to show the corresponding event element
     *   as selected.
     */
    selectEvent(eventItem, select) {
      let data = this.eventDataMap.get(eventItem.hashId);
      if (!data) {
        return;
      }
      data.selected = select;
      if (data.element) {
        // There is a small window between an event item being added and it
        // actually having an element. If it doesn't have an element yet, it
        // will be selected on its creation instead.
        data.element.selected = select;
      }
    }

    /**
     * Return the displayed calendar-event-box element for the given event item.
     *
     * @param {calItemBase} eventItem - The event item.
     *
     * @return {Element} - The corresponding element, or undefined if none.
     */
    findElementForEventItem(eventItem) {
      return this.eventDataMap.get(eventItem.hashId)?.element;
    }

    /**
     * Return all the event items that are displayed in this columns.
     *
     * @return {calItemBase[]} - An array of all the displayed event items.
     */
    getAllEventItems() {
      return Array.from(this.eventDataMap.values(), data => data.eventItem);
    }

    startLayoutBatchChange() {
      this.mLayoutBatchCount++;
    }

    endLayoutBatchChange() {
      this.mLayoutBatchCount--;
      if (this.mLayoutBatchCount == 0) {
        this.relayout();
      }
    }

    setAttribute(attr, val) {
      // this should be done using lookupMethod(), see bug 286629
      let ret = super.setAttribute(attr, val);

      if (attr == "orient" && this.getAttribute("orient") != val) {
        this.relayout();
      }

      return ret;
    }

    /**
     * This function returns the start and end minutes of the occurrence
     * part in the day of this column, moreover, the real start and end
     * minutes of the whole occurrence (which could span multiple days)
     * relative to the time 0:00 of the day in this column.
     *
     * @param {Object}   - occurrence which contains details of the dates of the event.
     *
     * @returns {Object} - object with starting and ending times of the event in the minutes.
     */
    getStartEndMinutesForOccurrence(occurrence) {
      let stdate = occurrence.startDate || occurrence.entryDate || occurrence.dueDate;
      let enddate = occurrence.endDate || occurrence.dueDate || occurrence.entryDate;

      if (!cal.data.compareObjects(stdate.timezone, this.mTimezone)) {
        stdate = stdate.getInTimezone(this.mTimezone);
      }

      if (!cal.data.compareObjects(enddate.timezone, this.mTimezone)) {
        enddate = enddate.getInTimezone(this.mTimezone);
      }

      let startHour = stdate.hour;
      let startMinute = stdate.minute;
      let endHour = enddate.hour;
      let endMinute = enddate.minute;

      // Handle cases where an event begins or ends on a day other than this.
      if (stdate.compare(this.mDate) == -1) {
        startHour = 0;
        startMinute = 0;
      }
      if (enddate.compare(this.mDate) == 1) {
        endHour = 24;
        endMinute = 0;
      }

      // For occurrences that span multiple days, we figure out the real
      // occurrence start and end minutes relative to the date of this
      // column and time 0:00.
      let durend = enddate.subtractDate(this.mDate);
      let durstart = stdate.subtractDate(this.mDate);
      // 'durend' is always positive, instead 'durstart' might be negative
      // if the event starts one or more days before the date of this column.
      let realStart = (durstart.days * 24 + durstart.hours) * 60 + durstart.minutes;
      realStart = durstart.isNegative ? -1 * realStart : realStart;
      let realEnd = (durend.days * 24 + durend.hours) * 60 + durend.minutes;

      return {
        start: startHour * 60 + startMinute,
        end: endHour * 60 + endMinute,
        realStart,
        realEnd,
      };
    }

    /**
     * Create or update a displayed calendar-event-box element for the given
     * event item.
     *
     * @param {calItemBase} eventItem - The event item to create or update an
     *   element for.
     */
    addEvent(eventItem) {
      let eventData = this.eventDataMap.get(eventItem.hashId);
      if (!eventData) {
        // New event with no pre-existing data.
        eventData = { selected: false };
        this.eventDataMap.set(eventItem.hashId, eventData);
      }
      eventData.needsUpdate = true;

      // We set the eventItem property here, the rest will be updated in
      // relayout().
      // NOTE: If we already have an event with the given hashId, then the
      // eventData.element will still refer to the previous display of the event
      // until we call relayout().
      eventData.eventItem = eventItem;

      if (this.mEventMapTimeout) {
        clearTimeout(this.mEventMapTimeout);
      }

      if (this.newEventNeedsEditing) {
        this.eventToEdit = eventItem.hashId;
        this.newEventNeedsEditing = false;
      }

      this.mEventMapTimeout = setTimeout(() => this.relayout(), 5);
    }

    /**
     * Remove the displayed calendar-event-box element for the given event item
     * from this column
     *
     * @param {calItemBase} eventItem - The event item to remove the element of.
     */
    deleteEvent(eventItem) {
      if (this.eventDataMap.delete(eventItem.hashId)) {
        this.relayout();
      }
    }

    _clearElements() {
      while (this.bgbox.hasChildNodes()) {
        this.bgbox.lastChild.remove();
      }
      while (this.eventsListElement.hasChildNodes()) {
        this.eventsListElement.lastChild.remove();
      }
    }

    /**
     * Clear the column of all events.
     */
    clear() {
      this._clearElements();
      this.eventDataMap.clear();
    }

    relayout() {
      if (this.mLayoutBatchCount > 0) {
        return;
      }
      this._clearElements();

      let orient = this.getAttribute("orient");
      this.bgbox.setAttribute("orient", orient);

      // 'bgbox' is used mainly for drawing the grid. At some point it may
      // also be used for all-day events.
      let configBox = this.querySelector("calendar-event-box");
      configBox.removeAttribute("hidden");
      let minSize = configBox.getOptimalMinSize();
      configBox.setAttribute("hidden", "true");
      // The minimum event duration in minutes that would give at least the
      // desired minSize in the layout.
      let minDuration = Math.ceil(minSize / this.mPixPerMin);

      let theMin = this.mStartMin;
      while (theMin < this.mEndMin) {
        let dur = theMin % 60;
        theMin += dur;
        if (dur == 0) {
          dur = 60;
        }

        let box = document.createXULElement("spacer");
        // We key off this in a CSS selector.
        box.setAttribute("orient", orient);
        box.setAttribute("class", "calendar-event-column-linebox");

        if (this.mSelected) {
          box.setAttribute("selected", "true");
        }
        if (this.mDayOff) {
          box.setAttribute("weekend", "true");
        }
        if (theMin < this.mDayStartMin || theMin >= this.mDayEndMin) {
          box.setAttribute("off-time", "true");
        }

        // Carry forth the day relation.
        box.setAttribute("relation", this.getAttribute("relation"));

        // Calculate duration pixel as the difference between
        // start pixel and end pixel to avoid rounding errors.
        let startPix = Math.round(theMin * this.mPixPerMin);
        let endPix = Math.round((theMin + dur) * this.mPixPerMin);
        let durPix = endPix - startPix;
        if (orient == "vertical") {
          box.setAttribute("height", durPix);
        } else {
          box.setAttribute("width", durPix);
        }

        this.bgbox.appendChild(box);
        theMin += 60;
      }

      // 'fgbox' is used for dragging events.
      this.fgboxes.box.setAttribute("orient", orient);
      this.querySelector(".fgdragspacer").setAttribute("orient", orient);

      let eventLayoutList = this.computeEventLayoutInfo(minDuration);

      for (let eventInfo of eventLayoutList) {
        // Set up a list item element to wrap the event.
        let item = eventInfo.item;
        let eventData = this.eventDataMap.get(item.hashId);
        let eventElement;
        if (eventData.needsUpdate) {
          // Create a new wrapper.
          eventElement = document.createElement("li");
          eventElement.classList.add("multiday-event-listitem");
        } else {
          // Re-use an existing event element. This was removed from the
          // eventsListElement in _clearElements, but we hold a reference to it
          // in the eventData. So we can re-add it in the new ordering and
          // change its dimensions.
          // Note that we store the calendar-event-box in the eventData, so we
          // grab its parent to get the wrapper list item.
          eventElement = eventData.element.parentNode;
        }

        // FIXME: offset and length should be in % of parent's dimension, so we
        // can avoid mPixPerMin.
        let offset = `${eventInfo.start * this.mPixPerMin}px`;
        let length = `${(eventInfo.end - eventInfo.start) * this.mPixPerMin}px`;
        let secondaryOffset = `${eventInfo.secondaryOffset * 100}%`;
        let secondaryLength = `${eventInfo.secondaryLength * 100}%`;
        if (orient == "vertical") {
          eventElement.style.height = length;
          eventElement.style.width = secondaryLength;
          eventElement.style.insetBlockStart = offset;
          eventElement.style.insetInlineStart = secondaryOffset;
        } else {
          eventElement.style.width = length;
          eventElement.style.height = secondaryLength;
          eventElement.style.insetInlineStart = offset;
          eventElement.style.insetBlockStart = secondaryOffset;
        }
        this.eventsListElement.appendChild(eventElement);

        if (!eventData.needsUpdate) {
          continue;
        }
        // Set up the event box.
        let eventBox = document.createXULElement("calendar-event-box");
        eventElement.appendChild(eventBox);
        eventBox.setAttribute(
          "context",
          this.getAttribute("item-context") || this.getAttribute("context")
        );

        // Set the gripBars visibility in the chunk. Keep it
        // hidden for tasks with only entry date OR due date.
        if ((item.entryDate || !item.dueDate) && (!item.entryDate || item.dueDate)) {
          let startGripVisible = !eventInfo.startClipped;
          let endGripVisible = !eventInfo.endClipped;
          if (startGripVisible && endGripVisible) {
            eventBox.setAttribute("gripBars", "both");
          } else if (endGripVisible) {
            eventBox.setAttribute("gripBars", "end");
          } else if (startGripVisible) {
            eventBox.setAttribute("gripBars", "start");
          }
        }
        eventBox.setAttribute("orient", orient);
        eventBox.calendarView = this.calendarView;
        eventBox.occurrence = item;
        eventBox.parentColumn = this;
        // An event item can technically be 'selected' between a call to
        // addEvent and this method (because of the setTimeout). E.g. clicking
        // the event in the unifinder tree will select the item through
        // selectEvent. If the element wasn't yet created in that method, we set
        // the selected status here as well.
        //
        // Similarly, if an event has the same hashId, we maintain its
        // selection.
        // NOTE: In this latter case we are relying on the fact that
        // eventData.element.selected is never out of sync with
        // eventData.selected.
        eventBox.selected = eventData.selected;
        eventData.element = eventBox;
        eventData.needsUpdate = false;
      }

      let boxToEdit = this.eventDataMap.get(this.eventToEdit)?.element;
      if (boxToEdit) {
        boxToEdit.startEditing();
      }
      this.eventToEdit = null;
    }

    /**
     * Layout information for displaying an event in the calendar column. The
     * calendar column has two dimensions: a primary-dimension, in minutes,
     * that runs from the start of the day to the end of the day; and a
     * secondary-dimension which runs from 0 to 1. This object describes how
     * an event can be placed on these axes.
     *
     * @typedef {Object} EventLayoutInfo
     * @property {calItemBase} item - The event item we want to display.
     * @property {number} start - The number of minutes from the start of this
     *   column's day to when the event should start.
     * @property {number} end - The number of minutes from the start of this
     *   column's day to when the event ends.
     * @property {boolean} [startClipped] - Whether the event technically starts
     *   on a previous day, which means that the 'start' had to be clipped to
     *   the start of the day.
     * @property {boolean} [endClipped] - Whether the event technically ends
     *   on a later day, which means that the 'end' had to be clipped to
     *   the end of the day.
     * @property {number} secondaryOffset - The position of the event on the
     *   secondary axis (between 0 and 1).
     * @property {number} secondaryLength - The length of the event on the
     *   secondary axis (between 0 and 1).
     */
    /**
     * Get an ordered list of events and their layout information. The list is
     * ordered relative to the event's layout.
     *
     * @param {number} minDuration - The minimum number of minutes that an event
     *   should be *shown* to last. This should be large enough to ensure that
     *   events are readable in the layout.
     *
     * @return {EventLayoutInfo[]} - An ordered list of event layout
     *   information.
     */
    computeEventLayoutInfo(minDuration) {
      if (!this.eventDataMap.size) {
        return [];
      }

      function sortByStart(aEventInfo, bEventInfo) {
        // If you pass in tasks without both entry and due dates, I will
        // kill you.
        let startComparison = aEventInfo.startDate.compare(bEventInfo.startDate);
        if (startComparison == 0) {
          // If the items start at the same time, return the longer one
          // first.
          return bEventInfo.endDate.compare(aEventInfo.endDate);
        }
        return startComparison;
      }

      // Construct the ordered list of EventLayoutInfo objects that we will
      // eventually return.
      // To begin, we construct the objects with a 'startDate' and 'endDate'
      // properties, as opposed to using minutes from the start of the day
      // because we want to sort the events relative to their absolute start
      // times.
      let eventList = Array.from(this.eventDataMap.values(), eventData => {
        let item = eventData.eventItem;
        let start = item.startDate || item.entryDate || item.dueDate;
        // Make sure the displayed start time is relative to the view's
        // timezone.
        start = start.getInTimezone(this.mTimezone);
        let end = item.endDate || item.dueDate || item.entryDate;
        end = end.getInTimezone(this.mTimezone);
        return { item, startDate: start, endDate: end };
      });
      eventList.sort(sortByStart);
      // After sorting, we now convert start and end date times to minutes from
      // the start of the day.
      // Any events that start or end on a different day are clipped to the
      // start/end minutes of this day instead.
      for (let eventInfo of eventList) {
        let start = eventInfo.startDate;
        let end = eventInfo.endDate;
        if (
          start.year == this.date.year &&
          start.month == this.date.month &&
          start.day == this.date.day
        ) {
          eventInfo.start = start.hour * 60 + start.minute;
        } else {
          eventInfo.start = 0;
          eventInfo.startClipped = true;
        }
        let minEnd = eventInfo.start + minDuration;
        if (
          end.year == this.date.year &&
          end.month == this.date.month &&
          end.day == this.date.day
        ) {
          eventInfo.end = Math.max(end.hour * 60 + end.minute, minEnd);
        } else {
          // NOTE: minEnd can overflow the end of the day.
          eventInfo.end = Math.max(24 * 60, minEnd);
          eventInfo.endClipped = true;
        }
      }

      // Some Events in the calendar column will overlap in time. When they do,
      // we want them to share the horizontal space (assuming the column is
      // vertical).
      //
      // To do this, we split the events into Blocks, each of which contains a
      // variable number of Columns, each of which contain non-overlapping
      // Events.
      //
      // Note that the end time of one event is equal to the start time of
      // another, we consider them non-overlapping.
      //
      // We choose each Block to form a continuous block of time in the
      // calendar column. Specifically, two Events are in the same Block if and
      // only if there exists some sequence of pairwise overlapping Events that
      // includes them both. This ensures that no Block will overlap another
      // Block, and each contains the least number of Events possible.
      //
      // Each Column will share the same horizontal width, and will be placed
      // adjacent to each other.
      //
      // Note that each Block may have a different number of Columns, and then
      // may not share a common factor, so the Columns may not line up in the
      // view.

      // All the event Blocks in this calendar column, ordered by their start
      // time. Each Block will be an array of Columns, which will in turn be an
      // array of Events.
      let allEventBlocks = [];
      // The current Block.
      let blockColumns = [];
      let blockEnd = eventList[0].end;

      for (let eventInfo of eventList) {
        let start = eventInfo.start;
        if (blockColumns.length && start >= blockEnd) {
          // There is a gap between this Event and the end of the Block. We also
          // know from the ordering of eventList that all other Events start at
          // the same time or later. So there are no more Events that can be
          // added to this Block. So we finish it and start a new one.
          allEventBlocks.push(blockColumns);
          blockColumns = [];
        }

        if (eventInfo.end > blockEnd) {
          blockEnd = eventInfo.end;
        }

        // Find the earliest Column that the Event fits in.
        let foundCol = false;
        for (let column of blockColumns) {
          // We know from the ordering of eventList that all Events already in a
          // Column have a start time that is equal to or earlier than this
          // Event's start time. Therefore, in order for this Event to not
          // overlap anything else in this Column, it must have a start time
          // that is later than or equal to the end time of the last Event in
          // this column.
          let colEnd = column[column.length - 1].end;
          if (start >= colEnd) {
            // It fits in this Column, so we push it to the end (preserving the
            // eventList ordering within the Column).
            column.push(eventInfo);
            foundCol = true;
            break;
          }
        }

        if (!foundCol) {
          // This Event doesn't fit in any column, so we create a new one.
          blockColumns.push([eventInfo]);
        }
      }
      if (blockColumns.length) {
        allEventBlocks.push(blockColumns);
      }

      for (let blockColumns of allEventBlocks) {
        let totalCols = blockColumns.length;
        for (let colIndex = 0; colIndex < totalCols; colIndex++) {
          for (let eventInfo of blockColumns[colIndex]) {
            if (eventInfo.processed) {
              // Already processed this Event in an earlier Column.
              continue;
            }
            let { start, end } = eventInfo;
            let colSpan = 1;
            // Currently, the Event is only contained in one Column. We want to
            // first try and stretch it across several continuous columns.
            // For this Event, we go through each later Column one by one and
            // see if there is a gap in it that it can fit in.
            // Note, we only look forward in the Columns because we already know
            // that we did not fit in the previous Columns.
            for (
              let neighbourColIndex = colIndex + 1;
              neighbourColIndex < totalCols;
              neighbourColIndex++
            ) {
              let neighbourColumn = blockColumns[neighbourColIndex];
              // Test if this Event overlaps any of the other Events in the
              // neighbouring Column.
              let overlapsCol = false;
              let indexInCol;
              for (indexInCol = 0; indexInCol < neighbourColumn.length; indexInCol++) {
                let otherEventInfo = neighbourColumn[indexInCol];
                if (end <= otherEventInfo.start) {
                  // The end of this Event is before or equal to the start of
                  // the other Event, so it cannot overlap.
                  // Moreover, the rest of the Events in this neighbouring
                  // Column have a later or equal start time, so we know that
                  // this Event cannot overlap any of them. So we can break
                  // early.
                  // We also know that indexInCol now points to the *first*
                  // Event in this neighbouring Column that starts after this
                  // Event.
                  break;
                } else if (start < otherEventInfo.end) {
                  // The end of this Event is after the start of the other
                  // Event, and the start of this Event is before the end of
                  // the other Event. So they must overlap.
                  overlapsCol = true;
                  break;
                }
              }
              if (overlapsCol) {
                // An Event must span continuously across Columns, so we must
                // break.
                break;
              }
              colSpan++;
              // Add this Event to the Column. Note that indexInCol points to
              // the *first* other Event that is later than this Event, or
              // points to the end of the Column. So we place ourselves there to
              // preserve the ordering.
              neighbourColumn.splice(indexInCol, 0, eventInfo);
            }
            eventInfo.processed = true;
            eventInfo.secondaryOffset = colIndex / totalCols;
            eventInfo.secondaryLength = colSpan / totalCols;
          }
        }
      }
      return eventList;
    }

    getShadowElements(start, end) {
      // 'start' and 'aEnd' are start and end minutes of the occurrence
      // from time 0:00 of the dragging column.
      let shadows = 1;
      let offset = 0;
      let startMin;
      if (start < 0) {
        shadows += Math.ceil(Math.abs(start) / this.mEndMin);
        offset = shadows - 1;
        let reminder = Math.abs(start) % this.mEndMin;
        startMin = this.mEndMin - (reminder ? reminder : this.mEndMin);
      } else {
        startMin = start;
      }
      shadows += Math.floor(end / this.mEndMin);

      // Return values needed to build the shadows while dragging.
      return {
        shadows, // Number of shadows.
        offset, // Offset first<->selected shadows.
        startMin, // First shadow start minute.
        endMin: end % this.mEndMin, // Last shadow end minute.
      };
    }

    firstLastShadowColumns(offset, shadows) {
      let firstCol = this; // eslint-disable-line consistent-this
      let lastCol = this; // eslint-disable-line consistent-this
      let firstIndex = offset == null ? this.mDragState.offset : offset;
      let lastIndex = firstIndex;
      while (firstCol.previousElementSibling && firstIndex > 0) {
        firstCol = firstCol.previousElementSibling;
        firstIndex--;
      }
      let lastShadow = shadows == null ? this.mDragState.shadows : shadows;
      while (lastCol.nextElementSibling && lastIndex < lastShadow - 1) {
        lastCol = lastCol.nextElementSibling;
        lastIndex++;
      }

      // Returns first and last column with shadows that are visible in the
      // week and the positions of these (visible) columns in the set of
      // columns shadows of the occurrence.
      return {
        firstCol,
        firstIndex,
        lastCol,
        lastIndex,
      };
    }

    updateShadowsBoxes(aStart, aEnd, aCurrentOffset, aCurrentShadows, aSizeattr) {
      let lateralColumns = this.firstLastShadowColumns(aCurrentOffset, aCurrentShadows);
      let firstCol = lateralColumns.firstCol;
      let firstIndex = lateralColumns.firstIndex;
      let lastCol = lateralColumns.lastCol;
      let lastIndex = lateralColumns.lastIndex;

      // Remove the first/last shadow when start/end time goes in the
      // next/previous day. This happens when current offset is different
      // from offset stored in mDragState.
      if (aCurrentOffset != null) {
        if (this.mDragState.offset > aCurrentOffset && firstCol.previousElementSibling) {
          firstCol.previousElementSibling.fgboxes.dragbox.removeAttribute("dragging");
          firstCol.previousElementSibling.fgboxes.box.removeAttribute("dragging");
        }
        let currentOffsetEndSide = aCurrentShadows - 1 - aCurrentOffset;
        if (
          this.mDragState.shadows - 1 - this.mDragState.offset > currentOffsetEndSide &&
          lastCol.nextElementSibling
        ) {
          lastCol.nextElementSibling.fgboxes.dragbox.removeAttribute("dragging");
          lastCol.nextElementSibling.fgboxes.box.removeAttribute("dragging");
        }
      }

      // Set shadow boxes size for every part of the occurrence.
      let firstShadowSize = (aCurrentShadows == 1 ? aEnd : this.mEndMin) - aStart;
      let column = firstCol;
      for (let i = firstIndex; column && i <= lastIndex; i++) {
        column.fgboxes.box.setAttribute("dragging", "true");
        column.fgboxes.dragbox.setAttribute("dragging", "true");
        if (i == 0) {
          // First shadow.
          column.fgboxes.dragspacer.setAttribute(aSizeattr, aStart * column.mPixPerMin);
          column.fgboxes.dragbox.setAttribute(aSizeattr, firstShadowSize * column.mPixPerMin);
        } else if (i == aCurrentShadows - 1) {
          // Last shadow.
          column.fgboxes.dragspacer.setAttribute(aSizeattr, 0);
          column.fgboxes.dragbox.setAttribute(aSizeattr, aEnd * column.mPixPerMin);
        } else {
          // An intermediate shadow (full day).
          column.fgboxes.dragspacer.setAttribute(aSizeattr, 0);
          column.fgboxes.dragbox.setAttribute(aSizeattr, this.mEndMin * column.mPixPerMin);
        }
        column = column.nextElementSibling;
      }
    }

    onEventSweepKeypress(event) {
      let col = document.calendarEventColumnDragging;
      if (col && event.key == "Escape") {
        window.removeEventListener("mousemove", col.onEventSweepMouseMove);
        window.removeEventListener("mouseup", col.onEventSweepMouseUp);
        window.removeEventListener("keypress", col.onEventSweepKeypress);

        let lateralColumns = col.firstLastShadowColumns();
        let column = lateralColumns.firstCol;
        let index = lateralColumns.firstIndex;
        while (column && index < col.mDragState.shadows) {
          column.fgboxes.dragbox.removeAttribute("dragging");
          column.fgboxes.box.removeAttribute("dragging");
          column = column.nextElementSibling;
          index++;
        }

        col.mDragState = null;
        document.calendarEventColumnDragging = null;
      }
    }

    clearMagicScroll() {
      if (this.mMagicScrollTimer) {
        clearTimeout(this.mMagicScrollTimer);
        this.mMagicScrollTimer = null;
      }
    }

    setupMagicScroll(event) {
      this.clearMagicScroll();

      // If we are at the bottom or top of the view (or left/right when
      // rotated), calculate the difference and start accelerating the
      // scrollbar.
      let diffStart, diffEnd;
      let orient = document.calendarEventColumnDragging.getAttribute("orient");
      let scrollbox = currentView().scrollbox;
      let boundingRect = scrollbox.getBoundingClientRect();
      if (orient == "vertical") {
        diffStart = event.clientY - boundingRect.y;
        diffEnd = boundingRect.y + boundingRect.height - event.clientY;
      } else {
        diffStart = event.clientX - boundingRect.x;
        diffEnd = boundingRect.x + boundingRect.width - event.clientX;
      }

      const SCROLLZONE = 55; // Size (pixels) of the top/bottom view where the scroll starts.
      const MAXTIMEOUT = 250; // Max and min time interval (ms) between.
      const MINTIMEOUT = 30; // two consecutive scrolls.
      const SCROLLBYHOUR = 0.33; // Part of hour to move for each scroll.
      let insideScrollZone = 0;
      let pxPerHr = event.target.mPixPerMin * 60;
      let scrollBy = Math.floor(pxPerHr * SCROLLBYHOUR);
      if (diffStart < SCROLLZONE) {
        insideScrollZone = SCROLLZONE - diffStart;
        scrollBy *= -1;
      } else if (diffEnd < SCROLLZONE) {
        insideScrollZone = SCROLLZONE - diffEnd;
      }

      if (insideScrollZone) {
        let timeout = MAXTIMEOUT - (insideScrollZone * (MAXTIMEOUT - MINTIMEOUT)) / SCROLLZONE;
        this.mMagicScrollTimer = setTimeout(() => {
          scrollbox.scrollBy(orient == "horizontal" && scrollBy, orient == "vertical" && scrollBy);
          this.onEventSweepMouseMove(event);
        }, timeout);
      }
    }

    // Event sweep handlers.
    onEventSweepMouseMove(event) {
      let col = document.calendarEventColumnDragging;
      if (!col) {
        return;
      }

      col.setupMagicScroll(event);

      let dragState = col.mDragState;

      let lateralColumns = col.firstLastShadowColumns();
      let firstCol = lateralColumns.firstCol;
      let firstIndex = lateralColumns.firstIndex;

      // If we leave the view, then stop our internal sweeping and start a
      // real drag session. Someday we need to fix the sweep to soely be a
      // drag session, no sweeping.
      let boundingRect = currentView().scrollbox.getBoundingClientRect();
      if (
        event.clientX < boundingRect.x ||
        event.clientX > boundingRect.x + boundingRect.width ||
        event.clientY < boundingRect.y ||
        event.clientY > boundingRect.y + boundingRect.height
      ) {
        // Remove the drag state.
        for (
          let column = firstCol, i = firstIndex;
          column && i < col.mDragState.shadows;
          column = column.nextElementSibling, i++
        ) {
          column.fgboxes.dragbox.removeAttribute("dragging");
          column.fgboxes.box.removeAttribute("dragging");
        }

        window.removeEventListener("mousemove", col.onEventSweepMouseMove);
        window.removeEventListener("mouseup", col.onEventSweepMouseUp);
        window.removeEventListener("keypress", col.onEventSweepKeypress);
        document.calendarEventColumnDragging = null;
        col.mDragState = null;

        let item = dragState.dragOccurrence;

        // The multiday view currently exhibits a less than optimal strategy
        // in terms of item selection. items don't get automatically selected
        // when clicked and dragged, as to differentiate inline editing from
        // the act of selecting an event. but the application internal drop
        // targets will ask for selected items in order to pull the data from
        // the packets. that's why we need to make sure at least the currently
        // dragged event is contained in the set of selected items.
        let selectedItems = this.getSelectedItems();
        if (!selectedItems.some(aItem => aItem.hashId == item.hashId)) {
          col.calendarView.setSelectedItems([event.ctrlKey ? item.parentItem : item]);
        }
        invokeEventDragSession(dragState.dragOccurrence, col);
        return;
      }

      col.fgboxes.box.setAttribute("dragging", "true");
      col.fgboxes.dragbox.setAttribute("dragging", "true");
      let minutesInDay = col.mEndMin - col.mStartMin;

      // Check if we need to jump a column.
      let jumpedColumns;
      let newcol = col.calendarView.findColumnForClientPoint(event.screenX, event.screenY);
      if (newcol && newcol != col) {
        // Find how many columns we are jumping by subtracting the dates.
        let dur = newcol.mDate.subtractDate(col.mDate);
        jumpedColumns = dur.days;
        jumpedColumns *= dur.isNegative ? -1 : 1;
        if (dragState.dragType == "modify-start") {
          // Prevent dragging the start date after the end date in a new column.
          if (dragState.limitEndMin - minutesInDay * jumpedColumns < 0) {
            return;
          }
          dragState.limitEndMin -= minutesInDay * jumpedColumns;
        } else if (dragState.dragType == "modify-end") {
          // Prevent dragging the end date before the start date in a new column.
          if (dragState.limitStartMin - minutesInDay * jumpedColumns > minutesInDay) {
            return;
          }
          dragState.limitStartMin -= minutesInDay * jumpedColumns;
        } else if (dragState.dragType == "new") {
          dragState.limitEndMin -= minutesInDay * jumpedColumns;
          dragState.limitStartMin -= minutesInDay * jumpedColumns;
          dragState.jumpedColumns += jumpedColumns;
        }
        // Kill our drag state.
        for (
          let column = firstCol, i = firstIndex;
          column && i < col.mDragState.shadows;
          column = column.nextElementSibling, i++
        ) {
          column.fgboxes.dragbox.removeAttribute("dragging");
          column.fgboxes.box.removeAttribute("dragging");
        }

        // Jump ship.
        newcol.acceptInProgressSweep(dragState);

        // Restart event handling.
        col.onEventSweepMouseMove(event);

        return;
      }

      let mousePos;
      let sizeattr;
      if (col.getAttribute("orient") == "vertical") {
        mousePos = event.screenY - col.parentNode.screenY;
        sizeattr = "height";
      } else {
        mousePos = event.screenX - col.parentNode.screenX;
        sizeattr = "width";
      }
      // Don't let mouse position go outside the window edges.
      let pos = Math.max(0, mousePos) - dragState.mouseOffset;

      // Snap interval: 15 minutes or 1 minute if modifier key is pressed.
      let snapIntMin = event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey ? 1 : 15;
      let interval = col.mPixPerMin * snapIntMin;
      let curmin = Math.floor(pos / interval) * snapIntMin;
      let deltamin = curmin - dragState.origMin;

      let shadowElements;
      if (dragState.dragType == "new") {
        // Extend deltamin in a linear way over the columns.
        deltamin += minutesInDay * dragState.jumpedColumns;
        if (deltamin < 0) {
          // Create a new event modifying the start. End time is fixed.
          shadowElements = {
            shadows: 1 - dragState.jumpedColumns,
            offset: 0,
            startMin: curmin,
            endMin: dragState.origMin,
          };
        } else {
          // Create a new event modifying the end. Start time is fixed.
          shadowElements = {
            shadows: dragState.jumpedColumns + 1,
            offset: dragState.jumpedColumns,
            startMin: dragState.origMin,
            endMin: curmin,
          };
        }
        dragState.startMin = shadowElements.startMin;
        dragState.endMin = shadowElements.endMin;
      } else if (dragState.dragType == "move") {
        // If we're moving, we modify startMin and endMin of the shadow.
        shadowElements = col.getShadowElements(
          dragState.origMinStart + deltamin,
          dragState.origMinEnd + deltamin
        );
        dragState.startMin = shadowElements.startMin;
        dragState.endMin = shadowElements.endMin;
        // Keep track of the last start position because it will help to
        // build the event at the end of the drag session.
        dragState.lastStart = dragState.origMinStart + deltamin;
      } else if (dragState.dragType == "modify-start") {
        // If we're modifying the start, the end time is fixed.
        shadowElements = col.getShadowElements(dragState.origMin + deltamin, dragState.limitEndMin);
        dragState.startMin = shadowElements.startMin;
        dragState.endMin = shadowElements.endMin;

        // But we need to not go past the end; if we hit
        // the end, then we'll clamp to the previous snap interval minute.
        if (dragState.startMin >= dragState.limitEndMin) {
          dragState.startMin =
            Math.ceil((dragState.limitEndMin - snapIntMin) / snapIntMin) * snapIntMin;
        }
      } else if (dragState.dragType == "modify-end") {
        // If we're modifying the end, the start time is fixed.
        shadowElements = col.getShadowElements(
          dragState.limitStartMin,
          dragState.origMin + deltamin
        );
        dragState.startMin = shadowElements.startMin;
        dragState.endMin = shadowElements.endMin;

        // But we need to not go past the start; if we hit
        // the start, then we'll clamp to the next snap interval minute.
        if (dragState.endMin <= dragState.limitStartMin) {
          dragState.endMin =
            Math.floor((dragState.limitStartMin + snapIntMin) / snapIntMin) * snapIntMin;
        }
      }
      let currentOffset = shadowElements.offset;
      let currentShadows = shadowElements.shadows;

      // Now we can update the shadow boxes position and size.
      col.updateShadowsBoxes(
        dragState.startMin,
        dragState.endMin,
        currentOffset,
        currentShadows,
        sizeattr
      );

      // Update the labels.
      lateralColumns = col.firstLastShadowColumns(currentOffset, currentShadows);
      col.updateDragLabels(lateralColumns.firstCol, lateralColumns.lastCol);

      col.mDragState.offset = currentOffset;
      col.mDragState.shadows = currentShadows;
    }

    onEventSweepMouseUp(event) {
      let col = document.calendarEventColumnDragging;
      if (!col) {
        return;
      }

      let dragState = col.mDragState;

      let lateralColumns = col.firstLastShadowColumns();
      let column = lateralColumns.firstCol;
      let index = lateralColumns.firstIndex;
      while (column && index < dragState.shadows) {
        column.fgboxes.dragbox.removeAttribute("dragging");
        column.fgboxes.box.removeAttribute("dragging");
        column = column.nextElementSibling;
        index++;
      }

      col.clearMagicScroll();

      window.removeEventListener("mousemove", col.onEventSweepMouseMove);
      window.removeEventListener("mouseup", col.onEventSweepMouseUp);
      window.removeEventListener("keypress", col.onEventSweepKeypress);

      // If the user didn't sweep out at least a few pixels, ignore
      // unless we're in a different column.
      if (dragState.origColumn == col) {
        let ignore = false;
        let orient = col.getAttribute("orient");
        let position = orient == "vertical" ? event.screenY : event.screenX;
        if (Math.abs(position - dragState.origLoc) < 3) {
          ignore = true;
        }

        if (ignore) {
          col.mDragState = null;
          return;
        }
      }

      let newStart;
      let newEnd;
      let startTZ;
      let endTZ;
      let dragDay = col.mDate;
      if (dragState.dragType != "new") {
        let oldStart =
          dragState.dragOccurrence.startDate ||
          dragState.dragOccurrence.entryDate ||
          dragState.dragOccurrence.dueDate;
        let oldEnd =
          dragState.dragOccurrence.endDate ||
          dragState.dragOccurrence.dueDate ||
          dragState.dragOccurrence.entryDate;
        newStart = oldStart.clone();
        newEnd = oldEnd.clone();

        // Our views are pegged to the default timezone.  If the event
        // isn't also in the timezone, we're going to need to do some
        // tweaking. We could just do this for every event but
        // getInTimezone is slow, so it's much better to only do this
        // when the timezones actually differ from the view's.
        if (col.mTimezone != newStart.timezone || col.mTimezone != newEnd.timezone) {
          startTZ = newStart.timezone;
          endTZ = newEnd.timezone;
          newStart = newStart.getInTimezone(col.calendarView.mTimezone);
          newEnd = newEnd.getInTimezone(col.calendarView.mTimezone);
        }
      }

      if (dragState.dragType == "modify-start") {
        newStart.resetTo(
          dragDay.year,
          dragDay.month,
          dragDay.day,
          0,
          dragState.startMin + col.mStartMin,
          0,
          newStart.timezone
        );
      } else if (dragState.dragType == "modify-end") {
        newEnd.resetTo(
          dragDay.year,
          dragDay.month,
          dragDay.day,
          0,
          dragState.endMin + col.mStartMin,
          0,
          newEnd.timezone
        );
      } else if (dragState.dragType == "new") {
        let startDay = dragState.origColumn.mDate;
        let draggedForward = dragDay.compare(startDay) > 0;
        newStart = draggedForward ? startDay.clone() : dragDay.clone();
        newEnd = draggedForward ? dragDay.clone() : startDay.clone();
        newStart.isDate = false;
        newEnd.isDate = false;
        newStart.resetTo(
          newStart.year,
          newStart.month,
          newStart.day,
          0,
          dragState.startMin + col.mStartMin,
          0,
          newStart.timezone
        );
        newEnd.resetTo(
          newEnd.year,
          newEnd.month,
          newEnd.day,
          0,
          dragState.endMin + col.mStartMin,
          0,
          newEnd.timezone
        );

        // Edit the event title on the first of the new event's occurrences
        // FIXME: This newEventNeedsEditing flag is read and unset in addEvent,
        // but this is only called after some delay: after the event creation
        // transaction completes. So there is a race between this creation and
        // other actions that call addEvent.
        // Bug 1710985 would be a way to address this: i.e. at this point we
        // immediately create an element that the user can type a title into
        // without creating a calendar item until they submit the title. Then
        // we won't need any special flag for addEvent.
        if (draggedForward) {
          dragState.origColumn.newEventNeedsEditing = true;
        } else {
          col.newEventNeedsEditing = true;
        }
      } else if (dragState.dragType == "move") {
        // Figure out the new date-times of the event by adding the duration
        // of the total movement (days and minutes) to the old dates.
        let duration = dragDay.subtractDate(dragState.origColumn.mDate);
        let minutes = dragState.lastStart - dragState.realStart;

        // Since both boxDate and beginMove are dates (note datetimes),
        // subtractDate will only give us a non-zero number of hours on
        // DST changes. While strictly speaking, subtractDate's behavior
        // is correct, we need to move the event a discrete number of
        // days here. There is no need for normalization here, since
        // addDuration does the job for us. Also note, the duration used
        // here is only used to move over multiple days. Moving on the
        // same day uses the minutes from the dragState.
        if (duration.hours == 23) {
          // Entering DST.
          duration.hours++;
        } else if (duration.hours == 1) {
          // Leaving DST.
          duration.hours--;
        }

        if (duration.isNegative) {
          // Adding negative minutes to a negative duration makes the
          // duration more positive, but we want more negative, and
          // vice versa.
          minutes *= -1;
        }
        duration.minutes = minutes;
        duration.normalize();

        newStart.addDuration(duration);
        newEnd.addDuration(duration);
      }

      // If we tweaked tzs, put times back in their original ones.
      if (startTZ) {
        newStart = newStart.getInTimezone(startTZ);
      }
      if (endTZ) {
        newEnd = newEnd.getInTimezone(endTZ);
      }

      if (dragState.dragType == "new") {
        // We won't pass a calendar, since the display calendar is the
        // composite anyway. createNewEvent() will use the selected
        // calendar.
        // TODO We might want to get rid of the extra displayCalendar
        // member.
        col.calendarView.controller.createNewEvent(null, newStart, newEnd);
      } else if (
        dragState.dragType == "move" ||
        dragState.dragType == "modify-start" ||
        dragState.dragType == "modify-end"
      ) {
        col.calendarView.controller.modifyOccurrence(dragState.dragOccurrence, newStart, newEnd);
      }
      document.calendarEventColumnDragging = null;
      col.mDragState = null;
    }

    // This is called by an event box when a grippy on either side is dragged,
    // or when the middle is pressed to drag the event to move it.  We create
    // the same type of view that we use to sweep out a new event, but we
    // initialize it based on the event's values and what type of dragging
    // we're doing.  In addition, we constrain things like not being able to
    // drag the end before the start and vice versa.
    startSweepingToModifyEvent(
      aEventBox,
      aOccurrence,
      aGrabbedElement,
      aMouseX,
      aMouseY,
      aSnapInt
    ) {
      if (
        !cal.acl.isCalendarWritable(aOccurrence.calendar) ||
        !cal.acl.userCanModifyItem(aOccurrence) ||
        (aOccurrence.calendar instanceof Ci.calISchedulingSupport &&
          aOccurrence.calendar.isInvitation(aOccurrence)) ||
        aOccurrence.calendar.getProperty("capabilities.events.supported") === false
      ) {
        return;
      }

      this.mDragState = {
        origColumn: this,
        dragOccurrence: aOccurrence,
        mouseOffset: 0,
        offset: null,
        shadows: null,
        limitStartMin: null,
        lastStart: 0,
        jumpedColumns: 0,
      };

      // Snap interval: 15 minutes or 1 minute if modifier key is pressed.
      let snapIntMin = aSnapInt || 15;
      let sizeattr;
      if (this.getAttribute("orient") == "vertical") {
        this.mDragState.origLoc = aMouseY;
        sizeattr = "height";
      } else {
        this.mDragState.origLoc = aMouseX;
        sizeattr = "width";
      }

      let mins = this.getStartEndMinutesForOccurrence(aOccurrence);

      // These are only used to compute durations or to compute UI
      // sizes, so offset by this.mStartMin for sanity here (at the
      // expense of possible insanity later).
      mins.start -= this.mStartMin;
      mins.end -= this.mStartMin;

      if (aGrabbedElement == "start") {
        this.mDragState.dragType = "modify-start";
        // We have to use "realEnd" as fixed end value.
        this.mDragState.limitEndMin = mins.realEnd;

        // Snap start.
        this.mDragState.origMin = Math.floor(mins.start / snapIntMin) * snapIntMin;

        // Show the shadows and drag labels when clicking on gripbars.
        let shadowElements = this.getShadowElements(
          this.mDragState.origMin,
          this.mDragState.limitEndMin
        );
        this.mDragState.startMin = shadowElements.startMin;
        this.mDragState.endMin = shadowElements.endMin;
        this.mDragState.shadows = shadowElements.shadows;
        this.mDragState.offset = shadowElements.offset;
        this.updateShadowsBoxes(
          this.mDragState.origMin,
          this.mDragState.endMin,
          0,
          this.mDragState.shadows,
          sizeattr
        );

        // Update drag labels.
        let lastCol = this.firstLastShadowColumns().lastCol;
        this.updateDragLabels(this, lastCol);
      } else if (aGrabbedElement == "end") {
        this.mDragState.dragType = "modify-end";
        // We have to use "realStart" as fixed end value.
        this.mDragState.limitStartMin = mins.realStart;

        // Snap end.
        this.mDragState.origMin = Math.floor(mins.end / snapIntMin) * snapIntMin;

        // Show the shadows and drag labels when clicking on gripbars.
        let shadowElements = this.getShadowElements(
          this.mDragState.limitStartMin,
          this.mDragState.origMin
        );
        this.mDragState.startMin = shadowElements.startMin;
        this.mDragState.endMin = shadowElements.endMin;
        this.mDragState.shadows = shadowElements.shadows;
        this.mDragState.offset = shadowElements.offset;
        this.updateShadowsBoxes(
          this.mDragState.startMin,
          this.mDragState.endMin,
          shadowElements.offset,
          this.mDragState.shadows,
          sizeattr
        );

        // Update drag labels.
        let firstCol = this.firstLastShadowColumns().firstCol;
        this.updateDragLabels(firstCol, this);
      } else if (aGrabbedElement == "middle") {
        this.mDragState.dragType = "move";
        // In a move, origMin will be the start minute of the element where
        // the drag occurs. Along with mouseOffset, it allows to track the
        // shadow position. origMinStart and origMinEnd allow to figure out
        // the real shadow size.
        // We snap to the start and add the real duration to find the end.
        let limitDurationMin = mins.realEnd - mins.realStart;
        this.mDragState.origMin = Math.floor(mins.start / snapIntMin) * snapIntMin;
        this.mDragState.origMinStart = Math.floor(mins.realStart / snapIntMin) * snapIntMin;
        this.mDragState.origMinEnd = this.mDragState.origMinStart + limitDurationMin;
        // Keep also track of the real Start, it will be used at the end
        // of the drag session to calculate the new start and end datetimes.
        this.mDragState.realStart = mins.realStart;

        let shadowElements = this.getShadowElements(
          this.mDragState.origMinStart,
          this.mDragState.origMinEnd
        );
        this.mDragState.shadows = shadowElements.shadows;
        this.mDragState.offset = shadowElements.offset;
        // We need to set a mouse offset, since we're not dragging from
        // one end of the element.
        if (aEventBox) {
          if (this.getAttribute("orient") == "vertical") {
            this.mDragState.mouseOffset = aMouseY - aEventBox.screenY;
          } else {
            this.mDragState.mouseOffset = aMouseX - aEventBox.screenX;
          }
        }
      } else {
        // Invalid grabbed element.
      }

      document.calendarEventColumnDragging = this;

      window.addEventListener("mousemove", this.onEventSweepMouseMove);
      window.addEventListener("mouseup", this.onEventSweepMouseUp);
      window.addEventListener("keypress", this.onEventSweepKeypress);
    }

    // Called by sibling columns to tell us to take over the sweeping
    // of an event.
    acceptInProgressSweep(dragState) {
      this.mDragState = dragState;
      document.calendarEventColumnDragging = this;

      this.fgboxes.box.setAttribute("dragging", "true");
      this.fgboxes.dragbox.setAttribute("dragging", "true");

      // The same event handlers are still valid,
      // because they use document.calendarEventColumnDragging.
      // So we really don't have anything to do here.
    }

    updateDragLabels(firstColumnUpdate, lastColumnUpdate) {
      if (!this.mDragState) {
        return;
      }

      let firstColumn = firstColumnUpdate || this;
      let lastColumn = lastColumnUpdate || this;
      let realstartmin = this.mDragState.startMin + this.mStartMin;
      let realendmin = this.mDragState.endMin + this.mStartMin;
      let starthr = Math.floor(realstartmin / 60);
      let startmin = realstartmin % 60;

      let endhr = Math.floor(realendmin / 60);
      let endmin = realendmin % 60;

      let formatter = cal.dtz.formatter;

      let jsTime = new Date();
      jsTime.setHours(starthr, startmin);
      let startstr = formatter.formatTime(cal.dtz.jsDateToDateTime(jsTime, cal.dtz.floating));
      jsTime.setHours(endhr, endmin);
      let endstr = formatter.formatTime(cal.dtz.jsDateToDateTime(jsTime, cal.dtz.floating));

      // Tasks without Entry or Due date have a string as first label
      // instead of the time.
      if (this.mDragState.dragOccurrence && this.mDragState.dragOccurrence.isTodo()) {
        if (!this.mDragState.dragOccurrence.dueDate) {
          startstr = cal.l10n.getCalString("dragLabelTasksWithOnlyEntryDate");
        } else if (!this.mDragState.dragOccurrence.entryDate) {
          startstr = cal.l10n.getCalString("dragLabelTasksWithOnlyDueDate");
        }
      }
      firstColumn.fgboxes.startlabel.setAttribute("value", startstr);
      lastColumn.fgboxes.endlabel.setAttribute("value", endstr);
    }

    setDayStartEndMinutes(dayStartMin, dayEndMin) {
      if (dayStartMin < this.mStartMin || dayStartMin > dayEndMin || dayEndMin > this.mEndMin) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }
      if (this.mDayStartMin != dayStartMin || this.mDayEndMin != dayEndMin) {
        this.mDayStartMin = dayStartMin;
        this.mDayEndMin = dayEndMin;
      }
    }

    getClickedDateTime(event) {
      let newStart = this.date.clone();
      newStart.isDate = false;
      newStart.hour = 0;

      const ROUND_INTERVAL = 15;

      let interval = this.mPixPerMin * ROUND_INTERVAL;
      let pos;
      if (this.getAttribute("orient") == "vertical") {
        pos = event.screenY - this.parentNode.screenY;
      } else {
        pos = event.screenX - this.parentNode.screenX;
      }
      newStart.minute = Math.round(pos / interval) * ROUND_INTERVAL + this.mStartMin;
      event.stopPropagation();
      return newStart;
    }
  }

  customElements.define("calendar-event-column", MozCalendarEventColumn);

  /**
   * Implements the Drag and Drop class for the Calendar Header Container.
   *
   * @extends {MozElements.CalendarDnDContainer}
   */
  class CalendarHeaderContainer extends MozElements.CalendarDnDContainer {
    constructor() {
      super();
      this.addEventListener("dblclick", this.onDblClick);
      this.addEventListener("mousedown", this.onMouseDown);
      this.addEventListener("click", this.onClick);
      this.addEventListener("wheel", this.onWheel);
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      // this.hasConnected is set to true in super.connectedCallback.
      super.connectedCallback();

      // Map from an event item's hashId to its calendar-editable-item.
      this.eventElements = new Map();

      this.eventsListElement = document.createElement("ol");
      this.eventsListElement.classList.add("allday-events-list");
      this.appendChild(this.eventsListElement);
    }

    get date() {
      return this.mDate;
    }

    set date(val) {
      this.mDate = val;
    }

    /**
     * Return the displayed calendar-editable-item element for the given event
     * item.
     *
     * @param {calItemBase} eventItem - The event item.
     *
     * @return {Element} - The corresponding element, or undefined if none.
     */
    findElementForEventItem(eventItem) {
      return this.eventElements.get(eventItem.hashId);
    }

    /**
     * Return all the event items that are displayed in this columns.
     *
     * @return {calItemBase[]} - An array of all the displayed event items.
     */
    getAllEventItems() {
      return Array.from(this.eventElements.values(), element => element.occurrence);
    }

    /**
     * Create or update a displayed calendar-editable-item element for the given
     * event item.
     *
     * @param {calItemBase} eventItem - The event item to create or update an
     *   element for.
     */
    addEvent(eventItem) {
      let existing = this.eventElements.get(eventItem.hashId);
      if (existing) {
        existing.remove();
      }

      let itemBox = document.createXULElement("calendar-editable-item");
      let listItemWrapper = document.createElement("li");
      listItemWrapper.classList.add("allday-event-listitem");
      listItemWrapper.appendChild(itemBox);
      cal.data.binaryInsertNode(
        this.eventsListElement,
        listItemWrapper,
        eventItem,
        cal.view.compareItems,
        false,
        wrapper => wrapper.firstChild.occurrence
      );

      itemBox.calendarView = this.calendarView;
      itemBox.occurrence = eventItem;
      let ctxt =
        this.calendarView.getAttribute("item-context") || this.calendarView.getAttribute("context");
      itemBox.setAttribute("context", ctxt);

      if (eventItem.hashId in this.calendarView.mFlashingEvents) {
        itemBox.setAttribute("flashing", "true");
      }

      this.eventElements.set(eventItem.hashId, itemBox);

      itemBox.parentBox = this;
    }

    /**
     * Remove the displayed calendar-editable-item element for the given event
     * item from this column
     *
     * @param {calItemBase} eventItem - The event item to remove the element of.
     */
    deleteEvent(eventItem) {
      let current = this.eventElements.get(eventItem.hashId);
      if (current) {
        // Need to remove the wrapper list item.
        current.parentNode.remove();
        this.eventElements.delete(eventItem.hashId);
      }
    }

    /**
     * Clear the header of all events.
     */
    clear() {
      this.eventElements.clear();
      while (this.eventsListElement.hasChildNodes()) {
        this.eventsListElement.lastChild.remove();
      }
    }

    /**
     * Set whether to show a drop shadow in the event list.
     *
     * @param {boolean} on - True to show the drop shadow, otherwise hides the
     *   drop shadow.
     */
    setDropShadow(on) {
      let existing = this.eventsListElement.querySelector(".dropshadow");
      if (on) {
        if (!existing) {
          // Insert an empty list item.
          let dropshadow = document.createElement("li");
          dropshadow.classList.add("dropshadow", "allday-event-listitem");
          this.eventsListElement.insertBefore(dropshadow, this.eventsListElement.firstElementChild);
        }
      } else if (existing) {
        existing.remove();
      }
    }

    onDropItem(aItem) {
      let newItem = cal.item.moveToDate(aItem, this.mDate);
      newItem = cal.item.setToAllDay(newItem, true);
      return newItem;
    }

    /**
     * Set whether the calendar-editable-item element for the given event item
     * should be displayed as selected or unselected.
     *
     * @param {calItemBase} eventItem - The event item.
     * @param {boolean} select - Whether to show the corresponding event element
     *   as selected.
     */
    selectEvent(eventItem, select) {
      let element = this.eventElements.get(eventItem.hashId);
      if (!element) {
        return;
      }
      element.selected = select;
    }

    onDblClick(event) {
      if (event.button == 0) {
        this.calendarView.controller.createNewEvent(null, this.mDate, null, true);
      }
    }

    onMouseDown(event) {
      this.calendarView.selectedDay = this.mDate;
    }

    onClick(event) {
      if (event.button == 0) {
        if (!(event.ctrlKey || event.metaKey)) {
          this.calendarView.setSelectedItems([]);
        }
      }
      if (event.button == 2) {
        let newStart = this.calendarView.selectedDay.clone();
        newStart.isDate = true;
        this.calendarView.selectedDateTime = newStart;
        event.stopPropagation();
      }
    }

    onWheel(event) {
      if (this.getAttribute("orient") == "vertical") {
        // In vertical view (normal), don't let the parent multiday view
        // handle the scrolling in its bubbling phase. The default action
        // will make the box scroll here.
        event.stopPropagation();
      }
    }
  }
  customElements.define("calendar-header-container", CalendarHeaderContainer);

  /**
   * The MozCalendarMonthDayBoxItem widget is used as event item in the
   * Day and Week views of the calendar. It displays the event name,
   * alarm icon and the category type color. It also displays the gripbar
   * components on hovering over the event. It is used to change the event
   * timings.
   *
   * @extends {MozElements.MozCalendarEditableItem}
   */
  class MozCalendarEventBox extends MozElements.MozCalendarEditableItem {
    static get inheritedAttributes() {
      return {
        ".alarm-icons-box": "flashing",
        ".calendar-event-box-grippy-top": "parentorient=orient",
        ".calendar-event-box-grippy-bottom": "parentorient=orient",
      };
    }
    constructor() {
      super();
      this.mParentColumn = null;
      this.addEventListener("mousedown", event => {
        if (event.button != 0) {
          return;
        }

        event.stopPropagation();

        if (this.mEditing) {
          return;
        }

        this.parentColumn.calendarView.selectedDay = this.parentColumn.mDate;
        this.mMouseX = event.screenX;
        this.mMouseY = event.screenY;

        let whichside = event.whichside;
        if (whichside) {
          this.calendarView.setSelectedItems([
            event.ctrlKey ? this.mOccurrence.parentItem : this.mOccurrence,
          ]);

          let snapIntMin =
            event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey ? 1 : 15;
          // Start edge resize drag
          this.parentColumn.startSweepingToModifyEvent(
            this,
            this.mOccurrence,
            whichside,
            event.screenX,
            event.screenY,
            snapIntMin
          );
        } else {
          // May be click or drag,
          // So wait for mousemove (or mouseout if fast) to start item move drag.
          this.mInMouseDown = true;
        }
      });

      this.addEventListener("mousemove", event => {
        if (!this.mInMouseDown) {
          return;
        }

        let deltaX = Math.abs(event.screenX - this.mMouseX);
        let deltaY = Math.abs(event.screenY - this.mMouseY);
        // More than a 3 pixel move?
        const movedMoreThan3Pixels = deltaX * deltaX + deltaY * deltaY > 9;
        if (movedMoreThan3Pixels && this.parentColumn) {
          this.startItemDrag();
        }
      });

      this.addEventListener("mouseout", event => {
        if (!this.mEditing && this.mInMouseDown && this.parentColumn) {
          this.startItemDrag();
        }
      });

      this.addEventListener("mouseup", event => {
        if (!this.mEditing) {
          this.mInMouseDown = false;
        }
      });

      this.addEventListener("mouseover", event => {
        if (this.calendarView && this.calendarView.controller) {
          event.stopPropagation();
          onMouseOverItem(event);
        }
      });

      // We have two event listeners for dragstart. This event listener is for the bubbling phase
      // where we are setting up the document.monthDragEvent which will be used in the event listener
      // in the capturing phase which is set up in the calendar-editable-item.
      this.addEventListener(
        "dragstart",
        event => {
          document.monthDragEvent = this;
        },
        true
      );
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <!-- NOTE: The following div is the same markup as EditableItem. -->
          <html:div class="calendar-item-grid">
            <html:div class="calendar-item-flex">
              <html:img class="item-type-icon" alt="" />
              <html:div class="event-name-label"></html:div>
              <html:input class="plain event-name-input"
                          hidden="hidden"
                          placeholder='${cal.l10n.getCalString("newEvent")}'/>
              <html:div class="alarm-icons-box"></html:div>
              <html:img class="item-classification-icon" />
            </html:div>
            <html:div class="location-desc"></html:div>
            <html:div class="calendar-category-box"></html:div>
          </html:div>
          <calendar-event-gripbar class="calendar-event-box-grippy-top"
                                  whichside="start">
          </calendar-event-gripbar>
          <calendar-event-gripbar class="calendar-event-box-grippy-bottom"
                                  whichside="end">
          </calendar-event-gripbar>
        `)
      );

      this.classList.add("calendar-color-box");

      this.style.pointerEvents = "auto";
      this.setAttribute("tooltip", "itemTooltip");

      if (!this.hasAttribute("orient")) {
        this.setAttribute("orient", "vertical");
      }
      this.addEventNameTextboxListener();
      this.initializeAttributeInheritance();
    }

    set parentColumn(val) {
      this.mParentColumn = val;
    }

    get parentColumn() {
      return this.mParentColumn;
    }

    getOptimalMinSize() {
      let label = this.querySelector(".event-name-label");
      if (this.getAttribute("orient") == "vertical") {
        let minHeight =
          getOptimalMinimumHeight(label) +
          getSummarizedStyleValues(label.parentNode, ["padding-bottom", "padding-top"]) +
          getSummarizedStyleValues(this, ["border-bottom-width", "border-top-width"]);
        this.setAttribute("minheight", minHeight);
        this.setAttribute("minwidth", "1");
        return minHeight;
      }
      label.style.minWidth = "2em";
      let minWidth = getOptimalMinimumWidth(this.eventNameLabel);
      this.setAttribute("minwidth", minWidth);
      this.setAttribute("minheight", "1");
      return minWidth;
    }

    startItemDrag() {
      if (this.editingTimer) {
        clearTimeout(this.editingTimer);
        this.editingTimer = null;
      }

      this.calendarView.setSelectedItems([this.mOccurrence]);

      this.mEditing = false;

      this.parentColumn.startSweepingToModifyEvent(
        this,
        this.mOccurrence,
        "middle",
        this.mMouseX,
        this.mMouseY
      );
      this.mInMouseDown = false;
    }
  }

  customElements.define("calendar-event-box", MozCalendarEventBox);

  /**
   * The time bar that displays time divisions to the side or top of a multiday (day or week) view.
   */
  class CalendarTimeBar extends MozXULElement {
    static get inheritedAttributes() {
      return {
        ".timebarboxstack": "orient,width,height",
        ".topbox": "orient,width,height",
        ".timeIndicator-timeBar": "orient",
      };
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      const stack = document.createXULElement("stack");
      const topbox = document.createXULElement("box");
      const indicator = document.createXULElement("box");

      stack.setAttribute("class", "timebarboxstack");
      stack.setAttribute("style", "display: block; position: relative;");
      stack.setAttribute("flex", "1");

      topbox.setAttribute("class", "topbox");
      topbox.setAttribute("flex", "1");

      indicator.setAttribute("class", "timeIndicator-timeBar");
      indicator.setAttribute("hidden", "true");

      stack.appendChild(topbox);
      stack.appendChild(indicator);
      this.appendChild(stack);

      this.initializeAttributeInheritance();

      this.mPixPerMin = 0.6;

      this.mStartMin = 0;
      this.mEndMin = 24 * 60;

      this.mDayStartHour = 0;
      this.mDayEndHour = 24;

      this.relayout();
      this.dispatchEvent(new CustomEvent("bindingattached", { bubbles: false }));
    }

    set pixelsPerMinute(ppm) {
      if (ppm != this.mPixPerMin) {
        this.mPixPerMin = ppm;
        this.relayout();
      }
    }

    get pixelsPerMinute() {
      return this.mPixPerMin;
    }

    /**
     * Set the hours when the day starts and ends.
     *
     * @param {number} dayStartHour    Hour when the day will start.
     * @param {number} dayEndHour      Hour when the day will end.
     */
    setDayStartEndHours(dayStartHour, dayEndHour) {
      if (
        dayStartHour * 60 < this.mStartMin ||
        dayStartHour > dayEndHour ||
        dayEndHour * 60 > this.mEndMin
      ) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }

      if (this.mDayStartHour != dayStartHour || this.mDayEndHour != dayEndHour) {
        this.mDayEndHour = dayEndHour;
        this.mDayStartHour = dayStartHour;

        const topbox = this.querySelector(".topbox");
        if (topbox.children.length) {
          // This only needs to be re-done if the initial relayout has already
          // happened.  (If it hasn't happened, this will be done when it does happen.)
          const start = this.mStartMin / 60;
          const end = this.mEndMin / 60;

          for (let hour = start; hour < end; hour++) {
            if (hour < this.mDayStartHour || hour >= this.mDayEndHour) {
              topbox.children[hour].setAttribute("off-time", "true");
            } else {
              topbox.children[hour].removeAttribute("off-time");
            }
          }
        }
      }
    }

    /**
     * Set an attribute on the time bar element, and do a relayout if needed.
     *
     * @param {string} attr     The attribute to set.
     * @param {string} value    The value to set.
     */
    setAttribute(attr, value) {
      const needsRelayout = attr == "orient" && this.getAttribute("orient") != value;

      // This should be done using lookupMethod(), see bug 286629.
      const ret = XULElement.prototype.setAttribute.call(this, attr, value);

      if (needsRelayout) {
        this.relayout();
      }

      return ret;
    }

    /**
     * Re-render the contents of the time bar.
     */
    relayout() {
      const topbox = this.querySelector(".topbox");

      while (topbox.hasChildNodes()) {
        topbox.lastChild.remove();
      }

      const orient = topbox.getAttribute("orient");
      const formatter = cal.dtz.formatter;
      const jsTime = new Date();

      this.getSections().forEach(([startMinute, duration]) => {
        const box = document.createXULElement("box");
        box.setAttribute("orient", orient);

        // Calculate duration pixel as the difference between
        // start pixel and end pixel to avoid rounding errors.
        const startPix = Math.round(startMinute * this.mPixPerMin);
        const endPix = Math.round((startMinute + duration) * this.mPixPerMin);
        const durPix = endPix - startPix;

        box.setAttribute(orient == "horizontal" ? "width" : "height", durPix);

        const hour = Math.floor(startMinute / 60);
        let timeString = "";

        if (duration == 60) {
          jsTime.setHours(hour, 0, 0);

          const dateTime = cal.dtz.jsDateToDateTime(jsTime, cal.dtz.floating);

          timeString = formatter.formatTime(dateTime);
        }

        const label = document.createXULElement("label");
        label.setAttribute("value", timeString);
        label.setAttribute("class", "calendar-time-bar-label");
        label.setAttribute("align", "center");
        box.appendChild(label);

        // Set up workweek hours.
        if (hour < this.mDayStartHour || hour >= this.mDayEndHour) {
          box.setAttribute("off-time", "true");
        }

        box.setAttribute("class", "calendar-time-bar-box-" + (hour % 2 == 0 ? "even" : "odd"));

        topbox.appendChild(box);
      });
    }

    /**
     * Get the section data for dividing up the time bar.
     *
     * @return {number[][]}    An array of arrays that represent time bar sections. Each array
     *                         holds two numbers, the first is the minute during the day when
     *                         the section starts, and the second is how many minutes the
     *                         section lasts (usually 60).
     */
    getSections() {
      const sections = [];
      let currentMin = this.mStartMin;

      while (currentMin < this.mEndMin) {
        const minutesLeft = this.mEndMin - currentMin;
        let duration;

        if (minutesLeft < 60) {
          duration = minutesLeft;
        } else {
          // 0 is falsy, so when the modulo is 0, duration is 60.
          duration = currentMin % 60 || 60;
        }

        sections.push([currentMin, duration]);

        currentMin += duration;
      }
      return sections;
    }
  }

  customElements.define("calendar-time-bar", CalendarTimeBar);

  /**
   * Abstract class used for the day and week calendar view elements. (Not month or multiweek.)
   *
   * @implements {calICalendarView}
   * @extends {MozElements.CalendarBaseView}
   * @abstract
   */
  class CalendarMultidayBaseView extends MozElements.CalendarBaseView {
    static get inheritedAttributes() {
      return { ".timebar": "orient" };
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      // this.hasConnected is set to true via super.connectedCallback (below).

      // The orient of the calendar-time-bar should be the opposite of the parent.
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <box class="mainbox multiday-view-main-box"
               flex="1">
            <box class="labelbox multiday-view-label-box">
              <box class="labeltimespacer multiday-view-label-time-spacer"/>
              <box class="labeldaybox multiday-view-label-day-box"
                   flex="1"
                   equalsize="always"/>
              <box class="labelscrollbarspacer multiday-labelscrollbarspacer"/>
            </box>
            <box class="headerbox multiday-view-header-box">
              <box class="headertimespacer multiday-view-header-time-spacer"/>
              <box class="headerdaybox multiday-view-header-day-box"
                   flex="1"
                   equalsize="always"/>
              <box class="headerscrollbarspacer multiday-headerscrollbarspacer"/>
            </box>
            <scrollbox class="scrollbox"
                       flex="1"
                       onoverflow="adjustScrollBarSpacers();"
                       onunderflow="adjustScrollBarSpacers();">
              <calendar-time-bar class="timebar"/>
              <box class="daybox multiday-view-day-box"
                   flex="1"
                   equalsize="always"/>
            </scrollbox>
          </box>
        `)
      );

      this.initializeAttributeInheritance();

      // super.connectedCallback has to be called after the time bar is added to the DOM.
      super.connectedCallback();

      this.addEventListener("click", event => {
        if (event.button != 2) {
          return;
        }
        this.selectedDateTime = null;
      });

      this.addEventListener("wheel", event => {
        // Only shift hours if no modifier is pressed.
        if (!event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
          let minute = this.mFirstVisibleMinute;

          if (event.deltaMode == event.DOM_DELTA_LINE) {
            if (this.rotated && event.deltaX != 0) {
              minute += event.deltaX < 0 ? -60 : 60;
            } else if (!this.rotated && event.deltaY != 0) {
              minute += event.deltaY < 0 ? -60 : 60;
            }
          } else if (event.deltaMode == event.DOM_DELTA_PIXEL) {
            if (this.rotated && event.deltaX != 0) {
              minute += Math.ceil(event.deltaX / this.mPixPerMin);
            } else if (!this.rotated && event.deltaY != 0) {
              minute += Math.ceil(event.deltaY / this.mPixPerMin);
            }
          }
          this.scrollToMinute(minute);
        }

        // We are taking care of scrolling, so prevent the default action in any case.
        event.preventDefault();
      });

      this.addEventListener("scroll", event => {
        const scrollbox = this.querySelector(".scrollbox");

        // Update the first visible minute, but only if the scrollbox has been sized.
        if (scrollbox.scrollHeight > 0) {
          const scrollTopOrLeft =
            scrollbox.getAttribute("orient") == "horizontal"
              ? scrollbox.scrollTop
              : scrollbox.scrollLeft;

          this.mFirstVisibleMinute = Math.round(scrollTopOrLeft / this.mPixPerMin);
        }
      });

      // mDateList will always be sorted before being set.
      this.mDateList = null;

      /**
       * A column in the view representing a particular date.
       * @typedef {Object} DateColumn
       * @property {calIDateTime} date    The date.
       * @property {Element} column       A `calendar-event-column` where regular,
       *                                  (not "all day") events appear.
       * @property {Element} header       A `calendar-header-container` where "all day"
       *                                  events appear.
       */

      /** @type {DateColumn[]} */
      this.mDateColumns = null;

      this.mPixPerMin = 0.6;
      this.mMinPixelsPerMinute = 0.1;

      this.mSelectedDayCol = null;
      this.mSelectedDay = null;

      this.mStartMin = 0;
      this.mEndMin = 24 * 60;

      this.mDayStartMin = 0;
      this.mDayEndMin = 0;

      this.mVisibleMinutes = 9 * 60;
      this.mClickedTime = null;

      this.mTimeIndicatorInterval = 15;
      this.mTimeIndicatorMinutes = 0;

      this.mModeHandler = null;
      this.mFirstVisibleMinute = 0;

      // Get day start/end hour from prefs and set on the view.
      const startHour = Services.prefs.getIntPref("calendar.view.daystarthour", 8) * 60;
      const endHour = Services.prefs.getIntPref("calendar.view.dayendhour", 17) * 60;
      this.setDayStartEndMinutes(startHour, endHour);

      // Initially scroll to the day start hour in the view.
      this.scrollToMinute(this.mDayStartMin);

      // Get visible hours from prefs and set on the view.
      const visibleMinutes = Services.prefs.getIntPref("calendar.view.visiblehours", 9) * 60;
      this.setVisibleMinutes(visibleMinutes);

      // Set the time interval for the time indicator timer.
      this.setTimeIndicatorInterval(
        Services.prefs.getIntPref("calendar.view.timeIndicatorInterval", 15)
      );

      this.enableTimeIndicator();

      this.reorient();
    }

    get labeldaybox() {
      return this.querySelector(".labeldaybox");
    }

    // calICalendarView Properties

    get supportsZoom() {
      return true;
    }

    get supportsRotation() {
      return true;
    }

    get supportsDisjointDates() {
      return true;
    }

    get hasDisjointDates() {
      return this.mDateList != null;
    }

    get startDate() {
      if (this.mStartDate) {
        return this.mStartDate;
      } else if (this.mDateList && this.mDateList.length > 0) {
        return this.mDateList[0];
      }
      return null;
    }

    get endDate() {
      if (this.mEndDate) {
        return this.mEndDate;
      } else if (this.mDateList && this.mDateList.length > 0) {
        return this.mDateList[this.mDateList.length - 1];
      }
      return null;
    }

    set selectedDay(day) {
      // Ignore if just 1 visible, it's always selected, but we don't indicate it.
      if (this.numVisibleDates == 1) {
        this.fireEvent("dayselect", day);
        return;
      }

      if (this.mSelectedDayCol) {
        this.mSelectedDayCol.column.selected = false;
        this.mSelectedDayCol.header.removeAttribute("selected");
      }

      if (day) {
        this.mSelectedDayCol = this.findColumnForDate(day);
        if (this.mSelectedDayCol) {
          this.mSelectedDay = this.mSelectedDayCol.date;
          this.mSelectedDayCol.column.selected = true;
          this.mSelectedDayCol.header.setAttribute("selected", "true");
        } else {
          this.mSelectedDay = day;
        }
      }
      this.fireEvent("dayselect", day);
    }

    get selectedDay() {
      let selected;
      if (this.numVisibleDates == 1) {
        selected = this.mDateColumns[0].date;
      } else if (this.mSelectedDay) {
        selected = this.mSelectedDay;
      } else if (this.mSelectedDayCol) {
        selected = this.mSelectedDayCol.date;
      }

      // TODO Make sure the selected day is valid.
      // TODO Select now if it is in the range?
      return selected;
    }

    // End calICalendarView Properties

    get daysInView() {
      return this.labeldaybox.children && this.labeldaybox.children.length;
    }

    set selectedDateTime(dateTime) {
      this.mClickedTime = dateTime;
    }

    get selectedDateTime() {
      return this.mClickedTime;
    }

    set pixelsPerMinute(ppm) {
      this.mPixPerMin = ppm;

      this.timebar.pixelsPerMinute = ppm;

      if (!this.mDateColumns) {
        return;
      }
      for (const col of this.mDateColumns) {
        col.column.pixelsPerMinute = ppm;
      }
    }

    get pixelsPerMinute() {
      return this.mPixPerMin;
    }

    // Private

    get numVisibleDates() {
      if (this.mDateList) {
        return this.mDateList.length;
      }

      let count = 0;

      if (!this.mStartDate || !this.mEndDate) {
        // The view has not been initialized, so there are 0 visible dates.
        return count;
      }

      const date = this.mStartDate.clone();
      while (date.compare(this.mEndDate) <= 0) {
        count++;
        date.day += 1;
      }

      return count;
    }

    get timebar() {
      return this.querySelector(".timebar");
    }

    get timeBarTimeIndicator() {
      return this.timebar.querySelector(".timeIndicator-timeBar");
    }

    get scrollbox() {
      return this.querySelector(".scrollbox");
    }

    /**
     * Set the preference for the time indicator interval.
     *
     * @param {number} prefInterval    A time indicator interval preference value.
     */
    setTimeIndicatorInterval(prefInterval) {
      // If the preference just edited by the user is outside the valid
      // range [0, 1440], we change it into the nearest limit (0 or 1440).
      const newTimeInterval = Math.max(0, Math.min(1440, prefInterval));
      if (newTimeInterval != prefInterval) {
        Services.prefs.setIntPref("calendar.view.timeIndicatorInterval", newTimeInterval);
      }

      if (newTimeInterval != this.mTimeIndicatorInterval) {
        this.mTimeIndicatorInterval = newTimeInterval;
      }
      if (this.mTimeIndicatorInterval == 0) {
        timeIndicator.cancel();
      }
    }

    /**
     * Hides or shows the time indicator when the time indicator interval preference changes
     * to 0 or changes from 0 to greater than 0. Also updates its position if needed.
     */
    enableTimeIndicator() {
      const hideIndicator = this.mTimeIndicatorInterval == 0;
      this.timeBarTimeIndicator.hidden = hideIndicator;

      const todayColumn = this.findColumnForDate(this.today());
      if (todayColumn) {
        todayColumn.column.timeIndicatorBox.hidden = hideIndicator;
      }

      // Update the timer but only under some circumstances, otherwise
      // it will update the wrong view or it will start without need.
      const currView = currentView().type;
      if (
        gCurrentMode == "calendar" &&
        currView == this.type &&
        !hideIndicator &&
        (currView == "day" || currView == "week")
      ) {
        this.updateTimeIndicatorPosition(true);
      }
    }

    /**
     * Update the position of the time indicator.
     *
     * @param {boolean} updateTheTimer    Whether to update the timer.
     * @param {boolean} ppmChanged        Whether the pixels per minute has changed.
     * @param {boolean} viewChanged       Whether the view has changed.
     */
    updateTimeIndicatorPosition(updateTheTimer, ppmChanged, viewChanged) {
      const now = cal.dtz.now();
      const nowMinutes = now.hour * 60 + now.minute;

      if (updateTheTimer) {
        const originalPrefInt = this.mTimeIndicatorInterval;
        if (originalPrefInt == 0) {
          timeIndicator.cancel();
          return;
        }

        // If pixels per minute is small, increase (then update) the interval pref.
        const prefInt =
          ppmChanged && this.mPixPerMin < 0.6
            ? Math.round(originalPrefInt / this.mPixPerMin)
            : originalPrefInt;

        if (!ppmChanged || viewChanged || prefInt != originalPrefInt) {
          // Synchronize the timer with a multiple of the interval.
          const firstInterval = (prefInt - (nowMinutes % prefInt)) * 60 - now.second;
          if (timeIndicator.timer) {
            timeIndicator.cancel();
          }
          timeIndicator.lastView = this.id;
          timeIndicator.timer = setTimeout(() => {
            this.updateTimeIndicatorPosition(false);
            timeIndicator.start(prefInt * 60, this);
          }, firstInterval * 1000);

          // Set the time for the first positioning of the indicator.
          const time = Math.floor(nowMinutes / prefInt) * prefInt;
          document.getElementById("day-view").mTimeIndicatorMinutes = time;
          document.getElementById("week-view").mTimeIndicatorMinutes = time;
        }
      } else if (updateTheTimer === false) {
        // Set the time for every positioning after the first
        document.getElementById("day-view").mTimeIndicatorMinutes = nowMinutes;
        document.getElementById("week-view").mTimeIndicatorMinutes = nowMinutes;
      }
      // Update the position of the indicator.
      const position = Math.round(this.mPixPerMin * this.mTimeIndicatorMinutes) - 1;
      const posAttr = this.getAttribute("orient") == "vertical" ? "top: " : "left: ";

      if (this.timeBarTimeIndicator) {
        this.timeBarTimeIndicator.setAttribute("style", posAttr + position + "px;");
      }

      const todayColumn = this.findColumnForDate(this.today());
      if (todayColumn) {
        todayColumn.column.timeIndicatorBox.setAttribute(
          "style",
          "margin-" + posAttr + position + "px;"
        );
      }
    }

    /**
     * Handle preference changes. Typically called by a preference observer.
     *
     * @param {Object} subject       The subject, a prefs object.
     * @param {string} topic         The notification topic.
     * @param {string} preference    The preference to handle.
     */
    handlePreference(subject, topic, preference) {
      subject.QueryInterface(Ci.nsIPrefBranch);
      switch (preference) {
        case "calendar.view.daystarthour":
          this.setDayStartEndMinutes(subject.getIntPref(preference) * 60, this.mDayEndMin);
          this.refreshView();
          break;

        case "calendar.view.dayendhour":
          this.setDayStartEndMinutes(this.mDayStartMin, subject.getIntPref(preference) * 60);
          this.refreshView();
          break;

        case "calendar.view.visiblehours":
          this.setVisibleMinutes(subject.getIntPref(preference) * 60);
          this.refreshView();
          break;

        case "calendar.view.timeIndicatorInterval":
          this.setTimeIndicatorInterval(subject.getIntPref(preference));
          this.enableTimeIndicator();
          break;

        default:
          this.handleCommonPreference(subject, topic, preference);
          break;
      }
    }

    /**
     * Handle resizing by adjusting the view to the new size.
     *
     * @param {Element} calViewElem    A calendar view element (calICalendarView).
     */
    onResize() {
      const scrollboxRect = this.scrollbox.getBoundingClientRect();
      let ppmHasChanged = false;

      if (scrollboxRect.width != this.mWidth && scrollboxRect.height != this.mHeight) {
        this.mWidth = scrollboxRect.width;
        this.mHeight = scrollboxRect.height;

        const isOrientHorizontal = this.getAttribute("orient") == "horizontal";

        const size = isOrientHorizontal ? scrollboxRect.width : scrollboxRect.height;

        const ppmRaw = size / this.mVisibleMinutes;
        const ppmRounded = Math.floor(ppmRaw * 1000) / 1000;

        const ppm = ppmRounded < this.mMinPixelsPerMinute ? this.mMinPixelsPerMinute : ppmRounded;

        ppmHasChanged = this.pixelsPerMinute != ppm;
        this.pixelsPerMinute = ppm;

        // Fit the weekday labels while scrolling.
        this.adjustWeekdayLength(isOrientHorizontal);
      }

      setTimeout(() => this.scrollToMinute(this.mFirstVisibleMinute), 0);

      // Adjust the time indicator position and the related timer.
      if (this.mTimeIndicatorInterval != 0) {
        const viewHasChanged = timeIndicator.lastView != this.id;
        if (
          gCurrentMode == "calendar" &&
          (!timeIndicator.timer || ppmHasChanged || viewHasChanged)
        ) {
          this.updateTimeIndicatorPosition(true, ppmHasChanged, viewHasChanged);
        }
      }
    }

    /**
     * Make a calendar item flash or stop flashing. Called when the item's alarm fires.
     *
     * @param {calIItemBase} item    The calendar item.
     * @param {boolean} stop         Whether to stop the item from flashing.
     */
    flashAlarm(item, stop) {
      function setFlashingAttribute(box) {
        if (stop) {
          box.removeAttribute("flashing");
        } else {
          box.setAttribute("flashing", "true");
        }
      }

      const showIndicator = Services.prefs.getBoolPref("calendar.alarms.indicator.show", true);
      const totaltime = Services.prefs.getIntPref("calendar.alarms.indicator.totaltime", 3600);

      if (!stop && (!showIndicator || totaltime < 1)) {
        // No need to animate if the indicator should not be shown.
        return;
      }

      // Make sure the flashing attribute is set or reset on all visible boxes.
      const columns = this.findColumnsForItem(item);
      for (const col of columns) {
        const colBox = col.column.findElementForEventItem(item);
        const headerBox = col.header.findElementForEventItem(item);

        if (colBox) {
          setFlashingAttribute(colBox);
        }
        if (headerBox) {
          setFlashingAttribute(headerBox);
        }
      }

      if (stop) {
        // We are done flashing, prevent newly created event boxes from flashing.
        delete this.mFlashingEvents[item.hashId];
      } else {
        // Set up a timer to stop the flashing after the total time.
        this.mFlashingEvents[item.hashId] = item;
        setTimeout(() => this.flashAlarm(item, true), totaltime);
      }
    }

    // calICalendarView Methods

    showDate(date) {
      const targetDate = date.getInTimezone(this.mTimezone);
      targetDate.isDate = true;

      if (this.mStartDate && this.mEndDate) {
        if (this.mStartDate.compare(targetDate) <= 0 && this.mEndDate.compare(targetDate) >= 0) {
          return;
        }
      } else if (this.mDateList) {
        for (const listDate of this.mDateList) {
          // If date is already visible, nothing to do.
          if (listDate.compare(targetDate) == 0) {
            return;
          }
        }
      }

      // If we're only showing one date, then continue
      // to only show one date; otherwise, show the week.
      if (this.numVisibleDates == 1) {
        this.setDateRange(date, date);
      } else {
        this.setDateRange(date.startOfWeek, date.endOfWeek);
      }

      this.selectedDay = targetDate;
    }

    setDateRange(startDate, endDate) {
      this.rangeStartDate = startDate;
      this.rangeEndDate = endDate;

      const viewStart = startDate.getInTimezone(this.mTimezone);
      const viewEnd = endDate.getInTimezone(this.mTimezone);

      viewStart.isDate = true;
      viewStart.makeImmutable();
      viewEnd.isDate = true;
      viewEnd.makeImmutable();
      this.mStartDate = viewStart;
      this.mEndDate = viewEnd;

      // goToDay are called when toggle the values below. The attempt to fix
      // Bug 872063 has modified the behavior of setDateRange, which doesn't
      // always refresh the view anymore. That is not the expected behavior
      // by goToDay. Add checks here to determine if the view need to be
      // refreshed.

      // First, check values of tasksInView, workdaysOnly, showCompleted.
      // Their status will determine the value of toggleStatus, which is
      // saved to this.mToggleStatus during last call to relayout()
      let toggleStatus = 0;

      if (this.mTasksInView) {
        toggleStatus |= this.mToggleStatusFlag.TasksInView;
      }
      if (this.mWorkdaysOnly) {
        toggleStatus |= this.mToggleStatusFlag.WorkdaysOnly;
      }
      if (this.mShowCompleted) {
        toggleStatus |= this.mToggleStatusFlag.ShowCompleted;
      }

      // Update the navigation bar only when changes are related to the current view.
      if (this.isVisible()) {
        calendarNavigationBar.setDateRange(viewStart, viewEnd);
      }

      // Check whether view range has been changed since last call to relayout().
      if (
        !this.mViewStart ||
        !this.mViewEnd ||
        this.mViewEnd.compare(viewEnd) != 0 ||
        this.mViewStart.compare(viewStart) != 0 ||
        this.mToggleStatus != toggleStatus
      ) {
        this.refresh();
      }
    }

    getDateList() {
      const dates = [];
      if (this.mStartDate && this.mEndDate) {
        const date = this.mStartDate.clone();
        while (date.compare(this.mEndDate) <= 0) {
          dates.push(date.clone());
          date.day += 1;
        }
      } else if (this.mDateList) {
        for (const date of this.mDateList) {
          dates.push(date.clone());
        }
      }

      return dates;
    }

    setSelectedItems(items, suppressEvent) {
      if (this.mSelectedItems) {
        for (const item of this.mSelectedItems) {
          for (const occ of this.getItemOccurrencesInView(item)) {
            const cols = this.findColumnsForItem(occ);
            for (const col of cols) {
              col.header.selectEvent(occ, false);
              col.column.selectEvent(occ, false);
            }
          }
        }
      }
      this.mSelectedItems = items || [];

      for (const item of this.mSelectedItems) {
        for (const occ of this.getItemOccurrencesInView(item)) {
          const cols = this.findColumnsForItem(occ);
          if (cols.length == 0) {
            continue;
          }
          const start = item.startDate || item.entryDate || item.dueDate;
          for (const col of cols) {
            if (start.isDate) {
              col.header.selectEvent(occ, true);
            } else {
              col.column.selectEvent(occ, true);
            }
          }
        }
      }

      if (!suppressEvent) {
        this.fireEvent("itemselect", this.mSelectedItems);
      }
    }

    centerSelectedItems() {
      const displayTZ = cal.dtz.defaultTimezone;
      let lowMinute = 24 * 60;
      let highMinute = 0;

      for (const item of this.mSelectedItems) {
        const startDateProperty = cal.dtz.startDateProp(item);
        const endDateProperty = cal.dtz.endDateProp(item);

        let occs = [];
        if (item.recurrenceInfo) {
          // If selected a parent item, show occurrence(s) in view range.
          occs = item.getOccurrencesBetween(this.startDate, this.queryEndDate);
        } else {
          occs = [item];
        }

        for (const occ of occs) {
          let occStart = occ[startDateProperty];
          let occEnd = occ[endDateProperty];
          // Must have at least one of start or end.
          if (!occStart && !occEnd) {
            // Task with no dates.
            continue;
          }

          // If just has single datetime, treat as zero duration item
          // (such as task with due datetime or start datetime only).
          occStart = occStart || occEnd;
          occEnd = occEnd || occStart;
          // Now both occStart and occEnd are datetimes.

          // Skip occurrence if all-day: it won't show in time view.
          if (occStart.isDate || occEnd.isDate) {
            continue;
          }

          // Trim dates to view.  (Not mutated so just reuse view dates.)
          if (this.startDate.compare(occStart) > 0) {
            occStart = this.startDate;
          }
          if (this.queryEndDate.compare(occEnd) < 0) {
            occEnd = this.queryEndDate;
          }

          // Convert to display timezone if different.
          if (occStart.timezone != displayTZ) {
            occStart = occStart.getInTimezone(displayTZ);
          }
          if (occEnd.timezone != displayTZ) {
            occEnd = occEnd.getInTimezone(displayTZ);
          }
          // If crosses midnight in current TZ, set end just
          // before midnight after start so start/title usually visible.
          if (!cal.dtz.sameDay(occStart, occEnd)) {
            occEnd = occStart.clone();
            occEnd.day = occStart.day;
            occEnd.hour = 23;
            occEnd.minute = 59;
          }

          // Ensure range shows occ.
          lowMinute = Math.min(occStart.hour * 60 + occStart.minute, lowMinute);
          highMinute = Math.max(occEnd.hour * 60 + occEnd.minute, highMinute);
        }
      }

      const displayDuration = highMinute - lowMinute;
      if (this.mSelectedItems.length && displayDuration >= 0) {
        let minute;
        if (displayDuration <= this.mVisibleMinutes) {
          minute = lowMinute + (displayDuration - this.mVisibleMinutes) / 2;
        } else if (this.mSelectedItems.length == 1) {
          // If the displayDuration doesn't fit into the visible minutes, but
          // only one event is selected, then go ahead and center the event start.

          minute = Math.max(0, lowMinute - this.mVisibleMinutes / 2);
        }
        this.scrollToMinute(minute);
      }
    }

    zoomIn(level) {
      let visibleHours = Services.prefs.getIntPref("calendar.view.visiblehours", 9);
      visibleHours += level || 1;

      Services.prefs.setIntPref("calendar.view.visiblehours", Math.min(visibleHours, 24));
    }

    zoomOut(level) {
      let visibleHours = Services.prefs.getIntPref("calendar.view.visiblehours", 9);
      visibleHours -= level || 1;

      Services.prefs.setIntPref("calendar.view.visiblehours", Math.max(1, visibleHours));
    }

    zoomReset() {
      Services.prefs.setIntPref("calendar.view.visiblehours", 9);
    }

    // End calICalendarView Methods

    /**
     * Return all the occurrences of a given item that are currently displayed in the view.
     *
     * @param {calIItemBase} item    A calendar item.
     * @return {calIItemBase[]}      An array of occurrences.
     */
    getItemOccurrencesInView(item) {
      if (item.recurrenceInfo && item.recurrenceStartDate) {
        // If a parent item is selected, show occurrence(s) in view range.
        return item.getOccurrencesBetween(this.startDate, this.queryEndDate);
      } else if (item.recurrenceStartDate) {
        return [item];
      }
      // Undated todo.
      return [];
    }

    /**
     * Set an attribute on the view element, and do re-orientation and re-layout if needed.
     *
     * @param {string} attr     The attribute to set.
     * @param {string} value    The value to set.
     */
    setAttribute(attr, value) {
      const needsReorient = attr == "orient" && this.getAttribute("orient") != value;

      const needsRelayout = attr == "context" || attr == "item-context";

      // This should be done using lookupMethod(), see bug 286629.
      const ret = XULElement.prototype.setAttribute.call(this, attr, value);

      if (needsReorient) {
        this.reorient();
      } else if (needsRelayout) {
        this.relayout();
      }

      return ret;
    }

    /**
     * Update the view when the view has changed orientation (horizontal or vertical).
     */
    reorient() {
      const orient = this.getAttribute("orient") || "horizontal";
      const otherOrient = orient == "vertical" ? "horizontal" : "vertical";

      this.pixelsPerMinute = orient == "horizontal" ? 1.5 : 0.6;

      const normalElems = [".mainbox", ".timebar"];
      const otherElems = [
        ".labelbox",
        ".labeldaybox",
        ".headertimespacer",
        ".headerbox",
        ".headerdaybox",
        ".scrollbox",
        ".daybox",
      ];

      for (const selector of normalElems) {
        this.querySelector(selector).setAttribute("orient", orient);
      }
      for (const selector of otherElems) {
        this.querySelector(selector).setAttribute("orient", otherOrient);
      }

      if (orient == "vertical") {
        this.scrollbox.setAttribute("style", "overflow-x:hidden; overflow-y:auto;");
        this.querySelector(".mainbox").setAttribute("style", "overflow-x:auto; overflow-y:hidden;");
      } else {
        this.scrollbox.setAttribute("style", "overflow-x: auto; overflow-y: hidden;");
        this.querySelector(".mainbox").setAttribute("style", "overflow-x:hidden; overflow-y:auto;");
      }

      for (const selector of [".daybox", ".headerdaybox"]) {
        for (let child of this.querySelector(selector).children) {
          child.setAttribute("orient", orient);
        }
      }

      for (let child of this.labeldaybox.children) {
        child.setAttribute("orient", otherOrient);
      }

      this.refresh();
    }

    /**
     * Re-render the view.
     */
    relayout() {
      if (!this.mStartDate || !this.mEndDate) {
        return;
      }

      const orient = this.getAttribute("orient") || "horizontal";
      const otherOrient = orient == "horizontal" ? "vertical" : "horizontal";

      const computedDateList = [];
      const startDate = this.mStartDate.clone();

      while (startDate.compare(this.mEndDate) <= 0) {
        const workday = startDate.clone();
        workday.makeImmutable();

        if (this.mDisplayDaysOff || !this.mDaysOffArray.includes(startDate.weekday)) {
          computedDateList.push(workday);
        }
        startDate.day += 1;
      }
      this.mDateList = computedDateList;

      // Deselect the previously selected event upon switching views, otherwise those events
      // will stay selected forever, if other events are selected after changing the view.
      this.setSelectedItems([], true);

      const daybox = this.querySelector(".daybox");
      const headerdaybox = this.querySelector(".headerdaybox");

      const dayStartMin = this.mDayStartMin;
      const dayEndMin = this.mDayEndMin;

      const setUpDayEventsBox = (dayBox, date) => {
        dayBox.setAttribute(
          "class",
          "calendar-event-column-" + (counter % 2 == 0 ? "even" : "odd")
        );
        dayBox.setAttribute("context", this.getAttribute("context"));
        dayBox.setAttribute(
          "item-context",
          this.getAttribute("item-context") || this.getAttribute("context")
        );

        dayBox.startLayoutBatchChange();
        dayBox.date = date;
        dayBox.setAttribute("orient", orient);

        dayBox.calendarView = this;
        dayBox.setDayStartEndMinutes(dayStartMin, dayEndMin);
      };

      const setUpDayHeaderBox = (dayBox, date) => {
        dayBox.date = date;
        dayBox.calendarView = this;
        dayBox.setAttribute("orient", "vertical");
        // Since the calendar-header-container boxes have the same vertical
        // orientation for normal and rotated views, it needs an attribute
        // "rotated" in order to have different css rules.
        dayBox.rotated = orient == "horizontal";
      };

      this.mDateColumns = [];

      // Get today's date.
      const today = this.today();
      let counter = 0;
      const dayboxkids = daybox.children;
      const headerboxkids = headerdaybox.children;
      const labelboxkids = this.labeldaybox.children;
      let updateTimeIndicator = false;

      for (const date of computedDateList) {
        let dayEventsBox;
        if (counter < dayboxkids.length) {
          dayEventsBox = dayboxkids[counter];
          dayEventsBox.removeAttribute("relation");
          dayEventsBox.clear();
        } else {
          dayEventsBox = document.createXULElement("calendar-event-column");
          dayEventsBox.setAttribute("flex", "1");
          daybox.appendChild(dayEventsBox);
        }
        setUpDayEventsBox(dayEventsBox, date);

        let dayHeaderBox;
        if (counter < headerboxkids.length) {
          dayHeaderBox = headerboxkids[counter];
          dayHeaderBox.clear();
        } else {
          dayHeaderBox = document.createXULElement("calendar-header-container");
          dayHeaderBox.setAttribute("flex", "1");
          headerdaybox.appendChild(dayHeaderBox);
        }
        setUpDayHeaderBox(dayHeaderBox, date);

        if (this.mDaysOffArray.includes(date.weekday)) {
          dayEventsBox.dayOff = true;
          dayHeaderBox.setAttribute("weekend", "true");
        } else {
          dayEventsBox.dayOff = false;
          dayHeaderBox.removeAttribute("weekend");
        }
        let labelbox;
        if (counter < labelboxkids.length) {
          labelbox = labelboxkids[counter];
          labelbox.date = date;
        } else {
          labelbox = document.createXULElement("calendar-day-label");
          labelbox.setAttribute("orient", otherOrient);
          this.labeldaybox.appendChild(labelbox);
          labelbox.date = date;
        }
        // Set attributes for date relations and for the time indicator.
        const headerDayBox = this.querySelector(".headerdaybox");
        headerDayBox.removeAttribute("todaylastinview");
        dayEventsBox.timeIndicatorBox.setAttribute("hidden", "true");
        switch (date.compare(today)) {
          case -1: {
            dayHeaderBox.setAttribute("relation", "past");
            dayEventsBox.setAttribute("relation", "past");
            labelbox.setAttribute("relation", "past");
            break;
          }
          case 0: {
            const relation_ = this.numVisibleDates == 1 ? "today1day" : "today";
            dayHeaderBox.setAttribute("relation", relation_);
            dayEventsBox.setAttribute("relation", relation_);
            labelbox.setAttribute("relation", relation_);
            dayEventsBox.timeIndicatorBox.hidden = this.mTimeIndicatorInterval == 0;
            updateTimeIndicator = true;

            // Due to equalsize=always being set on the dayboxes
            // parent, there are a few issues showing the border of
            // the last daybox correctly. To work around this, we're
            // setting an attribute we can use in CSS. For more
            // information about this hack, see bug 455045.
            if (
              dayHeaderBox == headerdaybox.children[headerdaybox.children.length - 1] &&
              this.numVisibleDates > 1
            ) {
              headerDayBox.setAttribute("todaylastinview", "true");
            }
            break;
          }
          case 1: {
            dayHeaderBox.setAttribute("relation", "future");
            dayEventsBox.setAttribute("relation", "future");
            labelbox.setAttribute("relation", "future");
            break;
          }
        }
        // We don't want to actually mess with our original dates, plus
        // they're likely to be immutable.
        const date2 = date.clone();
        date2.isDate = true;
        date2.makeImmutable();
        this.mDateColumns.push({ date: date2, column: dayEventsBox, header: dayHeaderBox });
        counter++;
      }

      // Remove any extra columns that may have been hanging around.
      function removeExtraKids(elem) {
        while (counter < elem.children.length) {
          elem.children[counter].remove();
        }
      }
      removeExtraKids(daybox);
      removeExtraKids(headerdaybox);
      removeExtraKids(this.labeldaybox);

      if (updateTimeIndicator) {
        this.updateTimeIndicatorPosition();
      }

      // Fix pixels-per-minute.
      this.onResize();
      if (this.mDateColumns) {
        for (const col of this.mDateColumns) {
          col.column.endLayoutBatchChange();
        }
      }

      // Adjust scrollbar spacers.
      this.adjustScrollBarSpacers();

      // Store the start and end of current view. Next time when
      // setDateRange is called, it will use mViewStart and mViewEnd to
      // check if view range has been changed.
      this.mViewStart = this.mStartDate;
      this.mViewEnd = this.mEndDate;

      let toggleStatus = 0;

      if (this.mTasksInView) {
        toggleStatus |= this.mToggleStatusFlag.TasksInView;
      }
      if (this.mWorkdaysOnly) {
        toggleStatus |= this.mToggleStatusFlag.WorkdaysOnly;
      }
      if (this.mShowCompleted) {
        toggleStatus |= this.mToggleStatusFlag.ShowCompleted;
      }

      this.mToggleStatus = toggleStatus;
    }

    /**
     * Return the column object for a given date.
     *
     * @param {calIDateTime} date    A date.
     * @return {?DateColumn}         A column object.
     */
    findColumnForDate(date) {
      if (!this.mDateColumns) {
        return null;
      }
      for (const col of this.mDateColumns) {
        if (col.date.compare(date) == 0) {
          return col;
        }
      }
      return null;
    }

    /**
     * Return the day box (column header) for a given date.
     *
     * @param {calIDateTime} date    A date.
     * @return {Element}             A `calendar-header-container` where "all day" events appear.
     */
    findDayBoxForDate(date) {
      const col = this.findColumnForDate(date);
      return col && col.header;
    }

    /**
     * Select the column header for a given date.
     *
     * @param {calIDateTime} date    A date.
     */
    selectColumnHeader(date) {
      let child = this.labeldaybox.firstElementChild;
      while (child) {
        if (child.date.compare(date) == 0) {
          child.setAttribute("selected", "true");
        } else {
          child.removeAttribute("selected");
        }
        child = child.nextElementSibling;
      }
    }

    /**
     * Return the column objects for a group of occurrences.
     *
     * @param {calIItemBase[]} occurrences    Array of calendar item occurrences.
     * @return {DateColumn[]}                 Array of column objects.
     */
    findColumnsForOccurrences(occurrences) {
      if (!this.mDateColumns || !this.mDateColumns.length) {
        return [];
      }

      const occMap = {};
      for (const occ of occurrences) {
        const startDate = occ[cal.dtz.startDateProp(occ)].getInTimezone(this.mStartDate.timezone);

        const endDate =
          occ[cal.dtz.endDateProp(occ)].getInTimezone(this.mEndDate.timezone) || startDate;

        if (startDate.compare(this.mStartDate) >= 0 && endDate.compare(this.mEndDate) <= 0) {
          for (let i = startDate.day; i <= endDate.day; i++) {
            occMap[i] = true;
          }
        }
      }

      return this.mDateColumns.filter(col => col.date.day in occMap);
    }

    /**
     * Return the column objects for a given calendar item.
     *
     * @param {calIItemBase} item    A calendar item.
     * @return {DateColumn[]}        An array of column objects.
     */
    findColumnsForItem(item) {
      const columns = [];

      if (!this.mDateColumns) {
        return columns;
      }

      // Note that these may be dates or datetimes.
      const startDate = item.startDate || item.entryDate || item.dueDate;
      if (!startDate) {
        return columns;
      }
      const timezone = this.mDateColumns[0].date.timezone;
      let targetDate = startDate.getInTimezone(timezone);
      let finishDate = (item.endDate || item.dueDate || item.entryDate || startDate).getInTimezone(
        timezone
      );

      if (targetDate.compare(this.mStartDate) < 0) {
        targetDate = this.mStartDate.clone();
      }

      if (finishDate.compare(this.mEndDate) > 0) {
        finishDate = this.mEndDate.clone();
        finishDate.day++;
      }

      // Set the time to 00:00 so that we get all the boxes.
      targetDate.isDate = false;
      targetDate.hour = 0;
      targetDate.minute = 0;
      targetDate.second = 0;

      if (targetDate.compare(finishDate) == 0) {
        // We have also to handle zero length events in particular for
        // tasks without entry or due date.
        const col = this.findColumnForDate(targetDate);
        if (col) {
          columns.push(col);
        }
      }

      while (targetDate.compare(finishDate) == -1) {
        const col = this.findColumnForDate(targetDate);

        // This might not exist if the event spans the view start or end.
        if (col) {
          columns.push(col);
        }
        targetDate.day += 1;
      }

      return columns;
    }

    /**
     * For the given client-coord-system point, return the event column element that contains
     * it. If no column contains it, return null.
     *
     * @param {number} clientX    A client X coordinate.
     * @param {number} clientY    A client Y coordinate.
     * @return {?Element}         A `calendar-event-column` element.
     */
    findColumnForClientPoint(clientX, clientY) {
      if (!this.mDateColumns) {
        return null;
      }
      for (const col of this.mDateColumns) {
        const element = col.column.querySelector(".multiday-column-box-stack");

        const boundingRect = element.getBoundingClientRect();
        if (
          clientX >= element.screenX &&
          clientX <= element.screenX + boundingRect.width &&
          clientY >= element.screenY &&
          clientY <= element.screenY + boundingRect.height
        ) {
          return col.column;
        }
      }
      return null;
    }

    /**
     * If an all day event is added or deleted, then the header with all day events could get a
     * scrollbar. Readjust the scrollbar spacers.
     *
     * @param {calIItemBase} event    A calendar item.
     */
    adjustScrollbarSpacersForAlldayEvents(event) {
      const startDate = event[cal.dtz.startDateProp(event)];
      const endDate = event[cal.dtz.endDateProp(event)];

      if ((startDate && startDate.isDate) || (endDate && endDate.isDate)) {
        this.adjustScrollBarSpacers();
      }
    }

    /**
     * Display a calendar item.
     *
     * @param {calIItemBase} event    A calendar item.
     */
    doAddItem(event) {
      const cols = this.findColumnsForItem(event);
      if (!cols.length) {
        return;
      }

      for (const col of cols) {
        const estart = event.startDate || event.entryDate || event.dueDate;

        if (estart.isDate) {
          col.header.addEvent(event);
        } else {
          col.column.addEvent(event);
        }
      }
      this.adjustScrollbarSpacersForAlldayEvents(event);
    }

    /**
     * Remove a calendar item so it is no longer displayed.
     *
     * @param {calIItemBase} event    A calendar item.
     */
    doRemoveItem(event) {
      const cols = this.findColumnsForItem(event);
      if (!cols.length) {
        return;
      }

      const oldLength = this.mSelectedItems.length;
      this.mSelectedItems = this.mSelectedItems.filter(item => {
        return item.hashId != event.hashId;
      });

      for (const col of cols) {
        const estart = event.startDate || event.entryDate || event.dueDate;

        if (estart.isDate) {
          col.header.deleteEvent(event);
        } else {
          col.column.deleteEvent(event);
        }
      }

      // If a deleted event was selected, we need to announce that the selection changed.
      if (oldLength != this.mSelectedItems.length) {
        this.fireEvent("itemselect", this.mSelectedItems);
      }

      this.adjustScrollbarSpacersForAlldayEvents(event);
    }

    /**
     * Remove all items for a given calendar so they are no longer displayed.
     *
     * @param {calICalendar} calendar    A calendar object.
     */
    removeItemsFromCalendar(calendar) {
      if (!this.mDateColumns) {
        return;
      }
      for (const col of this.mDateColumns) {
        // Get all-day events in column header and events within the column.
        const colEvents = col.header.getAllEventItems().concat(col.column.getAllEventItems());

        for (const event of colEvents) {
          if (event.calendar.id == calendar.id) {
            this.doRemoveItem(event);
          }
        }
      }
    }

    /**
     * Adjust scroll bar spacers if needed.
     */
    adjustScrollBarSpacers() {
      // Get the width or height of the scrollbox scrollbar, depending on view orientation.
      const widthOrHeight = this.getAttribute("orient") == "vertical" ? "width" : "height";

      // We cannot access the scrollbar to get its size directly (e.g. via querySelector) so
      // we subtract the size of the other scrollbox children from the size of the scrollbox
      // to calculate the size of the scrollbar.
      let scrollboxChildrenSize = 0;
      for (const child of this.scrollbox.children) {
        let computedStyle = window.getComputedStyle(child);
        if (this.getAttribute("orient") == "vertical") {
          // We expect that the margins are only set in px
          scrollboxChildrenSize += parseFloat(computedStyle.marginLeft);
          scrollboxChildrenSize += parseFloat(computedStyle.marginRight);
        } else {
          scrollboxChildrenSize += parseFloat(computedStyle.marginTop);
          scrollboxChildrenSize += parseFloat(computedStyle.marginBottom);
        }
        scrollboxChildrenSize += child.getBoundingClientRect()[widthOrHeight];
      }
      const scrollboxSize = this.scrollbox.getBoundingClientRect()[widthOrHeight];

      const scrollbarSize = scrollboxSize - scrollboxChildrenSize;

      // Check if we need to show the headerScrollbarSpacer at all.
      let headerPropVal = scrollbarSize;
      const headerDayBox = this.querySelector(".headerdaybox");
      if (headerDayBox) {
        // Only do this when there are multiple days.
        const headerDayBoxMaxHeight = parseInt(
          document.defaultView.getComputedStyle(headerDayBox).getPropertyValue("max-height"),
          10
        );

        if (
          this.getAttribute("orient") == "vertical" &&
          headerDayBox.getBoundingClientRect().height >= headerDayBoxMaxHeight
        ) {
          // If the headerDayBox is just as high as the max-height, then
          // there is already a scrollbar and we don't need to show the
          // headerScrollbarSpacer. This is only valid for the non-rotated view.
          headerPropVal = 0;
        }
      }

      // Set the same width/height for the label and header box spacers.
      this.querySelector(".headerscrollbarspacer").setAttribute(widthOrHeight, headerPropVal);
      this.querySelector(".labelscrollbarspacer").setAttribute(widthOrHeight, scrollbarSize);
    }

    /**
     * Scroll the view to a given minute.
     *
     * @param {number} rawMinute    The minute to scroll to.
     */
    scrollToMinute(rawMinute) {
      const scrollbox = this.scrollbox;
      // The minute will be the first minute showed in the view, so it must
      // belong to the range 0 <-> (24*60 - minutes_showed_in_the_view) but
      // we consider 25 hours instead of 24 to let the view scroll until
      // showing events that start just before 0.00.
      const maxFirstMin =
        25 * 60 - Math.round(scrollbox.getBoundingClientRect().height / this.mPixPerMin);

      const minute = Math.min(maxFirstMin, Math.max(0, rawMinute));

      if (scrollbox.scrollHeight > 0) {
        const pos = Math.round(minute * this.mPixPerMin);
        if (scrollbox.getAttribute("orient") == "horizontal") {
          scrollbox.scrollTo(scrollbox.scrollLeft, pos);
        } else {
          scrollbox.scrollTo(pos, scrollbox.scrollTop);
        }
      }

      // Set the first visible minute in any case, we want to move to the
      // right minute as soon as possible if we couldn't do so above.
      this.mFirstVisibleMinute = minute;
    }

    /**
     * Set the day start minute and the day end minute.
     *
     * @param {number} dayStartMin    Starting minute for the day.
     * @param {number} dayEndMin      Ending minute for the day.
     */
    setDayStartEndMinutes(dayStartMin, dayEndMin) {
      // If the timebar is not set up yet, defer until it is.
      if (!("setDayStartEndHours" in this.timebar)) {
        this.timebar.addEventListener(
          "bindingattached",
          () => this.setDayStartEndMinutes(dayStartMin, dayEndMin),
          { once: true }
        );
        return;
      }
      if (dayStartMin < this.mStartMin || dayStartMin > dayEndMin || dayEndMin > this.mEndMin) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }
      if (this.mDayStartMin != dayStartMin || this.mDayEndMin != dayEndMin) {
        this.mDayStartMin = dayStartMin;
        this.mDayEndMin = dayEndMin;

        // Also update on the time-bar.
        this.timebar.setDayStartEndHours(this.mDayStartMin / 60, this.mDayEndMin / 60);
      }
    }

    /**
     * Set how many minutes are visible in the view.
     *
     * @param {number} minutes    A number of visible minutes.
     * @return {number}           A number of visible minutes.
     */
    setVisibleMinutes(minutes) {
      if (minutes <= 0 || minutes > this.mEndMin - this.mStartMin) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }
      if (this.mVisibleMinutes != minutes) {
        this.mVisibleMinutes = minutes;
      }
      return this.mVisibleMinutes;
    }
  }

  MozElements.CalendarMultidayBaseView = CalendarMultidayBaseView;
}
