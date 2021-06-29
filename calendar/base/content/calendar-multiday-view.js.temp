/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from widgets/mouseoverPreviews.js */
/* import-globals-from calendar-ui-utils.js */

/* globals MozElements, MozXULElement */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

  /**
   * Implements the Drag and Drop class for the Calendar Header Container.
   *
   * @extends {MozElements.CalendarDnDContainer}
   */
  class CalendarHeaderContainer extends MozElements.CalendarDnDContainer {
    static get inheritedAttributes() {
      return { ".calendar-event-column-header": "selected" };
    }

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

      this.mItemBoxes = [];

      this.setAttribute("flex", "1");
      this.classList.add("calendar-event-column-header");
      this.initializeAttributeInheritance();
    }

    get date() {
      return this.mDate;
    }

    set date(val) {
      this.mDate = val;
    }

    findBoxForItem(aItem) {
      for (let item of this.mItemBoxes) {
        if (aItem && item.occurrence.hasSameIds(aItem)) {
          // We can return directly, since there will only be one box per
          // item in the header.
          return item;
        }
      }
      return null;
    }

    addEvent(aItem) {
      // Prevent same items being added.
      if (this.mItemBoxes.some(itemBox => itemBox.occurrence.hashId == aItem.hashId)) {
        return;
      }

      let itemBox = document.createXULElement("calendar-editable-item");
      cal.data.binaryInsertNode(
        this,
        itemBox,
        aItem,
        cal.view.compareItems,
        false,
        node => node.occurrence
      );
      itemBox.calendarView = this.calendarView;
      itemBox.occurrence = aItem;
      let ctxt =
        this.calendarView.getAttribute("item-context") || this.calendarView.getAttribute("context");
      itemBox.setAttribute("context", ctxt);

      if (aItem.hashId in this.calendarView.mFlashingEvents) {
        itemBox.setAttribute("flashing", "true");
      }

      this.mItemBoxes.push(itemBox);
      itemBox.parentBox = this;
    }

    deleteEvent(aItem) {
      for (let i in this.mItemBoxes) {
        if (this.mItemBoxes[i].occurrence.hashId == aItem.hashId) {
          this.mItemBoxes[i].remove();
          this.mItemBoxes.splice(i, 1);
          break;
        }
      }
    }

    setDropShadow(on) {
      let existing = this.querySelector(".dropshadow");
      if (on) {
        if (!existing) {
          let dropshadow = document.createXULElement("box");
          dropshadow.classList.add("dropshadow");
          this.insertBefore(dropshadow, this.firstElementChild);
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

    selectOccurrence(aItem) {
      for (let itemBox of this.mItemBoxes) {
        if (aItem && itemBox.occurrence.hashId == aItem.hashId) {
          itemBox.selected = true;
        }
      }
    }

    unselectOccurrence(aItem) {
      for (let itemBox of this.mItemBoxes) {
        if (aItem && itemBox.occurrence.hashId == aItem.hashId) {
          itemBox.selected = false;
        }
      }
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

    get startMinute() {
      if (!this.mOccurrence) {
        return 0;
      }
      let startDate = this.mOccurrence.startDate || this.mOccurrence.entryDate;
      return startDate.hour * 60 + startDate.minute;
    }

    get endMinute() {
      if (!this.mOccurrence) {
        return 0;
      }
      let endDate = this.mOccurrence.endDate || this.mOccurrence.dueDate;
      return endDate.hour * 60 + endDate.minute;
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
}
