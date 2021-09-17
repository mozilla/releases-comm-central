/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement, getSelectedCalendar, invokeEventDragSession, currentView */

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
        ".multiday-column-top-box": "context",
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
            <box class="multiday-column-top-box"
                 flex="1"
                 equalsize="always"/>
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

      // An array of objects that contain information about the events that are to be
      // displayed. The contained fields are:
      // - event:        The event that is to be displayed in a 'calendar-event-box'
      // - layoutStart:  The 'start'-datetime object of the event in the timezone of the view
      // - layoutEnd:    The 'end'-datetime object of the event in the timezone of the view.
      // The 'layoutEnd' may be different from the real 'end' time of the
      // event because it considers a certain minimum duration of the event
      // that is basically dependent of the font-size of the event-box label.
      this.mEventInfos = [];

      this.mEventMap = null;

      this.mCalendarView = null;

      this.mDate = null;

      this.mTimezone = null;

      this.mDragState = null;

      this.mLayoutBatchCount = 0;

      // Since we'll often be getting many events in rapid succession, this
      // timer helps ensure that we don't re-compute the event map too many
      // times in a short interval, and therefore improves performance.
      this.mEventMapTimeout = null;

      // Set this true so that we know in our onAddItem listener to start
      // modifying an event when it comes back to us as created.
      this.mCreatedNewEvent = false;

      this.mEventToEdit = null;

      this.mSelectedItemIds = null;

      this.mSelected = false;

      this.mFgboxes = null;

      this.mMinDuration = null;

      this.mDayOff = false;

      // mEventInfos.
      this.mSelectedChunks = [];

      this.mEventInfos = [];
      this.mTimezone = cal.dtz.UTC;
      this.mSelectedItemIds = {};
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
        if (!this.mLayoutBatchCount) {
          this.recalculateStartEndMinutes();
        }
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

    get topbox() {
      return this.querySelector(".multiday-column-top-box");
    }

    get bgbox() {
      return this.querySelector(".multiday-column-bg-box");
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

    selectOccurrence(occurrence) {
      if (occurrence) {
        this.mSelectedItemIds[occurrence.hashId] = true;
        let chunk = this.findChunkForOccurrence(occurrence);
        if (!chunk) {
          return;
        }
        chunk.selected = true;
        this.mSelectedChunks.push(chunk);
      }
    }

    unselectOccurrence(occurrence) {
      if (occurrence) {
        delete this.mSelectedItemIds[occurrence.hashId];
        let chunk = this.findChunkForOccurrence(occurrence);
        if (!chunk) {
          return;
        }
        chunk.selected = false;
        let index = this.mSelectedChunks.indexOf(chunk);
        this.mSelectedChunks.splice(index, 1);
      }
    }

    findChunkForOccurrence(occurrence) {
      for (let chunk of this.mEventBoxes) {
        if (chunk.occurrence.hashId == occurrence.hashId) {
          return chunk;
        }
      }

      return null;
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

    internalDeleteEvent(occurrence) {
      let itemIndex = -1;
      let occ;
      for (let i in this.mEventInfos) {
        occ = this.mEventInfos[i].event;
        if (occ.hashId == occurrence.hashId) {
          itemIndex = i;
          break;
        }
      }

      if (itemIndex == -1) {
        return false;
      }
      delete this.mSelectedItemIds[occ.hashId];
      this.mSelectedChunks = this.mSelectedChunks.filter(item => {
        return !item.occurrence || item.occurrence.hashId != occurrence.hashId;
      });
      this.mEventInfos.splice(itemIndex, 1);
      return true;
    }

    recalculateStartEndMinutes() {
      for (let chunk of this.mEventInfos) {
        let mins = this.getStartEndMinutesForOccurrence(chunk.event);
        chunk.startMinute = mins.start;
        chunk.endMinute = mins.end;
      }

      this.relayout();
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

    createChunk(occurrence) {
      let mins = this.getStartEndMinutesForOccurrence(occurrence);

      let chunk = {
        startMinute: mins.start,
        endMinute: mins.end,
        event: occurrence,
      };
      return chunk;
    }

    addEvent(occurrence) {
      this.internalDeleteEvent(occurrence);

      let chunk = this.createChunk(occurrence);
      this.mEventInfos.push(chunk);
      if (this.mEventMapTimeout) {
        clearTimeout(this.mEventMapTimeout);
      }

      if (this.mCreatedNewEvent) {
        this.mEventToEdit = occurrence;
      }

      this.mEventMapTimeout = setTimeout(() => this.relayout(), 5);
    }

    deleteEvent(occurrence) {
      if (this.internalDeleteEvent(occurrence)) {
        this.relayout();
      }
    }

    clear() {
      while (this.bgbox && this.bgbox.hasChildNodes()) {
        this.bgbox.lastChild.remove();
      }
      while (this.topbox && this.topbox.hasChildNodes()) {
        this.topbox.lastChild.remove();
      }
      this.mSelectedChunks = [];
    }

    relayout() {
      if (this.mLayoutBatchCount > 0) {
        return;
      }
      this.clear();

      let orient = this.getAttribute("orient");
      this.bgbox.setAttribute("orient", orient);

      // 'bgbox' is used mainly for drawing the grid. At some point it may
      // also be used for all-day events.
      let otherOrient = orient == "horizontal" ? "vertical" : "horizontal";
      let configBox = this.querySelector("calendar-event-box");
      configBox.removeAttribute("hidden");
      let minSize = configBox.getOptimalMinSize();
      configBox.setAttribute("hidden", "true");
      this.mMinDuration = Cc["@mozilla.org/calendar/duration;1"].createInstance(Ci.calIDuration);
      this.mMinDuration.minutes = Math.trunc(minSize / this.mPixPerMin);

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

      // This one is set to otherOrient, since it will contain
      // child boxes set to "orient" (one for each set of
      // overlapping event areas).
      this.topbox.setAttribute("orient", otherOrient);

      this.mEventMap = this.computeEventMap();
      this.mEventBoxes = [];

      if (!this.mEventMap.length) {
        return;
      }

      // First of all we create a xul:stack which
      // will hold all events for this event column.
      // The stack will be grouped below .../calendar-event-column/stack/topbox.
      let stack = document.createXULElement("stack");
      stack.setAttribute("flex", "1");
      this.topbox.appendChild(stack);

      let boxToEdit;
      let columnCount = 1;
      let spanTotal = 0;

      for (let layer of this.mEventMap) {
        // The event-map (this.mEventMap) contains an array of layers.
        // For each layer we create a box below the stack just created above.
        // So each different layer lives in a box that's contained in the stack.
        let xulColumn = document.createXULElement("box");
        xulColumn.setAttribute("orient", otherOrient);
        xulColumn.setAttribute("flex", "1");
        xulColumn.setAttribute("class", "calendar-xul-column");
        stack.appendChild(xulColumn);

        let numBlocksInserted = 0;

        // Column count determined by layer with no special span columns.
        if (layer.every(e => !e.specialSpan)) {
          columnCount = layer.length;
        }
        spanTotal = 0;

        // Each layer contains a list of the columns that
        // need to be created for a span.
        for (let column of layer) {
          let innerColumn = document.createXULElement("box");
          innerColumn.setAttribute("orient", orient);

          let colFlex = column.specialSpan ? columnCount * column.specialSpan : 1;
          innerColumn.setAttribute("flex", colFlex);
          spanTotal += colFlex;

          innerColumn.style.minWidth = "1px";
          innerColumn.style.minHeight = "1px";
          innerColumn.style.width = colFlex + "px";
          innerColumn.style.height = colFlex + "px";

          xulColumn.appendChild(innerColumn);
          let duration;
          for (let chunk of column) {
            duration = chunk.duration;
            if (!duration) {
              continue;
            }

            if (chunk.event) {
              let chunkBox = document.createXULElement("calendar-event-box");
              let durMinutes = duration.inSeconds / 60;
              let size = Math.max(durMinutes * this.mPixPerMin, minSize);
              if (orient == "vertical") {
                chunkBox.setAttribute("height", size);
              } else {
                chunkBox.setAttribute("width", size);
              }
              chunkBox.setAttribute(
                "context",
                this.getAttribute("item-context") || this.getAttribute("context")
              );

              // Set the gripBars visibility in the chunk. Keep it
              // hidden for tasks with only entry date OR due date.
              if (
                (chunk.event.entryDate || !chunk.event.dueDate) &&
                (!chunk.event.entryDate || chunk.event.dueDate)
              ) {
                let startGripVisible =
                  (chunk.event.startDate || chunk.event.entryDate).compare(chunk.startDate) == 0;
                let endGripVisible =
                  (chunk.event.endDate || chunk.event.dueDate).compare(chunk.endDate) <= 0;
                if (startGripVisible && endGripVisible) {
                  chunkBox.setAttribute("gripBars", "both");
                } else if (endGripVisible) {
                  chunkBox.setAttribute("gripBars", "end");
                } else if (startGripVisible) {
                  chunkBox.setAttribute("gripBars", "start");
                }
              }

              innerColumn.appendChild(chunkBox);
              chunkBox.setAttribute("orient", orient);
              chunkBox.calendarView = this.calendarView;
              chunkBox.occurrence = chunk.event;
              chunkBox.parentColumn = this;
              if (chunk.event.hashId in this.mSelectedItemIds) {
                chunkBox.selected = true;
                this.mSelectedChunks.push(chunkBox);
              }

              this.mEventBoxes.push(chunkBox);

              if (this.mEventToEdit && chunkBox.occurrence.hashId == this.mEventToEdit.hashId) {
                boxToEdit = chunkBox;
              }
            } else {
              let chunkBox = document.createXULElement("spacer");
              chunkBox.setAttribute("context", this.getAttribute("context"));
              chunkBox.setAttribute("orient", orient);
              chunkBox.setAttribute("class", "calendar-empty-space-box");
              innerColumn.appendChild(chunkBox);

              let durMinutes = duration.inSeconds / 60;
              if (orient == "vertical") {
                chunkBox.setAttribute("height", durMinutes * this.mPixPerMin);
              } else {
                chunkBox.setAttribute("width", durMinutes * this.mPixPerMin);
              }
            }
          }

          numBlocksInserted++;
        }

        // Add last empty column if necessary.
        if (spanTotal < columnCount) {
          let lastColumn = document.createXULElement("box");
          lastColumn.setAttribute("orient", orient);
          lastColumn.setAttribute("flex", columnCount - spanTotal);
          lastColumn.style.minWidth = "1px";
          lastColumn.style.minHeight = "1px";
          lastColumn.style.width = columnCount - spanTotal + "px";
          lastColumn.style.height = columnCount - spanTotal + "px";

          xulColumn.appendChild(lastColumn);
        }

        if (boxToEdit) {
          this.mCreatedNewEvent = false;
          this.mEventToEdit = null;
          boxToEdit.startEditing();
        }

        if (numBlocksInserted == 0) {
          // If we didn't insert any blocks, then
          // forget about this column.
          xulColumn.remove();
        }
      }
    }

    computeEventMap() {
      // We're going to create a series of 'blobs'.  A blob is a series of
      // events that create a continuous block of busy time.  In other
      // words, a blob ends when there is some time such that no events
      // occupy that time.
      // Each blob will be an array of objects with the following properties:
      //    item:     the event/task
      //    startCol: the starting column to display the event in (0-indexed)
      //    colSpan:  the number of columns the item spans
      // An item with no conflicts will have startCol: 0 and colSpan: 1.
      let blobs = [];
      let currentBlob = [];

      function sortByStart(aEventInfo, bEventInfo) {
        // If you pass in tasks without both entry and due dates, I will
        // kill you.
        let startComparison = aEventInfo.layoutStart.compare(bEventInfo.layoutStart);
        if (startComparison == 0) {
          // If the items start at the same time, return the longer one
          // first.
          return bEventInfo.layoutEnd.compare(aEventInfo.layoutEnd);
        }
        return startComparison;
      }
      this.mEventInfos.forEach(aEventInfo => {
        let item = aEventInfo.event.clone();
        let start = item.startDate || item.entryDate || item.dueDate;
        start = start.getInTimezone(this.mTimezone);
        aEventInfo.layoutStart = start;
        let end = item.endDate || item.dueDate || item.entryDate;
        end = end.getInTimezone(this.mTimezone);
        let secEnd = start.clone();
        secEnd.addDuration(this.mMinDuration);
        if (secEnd.nativeTime > end.nativeTime) {
          aEventInfo.layoutEnd = secEnd;
        } else {
          aEventInfo.layoutEnd = end;
        }
        return aEventInfo;
      });
      this.mEventInfos.sort(sortByStart);

      // The end time of the last ending event in the entire blob.
      let latestItemEnd;

      // This array keeps track of the last (latest ending) item in each of
      // the columns of the current blob. We could reconstruct this data at
      // any time by looking at the items in the blob, but that would hurt
      // perf.
      let colEndArray = [];

      // Go through a 3 step process to try and place each item.
      // Step 1: Look for an existing column with room for the item.
      // Step 2: Look for a previously placed item that can be shrunk in
      //         width to make room for the item.
      // Step 3: Give up and create a new column for the item.
      // (The steps are explained in more detail as we come to them).
      for (let i in this.mEventInfos) {
        let curItemInfo = {
          event: this.mEventInfos[i].event,
          layoutStart: this.mEventInfos[i].layoutStart,
          layoutEnd: this.mEventInfos[i].layoutEnd,
        };
        if (!latestItemEnd) {
          latestItemEnd = curItemInfo.layoutEnd;
        }
        if (
          currentBlob.length &&
          latestItemEnd &&
          curItemInfo.layoutStart.compare(latestItemEnd) != -1
        ) {
          // We're done with this current blob because item starts
          // after the last event in the current blob ended.
          blobs.push({ blob: currentBlob, totalCols: colEndArray.length });

          // Reset our variables.
          currentBlob = [];
          colEndArray = [];
        }

        // Place the item in its correct place in the blob.
        let placedItem = false;

        // Step 1
        // Look for a possible column in the blob that has been left open. This
        // would happen if we already have multiple columns but some of
        // the cols have events before latestItemEnd.  For instance
        //       |      |      |
        //       |______|      |
        //       |ev1   |______|
        //       |      |ev2   |
        //       |______|      |
        //       |      |      |
        //       |OPEN! |      |<--Our item's start time might be here
        //       |      |______|
        //       |      |      |
        //
        // Remember that any time we're starting a new blob, colEndArray
        // will be empty, but that's ok.
        for (let j = 0; j < colEndArray.length; ++j) {
          let colEnd = colEndArray[j].layoutEnd;
          if (colEnd.compare(curItemInfo.layoutStart) != 1) {
            // Yay, we can jump into this column.
            colEndArray[j] = curItemInfo;

            // Check and see if there are any adjacent columns we can
            // jump into as well.
            let lastCol = Number(j) + 1;
            while (lastCol < colEndArray.length) {
              let nextColEnd = colEndArray[lastCol].layoutEnd;
              // If the next column's item ends after we start, we
              // can't expand any further.
              if (nextColEnd.compare(curItemInfo.layoutStart) == 1) {
                break;
              }
              colEndArray[lastCol] = curItemInfo;
              lastCol++;
            }
            // Now construct the info we need to push into the blob.
            currentBlob.push({
              itemInfo: curItemInfo,
              startCol: j,
              colSpan: lastCol - j,
            });

            // Update latestItemEnd.
            if (latestItemEnd && curItemInfo.layoutEnd.compare(latestItemEnd) == 1) {
              latestItemEnd = curItemInfo.layoutEnd;
            }
            placedItem = true;
            break; // Stop iterating through colEndArray.
          }
        }

        if (placedItem) {
          // Go get the next item.
          continue;
        }

        // Step 2
        // OK, all columns (if there are any) overlap us.  Look if the
        // last item in any of the last items in those columns is taking
        // up 2 or more cols. If so, shrink it and stick the item in the
        // created space. For instance
        //       |______|______|______|
        //       |ev1   |ev3   |ev4   |
        //       |      |      |      |
        //       |      |______|      |
        //       |      |      |______|
        //       |      |_____________|
        //       |      |ev2          |
        //       |______|             |<--If our item's start time is
        //       |      |_____________|   here, we can shrink ev2 and jump
        //       |      |      |      |   in column #3
        //
        for (let j = 1; j < colEndArray.length; ++j) {
          if (colEndArray[j].event.hashId == colEndArray[j - 1].event.hashId) {
            // Good we found a item that spanned multiple columns.
            // Find it in the blob so we can modify its properties.
            for (let blobKey in currentBlob) {
              if (currentBlob[blobKey].itemInfo.event.hashId == colEndArray[j].event.hashId) {
                // Take all but the first spot that the item spanned.
                let spanOfShrunkItem = currentBlob[blobKey].colSpan;
                currentBlob.push({
                  itemInfo: curItemInfo,
                  startCol: Number(currentBlob[blobKey].startCol) + 1,
                  colSpan: spanOfShrunkItem - 1,
                });

                // Update colEndArray.
                for (let k = j; k < j + spanOfShrunkItem - 1; k++) {
                  colEndArray[k] = curItemInfo;
                }

                // Modify the data on the old item.
                currentBlob[blobKey] = {
                  itemInfo: currentBlob[blobKey].itemInfo,
                  startCol: currentBlob[blobKey].startCol,
                  colSpan: 1,
                };
                // Update latestItemEnd.
                if (latestItemEnd && curItemInfo.layoutEnd.compare(latestItemEnd) == 1) {
                  latestItemEnd = curItemInfo.layoutEnd;
                }
                break; // Stop iterating through currentBlob.
              }
            }
            placedItem = true;
            break; // Stop iterating through colEndArray.
          }
        }

        if (placedItem) {
          // Go get the next item.
          continue;
        }

        // Step 3
        // Guess what? We still haven't placed the item.  We need to
        // create a new column for it.

        // All the items in the last column, except for the one* that
        // conflicts with the item we're trying to place, need to have
        // their span extended by 1, since we're adding the new column
        //
        // * Note that there can only be one, because we sorted our
        //   events by start time, so this event must start later than
        //   the start of any possible conflicts.
        let lastColNum = colEndArray.length;
        for (let blobKey in currentBlob) {
          let blobKeyEnd = currentBlob[blobKey].itemInfo.layoutEnd;
          if (
            currentBlob[blobKey].startCol + currentBlob[blobKey].colSpan == lastColNum &&
            blobKeyEnd.compare(curItemInfo.layoutStart) != 1
          ) {
            currentBlob[blobKey] = {
              itemInfo: currentBlob[blobKey].itemInfo,
              startCol: currentBlob[blobKey].startCol,
              colSpan: currentBlob[blobKey].colSpan + 1,
            };
          }
        }
        currentBlob.push({
          itemInfo: curItemInfo,
          startCol: colEndArray.length,
          colSpan: 1,
        });
        colEndArray.push(curItemInfo);

        // Update latestItemEnd.
        if (latestItemEnd && curItemInfo.layoutEnd.compare(latestItemEnd) == 1) {
          latestItemEnd = curItemInfo.layoutEnd;
        }
        // Go get the next item.
      }
      // Add the last blob.
      blobs.push({
        blob: currentBlob,
        totalCols: colEndArray.length,
      });
      return this.setupBoxStructure(blobs);
    }

    setupBoxStructure(blobs) {
      // This is actually going to end up being a 3-d array
      // 1st dimension: "layers", sets of columns of events that all
      //                should have equal width*
      // 2nd dimension: "columns", individual columns of non-conflicting
      //                items
      // 3rd dimension: "chunks", individual items or placeholders for
      //                the blank time in between them
      //
      // * Note that 'equal width' isn't strictly correct.  If we're
      //   oriented differently, it will be height (and we'll have rows
      //   not columns).  What's more, in the 'specialSpan' case, the
      //   columns won't actually have the same size, but will only all
      //   be multiples of a common size.  See the note in the relayout
      //   function for more info on this (fairly rare) case.
      let layers = [];

      // When we start a new blob, move to a new set of layers.
      let layerOffset = 0;
      for (let glob of blobs) {
        let layerArray = [];
        let layerCounter = 1;

        for (let data of glob.blob) {
          // From the item at hand we need to figure out on which
          // layer and on which column it should go.
          let layerIndex;
          let specialSpan = null;

          // Each blob receives its own layer, that's the first part of the story. within
          // a given blob we need to distribute the items on different layers depending on
          // the number of columns each item spans. if each item just spans a single column
          // the blob will cover *one* layer. if the blob contains items that span more than
          // a single column, this blob will cover more than one layer. the algorithm places
          // the items on the first layer in the case an item covers a single column. new layers
          // are introduced based on the start column and number of spanning columns of an item.
          if (data.colSpan == 1) {
            layerIndex = 0;
          } else {
            let index = glob.totalCols * data.colSpan + data.startCol;
            layerIndex = layerArray[index];
            if (!layerIndex) {
              layerIndex = layerCounter++;
              layerArray[index] = layerIndex;
            }
            let offset = (glob.totalCols - data.colSpan) % glob.totalCols;
            if (offset != 0) {
              specialSpan = data.colSpan / glob.totalCols;
            }
          }
          layerIndex += layerOffset;

          // Make sure there's room to insert stuff.
          while (layerIndex >= layers.length) {
            layers.push([]);
          }

          while (data.startCol >= layers[layerIndex].length) {
            layers[layerIndex].push([]);
            if (specialSpan) {
              layers[layerIndex][layers[layerIndex].length - 1].specialSpan = 1 / glob.totalCols;
            }
          }

          // We now retrieve the column from 'layerIndex' and 'startCol'.
          let col = layers[layerIndex][data.startCol];
          if (specialSpan) {
            col.specialSpan = specialSpan;
          }

          // Take into account that items can span several days.
          // that's why i'm clipping the start- and end-time to the
          // timespan of this column.
          let start = data.itemInfo.layoutStart;
          let end = data.itemInfo.layoutEnd;
          if (
            start.year != this.date.year ||
            start.month != this.date.month ||
            start.day != this.date.day
          ) {
            start = start.clone();
            start.resetTo(
              this.date.year,
              this.date.month,
              this.date.day,
              0,
              this.mStartMin,
              0,
              start.timezone
            );
          }
          if (
            end.year != this.date.year ||
            end.month != this.date.month ||
            end.day != this.date.day
          ) {
            end = end.clone();
            end.resetTo(
              this.date.year,
              this.date.month,
              this.date.day,
              0,
              this.mEndMin,
              0,
              end.timezone
            );
          }
          let prevEnd;
          if (col.length > 0) {
            // Fill in time gaps with a placeholder.
            prevEnd = col[col.length - 1].endDate.clone();
          } else {
            // First event in the column, add a placeholder for the
            // blank time from this.mStartMin to the event's start.
            prevEnd = start.clone();
            prevEnd.hour = 0;
            prevEnd.minute = this.mStartMin;
          }
          prevEnd.timezone = cal.dtz.floating;
          // The reason why we need to calculate time durations
          // based on floating timezones is that we need avoid
          // dst gaps in this case. converting the date/times to
          // floating conveys this idea in a natural way. note that
          // we explicitly don't use getInTimezone() as it would
          // be slightly more expensive in terms of performance.
          let floatstart = start.clone();
          floatstart.timezone = cal.dtz.floating;
          let dur = floatstart.subtractDate(prevEnd);
          if (dur.inSeconds) {
            col.push({ duration: dur });
          }
          let floatend = end.clone();
          floatend.timezone = cal.dtz.floating;
          col.push({
            event: data.itemInfo.event,
            endDate: end,
            startDate: start,
            duration: floatend.subtractDate(floatstart),
          });
        }
        layerOffset = layers.length;
      }
      return layers;
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
        if (draggedForward) {
          dragState.origColumn.mCreatedNewEvent = true;
        } else {
          col.mCreatedNewEvent = true;
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
}
