/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MozElements, MozXULElement, onMouseOverItem */

/* import-globals-from calendar-ui-utils.js */

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
      return val;
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
      this.appendChild(itemBox);
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
        ".calendar-color-box":
          "orient,readonly,flashing,alarm,allday,priority,progress,status,calendar,categories,todoType",
        ".calendar-event-box": "orient,width,height",
        ".calendar-event-box-container":
          "context,parentorient=orient,readonly,flashing,alarm,allday,priority,progress,status,calendar,categories",
        ".calendar-item-image": "progress,allday,itemType,todoType",
        ".alarm-icons-box": "flashing",
        ".category-color-box": "categories",
        ".calendar-event-box-grippy-top": "parentorient=orient",
        ".calendar-event-box-grippy-bottom": "parentorient=orient",
        ".calendar-event-gripbar-container": "orient",
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
          <box class="calendar-event-box"
               flex="1">
            <box class="calendar-color-box"
                 flex="1">
              <box class="calendar-event-selection"
                   orient="horizontal"
                   flex="1">
                <stack class="calendar-event-box-container"
                       flex="1">
                  <hbox class="calendar-event-details"
                        align="start">
                    <image class="calendar-item-image">
                    </image>
                    <vbox flex="1">
                      <label class="calendar-event-details-core event-name-label"
                             crop="end">
                      </label>
                      <html:input class="plain calendar-event-details-core calendar-event-name-textbox title-desc"
                                  hidden="hidden"/>
                      <label class="calendar-event-details-core location-desc"
                             crop="end">
                      </label>
                    </vbox>
                    <hbox class="alarm-icons-box"
                          align="start">
                    </hbox>
                    <image class="item-classification-box">
                    </image>
                  </hbox>
                  <stack class="calendar-category-box-stack">
                    <hbox class="calendar-category-box category-color-box calendar-event-selection"
                          flex="1"
                          pack="end">
                      <image class="calendar-category-box-gradient">
                      </image>
                    </hbox>
                  </stack>
                  <box class="calendar-event-gripbar-container">
                    <calendar-event-gripbar class="calendar-event-box-grippy-top"
                                            whichside="start">
                    </calendar-event-gripbar>
                    <spacer flex="1"/>
                    <calendar-event-gripbar class="calendar-event-box-grippy-bottom"
                                            whichside="end">
                    </calendar-event-gripbar>
                  </box>
                </stack>
              </box>
            </box>
          </box>
        `)
      );

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
      return val;
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
      if (this.getAttribute("orient") == "vertical") {
        let minHeight =
          getOptimalMinimumHeight(this.eventNameLabel) +
          getSummarizedStyleValues(this.querySelector(".calendar-event-box-container"), [
            "margin-bottom",
            "margin-top",
          ]) +
          getSummarizedStyleValues(this, ["border-bottom-width", "border-top-width"]);
        this.setAttribute("minheight", minHeight);
        this.setAttribute("minwidth", "1");
        return minHeight;
      }
      this.eventNameLabel.setAttribute("style", "min-width: 2em");
      let minWidth = getOptimalMinimumWidth(this.eventNameLabel);
      this.setAttribute("minwidth", minWidth);
      this.setAttribute("minheight", "1");
      return minWidth;
    }

    setEditableLabel() {
      let label = this.eventNameLabel;
      let item = this.mOccurrence;

      label.textContent = item.title || cal.l10n.getCalString("eventUntitled");

      let gripbar = this.querySelector(".calendar-event-box-grippy-top").getBoundingClientRect()
        .height;
      let height = this.querySelector(".calendar-event-box-container").getBoundingClientRect()
        .height;
      label.setAttribute("style", "max-height: " + Math.max(0, height - gripbar * 2) + "px");
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
