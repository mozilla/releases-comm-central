/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals currentView MozElements MozXULElement */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

  /**
   * An abstract class to handle drag on drop for calendar.
   *
   * @abstract
   */
  class CalendarDnDContainer extends MozXULElement {
    constructor() {
      super();
      this.addEventListener("dragstart", this.onDragStart);
      this.addEventListener("dragover", this.onDragOver);
      this.addEventListener("dragenter", this.onDragEnter);
      this.addEventListener("drop", this.onDrop);
      this.addEventListener("dragend", this.onDragEnd);
      this.mCalendarView = null;
    }

    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }
      this.hasConnected = true;
    }

    /**
     * The ViewController that supports the interface 'calICalendarView'.
     *
     * @returns {calICalendarView}
     */
    get calendarView() {
      return this.mCalendarView;
    }

    set calendarView(val) {
      this.mCalendarView = val;
    }

    /**
     * Method to add individual code e.g to set up the new item during 'ondrop'.
     */
    onDropItem() {
      // method that may be overridden by derived bindings...
    }

    /**
     * Adds the dropshadows to the children of the binding.
     * The dropshadows are added at the first position of the children.
     */
    addDropShadows() {
      const offset = this.calendarView.mShadowOffset;
      const shadowStartDate = this.date.clone();
      shadowStartDate.addDuration(offset);
      this.calendarView.mDropShadows = [];
      for (let i = 0; i < this.calendarView.mDropShadowsLength; i++) {
        const box = this.calendarView.findDayBoxForDate(shadowStartDate);
        if (box) {
          box.setDropShadow(true);
          this.calendarView.mDropShadows.push(box);
        }
        shadowStartDate.day += 1;
      }
    }

    /**
     * Removes all dropShadows from the binding.
     * Dropshadows are recognized as such by carrying an attribute "dropshadow".
     */
    removeDropShadows() {
      // method that may be overwritten by derived bindings...
      if (this.calendarView.mDropShadows) {
        for (const box of this.calendarView.mDropShadows) {
          box.setDropShadow(false);
        }
      }
      this.calendarView.mDropShadows = null;
    }

    /**
     * By setting the attribute "dropbox" to "true" or "false" the
     * dropshadows are added or removed.
     */
    setAttribute(aAttr, aVal) {
      if (aAttr == "dropbox") {
        const session = cal.dragService.getCurrentSession();
        if (session) {
          session.canDrop = true;
          // no shadows when dragging in the initial position
          if (aVal == "true" && !this.contains(session.sourceNode)) {
            this.addDropShadows();
          } else {
            this.removeDropShadows();
          }
        }
      }
      return XULElement.prototype.setAttribute.call(this, aAttr, aVal);
    }

    onDragStart(event) {
      let target = event.target;
      if (target?.nodeType == Node.TEXT_NODE) {
        target = target.parentNode;
      }
      const draggedDOMNode = target.closest(`[draggable="true"]`);
      if (!draggedDOMNode?.occurrence || !this.contains(draggedDOMNode)) {
        return;
      }
      const item = draggedDOMNode.occurrence.clone();
      const beginMoveDate = draggedDOMNode.mParentBox.date;
      const itemStartDate = (item.startDate || item.entryDate || item.dueDate).getInTimezone(
        this.calendarView.mTimezone
      );
      const itemEndDate = (item.endDate || item.dueDate || item.entryDate).getInTimezone(
        this.calendarView.mTimezone
      );
      const oneMoreDay = itemEndDate.hour > 0 || itemEndDate.minute > 0;
      itemStartDate.isDate = true;
      itemEndDate.isDate = true;
      const offsetDuration = itemStartDate.subtractDate(beginMoveDate);
      const lenDuration = itemEndDate.subtractDate(itemStartDate);
      const len = lenDuration.weeks * 7 + lenDuration.days;

      this.calendarView.mShadowOffset = offsetDuration;
      this.calendarView.mDropShadowsLength = oneMoreDay ? len + 1 : len;
    }

    onDragOver(event) {
      if (!event.dataTransfer.mozTypesAt(0).contains("application/vnd.x-moz-cal-item")) {
        // No source item? Then this is not for us.
        return;
      }

      // We handled the event.
      event.preventDefault();
    }

    onDragEnter(event) {
      if (!event.dataTransfer.mozTypesAt(0).contains("application/vnd.x-moz-cal-item")) {
        // No source item? Then this is not for us.
        return;
      }

      // We can drop now, tell the drag service.
      event.preventDefault();

      if (!this.hasAttribute("dropbox") || this.getAttribute("dropbox") == "false") {
        // As it turned out it was not possible to remove the remaining dropshadows
        // at the "dragleave" event, majorly because it was not reliably
        // fired.
        // So we have to remove them at the currentView(). The restriction of course is
        // that these containers so far may not be used for drag and drop from/to e.g.
        // the today-pane.
        currentView().removeDropShadows();
      }
      this.setAttribute("dropbox", "true");
    }

    onDrop(event) {
      if (!event.dataTransfer.mozTypesAt(0).contains("application/vnd.x-moz-cal-item")) {
        // No source node? Not our drag.
        return;
      }
      const item = event.dataTransfer.mozGetDataAt("application/vnd.x-moz-cal-item", 0);
      this.setAttribute("dropbox", "false");
      const newItem = this.onDropItem(item).clone();
      const newStart = newItem.startDate || newItem.entryDate || newItem.dueDate;
      const newEnd = newItem.endDate || newItem.dueDate || newItem.entryDate;
      const offset = this.calendarView.mShadowOffset;
      newStart.addDuration(offset);
      newEnd.addDuration(offset);
      this.calendarView.controller.modifyOccurrence(item, newStart, newEnd);

      // We handled the event.
      event.stopPropagation();
    }

    onDragEnd() {
      currentView().removeDropShadows();
    }
  }

  MozElements.CalendarDnDContainer = CalendarDnDContainer;
}
