/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals currentView MozElements MozXULElement */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

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
    }

    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }
      this.hasConnected = true;

      this.mDropShadows = [];
      this.mCalendarView = null;
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
      return (this.mCalendarView = val);
    }

    /**
     * Method to add individual code e.g to set up the new item during 'ondrop'.
     */
    onDropItem(aItem) {
      // method that may be overridden by derived bindings...
    }

    getDropShadows() {
      return this.mDropShadows;
    }

    /**
     * Adds the dropshadows to the children of the binding.
     * The dropshadows are added at the first position of the children.
     */
    addDropShadows() {
      if (!this.mDropShadows) {
        return;
      }

      if (this.getElementsByAttribute("class", "dropshadow").length > 0) {
        return;
      }

      let offset = this.calendarView.mShadowOffset;
      let shadowStartDate = this.date.clone();
      shadowStartDate.addDuration(offset);
      this.calendarView.mDropShadows = [];
      for (let i = 0; i < this.calendarView.mDropShadowsLength; i++) {
        let box = this.calendarView.findDayBoxForDate(shadowStartDate);
        if (!box) {
          // Dragging to the end or beginning of a view.
          shadowStartDate.day += 1;
          continue;
        }
        let boxItems = box.querySelector(".calendar-day-items");
        let dropshadow = document.createXULElement("box");
        dropshadow.setAttribute("class", "dropshadow");
        if (boxItems) {
          boxItems.insertBefore(dropshadow, boxItems.firstElementChild);
          this.calendarView.mDropShadows.push(boxItems);
        } else {
          box.insertBefore(dropshadow, box.firstElementChild);
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
        for (let shadow of this.calendarView.mDropShadows) {
          cal.view.removeChildElementsByAttribute(shadow, "class", "dropshadow");
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
        let session = cal.getDragService().getCurrentSession();
        let startingDayBox = session.sourceNode.mParentBox;
        if (session) {
          session.canDrop = true;
          // no shadows when dragging in the initial position
          if (aVal == "true" && this != startingDayBox) {
            this.mDropShadows = [session.sourceNode.sourceObject];
            this.addDropShadows();
          } else {
            this.removeDropShadows();
          }
        }
      }
      return XULElement.prototype.setAttribute.call(this, aAttr, aVal);
    }

    onDragStart(event) {
      let draggedDOMNode = document.monthDragEvent || event.target;
      if (
        !draggedDOMNode ||
        !draggedDOMNode.parentNode ||
        (draggedDOMNode.parentNode != this &&
          !draggedDOMNode.parentNode.classList.contains("calendar-day-items"))
      ) {
        return;
      }
      let item = draggedDOMNode.occurrence.clone();
      let beginMoveDate = draggedDOMNode.mParentBox.date;
      let itemStartDate = (item.startDate || item.entryDate || item.dueDate).getInTimezone(
        this.calendarView.mTimezone
      );
      let itemEndDate = (item.endDate || item.dueDate || item.entryDate).getInTimezone(
        this.calendarView.mTimezone
      );
      let oneMoreDay = itemEndDate.hour > 0 || itemEndDate.minute > 0;
      itemStartDate.isDate = true;
      itemEndDate.isDate = true;
      let offsetDuration = itemStartDate.subtractDate(beginMoveDate);
      let lenDuration = itemEndDate.subtractDate(itemStartDate);
      let len = lenDuration.weeks * 7 + lenDuration.days;

      this.calendarView.mShadowOffset = offsetDuration;
      this.calendarView.mDropShadowsLength = oneMoreDay ? len + 1 : len;
    }

    onDragOver(event) {
      let session = cal.getDragService().getCurrentSession();
      if (!session || !session.sourceNode || !session.sourceNode.sourceObject) {
        // No source item? Then this is not for us.
        return;
      }

      // We handled the event.
      event.preventDefault();
    }

    onDragEnter(event) {
      if (
        event.target.localName == this.localName ||
        event.target.classList.contains("calendar-day-items")
      ) {
        let session = cal.getDragService().getCurrentSession();
        if (session) {
          if (!session.sourceNode || !session.sourceNode.sourceObject) {
            // No source item? Then this is not for us.
            return;
          }

          // We can drop now, tell the drag service.
          event.preventDefault();

          if (!this.hasAttribute("dropbox") || this.getAttribute("dropbox") == "false") {
            // As it turned out it was not possible to remove the remaining dropshadows
            // at the "dragleave" or "dragexit" event, majorly because it was not reliably
            // fired. As the dragndropcontainer may be anonymous it is further on not
            // possible to remove the dropshadows by something like
            // "document.getElementsByAttribute('dropbox').removeDropShadows();";
            // So we have to remove them at the currentView(). The restriction of course is
            // that these containers so far may not be used for drag and drop from/to e.g.
            // the today-pane.
            currentView().removeDropShadows();
          }
          this.setAttribute("dropbox", "true");
        }
      }
    }

    onDrop(event) {
      let session = cal.getDragService().getCurrentSession();
      if (!session || !session.sourceNode || !session.sourceNode.sourceObject) {
        // No source node? Not our drag.
        return;
      }
      let item = session.sourceNode.sourceObject.clone();
      this.setAttribute("dropbox", "false");
      let transfer = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
      transfer.init(null);

      if (cal.item.isEvent(item)) {
        transfer.addDataFlavor("application/x-moz-cal-event");
      } else {
        transfer.addDataFlavor("application/x-moz-cal-task");
      }

      session.getData(transfer, 0);
      item = session.sourceNode.sourceObject;

      let newItem = this.onDropItem(item).clone();
      let newStart = newItem.startDate || newItem.entryDate || newItem.dueDate;
      let newEnd = newItem.endDate || newItem.dueDate || newItem.entryDate;
      let offset = this.calendarView.mShadowOffset;
      newStart.addDuration(offset);
      newEnd.addDuration(offset);
      this.calendarView.controller.modifyOccurrence(item, newStart, newEnd);

      // We handled the event.
      event.stopPropagation();
    }

    onDragEnd(event) {
      currentView().removeDropShadows();
    }
  }

  MozElements.CalendarDnDContainer = CalendarDnDContainer;
}
