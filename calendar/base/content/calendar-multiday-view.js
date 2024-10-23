/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* eslint-enable valid-jsdoc */

/* import-globals-from widgets/mouseoverPreviews.js */
/* import-globals-from calendar-ui-utils.js */

/* global calendarNavigationBar, currentView, gCurrentMode, getSelectedCalendar,
   invokeEventDragSession, MozElements, MozXULElement, timeIndicator */

// Wrap in a block to prevent leaking to window scope.
{
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  const MINUTES_IN_DAY = 24 * 60;
  const lazy = {};
  ChromeUtils.defineLazyGetter(
    lazy,
    "l10n",
    () => new Localization(["calendar/calendar.ftl"], true)
  );
  /**
   * Get the nearest or next snap point for the given minute. The set of snap
   * points is given by `n * snapInterval`, where `n` is some integer.
   *
   * @param {number} minute - The minute to snap.
   * @param {number} snapInterval - The integer number of minutes between snap
   *   points.
   * @param {"nearest"|"forward"|"backward"} [direction="nearest"] - Where to
   *   find the snap point. "nearest" will return the closest snap point,
   *   "forward" will return the closest snap point that is greater (and not
   *   equal), and "backward" will return the closest snap point that is lower
   *   (and not equal).
   *
   * @returns {number} - The nearest snap point.
   */
  function snapMinute(minute, snapInterval, direction = "nearest") {
    switch (direction) {
      case "forward":
        return Math.floor((minute + snapInterval) / snapInterval) * snapInterval;
      case "backward":
        return Math.ceil((minute - snapInterval) / snapInterval) * snapInterval;
      case "nearest":
        return Math.round(minute / snapInterval) * snapInterval;
      default:
        throw new RangeError(`"${direction}" is not one of the allowed values for the direction`);
    }
  }

  /**
   * Determine whether the given event item can be edited by the user.
   *
   * @param {calItemBase} eventItem - The event item.
   *
   * @returns {boolean} - Whether the given event can be edited by the user.
   */
  function canEditEventItem(eventItem) {
    return (
      cal.acl.isCalendarWritable(eventItem.calendar) &&
      cal.acl.userCanModifyItem(eventItem) &&
      !(
        eventItem.calendar instanceof Ci.calISchedulingSupport &&
        eventItem.calendar.isInvitation(eventItem)
      ) &&
      eventItem.calendar.getProperty("capabilities.events.supported") !== false
    );
  }

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
      };
    }

    /**
     * The background hour box elements this event column owns, ordered and
     * indexed by their starting hour.
     *
     * @type {Element[]}
     */
    hourBoxes = [];

    /**
     * The date of the day this event column represents.
     *
     * @type {calIDateTime}
     */
    date;

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <stack class="multiday-column-box-stack" flex="1">
            <html:div class="multiday-hour-box-container"></html:div>
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
      this.hourBoxContainer = this.querySelector(".multiday-hour-box-container");
      for (let hour = 0; hour < 24; hour++) {
        const hourBox = document.createElement("div");
        hourBox.classList.add("multiday-hour-box");
        this.hourBoxContainer.appendChild(hourBox);
        this.hourBoxes.push(hourBox);
      }

      this.eventsListElement = this.querySelector(".multiday-events-list");

      this.addEventListener("dblclick", event => {
        if (event.button != 0) {
          return;
        }

        if (this.calendarView.controller) {
          event.stopPropagation();
          this.calendarView.controller.createNewEvent(null, this.getMouseDateTime(event), null);
        }
      });

      this.addEventListener("click", event => {
        if (event.button != 0 || event.ctrlKey || event.metaKey) {
          return;
        }
        this.calendarView.setSelectedItems([]);
        this.focus();
      });

      // Mouse down handler, in empty event column regions.  Starts sweeping out a new event.
      this.addEventListener("mousedown", event => {
        // Select this column.
        this.calendarView.selectedDay = this.date;

        // If the selected calendar is readOnly, we don't want any sweeping.
        const calendar = getSelectedCalendar();
        if (
          !cal.acl.isCalendarWritable(calendar) ||
          calendar.getProperty("capabilities.events.supported") === false
        ) {
          return;
        }

        if (event.button == 2) {
          // Set a selected datetime for the context menu.
          this.calendarView.selectedDateTime = this.getMouseDateTime(event);
          return;
        }
        // Only start sweeping out an event if the left button was clicked.
        if (event.button != 0) {
          return;
        }

        this.mDragState = {
          origColumn: this,
          dragType: "new",
          mouseMinuteOffset: 0,
          offset: null,
          shadows: null,
          limitStartMin: null,
          limitEndMin: null,
          jumpedColumns: 0,
        };

        // Snap interval: 15 minutes or 1 minute if modifier key is pressed.
        this.mDragState.origMin = snapMinute(
          this.getMouseMinute(event),
          event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey ? 1 : 15
        );

        if (this.getAttribute("orient") == "vertical") {
          this.mDragState.origLoc = event.clientY;
          this.mDragState.limitEndMin = this.mDragState.origMin;
          this.mDragState.limitStartMin = this.mDragState.origMin;
          this.fgboxes.dragspacer.setAttribute(
            "height",
            this.mDragState.origMin * this.pixelsPerMinute
          );
        } else {
          this.mDragState.origLoc = event.clientX;
          this.fgboxes.dragspacer.setAttribute(
            "width",
            this.mDragState.origMin * this.pixelsPerMinute
          );
        }

        document.calendarEventColumnDragging = this;

        window.addEventListener("mousemove", this.onEventSweepMouseMove);
        window.addEventListener("mouseup", this.onEventSweepMouseUp);
        window.addEventListener("keypress", this.onEventSweepKeypress);
      });

      /**
       * An internal collection of data for events.
       *
       * @typedef {object} EventData
       * @property {calItemBase} eventItem - The event item.
       * @property {Element} element - The displayed event in this column.
       * @property {boolean} selected - Whether the event is selected.
       * @property {boolean} needsUpdate - True whilst the eventItem has changed
       *   and we are still pending updating the 'element' property.
       */
      /**
       * Event data for all the events displayed in this column.
       *
       * @type {Map<string,EventData>} - A map from an event item's hashId to
       *   its data.
       */
      this.eventDataMap = new Map();

      this.mCalendarView = null;

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

      this.initializeAttributeInheritance();
    }

    /**
     * The number of pixels that a one minute duration should occupy in the
     * column.
     *
     * @type {number}
     */
    set pixelsPerMinute(val) {
      this._pixelsPerMinute = val;
      this.relayout();
    }

    get pixelsPerMinute() {
      return this._pixelsPerMinute;
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

    /**
     * Set whether the calendar-event-box element for the given event item
     * should be displayed as selected or unselected.
     *
     * @param {calItemBase} eventItem - The event item.
     * @param {boolean} select - Whether to show the corresponding event element
     *   as selected.
     */
    selectEvent(eventItem, select) {
      const data = this.eventDataMap.get(eventItem.hashId);
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
     * @returns {Element} - The corresponding element, or undefined if none.
     */
    findElementForEventItem(eventItem) {
      return this.eventDataMap.get(eventItem.hashId)?.element;
    }

    /**
     * Return all the event items that are displayed in this columns.
     *
     * @returns {calItemBase[]} - An array of all the displayed event items.
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
      const ret = super.setAttribute(attr, val);

      if (attr == "orient" && this.getAttribute("orient") != val) {
        this.relayout();
      }

      return ret;
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

      const orient = this.getAttribute("orient");

      const configBox = this.querySelector("calendar-event-box");
      configBox.removeAttribute("hidden");
      const minSize = configBox.getOptimalMinSize(orient);
      configBox.setAttribute("hidden", "true");
      // The minimum event duration in minutes that would give at least the
      // desired minSize in the layout.
      const minDuration = Math.ceil(minSize / this.pixelsPerMinute);

      const dayPx = `${MINUTES_IN_DAY * this.pixelsPerMinute}px`;
      if (orient == "vertical") {
        this.hourBoxContainer.style.height = dayPx;
        this.hourBoxContainer.style.width = null;
      } else {
        this.hourBoxContainer.style.width = dayPx;
        this.hourBoxContainer.style.height = null;
      }

      // 'fgbox' is used for dragging events.
      this.fgboxes.box.setAttribute("orient", orient);
      this.querySelector(".fgdragspacer").setAttribute("orient", orient);

      for (const eventData of this.eventDataMap.values()) {
        if (!eventData.needsUpdate) {
          continue;
        }
        eventData.needsUpdate = false;
        // Create a new wrapper.
        const eventElement = document.createElement("li");
        eventElement.classList.add("multiday-event-listitem");
        // Set up the event box.
        const eventBox = document.createXULElement("calendar-event-box");
        eventElement.appendChild(eventBox);

        // Trigger connectedCallback
        this.eventsListElement.appendChild(eventElement);

        eventBox.setAttribute(
          "context",
          this.getAttribute("item-context") || this.getAttribute("context")
        );

        eventBox.calendarView = this.calendarView;
        eventBox.occurrence = eventData.eventItem;
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

        // Remove the element to be added again later.
        eventElement.remove();
      }

      const eventLayoutList = this.computeEventLayoutInfo(minDuration);

      for (const eventInfo of eventLayoutList) {
        // Note that we store the calendar-event-box in the eventInfo, so we
        // grab its parent to get the wrapper list item.
        // NOTE: This may be a newly created element or a non-updated element
        // that was removed from the eventsListElement in _clearElements. We
        // still hold a reference to it, so we can re-add it in the new ordering
        // and change its dimensions.
        const eventElement = eventInfo.element.parentNode;
        // FIXME: offset and length should be in % of parent's dimension, so we
        // can avoid pixelsPerMinute.
        const offset = `${eventInfo.start * this.pixelsPerMinute}px`;
        const length = `${(eventInfo.end - eventInfo.start) * this.pixelsPerMinute}px`;
        const secondaryOffset = `${eventInfo.secondaryOffset * 100}%`;
        const secondaryLength = `${eventInfo.secondaryLength * 100}%`;
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
      }

      const boxToEdit = this.eventDataMap.get(this.eventToEdit)?.element;
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
     * @typedef {object} EventLayoutInfo
     * @property {MozCalendarEventBox} element - The displayed event.
     * @property {number} start - The number of minutes from the start of this
     *   column's day to when the event should start.
     * @property {number} end - The number of minutes from the start of this
     *   column's day to when the event ends.
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
     * @returns {EventLayoutInfo[]} - An ordered list of event layout
     *   information.
     */
    computeEventLayoutInfo(minDuration) {
      if (!this.eventDataMap.size) {
        return [];
      }

      function sortByStart(aEventInfo, bEventInfo) {
        // If you pass in tasks without both entry and due dates, I will
        // kill you.
        const startComparison = aEventInfo.startDate.compare(bEventInfo.startDate);
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
      const eventList = Array.from(this.eventDataMap.values(), eventData => {
        const element = eventData.element;
        let { startDate, endDate, startMinute, endMinute } = element.updateRelativeStartEndDates(
          this.date
        );
        // If there is no startDate, we use the element's endDate for both the
        // start and the end times. Similarly if there is no endDate. Such items
        // will automatically have the minimum duration.
        if (!startDate) {
          startDate = endDate;
          startMinute = endMinute;
        } else if (!endDate) {
          endDate = startDate;
          endMinute = startMinute;
        }
        // Any events that start or end on a different day are clipped to the
        // start/end minutes of this day instead.
        const start = Math.max(startMinute, 0);
        // NOTE: The end can overflow the end of the day due to the minDuration.
        const end = Math.max(start + minDuration, Math.min(endMinute, MINUTES_IN_DAY));
        return { element, startDate, endDate, start, end };
      });
      eventList.sort(sortByStart);

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
      const allEventBlocks = [];
      // The current Block.
      let blockColumns = [];
      let blockEnd = eventList[0].end;

      for (const eventInfo of eventList) {
        const start = eventInfo.start;
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
        for (const column of blockColumns) {
          // We know from the ordering of eventList that all Events already in a
          // Column have a start time that is equal to or earlier than this
          // Event's start time. Therefore, in order for this Event to not
          // overlap anything else in this Column, it must have a start time
          // that is later than or equal to the end time of the last Event in
          // this column.
          const colEnd = column[column.length - 1].end;
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

      for (const column of allEventBlocks) {
        const totalCols = column.length;
        for (let colIndex = 0; colIndex < totalCols; colIndex++) {
          for (const eventInfo of column[colIndex]) {
            if (eventInfo.processed) {
              // Already processed this Event in an earlier Column.
              continue;
            }
            const { start, end } = eventInfo;
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
              const neighbourColumn = column[neighbourColIndex];
              // Test if this Event overlaps any of the other Events in the
              // neighbouring Column.
              let overlapsCol = false;
              let indexInCol;
              for (indexInCol = 0; indexInCol < neighbourColumn.length; indexInCol++) {
                const otherEventInfo = neighbourColumn[indexInCol];
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

    /**
     * Get information about which columns, relative to this column, are
     * covered by the given time interval.
     *
     * @param {number} start - The starting time of the interval, in minutes
     *   from the start of this column's day. Should be negative for times on
     *   previous days. This must be on this column's day or earlier.
     * @param {number} end - The ending time of the interval, in minutes from
     *   the start of this column's day. This can go beyond the end of this day.
     *   This must be greater than 'start' and on this column's day or later.
     *
     * @returns {object} - Data determining which columns are covered by the
     *   interval. Each column that is in the given range is covered from the
     *   start of the day to the end, apart from the first and last columns.
     * @property {number} shadows - The number of columns that have some cover.
     * @property {number} offset - The number of columns before this column that
     *   have some cover. For example, if 'start' is the day before, this is 1.
     * @property {number} startMin - The starting time of the time interval, in
     *   minutes relative to the start of the first column's day.
     * @property {number} endMin - The ending time of the time interval, in
     *   minutes relative to the start of the last column's day.
     */
    getShadowElements(start, end) {
      let shadows = 1;
      let offset = 0;
      let startMin;
      if (start < 0) {
        offset = Math.ceil(Math.abs(start) / MINUTES_IN_DAY);
        shadows += offset;
        const remainder = Math.abs(start) % MINUTES_IN_DAY;
        startMin = remainder ? MINUTES_IN_DAY - remainder : 0;
      } else {
        startMin = start;
      }
      shadows += Math.floor(end / MINUTES_IN_DAY);
      return { shadows, offset, startMin, endMin: end % MINUTES_IN_DAY };
    }

    /**
     * Clear a dragging sequence that is owned by this column.
     */
    clearDragging() {
      for (const col of this.calendarView.getEventColumns()) {
        col.fgboxes.dragbox.removeAttribute("dragging");
        col.fgboxes.box.removeAttribute("dragging");
        // We remove the height and width attributes as well.
        // In particular, this means we won't accidentally preserve the height
        // attribute if we switch to the rotated view, or the width if we
        // switch back.
        col.fgboxes.dragbox.removeAttribute("width");
        col.fgboxes.dragbox.removeAttribute("height");
        col.fgboxes.dragspacer.removeAttribute("width");
        col.fgboxes.dragspacer.removeAttribute("height");
      }

      window.removeEventListener("mousemove", this.onEventSweepMouseMove);
      window.removeEventListener("mouseup", this.onEventSweepMouseUp);
      window.removeEventListener("keypress", this.onEventSweepKeypress);
      document.calendarEventColumnDragging = null;
      this.mDragState = null;
    }

    /**
     * Update the shown drag state of all event columns in the same view using
     * the mDragState of the current column.
     */
    updateColumnShadows() {
      let startStr;
      // Tasks without Entry or Due date have a string as first label
      // instead of the time.
      const item = this.mDragState.dragOccurrence;
      if (item?.isTodo()) {
        if (!item.dueDate) {
          startStr = lazy.l10n.formatValueSync("drag-label-tasks-with-only-entry-date");
        } else if (!item.entryDate) {
          startStr = lazy.l10n.formatValueSync("drag-label-tasks-with-only-due-date");
        }
      }

      const { startMin, endMin, offset, shadows } = this.mDragState;
      const jsTime = new Date();
      const formatter = cal.dtz.formatter;
      if (!startStr) {
        jsTime.setHours(0, startMin, 0);
        startStr = formatter.formatTime(cal.dtz.jsDateToDateTime(jsTime, cal.dtz.floating));
      }
      jsTime.setHours(0, endMin, 0);
      const endStr = formatter.formatTime(cal.dtz.jsDateToDateTime(jsTime, cal.dtz.floating));

      const allColumns = this.calendarView.getEventColumns();
      const thisIndex = allColumns.indexOf(this);
      // NOTE: startIndex and endIndex be before or after the start and end of
      // the week, respectively, if the event spans multiple days.
      const startIndex = thisIndex - offset;
      const endIndex = startIndex + shadows - 1;

      // All columns have the same orient and pixels per minutes.
      const sizeProp = this.getAttribute("orient") == "vertical" ? "height" : "width";
      const pixPerMin = this.pixelsPerMinute;

      for (let i = 0; i < allColumns.length; i++) {
        const fgboxes = allColumns[i].fgboxes;
        if (i == startIndex) {
          fgboxes.dragbox.setAttribute("dragging", "true");
          fgboxes.box.setAttribute("dragging", "true");
          fgboxes.dragspacer.style[sizeProp] = `${startMin * pixPerMin}px`;
          fgboxes.dragbox.style[sizeProp] = `${
            ((i == endIndex ? endMin : MINUTES_IN_DAY) - startMin) * pixPerMin
          }px`;
          fgboxes.startlabel.value = startStr;
          fgboxes.endlabel.value = i == endIndex ? endStr : "";
        } else if (i == endIndex) {
          fgboxes.dragbox.setAttribute("dragging", "true");
          fgboxes.box.setAttribute("dragging", "true");
          fgboxes.dragspacer.style[sizeProp] = "0";
          fgboxes.dragbox.style[sizeProp] = `${endMin * pixPerMin}px`;
          fgboxes.startlabel.value = "";
          fgboxes.endlabel.value = endStr;
        } else if (i > startIndex && i < endIndex) {
          fgboxes.dragbox.setAttribute("dragging", "true");
          fgboxes.box.setAttribute("dragging", "true");
          fgboxes.dragspacer.style[sizeProp] = "0";
          fgboxes.dragbox.style[sizeProp] = `${MINUTES_IN_DAY * pixPerMin}px`;
          fgboxes.startlabel.value = "";
          fgboxes.endlabel.value = "";
        } else {
          fgboxes.dragbox.removeAttribute("dragging");
          fgboxes.box.removeAttribute("dragging");
        }
      }
    }

    onEventSweepKeypress(event) {
      const col = document.calendarEventColumnDragging;
      if (col && event.key == "Escape") {
        col.clearDragging();
      }
    }

    // Event sweep handlers.
    onEventSweepMouseMove(event) {
      const col = document.calendarEventColumnDragging;
      if (!col) {
        return;
      }

      const dragState = col.mDragState;

      // FIXME: Use mouseenter and mouseleave to detect column changes since
      // they fire when scrolling changes the mouse target, but mousemove does
      // not.
      const newcol = col.calendarView.findEventColumnThatContains(event.target);
      // If we leave the view, then stop our internal sweeping and start a
      // real drag session. Someday we need to fix the sweep to soely be a
      // drag session, no sweeping.
      if (dragState.dragType == "move" && !newcol) {
        // Remove the drag state.
        col.clearDragging();

        const item = dragState.dragOccurrence;

        // The multiday view currently exhibits a less than optimal strategy
        // in terms of item selection. items don't get automatically selected
        // when clicked and dragged, as to differentiate inline editing from
        // the act of selecting an event. but the application internal drop
        // targets will ask for selected items in order to pull the data from
        // the packets. that's why we need to make sure at least the currently
        // dragged event is contained in the set of selected items.
        const selectedItems = this.getSelectedItems();
        if (!selectedItems.some(aItem => aItem.hashId == item.hashId)) {
          col.calendarView.setSelectedItems([event.ctrlKey ? item.parentItem : item]);
        }
        // NOTE: Dragging to the allday header will fail (bug 1675056).
        return;
      }

      // Snap interval: 15 minutes or 1 minute if modifier key is pressed.
      dragState.snapIntMin =
        event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey ? 1 : 15;

      // Check if we need to jump a column.
      if (newcol && newcol != col) {
        // Find how many columns we are jumping by subtracting the dates.
        const dur = newcol.date.subtractDate(col.date);
        const jumpedColumns = dur.isNegative ? -dur.days : dur.days;
        if (dragState.dragType == "modify-start") {
          // Prevent dragging the start date after the end date in a new column.
          const limitEndMin = dragState.limitEndMin - MINUTES_IN_DAY * jumpedColumns;
          if (limitEndMin < 0) {
            return;
          }
          dragState.limitEndMin = limitEndMin;
        } else if (dragState.dragType == "modify-end") {
          const limitStartMin = dragState.limitStartMin - MINUTES_IN_DAY * jumpedColumns;
          // Prevent dragging the end date before the start date in a new column.
          if (limitStartMin > MINUTES_IN_DAY) {
            return;
          }
          dragState.limitStartMin = limitStartMin;
        } else if (dragState.dragType == "new") {
          dragState.limitEndMin -= MINUTES_IN_DAY * jumpedColumns;
          dragState.limitStartMin -= MINUTES_IN_DAY * jumpedColumns;
          dragState.jumpedColumns += jumpedColumns;
        }

        // Move drag state to the new column.
        col.mDragState = null;
        newcol.mDragState = dragState;
        document.calendarEventColumnDragging = newcol;
        // The same event handlers are still valid,
        // because they use document.calendarEventColumnDragging.
      }

      col.updateDragPosition(event.clientX, event.clientY);
    }

    /**
     * Update the drag position to point to the given client position.
     *
     * Note, this method will not switch the drag state between columns.
     *
     * @param {number} clientX - The x position.
     * @param {number} clientY - The y position.
     */
    updateDragPosition(clientX, clientY) {
      const col = document.calendarEventColumnDragging;
      if (!col) {
        return;
      }
      // If we scroll, we call this method again using the same mouse positions.
      // NOTE: if the magic scroll makes the mouse move over a different column,
      // this won't be updated until another mousemove.
      this.calendarView.setupMagicScroll(clientX, clientY, () =>
        this.updateDragPosition(clientX, clientY)
      );

      const dragState = col.mDragState;

      let mouseMinute = this.getMouseMinute({ clientX, clientY });
      if (mouseMinute < 0) {
        mouseMinute = 0;
      } else if (mouseMinute > MINUTES_IN_DAY) {
        mouseMinute = MINUTES_IN_DAY;
      }
      const snappedMouseMinute = snapMinute(
        mouseMinute - dragState.mouseMinuteOffset,
        dragState.snapIntMin
      );

      let deltamin = snappedMouseMinute - dragState.origMin;

      let shadowElements;
      if (dragState.dragType == "new") {
        // Extend deltamin in a linear way over the columns.
        deltamin += MINUTES_IN_DAY * dragState.jumpedColumns;
        if (deltamin < 0) {
          // Create a new event modifying the start. End time is fixed.
          shadowElements = {
            shadows: 1 - dragState.jumpedColumns,
            offset: 0,
            startMin: snappedMouseMinute,
            endMin: dragState.origMin,
          };
        } else {
          // Create a new event modifying the end. Start time is fixed.
          shadowElements = {
            shadows: dragState.jumpedColumns + 1,
            offset: dragState.jumpedColumns,
            startMin: dragState.origMin,
            endMin: snappedMouseMinute,
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
          dragState.startMin = snapMinute(dragState.limitEndMin, dragState.snapIntMin, "backward");
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
          dragState.endMin = snapMinute(dragState.limitStartMin, dragState.snapIntMin, "forward");
        }
      }
      dragState.offset = shadowElements.offset;
      dragState.shadows = shadowElements.shadows;

      // Now we can update the shadow boxes position and size.
      col.updateColumnShadows();
    }

    onEventSweepMouseUp(event) {
      const col = document.calendarEventColumnDragging;
      if (!col) {
        return;
      }

      const dragState = col.mDragState;

      col.clearDragging();
      col.calendarView.clearMagicScroll();

      // If the user didn't sweep out at least a few pixels, ignore
      // unless we're in a different column.
      if (dragState.origColumn == col) {
        const position = col.getAttribute("orient") == "vertical" ? event.clientY : event.clientX;
        if (Math.abs(position - dragState.origLoc) < 3) {
          return;
        }
      }

      let newStart;
      let newEnd;
      let startTZ;
      let endTZ;
      const dragDay = col.date;
      if (dragState.dragType != "new") {
        const oldStart =
          dragState.dragOccurrence.startDate ||
          dragState.dragOccurrence.entryDate ||
          dragState.dragOccurrence.dueDate;
        const oldEnd =
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
        if (col.date.timezone != newStart.timezone || col.date.timezone != newEnd.timezone) {
          startTZ = newStart.timezone;
          endTZ = newEnd.timezone;
          newStart = newStart.getInTimezone(col.date.timezone);
          newEnd = newEnd.getInTimezone(col.date.timezone);
        }
      }

      if (dragState.dragType == "modify-start") {
        newStart.resetTo(
          dragDay.year,
          dragDay.month,
          dragDay.day,
          0,
          dragState.startMin,
          0,
          newStart.timezone
        );
      } else if (dragState.dragType == "modify-end") {
        newEnd.resetTo(
          dragDay.year,
          dragDay.month,
          dragDay.day,
          0,
          dragState.endMin,
          0,
          newEnd.timezone
        );
      } else if (dragState.dragType == "new") {
        const startDay = dragState.origColumn.date;
        const draggedForward = dragDay.compare(startDay) > 0;
        newStart = draggedForward ? startDay.clone() : dragDay.clone();
        newEnd = draggedForward ? dragDay.clone() : startDay.clone();
        newStart.isDate = false;
        newEnd.isDate = false;
        newStart.resetTo(
          newStart.year,
          newStart.month,
          newStart.day,
          0,
          dragState.startMin,
          0,
          newStart.timezone
        );
        newEnd.resetTo(
          newEnd.year,
          newEnd.month,
          newEnd.day,
          0,
          dragState.endMin,
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
        const duration = dragDay.subtractDate(dragState.origColumn.date);
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
        col.calendarView.controller.createNewEvent(null, newStart, newEnd);
      } else if (
        dragState.dragType == "move" ||
        dragState.dragType == "modify-start" ||
        dragState.dragType == "modify-end"
      ) {
        col.calendarView.controller.modifyOccurrence(dragState.dragOccurrence, newStart, newEnd);
      }
    }

    /**
     * Start modifying an item through a mouse motion.
     *
     * @param {calItemBase} eventItem - The event item to start modifying.
     * @param {"start"|"end"|"middle"} where - Whether to modify the starting
     *   time, ending time, or moving the entire event (modify the start and
     *   end, but preserve the duration).
     * @param {object} position - The mouse position of the event that
     *   initialized* the motion.
     * @param {number} position.clientX - The client x position.
     * @param {number} position.clientY - The client y position.
     * @param {number} position.offsetStartMinute - The minute offset of the
     *   mouse relative to the event item's starting time edge.
     * @param {number} [snapIntMin=15] - The snapping interval to apply to the
     *   mouse position, in minutes.
     */
    startSweepingToModifyEvent(eventItem, where, position, snapIntMin = 15) {
      if (!canEditEventItem(eventItem)) {
        return;
      }

      this.mDragState = {
        origColumn: this,
        dragOccurrence: eventItem,
        mouseMinuteOffset: 0,
        offset: null,
        shadows: null,
        limitStartMin: null,
        lastStart: 0,
        jumpedColumns: 0,
      };

      if (this.getAttribute("orient") == "vertical") {
        this.mDragState.origLoc = position.clientY;
      } else {
        this.mDragState.origLoc = position.clientX;
      }

      const stdate = eventItem.startDate || eventItem.entryDate || eventItem.dueDate;
      const enddate = eventItem.endDate || eventItem.dueDate || eventItem.entryDate;

      // Get the start and end times in minutes, relative to the start of the
      // day. This may be negative or exceed the length of the day if the event
      // spans more than one day.
      const realStart = Math.floor(stdate.subtractDate(this.date).inSeconds / 60);
      const realEnd = Math.floor(enddate.subtractDate(this.date).inSeconds / 60);

      if (where == "start") {
        this.mDragState.dragType = "modify-start";
        // We have to use "realEnd" as fixed end value.
        this.mDragState.limitEndMin = realEnd;

        // Snap start.
        // Since we are modifying the start, we know the event starts on this
        // day, so realStart is not negative.
        this.mDragState.origMin = snapMinute(realStart, snapIntMin);

        // Show the shadows and drag labels when clicking on gripbars.
        const shadowElements = this.getShadowElements(
          this.mDragState.origMin,
          this.mDragState.limitEndMin
        );
        this.mDragState.startMin = shadowElements.startMin;
        this.mDragState.endMin = shadowElements.endMin;
        this.mDragState.shadows = shadowElements.shadows;
        this.mDragState.offset = shadowElements.offset;
        this.updateColumnShadows();
      } else if (where == "end") {
        this.mDragState.dragType = "modify-end";
        // We have to use "realStart" as fixed end value.
        this.mDragState.limitStartMin = realStart;

        // Snap end.
        // Since we are modifying the end, we know the event end on this day,
        // so realEnd is before midnight on this day.
        this.mDragState.origMin = snapMinute(realEnd, snapIntMin);

        // Show the shadows and drag labels when clicking on gripbars.
        const shadowElements = this.getShadowElements(
          this.mDragState.limitStartMin,
          this.mDragState.origMin
        );
        this.mDragState.startMin = shadowElements.startMin;
        this.mDragState.endMin = shadowElements.endMin;
        this.mDragState.shadows = shadowElements.shadows;
        this.mDragState.offset = shadowElements.offset;
        this.updateColumnShadows();
      } else if (where == "middle") {
        this.mDragState.dragType = "move";
        // In a move, origMin will be the start minute of the element where
        // the drag occurs. Along with mouseMinuteOffset, it allows to track the
        // shadow position. origMinStart and origMinEnd allow to figure out
        // the real shadow size.
        this.mDragState.mouseMinuteOffset = position.offsetStartMinute;
        // We use origMin to get the number of minutes since the start of *this*
        // day, which is 0 if realStart is negative.
        this.mDragState.origMin = Math.max(0, snapMinute(realStart, snapIntMin));
        // We snap to the start and add the real duration to find the end.
        this.mDragState.origMinStart = snapMinute(realStart, snapIntMin);
        this.mDragState.origMinEnd = realEnd + this.mDragState.origMinStart - realStart;
        // Keep also track of the real Start, it will be used at the end
        // of the drag session to calculate the new start and end datetimes.
        this.mDragState.realStart = realStart;

        const shadowElements = this.getShadowElements(
          this.mDragState.origMinStart,
          this.mDragState.origMinEnd
        );
        this.mDragState.shadows = shadowElements.shadows;
        this.mDragState.offset = shadowElements.offset;
        // Do not show the shadow yet.
      } else {
        // Invalid grabbed element.
      }

      document.calendarEventColumnDragging = this;

      window.addEventListener("mousemove", this.onEventSweepMouseMove);
      window.addEventListener("mouseup", this.onEventSweepMouseUp);
      window.addEventListener("keypress", this.onEventSweepKeypress);
    }

    /**
     * Set the hours when the day starts and ends.
     *
     * @param {number} dayStartHour - Hour at which the day starts.
     * @param {number} dayEndHour - Hour at which the day ends.
     */
    setDayStartEndHours(dayStartHour, dayEndHour) {
      if (dayStartHour < 0 || dayStartHour > dayEndHour || dayEndHour > 24) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }
      for (const [hour, hourBox] of this.hourBoxes.entries()) {
        hourBox.classList.toggle(
          "multiday-hour-box-off-time",
          hour < dayStartHour || hour >= dayEndHour
        );
      }
    }

    /**
     * Get the minute since the starting edge of the given element that a mouse
     * event points to.
     *
     * @param {{clientX: number, clientY: number}} mouseEvent - The pointer
     *   position in the viewport.
     * @param {Element} [element] - The element to use the starting edge of as
     *   reference. Defaults to using the starting edge of the column itself,
     *   such that the returned minute is the number of minutes since the start
     *   of the day.
     *
     * @returns {number} - The number of minutes since the starting edge of
     *   'element' that this event points to.
     */
    getMouseMinute(mouseEvent, element = this) {
      const rect = element.getBoundingClientRect();
      let pos;
      if (this.getAttribute("orient") == "vertical") {
        pos = mouseEvent.clientY - rect.top;
      } else if (document.dir == "rtl") {
        pos = rect.right - mouseEvent.clientX;
      } else {
        pos = mouseEvent.clientX - rect.left;
      }
      return pos / this.pixelsPerMinute;
    }

    /**
     * Get the datetime that the mouse event points to, snapped to the nearest
     * 15 minutes.
     *
     * @param {MouseEvent} mouseEvent - The pointer event.
     *
     * @returns {calDateTime} - A new datetime that the mouseEvent points to.
     */
    getMouseDateTime(mouseEvent) {
      const clickMinute = this.getMouseMinute(mouseEvent);
      const newStart = this.date.clone();
      newStart.isDate = false;
      newStart.hour = 0;
      // Round to nearest 15 minutes.
      newStart.minute = snapMinute(clickMinute, 15);
      return newStart;
    }
  }

  customElements.define("calendar-event-column", MozCalendarEventColumn);

  /**
   * Implements the Drag and Drop class for the Calendar Header Container.
   *
   * @augments {MozElements.CalendarDnDContainer}
   */
  class CalendarHeaderContainer extends MozElements.CalendarDnDContainer {
    /**
     * The date of the day this header represents.
     *
     * @type {calIDateTime}
     */
    date;

    constructor() {
      super();
      this.addEventListener("dblclick", this.onDblClick);
      this.addEventListener("mousedown", this.onMouseDown);
      this.addEventListener("click", this.onClick);
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

    /**
     * Return the displayed calendar-editable-item element for the given event
     * item.
     *
     * @param {calItemBase} eventItem - The event item.
     *
     * @returns {Element} - The corresponding element, or undefined if none.
     */
    findElementForEventItem(eventItem) {
      return this.eventElements.get(eventItem.hashId);
    }

    /**
     * Return all the event items that are displayed in this columns.
     *
     * @returns {calItemBase[]} - An array of all the displayed event items.
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
      const existing = this.eventElements.get(eventItem.hashId);
      if (existing) {
        // Remove the wrapper list item. We'll insert a replacement below.
        existing.parentNode.remove();
      }

      const itemBox = document.createXULElement("calendar-editable-item");
      const listItemWrapper = document.createElement("li");
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
      itemBox.setAttribute(
        "context",
        this.calendarView.getAttribute("item-context") || this.calendarView.getAttribute("context")
      );
      itemBox.setAttribute("draggable", "true");

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
      const current = this.eventElements.get(eventItem.hashId);
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
      // NOTE: Adding or removing drop shadows may change our size, but we won't
      // let the calendar view know about these since they are temporary and we
      // don't want the view to be re-adjusting on every hover.
      const existing = this.eventsListElement.querySelector(".dropshadow");
      if (on) {
        if (!existing) {
          // Insert an empty list item.
          const dropshadow = document.createElement("li");
          dropshadow.classList.add("dropshadow", "allday-event-listitem");
          this.eventsListElement.insertBefore(dropshadow, this.eventsListElement.firstElementChild);
        }
      } else if (existing) {
        existing.remove();
      }
    }

    onDropItem(aItem) {
      let newItem = cal.item.moveToDate(aItem, this.date);
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
      const element = this.eventElements.get(eventItem.hashId);
      if (!element) {
        return;
      }
      element.selected = select;
    }

    onDblClick(event) {
      if (event.button == 0) {
        this.calendarView.controller.createNewEvent(null, this.date, null, true);
      }
    }

    onMouseDown() {
      this.calendarView.selectedDay = this.date;
    }

    onClick(event) {
      if (event.button == 0) {
        if (!(event.ctrlKey || event.metaKey)) {
          this.calendarView.setSelectedItems([]);
        }
      }
      if (event.button == 2) {
        const newStart = this.calendarView.selectedDay.clone();
        newStart.isDate = true;
        this.calendarView.selectedDateTime = newStart;
        event.stopPropagation();
      }
    }

    /**
     * Determine whether the given wheel event is above a scrollable area and
     * matches the scroll direction.
     *
     * @param {WheelEvent} event - The wheel event.
     *
     * @returns {boolean} - True if this event is above a scrollable area and
     *   matches its scroll direction.
     */
    wheelOnScrollableArea(event) {
      const scrollArea = this.eventsListElement;
      return (
        event.deltaY &&
        scrollArea.contains(event.target) &&
        scrollArea.scrollHeight != scrollArea.clientHeight
      );
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
   * @augments {MozElements.MozCalendarEditableItem}
   */
  class MozCalendarEventBox extends MozElements.MozCalendarEditableItem {
    static get inheritedAttributes() {
      return {
        ".alarm-icons-box": "flashing",
      };
    }
    constructor() {
      super();
      this.addEventListener("mousedown", event => {
        if (event.button != 0) {
          return;
        }

        event.stopPropagation();

        if (this.mEditing) {
          return;
        }

        this.parentColumn.calendarView.selectedDay = this.parentColumn.date;

        this.mouseDownPosition = {
          clientX: event.clientX,
          clientY: event.clientY,
          // We calculate the offsetStartMinute here because the clientX and
          // clientY coordinates might become 'stale' by the time we actually
          // call startItemDrag. E.g. if we scroll the view.
          offsetStartMinute: this.parentColumn.getMouseMinute(
            event,
            // We use the listitem wrapper, since that is positioned relative to
            // the event's start time.
            this.closest(".multiday-event-listitem")
          ),
        };

        let side;
        if (this.startGripbar.contains(event.target)) {
          side = "start";
        } else if (this.endGripbar.contains(event.target)) {
          side = "end";
        }

        if (side) {
          this.calendarView.setSelectedItems([
            event.ctrlKey ? this.mOccurrence.parentItem : this.mOccurrence,
          ]);

          // Start edge resize drag
          this.parentColumn.startSweepingToModifyEvent(
            this.mOccurrence,
            side,
            this.mouseDownPosition,
            event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey ? 1 : 15
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

        const deltaX = Math.abs(event.clientX - this.mouseDownPosition.clientX);
        const deltaY = Math.abs(event.clientY - this.mouseDownPosition.clientY);
        // More than a 3 pixel move?
        const movedMoreThan3Pixels = deltaX * deltaX + deltaY * deltaY > 9;
        if (movedMoreThan3Pixels && this.parentColumn) {
          this.startItemDrag();
        }
      });

      this.addEventListener("mouseout", () => {
        if (!this.mEditing && this.mInMouseDown && this.parentColumn) {
          this.startItemDrag();
        }
      });

      this.addEventListener("mouseup", () => {
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

      this.addEventListener("mouseenter", () => {
        // Update the event-readonly class to determine whether to show the
        // gripbars, which are otherwise shown on hover.
        this.classList.toggle("event-readonly", !canEditEventItem(this.occurrence));
      });
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      MozXULElement.insertFTLIfNeeded("calendar/calendar.ftl");

      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <!-- NOTE: The following div is the same markup as EditableItem. -->
          <html:div class="calendar-item-container">
            <html:div class="calendar-item-flex">
              <html:img class="item-type-icon" alt="" />
              <html:div class="event-name-label"></html:div>
              <html:input class="plain event-name-input"
                          hidden="hidden"
                          data-l10n-id="new-event"/>
              <html:div class="alarm-icons-box"></html:div>
              <html:img class="item-classification-icon" />
              <html:img class="item-recurrence-icon" />
            </html:div>
            <html:div class="location-desc"></html:div>
            <html:div class="calendar-category-box"></html:div>
          </html:div>
        `)
      );

      this.startGripbar = this.createGripbar("start");
      this.endGripbar = this.createGripbar("end");
      this.appendChild(this.startGripbar);
      this.appendChild(this.endGripbar);

      this.classList.add("calendar-color-box");

      this.style.pointerEvents = "auto";
      this.setAttribute("tooltip", "itemTooltip");

      this.addEventNameTextboxListener();
      this.initializeAttributeInheritance();
    }

    /**
     * Create one of the box's gripbars that can be dragged to resize the event.
     *
     * @param {"start"|"end"} side - The side the gripbar controls.
     *
     * @returns {Element} - A newly created gripbar.
     */
    createGripbar(side) {
      const gripbar = document.createElement("div");
      gripbar.classList.add(side == "start" ? "gripbar-start" : "gripbar-end");
      const img = document.createElement("img");
      img.setAttribute("src", "chrome://calendar/skin/shared/event-grippy.png");
      /* Make sure the img doesn't interfere with dragging the gripbar to
       * resize. */
      img.setAttribute("draggable", "false");
      img.setAttribute("alt", "");
      gripbar.appendChild(img);
      return gripbar;
    }

    /**
     * Update and retrieve the event's start and end dates relative to the given
     * day. This updates the gripbars.
     *
     * @param {calIDateTime} day - The day that this event is shown on.
     *
     * @returns {object} - The start and end time information.
     * @property {calIDateTime|undefined} startDate - The start date-time of the
     *   event in the timezone of the given day. Or the entry date-time for
     *   tasks, if they have one.
     * @property {calIDateTime|undefined} endDate - The end date-time of the
     *   event in the timezone of the given day. Or the due date-time for
     *   tasks, if they have one.
     * @property {number} startMinute - The number of minutes since the start of
     *   the given day that the event starts.
     * @property {number} endMinute - The number of minutes since the end of the
     *   given day that the event ends.
     */
    updateRelativeStartEndDates(day) {
      const item = this.occurrence;

      // Get closed bounds for the day. I.e. inclusive of midnight the next day.
      const closedDayStart = day.clone();
      closedDayStart.isDate = false;
      const closedDayEnd = day.clone();
      closedDayEnd.day++;
      closedDayEnd.isDate = false;

      function relativeTime(date) {
        if (!date) {
          return null;
        }
        date = date.getInTimezone(day.timezone);
        return {
          date,
          minute: date.subtractDate(closedDayStart).inSeconds / 60,
          withinClosedDay: date.compare(closedDayStart) >= 0 && date.compare(closedDayEnd) <= 0,
        };
      }

      let start;
      let end;
      if (item.isEvent()) {
        start = relativeTime(item.startDate);
        end = relativeTime(item.endDate);
      } else {
        start = relativeTime(item.entryDate);
        end = relativeTime(item.dueDate);
      }

      this.startGripbar.hidden = !(end && start?.withinClosedDay);
      this.endGripbar.hidden = !(start && end?.withinClosedDay);

      return {
        startDate: start?.date,
        endDate: end?.date,
        startMinute: start?.minute,
        endMinute: end?.minute,
      };
    }

    getOptimalMinSize(orient) {
      const label = this.querySelector(".event-name-label");
      if (orient == "vertical") {
        const minHeight =
          getOptimalMinimumHeight(label) +
          getSummarizedStyleValues(label.parentNode, ["padding-bottom", "padding-top"]) +
          getSummarizedStyleValues(this, ["border-bottom-width", "border-top-width"]);
        this.style.minHeight = minHeight + "px";
        this.style.minWidth = "1px";
        return minHeight;
      }
      label.style.minWidth = "2em";
      const minWidth = getOptimalMinimumWidth(this.eventNameLabel);
      this.style.minWidth = minWidth + "px";
      this.style.minHeight = "1px";
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
        this.mOccurrence,
        "middle",
        this.mouseDownPosition
      );
      this.mInMouseDown = false;
    }
  }

  customElements.define("calendar-event-box", MozCalendarEventBox);

  /**
   * Abstract class used for the day and week calendar view elements. (Not month or multiweek.)
   *
   * @implements {calICalendarView}
   * @augments {MozElements.CalendarBaseView}
   * @abstract
   */
  class CalendarMultidayBaseView extends MozElements.CalendarBaseView {
    // mDateList will always be sorted before being set.
    mDateList = null;

    /**
     * A column in the view representing a particular date.
     *
     * @typedef {object} DayColumn
     * @property {calIDateTime} date - The day's date.
     * @property {Element} container - The container that holds the other
     *   elements.
     * @property {Element} headingContainer - The day heading. This holds both
     *   the short and long headings, with only one being visible at any given
     *   time.
     * @property {Element} longHeading - The day heading that uses the full
     *   day of the week. For example, "Monday".
     * @property {Element} shortHeading - The day heading that uses an
     *   abbreviation for the day of the week. For example, "Mon".
     * @property {number} longHeadingContentAreaWidth - The content area width
     *   of the headingContainer when the long heading is shown.
     * @property {Element} column - A calendar-event-column where regular
     *   (not "all day") events appear.
     * @property {Element} header - A calendar-header-container where allday
     *   events appear.
     */
    /**
     * An ordered list of the shown day columns.
     *
     * @type {DayColumn[]}
     */
    dayColumns = [];

    /**
     * Whether the number of headings, or the heading dates have changed, and
     * the view still needs to be adjusted accordingly.
     *
     * @type {boolean}
     */
    headingDatesChanged = true;
    /**
     * Whether the view has been rotated and the view still needs to be fully
     * adjusted.
     *
     * @type {boolean}
     */
    rotationChanged = true;

    mSelectedDayCol = null;
    mSelectedDay = null;

    /**
     * The hour that a 'day' starts. Any time before this is considered
     * off-time.
     *
     * @type {number}
     */
    dayStartHour = 0;
    /**
     * The hour that a 'day' ends. Any time equal to or after this is
     * considered off-time.
     *
     * @type {number}
     */
    dayEndHour = 0;

    /**
     * How many hours to show in the scrollable area.
     *
     * @type {number}
     */
    visibleHours = 9;

    /**
     * The number of pixels that a one minute duration should occupy in the
     * view.
     *
     * @type {number}
     */
    pixelsPerMinute;

    /**
     * The timebar hour box elements in this view, ordered and indexed by their
     * starting hour.
     *
     * @type {Element[]}
     */
    hourBoxes = [];

    mClickedTime = null;

    mTimeIndicatorInterval = 15;
    mTimeIndicatorMinutes = 0;

    mModeHandler = null;
    scrollMinute = 0;

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      super.connectedCallback();

      // Get day start/end hour from prefs and set on the view.
      // This happens here to keep tests happy.
      this.setDayStartEndHours(
        Services.prefs.getIntPref("calendar.view.daystarthour", 8),
        Services.prefs.getIntPref("calendar.view.dayendhour", 17)
      );

      // We set the scrollMinute, so that when onResize is eventually triggered
      // by refresh, we will scroll to this.
      // FIXME: Find a cleaner solution.
      this.scrollMinute = this.dayStartHour * 60;
    }

    ensureInitialized() {
      if (this.isInitialized) {
        return;
      }

      this.grid = document.createElement("div");
      this.grid.classList.add("multiday-grid");
      this.appendChild(this.grid);

      this.headerCorner = document.createElement("div");
      this.headerCorner.classList.add("multiday-header-corner");

      this.grid.appendChild(this.headerCorner);

      this.timebar = document.createElement("div");
      this.timebar.classList.add("multiday-timebar", "multiday-hour-box-container");
      this.nowIndicator = document.createElement("div");
      this.nowIndicator.classList.add("multiday-timebar-now-indicator");
      this.nowIndicator.hidden = true;
      this.timebar.appendChild(this.nowIndicator);

      const formatter = cal.dtz.formatter;
      const jsTime = new Date();
      for (let hour = 0; hour < 24; hour++) {
        const hourBox = document.createElement("div");
        hourBox.classList.add("multiday-hour-box", "multiday-timebar-time");
        // Set the time label.
        jsTime.setHours(hour, 0, 0);
        hourBox.textContent = formatter.formatTime(
          cal.dtz.jsDateToDateTime(jsTime, cal.dtz.floating)
        );
        this.timebar.appendChild(hourBox);
        this.hourBoxes.push(hourBox);
      }
      this.grid.appendChild(this.timebar);

      this.endBorder = document.createElement("div");
      this.endBorder.classList.add("multiday-end-border");
      this.grid.appendChild(this.endBorder);

      this.initializeAttributeInheritance();

      // super.connectedCallback has to be called after the time bar is added to the DOM.
      super.ensureInitialized();

      this.addEventListener("click", event => {
        if (event.button != 2) {
          return;
        }
        this.selectedDateTime = null;
      });

      this.addEventListener("wheel", event => {
        // Only shift hours if no modifier is pressed.
        if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
          return;
        }
        const deltaTime = this.getAttribute("orient") == "horizontal" ? event.deltaX : event.deltaY;
        if (!deltaTime) {
          // Scroll is not in the same direction as the time axis, so just do
          // the default scroll (if any).
          return;
        }
        if (
          this.headerCorner.contains(event.target) ||
          this.dayColumns.some(col => col.headingContainer.contains(event.target))
        ) {
          // Prevent any scrolling in these sticky headers.
          event.preventDefault();
          return;
        }
        const header = this.dayColumns.find(col => col.header.contains(event.target))?.header;
        if (header) {
          if (!header.wheelOnScrollableArea(event)) {
            // Prevent any scrolling in this header.
            event.preventDefault();
            // Otherwise, we let the default wheel handler scroll the header.
            // NOTE: We have the CSS overscroll-behavior set to "none", to stop
            // the default wheel handler from scrolling the parent if the header
            // is already at its scrolling edge.
          }
          return;
        }
        let minute = this.scrollMinute;
        if (event.deltaMode == event.DOM_DELTA_LINE) {
          // We snap from the current hour to the next one.
          let scrollHour = deltaTime < 0 ? Math.floor(minute / 60) : Math.ceil(minute / 60);
          if (Math.abs(scrollHour * 60 - minute) < 10) {
            // If the change in minutes would be less than 10 minutes, go to the
            // next hour. This means that anything in the close neighbourhood of
            // the hour line will scroll to the same hour.
            scrollHour += Math.sign(deltaTime);
          }
          minute = scrollHour * 60;
        } else if (event.deltaMode == event.DOM_DELTA_PIXEL) {
          const minDiff = deltaTime / this.pixelsPerMinute;
          minute += minDiff < 0 ? Math.floor(minDiff) : Math.ceil(minDiff);
        } else {
          return;
        }
        event.preventDefault();
        this.scrollToMinute(minute);
      });

      this.grid.addEventListener("scroll", () => {
        if (!this.clientHeight) {
          // Hidden, so don't store the scroll position.
          // FIXME: We don't expect scrolling whilst we are hidden, so we should
          // try and remove. This is only seems to happen in mochitests.
          return;
        }
        let scrollPx;
        if (this.getAttribute("orient") == "horizontal") {
          scrollPx = document.dir == "rtl" ? -this.grid.scrollLeft : this.grid.scrollLeft;
        } else {
          scrollPx = this.grid.scrollTop;
        }
        this.scrollMinute = Math.round(scrollPx / this.pixelsPerMinute);
      });

      // Get visible hours from prefs and set on the view.
      this.setVisibleHours(Services.prefs.getIntPref("calendar.view.visiblehours", 9));
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

    set selectedDay(day) {
      // Ignore if just 1 visible, it's always selected, but we don't indicate it.
      if (this.numVisibleDates == 1) {
        this.fireEvent("dayselect", day);
        return;
      }

      if (this.mSelectedDayCol) {
        this.mSelectedDayCol.container.classList.remove("day-column-selected");
      }

      if (day) {
        this.mSelectedDayCol = this.findColumnForDate(day);
        if (this.mSelectedDayCol) {
          this.mSelectedDay = this.mSelectedDayCol.date;
          this.mSelectedDayCol.container.classList.add("day-column-selected");
        } else {
          this.mSelectedDay = day;
        }
      }
      this.fireEvent("dayselect", day);
    }

    get selectedDay() {
      let selected;
      if (this.numVisibleDates == 1) {
        selected = this.dayColumns[0].date;
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

    set selectedDateTime(dateTime) {
      this.mClickedTime = dateTime;
    }

    get selectedDateTime() {
      return this.mClickedTime;
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

    /**
     * Update the position of the time indicator.
     */
    updateTimeIndicatorPosition() {
      // Calculate the position of the indicator based on how far into the day
      // it is and the size of the current view.
      const now = cal.dtz.now();
      const nowMinutes = now.hour * 60 + now.minute;

      const position = `${this.pixelsPerMinute * nowMinutes - 1}px`;
      const isVertical = this.getAttribute("orient") == "vertical";

      // Control the position of the dot in the time bar, which is present even
      // when the view does not show the current day. Inline start controls
      // horizontal position of the dot, block controls vertical.
      this.nowIndicator.style.insetInlineStart = isVertical ? null : position;
      this.nowIndicator.style.insetBlockStart = isVertical ? position : null;

      // Control the position of the bar, which should be visible only for the
      // current day.
      const todayIndicator = this.findColumnForDate(this.today())?.column.timeIndicatorBox;
      if (todayIndicator) {
        todayIndicator.style.marginInlineStart = isVertical ? null : position;
        todayIndicator.style.marginBlockStart = isVertical ? position : null;
      }
    }

    /**
     * Handle preference changes. Typically called by a preference observer.
     *
     * @param {object} subject - The subject, a prefs object.
     * @param {string} topic - The notification topic.
     * @param {string} preference - The preference to handle.
     */
    handlePreference(subject, topic, preference) {
      subject.QueryInterface(Ci.nsIPrefBranch);
      switch (preference) {
        case "calendar.view.daystarthour":
          this.setDayStartEndHours(subject.getIntPref(preference), this.dayEndHour);
          break;

        case "calendar.view.dayendhour":
          this.setDayStartEndHours(this.dayStartHour, subject.getIntPref(preference));
          break;

        case "calendar.view.visiblehours":
          this.setVisibleHours(subject.getIntPref(preference));
          this.readjustView(true, true, this.scrollMinute);
          break;

        default:
          this.handleCommonPreference(subject, topic, preference);
          break;
      }
    }

    /**
     * Handle resizing by adjusting the view to the new size.
     */
    onResize() {
      // Assume resize in both directions.
      this.readjustView(true, true, this.scrollMinute);
    }

    /**
     * Because the font size changed, tell the resize code to recalculate the
     * heading text sizes.
     */
    onFontSizeChange() {
      this.headingDatesChanged = true;
      super.onFontSizeChange();
    }

    /**
     * Perform an operation on the header that may cause it to resize, such that
     * the view can adjust itself accordingly.
     *
     * @param {Element} header - The header that may resize.
     * @param {Function} operation - An operation to run.
     */
    doResizingHeaderOperation(header, operation) {
      // Capture scrollMinute before we potentially change the size of the view.
      const scrollMinute = this.scrollMinute;
      const beforeRect = header.getBoundingClientRect();

      operation();

      const afterRect = header.getBoundingClientRect();
      this.readjustView(
        beforeRect.height != afterRect.height,
        beforeRect.width != afterRect.width,
        scrollMinute
      );
    }

    /**
     * Adjust the view based an a change in rotation, layout, view size, or
     * header size.
     *
     * Note, this method will do nothing whilst the view is hidden, so must be
     * called again once it is shown.
     *
     * @param {boolean} verticalResize - There may have been a change in the
     *   vertical direction.
     * @param {boolean} horizontalResize - There may have been a change in the
     *   horizontal direction.
     * @param {number} scrollMinute - The minute we should scroll after
     *   adjusting the view in the time-direction.
     */
    readjustView(verticalResize, horizontalResize, scrollMinute) {
      if (!this.clientHeight || !this.clientWidth) {
        // Do nothing if we have zero width or height since we cannot measure
        // elements. Should be called again once we can.
        return;
      }

      const isHorizontal = this.getAttribute("orient") == "horizontal";

      // Adjust the headings. We do this before measuring the pixels per minute
      // because this may adjust the size of the headings.
      if (this.headingDatesChanged) {
        this.shortHeadingContentWidth = 0;
        for (const dayCol of this.dayColumns) {
          // Make sure both headings are visible for measuring.
          // We will hide one of them again further below.
          dayCol.shortHeading.hidden = false;
          dayCol.longHeading.hidden = false;

          // We can safely measure the widths of the short and long headings
          // because their headingContainer does not grow or shrink them.
          const longHeadingRect = dayCol.longHeading.getBoundingClientRect();
          if (!this.headingContentHeight) {
            // We assume this is constant and the same for each heading.
            this.headingContentHeight = longHeadingRect.height;
          }

          dayCol.longHeadingContentAreaWidth = longHeadingRect.width;
          this.shortHeadingContentWidth = Math.max(
            this.shortHeadingContentWidth,
            dayCol.shortHeading.getBoundingClientRect().width
          );
        }
        // Unset the other properties that use these values.
        // NOTE: We do not calculate new values for these properties here
        // because they can only be measured in one of the rotated or
        // non-rotated states. So we will calculate them as needed.
        delete this.rotatedHeadingWidth;
        delete this.minHeadingWidth;
      }

      // Whether the headings need readjusting.
      let adjustHeadingPositioning = this.headingDatesChanged || this.rotationChanged;
      // Position headers.
      if (isHorizontal) {
        // We're in the rotated state, so we can measure the corresponding
        // header dimensions.
        // NOTE: we always use short headings in the rotated view.
        if (!this.rotatedHeadingWidth) {
          // Width is shared by all headings in the rotated view, so we set it
          // so that its large enough to fit the text of each heading.
          if (!this.rotatedHeadingContentToBorderWidthOffset) {
            // We cache the value since we assume it is constant within the
            // rotated view.
            this.rotatedHeadingContentToBorderOffset = this.measureHeadingContentToBorderOffset();
          }
          this.rotatedHeadingWidth =
            this.shortHeadingContentWidth + this.rotatedHeadingContentToBorderOffset.inline;
          adjustHeadingPositioning = true;
        }
        if (adjustHeadingPositioning) {
          for (const dayCol of this.dayColumns) {
            // The header is sticky, so we need to position it. We want a constant
            // position, so we offset the header by the heading width.
            // NOTE: We assume there is no margin between the two.
            dayCol.header.style.insetBlockStart = null;
            dayCol.header.style.insetInlineStart = `${this.rotatedHeadingWidth}px`;
            // NOTE: The heading must have its box-sizing set to border-box for
            // this to work properly.
            dayCol.headingContainer.style.width = `${this.rotatedHeadingWidth}px`;
            dayCol.headingContainer.style.minWidth = null;
          }
        }
      } else {
        // We're in the non-rotated state, so we can measure the corresponding
        // header dimensions.
        if (!this.headingContentToBorderOffset) {
          // We cache the value since we assume it is constant within the
          // non-rotated view.
          this.headingContentToBorderOffset = this.measureHeadingContentToBorderOffset();
        }
        if (!this.headingHeight) {
          this.headingHeight = this.headingContentHeight + this.headingContentToBorderOffset.block;
        }
        if (!this.minHeadingWidth) {
          // Make the minimum width large enough to fit the short heading.
          this.minHeadingWidth =
            this.shortHeadingContentWidth + this.headingContentToBorderOffset.inline;
          adjustHeadingPositioning = true;
        }
        if (adjustHeadingPositioning) {
          for (const dayCol of this.dayColumns) {
            // We offset the header by the heading height.
            dayCol.header.style.insetBlockStart = `${this.headingHeight}px`;
            dayCol.header.style.insetInlineStart = null;
            dayCol.headingContainer.style.minWidth = `${this.minHeadingWidth}px`;
            dayCol.headingContainer.style.width = null;
          }
        }
      }

      // If the view is horizontal, we always use the short headings.
      // We do this before calculating the pixelsPerMinute since the width of
      // the heading is important to determining the size of the scroll area.
      // We only need to do this when the view has been rotated, or when new
      // headings have been added. adjustHeadingPosition covers both of these.
      if (isHorizontal && adjustHeadingPositioning) {
        for (const dayCol of this.dayColumns) {
          dayCol.shortHeading.hidden = false;
          dayCol.longHeading.hidden = true;
        }
      }
      // Otherwise, if the view is vertical, we determine whether to use short
      // or long headings after changing the pixelsPerMinute, which can change
      // the amount of horizontal space.
      // NOTE: when the view is vertical, both the short and long headings
      // should take up the same vertical space, so this shouldn't effect the
      // pixelsPerMinute calculation.

      if (this.rotationChanged) {
        // Clear the set widths/heights or positions before calculating the
        // scroll area. Otherwise they will remain extended in the wrong
        // direction, and keep the grid content larger than necessary, which can
        // cause the grid content to overflow, which in turn shrinks the
        // calculated scroll area due to extra scrollbars.
        // The timebar will be corrected when the pixelsPerMinute is calculated.
        this.timebar.style.width = null;
        this.timebar.style.height = null;
        // The time indicators will be corrected in updateTimeIndicatorPosition.
        this.nowIndicator.style.insetInlineStart = null;
        this.nowIndicator.style.insetBlockStart = null;
        const todayIndicator = this.findColumnForDate(this.today())?.column.timeIndicatorBox;
        if (todayIndicator) {
          todayIndicator.style.marginInlineStart = null;
          todayIndicator.style.marginBlockStart = null;
        }
      }

      // Adjust pixels per minute.
      let ppmHasChanged = false;
      if (
        adjustHeadingPositioning ||
        (isHorizontal && horizontalResize) ||
        (!isHorizontal && verticalResize)
      ) {
        if (isHorizontal && !this.timebarMinWidth) {
          // Measure the minimum width such that the time labels do not overflow
          // and are equal width.
          this.timebar.style.height = null;
          this.timebar.style.width = "min-content";
          let maxWidth = 0;
          for (const hourBox of this.hourBoxes) {
            maxWidth = Math.max(maxWidth, hourBox.getBoundingClientRect().width);
          }
          // NOTE: We assume no margin between the boxes.
          this.timebarMinWidth = maxWidth * this.hourBoxes.length;
          // width should be set to the correct value below when the
          // pixelsPerMinute changes.
        } else if (!isHorizontal && !this.timebarMinHeight) {
          // Measure the minimum height such that the time labels do not
          // overflow and are equal height.
          this.timebar.style.width = null;
          this.timebar.style.height = "min-content";
          let maxHeight = 0;
          for (const hourBox of this.hourBoxes) {
            maxHeight = Math.max(maxHeight, hourBox.getBoundingClientRect().height);
          }
          // NOTE: We assume no margin between the boxes.
          this.timebarMinHeight = maxHeight * this.hourBoxes.length;
          // height should be set to the correct value below when the
          // pixelsPerMinute changes.
        }

        // We want to know how much visible space is available in the
        // "time-direction" of this view's scrollable area, which will be used
        // to show 'this.visibleHour' hours in the timebar.
        // NOTE: The area returned by getScrollAreaRect is the *current*
        // scrollable area. We are working with the assumption that the length
        // in the time-direction will not change when we change the pixels per
        // minute. This assumption is broken if the changes cause the
        // non-time-direction to switch from overflowing to not, or vis versa,
        // which adds or removes a scrollbar. Since we are only changing the
        // content length in the time-direction, this should only happen in edge
        // cases (e.g. scrollbar being added from a time-direction overflow also
        // causes the non-time-direction to overflow).
        const scrollArea = this.getScrollAreaRect();
        const dayScale = 24 / this.visibleHours;
        const dayPixels = isHorizontal
          ? Math.max((scrollArea.right - scrollArea.left) * dayScale, this.timebarMinWidth)
          : Math.max((scrollArea.bottom - scrollArea.top) * dayScale, this.timebarMinHeight);
        const pixelsPerMinute = dayPixels / MINUTES_IN_DAY;
        if (this.rotationChanged || pixelsPerMinute != this.pixelsPerMinute) {
          ppmHasChanged = true;
          this.pixelsPerMinute = pixelsPerMinute;

          // Use the same calculation as in the event columns.
          const dayPx = `${MINUTES_IN_DAY * pixelsPerMinute}px`;
          if (isHorizontal) {
            this.timebar.style.width = dayPx;
            this.timebar.style.height = null;
          } else {
            this.timebar.style.height = dayPx;
            this.timebar.style.width = null;
          }

          for (const col of this.dayColumns) {
            col.column.pixelsPerMinute = pixelsPerMinute;
          }
        }

        // Scroll to the given minute.
        this.scrollToMinute(scrollMinute);
        // A change in pixels per minute can cause a scrollbar to appear or
        // disappear, which can change the available space for headers.
        if (ppmHasChanged) {
          verticalResize = true;
          horizontalResize = true;
        }
      }

      // Decide whether to use short headings.
      if (!isHorizontal && (horizontalResize || adjustHeadingPositioning)) {
        // Use short headings if *any* heading would horizontally overflow with
        // a long heading.
        const widthOffset = this.headingContentToBorderOffset.inline;
        const useShortHeadings = this.dayColumns.some(
          col =>
            col.headingContainer.getBoundingClientRect().width <
            col.longHeadingContentAreaWidth + widthOffset
        );
        for (const dayCol of this.dayColumns) {
          dayCol.shortHeading.hidden = !useShortHeadings;
          dayCol.longHeading.hidden = useShortHeadings;
        }
      }

      this.updateTimeIndicatorPosition();

      // The changes have now been handled.
      this.headingDatesChanged = false;
      this.rotationChanged = false;
    }

    /**
     * Measure the total offset between the content width and border width of
     * the day headings.
     *
     * @returns {{inline: number, block: number}} - The offsets in their
     *   respective directions.
     */
    measureHeadingContentToBorderOffset() {
      if (!this.dayColumns.length) {
        // undefined properties.
        return {};
      }
      // We cache the offset. We expect these styles to differ between the
      // rotated and non-rotated views, but to otherwise be constant.
      const style = getComputedStyle(this.dayColumns[0].headingContainer);
      return {
        inline:
          parseFloat(style.paddingInlineStart) +
          parseFloat(style.paddingInlineEnd) +
          parseFloat(style.borderInlineStartWidth) +
          parseFloat(style.borderInlineEndWidth),
        block:
          parseFloat(style.paddingBlockStart) +
          parseFloat(style.paddingBlockEnd) +
          parseFloat(style.borderBlockStartWidth) +
          parseFloat(style.borderBlockEndWidth),
      };
    }

    /**
     * Make a calendar item flash or stop flashing. Called when the item's alarm fires.
     *
     * @param {calIItemBase} item - The calendar item.
     * @param {boolean} stop - Whether to stop the item from flashing.
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

      if (this.mStartDate.timezone.tzid == date.timezone.tzid) {
        if (this.mStartDate && this.mEndDate) {
          if (
            this.mStartDate.compare(targetDate) <= 0 &&
            this.mEndDate.compare(targetDate) >= 0 &&
            this.mStartDate.weekday == this.weekStartOffset
          ) {
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
      }

      // If we're only showing one date, then continue
      // to only show one date; otherwise, show the week.
      if (this.numVisibleDates == 1) {
        this.setDateRange(date, date);
      } else {
        const viewStart = cal.weekInfoService.getStartOfWeek(targetDate);
        const viewEnd = cal.weekInfoService.getEndOfWeek(targetDate);
        this.setDateRange(viewStart, viewEnd);
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

      // The start and end dates to query calendars with (in CalendarFilteredViewMixin).
      this.startDate = viewStart;
      const viewEndPlusOne = viewEnd.clone();
      viewEndPlusOne.day++;
      this.endDate = viewEndPlusOne;

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
        this.mViewStart.timezone.tzid != viewStart.timezone.tzid ||
        this.mViewEnd.compare(viewEnd) != 0 ||
        this.mViewStart.compare(viewStart) != 0 ||
        this.mToggleStatus != toggleStatus
      ) {
        this.relayout({ dates: true });
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
      let lowMinute = MINUTES_IN_DAY;
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

      const halfDurationMinutes = (highMinute - lowMinute) / 2;
      if (this.mSelectedItems.length && halfDurationMinutes >= 0) {
        const halfVisibleMinutes = this.visibleHours * 30;
        if (halfDurationMinutes <= halfVisibleMinutes) {
          // If the full duration fits in the view, then center the middle of
          // the region.
          this.scrollToMinute(lowMinute + halfDurationMinutes - halfVisibleMinutes);
        } else if (this.mSelectedItems.length == 1) {
          // Else, if only one event is selected, then center the start.
          this.scrollToMinute(lowMinute - halfVisibleMinutes);
        }
        // Else, don't scroll.
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
     * @param {calIItemBase} item - A calendar item.
     * @returns {calIItemBase[]} An array of occurrences.
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
     * @param {string} attr - The attribute to set.
     * @param {string} value - The value to set.
     */
    setAttribute(attr, value) {
      const rotated = attr == "orient" && this.getAttribute("orient") != value;
      const context = attr == "context" || attr == "item-context";

      // This should be done using lookupMethod(), see bug 286629.
      const ret = XULElement.prototype.setAttribute.call(this, attr, value);

      if (rotated || context) {
        this.relayout({ rotated, context });
      }

      return ret;
    }

    /**
     * Re-render the view based on the given changes.
     *
     * Note, changing the dates will wipe the columns of all events, otherwise
     * the current events are kept in place.
     *
     * @param {object} [changes] - The relevant changes to the view. Defaults to
     *   all changes.
     * @property {boolean} dates - A change in the column dates.
     * @property {boolean} rotated - A change in the rotation.
     * @property {boolean} context - A change in the context menu.
     */
    relayout(changes) {
      if (!this.mStartDate || !this.mEndDate) {
        return;
      }
      if (!changes) {
        changes = { dates: true, rotated: true, context: true };
      }
      const scrollMinute = this.scrollMinute;

      const orient = this.getAttribute("orient") || "vertical";
      this.grid.classList.toggle("multiday-grid-rotated", orient == "horizontal");

      const context = this.getAttribute("context");
      const itemContext = this.getAttribute("item-context") || context;

      for (const dayCol of this.dayColumns) {
        dayCol.column.startLayoutBatchChange();
      }

      if (changes.dates) {
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

        this.grid.style.setProperty("--multiday-num-days", computedDateList.length);

        // Deselect the previously selected event upon switching views,
        // otherwise those events will stay selected forever, if other events
        // are selected after changing the view.
        this.setSelectedItems([], true);

        // Get today's date.
        const today = this.today();

        const dateFormatter = cal.dtz.formatter;

        // Assume the heading widths are no longer valid because the displayed
        // dates are likely to change.
        // We do not measure them here since we may be hidden. Instead we do so
        // in readjustView.
        this.headingDatesChanged = true;
        let colIndex;
        for (colIndex = 0; colIndex < computedDateList.length; colIndex++) {
          const dayDate = computedDateList[colIndex];
          let dayCol = this.dayColumns[colIndex];
          if (dayCol) {
            dayCol.column.clear();
            dayCol.header.clear();
          } else {
            dayCol = {};
            dayCol.container = document.createElement("article");
            dayCol.container.classList.add("day-column-container");
            this.grid.insertBefore(dayCol.container, this.endBorder);

            dayCol.headingContainer = document.createElement("h2");
            dayCol.headingContainer.classList.add("day-column-heading");
            dayCol.longHeading = document.createElement("span");
            dayCol.shortHeading = document.createElement("span");
            dayCol.headingContainer.appendChild(dayCol.longHeading);
            dayCol.headingContainer.appendChild(dayCol.shortHeading);
            dayCol.container.appendChild(dayCol.headingContainer);

            dayCol.header = document.createXULElement("calendar-header-container");
            dayCol.header.setAttribute("orient", "vertical");
            dayCol.container.appendChild(dayCol.header);
            dayCol.header.calendarView = this;

            dayCol.column = document.createXULElement("calendar-event-column");
            dayCol.container.appendChild(dayCol.column);
            dayCol.column.calendarView = this;
            dayCol.column.startLayoutBatchChange();
            dayCol.column.pixelsPerMinute = this.pixelsPerMinute;
            dayCol.column.setDayStartEndHours(this.dayStartHour, this.dayEndHour);
            dayCol.column.setAttribute("orient", orient);
            dayCol.column.setAttribute("context", context);
            dayCol.column.setAttribute("item-context", itemContext);

            this.dayColumns[colIndex] = dayCol;
          }
          dayCol.date = dayDate.clone();
          dayCol.date.isDate = true;
          dayCol.date.makeImmutable();

          // Set up day of the week headings. This needs to happen synchronously
          // so that it happens before the layout calculations, so we don't use
          // `document.l10n.setAttributes` here.
          dayCol.shortHeading.textContent = lazy.l10n.formatValueSync("day-header", {
            dayName: dateFormatter.shortWeekdayNames[dayDate.weekday],
            dayIndex: dateFormatter.formatDateWithoutYear(dayDate),
          });
          dayCol.longHeading.textContent = lazy.l10n.formatValueSync("day-header", {
            dayName: dateFormatter.weekdayNames[dayDate.weekday],
            dayIndex: dateFormatter.formatDateWithoutYear(dayDate),
          });

          /* Set up all-day header. */
          dayCol.header.date = dayDate;

          /* Set up event column. */
          dayCol.column.date = dayDate;

          /* Set up styling classes for day-off and today. */
          dayCol.container.classList.toggle(
            "day-column-weekend",
            this.mDaysOffArray.includes(dayDate.weekday)
          );

          const isToday = dayDate.compare(today) == 0;
          dayCol.column.timeIndicatorBox.hidden = !isToday;
          dayCol.container.classList.toggle("day-column-today", isToday);
        }
        // Remove excess columns.
        for (const dayCol of this.dayColumns.splice(colIndex)) {
          dayCol.column.endLayoutBatchChange();
          dayCol.container.remove();
        }
      }

      if (changes.rotated) {
        this.rotationChanged = true;
        for (const dayCol of this.dayColumns) {
          dayCol.column.setAttribute("orient", orient);
        }
      }

      if (changes.context) {
        for (const dayCol of this.dayColumns) {
          dayCol.column.setAttribute("context", context);
          dayCol.column.setAttribute("item-context", itemContext);
        }
      }

      // Let the columns relayout themselves before we readjust the view.
      for (const dayCol of this.dayColumns) {
        dayCol.column.endLayoutBatchChange();
      }

      if (changes.dates || changes.rotated) {
        // Fix pixels-per-minute and headers, now or when next visible.
        this.readjustView(false, false, scrollMinute);
      }

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
      if (changes.dates) {
        // Fetch new items for the new dates.
        this.refreshItems(true);
      }
    }

    /**
     * Return the column object for a given date.
     *
     * @param {calIDateTime} date - A date.
     * @returns {?DateColumn} A column object.
     */
    findColumnForDate(date) {
      for (const col of this.dayColumns) {
        if (col.date.compare(date) == 0) {
          return col;
        }
      }
      return null;
    }

    /**
     * Return the day box (column header) for a given date.
     *
     * @param {calIDateTime} date - A date.
     * @returns {Element} A `calendar-header-container` where "all day" events appear.
     */
    findDayBoxForDate(date) {
      const col = this.findColumnForDate(date);
      return col && col.header;
    }

    /**
     * Return the column objects for a given calendar item.
     *
     * @param {calIItemBase} item - A calendar item.
     * @returns {DateColumn[]} An array of column objects.
     */
    findColumnsForItem(item) {
      const columns = [];

      if (!this.dayColumns.length) {
        return columns;
      }

      // Note that these may be dates or datetimes.
      const startDate = item.startDate || item.entryDate || item.dueDate;
      if (!startDate) {
        return columns;
      }
      const timezone = this.dayColumns[0].date.timezone;
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
     * Get an ordered list of all the calendar-event-column elements in this
     * view.
     *
     * @returns {MozCalendarEventColumn[]} - The columns in this view.
     */
    getEventColumns() {
      return Array.from(this.dayColumns, col => col.column);
    }

    /**
     * Find the calendar-event-column that contains the given node.
     *
     * @param {Node} node - The node to search for.
     *
     * @returns {?MozCalendarEventColumn} - The column that contains the node, or
     *   null if none do.
     */
    findEventColumnThatContains(node) {
      return this.dayColumns.find(col => col.column.contains(node))?.column;
    }

    /**
     * Display a calendar item.
     *
     * @param {calIItemBase} event - A calendar item.
     */
    doAddItem(event) {
      const cols = this.findColumnsForItem(event);
      if (!cols.length) {
        return;
      }

      for (const col of cols) {
        const estart = event.startDate || event.entryDate || event.dueDate;

        if (estart.isDate) {
          this.doResizingHeaderOperation(col.header, () => col.header.addEvent(event));
        } else {
          col.column.addEvent(event);
        }
      }
    }

    /**
     * Remove a calendar item so it is no longer displayed.
     *
     * @param {calIItemBase} event - A calendar item.
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
          this.doResizingHeaderOperation(col.header, () => col.header.deleteEvent(event));
        } else {
          col.column.deleteEvent(event);
        }
      }

      // If a deleted event was selected, we need to announce that the selection changed.
      if (oldLength != this.mSelectedItems.length) {
        this.fireEvent("itemselect", this.mSelectedItems);
      }
    }

    // CalendarFilteredViewMixin implementation.

    /**
     * Removes all items so they are no longer displayed.
     */
    clearItems() {
      for (const dayCol of this.dayColumns) {
        dayCol.column.clear();
        dayCol.header.clear();
      }
    }

    /**
     * Remove all items for a given calendar so they are no longer displayed.
     *
     * @param {string} calendarId - The ID of the calendar to remove items from.
     */
    removeItemsFromCalendar(calendarId) {
      for (const col of this.dayColumns) {
        // Get all-day events in column header and events within the column.
        const colEvents = col.header.getAllEventItems().concat(col.column.getAllEventItems());

        for (const event of colEvents) {
          if (event.calendar.id == calendarId) {
            this.doRemoveItem(event);
          }
        }
      }
    }

    // End of CalendarFilteredViewMixin implementation.

    /**
     * Clear the pending magic scroll update method.
     */
    clearMagicScroll() {
      if (this.magicScrollTimer) {
        clearTimeout(this.magicScrollTimer);
        this.magicScrollTimer = null;
      }
    }

    /**
     * Get the amount to scroll the view by.
     *
     * @param {number} startDiff - The number of pixels the mouse is from the
     *   starting edge.
     * @param {number} endDiff - The number of pixels the mouse is from the
     *   ending edge.
     * @param {number} scrollzone - The number of pixels from the edge at which
     *   point scrolling is triggered.
     * @param {number} factor - The number of pixels to scroll by if touching
     *   the edge.
     *
     * @returns {number} - The number of pixels to scroll by scaled by the depth
     *   within the scrollzone. Zero if outside the scrollzone, negative if
     *   we're closer to the starting edge and positive if we're closer to the
     *   ending edge.
     */
    getScrollBy(startDiff, endDiff, scrollzone, factor) {
      if (startDiff >= scrollzone && endDiff >= scrollzone) {
        return 0;
      } else if (startDiff < endDiff) {
        return Math.floor((-1 + startDiff / scrollzone) * factor);
      }
      return Math.ceil((1 - endDiff / scrollzone) * factor);
    }

    /**
     * Start scrolling the view if the given positions are close to or beyond
     * its edge.
     *
     * Note, any pending updater sent to this method previously will be
     * cancelled.
     *
     * @param {number} clientX - The horizontal viewport position.
     * @param {number} clientY - The vertical viewport position.
     * @param {Function} updater - A method to call, with some delay, if we
     *   scroll successfully.
     */
    setupMagicScroll(clientX, clientY, updater) {
      this.clearMagicScroll();

      // If we are at the bottom or top of the view (or left/right when
      // rotated), calculate the difference and start accelerating the
      // scrollbar.
      const scrollArea = this.getScrollAreaRect();

      // Distance the mouse is from the edge.
      const diffTop = Math.max(clientY - scrollArea.top, 0);
      const diffBottom = Math.max(scrollArea.bottom - clientY, 0);
      const diffLeft = Math.max(clientX - scrollArea.left, 0);
      const diffRight = Math.max(scrollArea.right - clientX, 0);

      // How close to the edge we need to be to trigger scrolling.
      const primaryZone = 50;
      const secondaryZone = 20;
      // How many pixels to scroll by.
      const primaryFactor = Math.max(4 * this.pixelsPerMinute, 8);
      const secondaryFactor = 4;

      let left;
      let top;
      if (this.getAttribute("orient") == "horizontal") {
        left = this.getScrollBy(diffLeft, diffRight, primaryZone, primaryFactor);
        top = this.getScrollBy(diffTop, diffBottom, secondaryZone, secondaryFactor);
      } else {
        top = this.getScrollBy(diffTop, diffBottom, primaryZone, primaryFactor);
        left = this.getScrollBy(diffLeft, diffRight, secondaryZone, secondaryFactor);
      }

      if (top || left) {
        this.grid.scrollBy({ top, left, behaviour: "smooth" });
        this.magicScrollTimer = setTimeout(updater, 20);
      }
    }

    /**
     * Get the position of the view's scrollable area (the padding area minus
     * sticky headers and scrollbars) in the viewport.
     *
     * @returns {{top: number, bottom: number, left: number, right: number}} -
     *   The viewport positions of the respective scrollable area edges.
     */
    getScrollAreaRect() {
      // We want the viewport coordinates of the view's scrollable area. This is
      // the same as the padding area minus the sticky headers and scrollbars.
      let scrollLeft;
      let scrollRight;
      const view = this.grid;
      const viewRect = view.getBoundingClientRect();
      const headerRect = this.headerCorner.getBoundingClientRect();

      // paddingTop is the top of the view's padding area. We translate from
      // the border area of the view to the padding area by adding clientTop,
      // which is the view's top border width.
      const paddingTop = viewRect.top + view.clientTop;
      // The top of the scroll area is the bottom of the sticky header.
      const scrollTop = headerRect.bottom;
      // To get the bottom we add the clientHeight, which is the height of the
      // padding area minus the scrollbar.
      const scrollBottom = paddingTop + view.clientHeight;

      // paddingLeft is the left of the view's padding area. We translate from
      // the border area to the padding area by adding clientLeft, which is the
      // left border width (plus the scrollbar in right-to-left).
      const paddingLeft = viewRect.left + view.clientLeft;
      if (document.dir == "rtl") {
        scrollLeft = paddingLeft;
        // The right of the scroll area is the left of the sticky header.
        scrollRight = headerRect.left;
      } else {
        // The left of the scroll area is the right of the sticky header.
        scrollLeft = headerRect.right;
        // To get the right we add the clientWidth, which is the width of the
        // padding area minus the scrollbar.
        scrollRight = paddingLeft + view.clientWidth;
      }
      return { top: scrollTop, bottom: scrollBottom, left: scrollLeft, right: scrollRight };
    }

    /**
     * Scroll the view to a given minute.
     *
     * @param {number} minute - The minute to scroll to.
     */
    scrollToMinute(minute) {
      const pos = Math.round(Math.max(0, minute) * this.pixelsPerMinute);
      if (this.getAttribute("orient") == "horizontal") {
        this.grid.scrollLeft = document.dir == "rtl" ? -pos : pos;
      } else {
        this.grid.scrollTop = pos;
      }
      // NOTE: this.scrollMinute is set by the "scroll" callback.
      // This means that if we tried to scroll further than possible, the
      // scrollMinute will be capped.
      // Also, if pixelsPerMinute < 1, then scrollMinute may differ from the
      // given 'minute' due to rounding errors.
    }

    /**
     * Set the hours when the day starts and ends.
     *
     * @param {number} dayStartHour - Hour at which the day starts.
     * @param {number} dayEndHour - Hour at which the day ends.
     */
    setDayStartEndHours(dayStartHour, dayEndHour) {
      if (dayStartHour < 0 || dayStartHour > dayEndHour || dayEndHour > 24) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }
      this.dayStartHour = dayStartHour;
      this.dayEndHour = dayEndHour;
      // Also update on the timebar.
      for (const [hour, hourBox] of this.hourBoxes.entries()) {
        hourBox.classList.toggle(
          "multiday-hour-box-off-time",
          hour < dayStartHour || hour >= dayEndHour
        );
      }
      for (const dayCol of this.dayColumns) {
        dayCol.column.setDayStartEndHours(dayStartHour, dayEndHour);
      }
    }

    /**
     * Set how many hours are visible in the scrollable area.
     *
     * @param {number} hours - The number of visible hours.
     */
    setVisibleHours(hours) {
      if (hours <= 0 || hours > 24) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }
      this.visibleHours = hours;
    }
  }

  MozElements.CalendarMultidayBaseView = CalendarMultidayBaseView;
}
