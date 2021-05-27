/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MozElements MozXULElement */

/* import-globals-from calendar-ui-utils.js */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

  /**
   * Implements the Drag and Drop class for the Month Day Box view.
   *
   * @extends {MozElements.CalendarDnDContainer}
   */
  class CalendarMonthDayBox extends MozElements.CalendarDnDContainer {
    static get inheritedAttributes() {
      return {
        ".calendar-month-week-label": "relation,selected",
        ".calendar-month-day-label": "relation,selected,value",
      };
    }

    constructor() {
      super();
      this.addEventListener("mousedown", this.onMouseDown);
      this.addEventListener("dblclick", this.onDblClick);
      this.addEventListener("click", this.onClick);
      this.addEventListener("wheel", this.onWheel);
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      // this.hasConnected is set to true in super.connectedCallback.
      super.connectedCallback();

      this.mDate = null;
      this.mItemHash = {};
      this.mShowMonthLabel = false;

      this.setAttribute("orient", "vertical");

      let monthDayLabels = document.createXULElement("hbox");
      monthDayLabels.classList.add("calendar-month-day-box-dates");

      let weekLabel = document.createXULElement("label");
      weekLabel.setAttribute("data-label", "week");
      weekLabel.setAttribute("flex", "1");
      weekLabel.setAttribute("crop", "end");
      weekLabel.setAttribute("hidden", "true");
      weekLabel.style.pointerEvents = "none";
      weekLabel.classList.add(
        "calendar-month-day-box-week-label",
        "calendar-month-day-box-date-label",
        "calendar-month-week-label"
      );

      let dayLabel = document.createXULElement("label");
      dayLabel.setAttribute("data-label", "day");
      dayLabel.setAttribute("flex", "1");
      dayLabel.style.pointerEvents = "none";
      dayLabel.classList.add("calendar-month-day-box-date-label", "calendar-month-day-label");

      monthDayLabels.appendChild(weekLabel);
      monthDayLabels.appendChild(dayLabel);

      this.dayList = document.createElement("ol");
      this.dayList.classList.add("calendar-month-day-box-list");

      this.appendChild(monthDayLabels);
      this.appendChild(this.dayList);

      this.initializeAttributeInheritance();
    }

    get date() {
      return this.mDate;
    }

    set date(val) {
      this.setDate(val);
    }

    get selected() {
      let sel = this.getAttribute("selected");
      if (sel && sel == "true") {
        return true;
      }

      return false;
    }

    set selected(val) {
      if (val) {
        this.setAttribute("selected", "true");
        this.parentNode.setAttribute("selected", "true");
      } else {
        this.removeAttribute("selected");
        this.parentNode.removeAttribute("selected");
      }
    }

    get showMonthLabel() {
      return this.mShowMonthLabel;
    }

    set showMonthLabel(val) {
      if (this.mShowMonthLabel == val) {
        return;
      }
      this.mShowMonthLabel = val;

      if (!this.mDate) {
        return;
      }
      if (val) {
        this.setAttribute("value", cal.dtz.formatter.formatDateWithoutYear(this.mDate));
      } else {
        this.setAttribute("value", this.mDate.day);
      }
    }

    setDate(aDate) {
      // Remove all the old events.
      this.mItemHash = {};
      while (this.dayList.lastChild) {
        this.dayList.lastChild.remove();
      }

      if (this.mDate && aDate && this.mDate.compare(aDate) == 0) {
        return;
      }

      this.mDate = aDate;

      if (!aDate) {
        // Clearing out these attributes isn't strictly necessary but saves some confusion.
        this.removeAttribute("year");
        this.removeAttribute("month");
        this.removeAttribute("week");
        this.removeAttribute("day");
        this.removeAttribute("value");
        return;
      }

      // Set up DOM attributes for custom CSS coloring.
      let weekTitle = cal.getWeekInfoService().getWeekTitle(aDate);
      this.setAttribute("year", aDate.year);
      this.setAttribute("month", aDate.month + 1);
      this.setAttribute("week", weekTitle);
      this.setAttribute("day", aDate.day);

      if (this.mShowMonthLabel) {
        let monthName = cal.l10n.getDateFmtString(`month.${aDate.month + 1}.Mmm`);
        this.setAttribute("value", aDate.day + " " + monthName);
      } else {
        this.setAttribute("value", aDate.day);
      }
    }

    addItem(aItem) {
      if (aItem.hashId in this.mItemHash) {
        this.deleteItem(aItem);
      }

      let cssSafeId = cal.view.formatStringForCSSRule(aItem.calendar.id);
      let box = document.createXULElement("calendar-month-day-box-item");
      let context = this.getAttribute("item-context") || this.getAttribute("context");
      box.setAttribute("context", context);
      box.style.setProperty("--item-backcolor", `var(--calendar-${cssSafeId}-backcolor)`);
      box.style.setProperty("--item-forecolor", `var(--calendar-${cssSafeId}-forecolor)`);

      let listItemWrapper = document.createElement("li");
      listItemWrapper.classList.add("calendar-month-day-box-list-item");
      listItemWrapper.appendChild(box);
      cal.data.binaryInsertNode(
        this.dayList,
        listItemWrapper,
        aItem,
        cal.view.compareItems,
        false,
        // Access the calendar item from a list item wrapper.
        wrapper => wrapper.firstChild.item
      );

      box.calendarView = this.calendarView;
      box.item = aItem;
      box.parentBox = this;
      box.occurrence = aItem;

      this.mItemHash[aItem.hashId] = box;
      return box;
    }

    selectItem(aItem) {
      if (aItem.hashId in this.mItemHash) {
        this.mItemHash[aItem.hashId].selected = true;
      }
    }

    unselectItem(aItem) {
      if (aItem.hashId in this.mItemHash) {
        this.mItemHash[aItem.hashId].selected = false;
      }
    }

    deleteItem(aItem) {
      if (aItem.hashId in this.mItemHash) {
        // Delete the list item wrapper.
        let node = this.mItemHash[aItem.hashId].parentNode;
        node.remove();
        delete this.mItemHash[aItem.hashId];
      }
    }

    setDropShadow(on) {
      let existing = this.dayList.querySelector(".dropshadow");
      if (on) {
        if (!existing) {
          // Insert an empty list item.
          let dropshadow = document.createElement("li");
          dropshadow.classList.add("dropshadow", "calendar-month-day-box-list-item");
          this.dayList.insertBefore(dropshadow, this.dayList.firstElementChild);
        }
      } else if (existing) {
        existing.remove();
      }
    }

    onDropItem(aItem) {
      // When item's timezone is different than the default one, the
      // item might get moved on a day different than the drop day.
      // Changing the drop day allows to compensate a possible difference.

      // Figure out if the timezones cause a days difference.
      let start = (
        aItem[cal.dtz.startDateProp(aItem)] || aItem[cal.dtz.endDateProp(aItem)]
      ).clone();
      let dayboxDate = this.mDate.clone();
      if (start.timezone != dayboxDate.timezone) {
        let startInDefaultTz = start.clone().getInTimezone(dayboxDate.timezone);
        start.isDate = true;
        startInDefaultTz.isDate = true;
        startInDefaultTz.timezone = start.timezone;
        let dayDiff = start.subtractDate(startInDefaultTz);
        // Change the day where to drop the item.
        dayboxDate.addDuration(dayDiff);
      }

      return cal.item.moveToDate(aItem, dayboxDate);
    }

    onMouseDown(event) {
      event.stopPropagation();
      if (this.mDate) {
        this.calendarView.selectedDay = this.mDate;
      }
    }

    onDblClick(event) {
      event.stopPropagation();
      this.calendarView.controller.createNewEvent();
    }

    onClick(event) {
      if (event.button != 0) {
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) {
        this.calendarView.setSelectedItems([]);
      }
    }

    onWheel(event) {
      if (cal.view.getParentNodeOrThisByAttribute(event.target, "data-label", "day") == null) {
        if (this.dayList.scrollHeight > this.dayList.clientHeight) {
          event.stopPropagation();
        }
      }
    }
  }
  customElements.define("calendar-month-day-box", CalendarMonthDayBox);

  /**
   * The MozCalendarMonthDayBoxItem widget is used as event item in the
   * Multiweek and Month views of the calendar. It displays the event name,
   * alarm icon and the category type color.
   *
   * @extends {MozElements.MozCalendarEditableItem}
   */
  class MozCalendarMonthDayBoxItem extends MozElements.MozCalendarEditableItem {
    static get inheritedAttributes() {
      return {
        ".alarm-icons-box": "flashing",
      };
    }
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      // NOTE: This is the same structure as EditableItem, except this has a
      // time label and we are missing the location-desc.
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <html:img class="item-type-icon" alt="" />
          <html:div class="item-time-label"></html:div>
          <html:div class="event-name-label"></html:div>
          <html:input class="plain event-name-input"
                      hidden="hidden"
                      placeholder='${cal.l10n.getCalString("newEvent")}' />
          <html:div class="alarm-icons-box"></html:div>
          <html:img class="item-classification-icon" />
          <html:div class="calendar-category-box"></html:div>
        `)
      );

      this.classList.add("calendar-color-box", "calendar-item-flex");

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

      this.style.pointerEvents = "auto";
      this.setAttribute("tooltip", "itemTooltip");
      this.addEventNameTextboxListener();
      this.initializeAttributeInheritance();
    }

    set occurrence(val) {
      cal.ASSERT(!this.mOccurrence, "Code changes needed to set the occurrence twice", true);
      this.mOccurrence = val;
      let labelTime;
      if (val.isEvent()) {
        let type;
        if (!val.startDate.isDate) {
          let timezone = this.calendarView ? this.calendarView.mTimezone : cal.dtz.defaultTimezone;
          let parentDate = this.parentBox.date;
          let parentTime = cal.createDateTime();
          parentTime.resetTo(parentDate.year, parentDate.month, parentDate.day, 0, 0, 0, timezone);
          let startTime = val.startDate.getInTimezone(timezone);
          let endTime = val.endDate.getInTimezone(timezone);
          let nextDay = parentTime.clone();
          nextDay.day++;
          let comp = endTime.compare(nextDay);
          if (startTime.compare(parentTime) == -1) {
            if (comp == 1) {
              type = "continue";
            } else if (comp == 0) {
              type = "start";
            } else {
              type = "end";
              labelTime = endTime;
            }
          } else if (comp == 1) {
            type = "start";
            labelTime = startTime;
          } else {
            labelTime = startTime;
          }
        }
        let icon = this.querySelector(".item-type-icon");
        if (type) {
          // NOTE: "type" attribute only seems to be used in the mochitest
          // browser_eventDisplay.js.
          icon.setAttribute("type", type);
          icon.setAttribute("src", `chrome://calendar/skin/shared/event-${type}.svg`);
          icon.setAttribute("rotated-to-read-direction", true);
          // Sets alt.
          document.l10n.setAttributes(icon, `calendar-editable-item-multiday-event-icon-${type}`);
        } else {
          icon.removeAttribute("type");
          icon.removeAttribute("src");
          icon.removeAttribute("rotated-to-read-direction");
          icon.removeAttribute("data-l10n-id");
          icon.setAttribute("alt", "");
        }
      }
      let timeLabel = this.querySelector(".item-time-label");
      if (labelTime === undefined) {
        timeLabel.textContent = "";
        timeLabel.hidden = true;
      } else {
        let formatter = cal.dtz.formatter;
        timeLabel.textContent = formatter.formatTime(labelTime);
        timeLabel.hidden = false;
      }

      this.setEditableLabel();
      this.setCSSClasses();
    }

    get occurrence() {
      return this.mOccurrence;
    }
  }

  customElements.define("calendar-month-day-box-item", MozCalendarMonthDayBoxItem);
}
