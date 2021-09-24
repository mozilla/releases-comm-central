/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from item-editing/calendar-item-editing.js */
/* import-globals-from widgets/calendar-filter.js */
/* import-globals-from widgets/mouseoverPreviews.js */
/* import-globals-from calendar-dnd-listener.js */
/* import-globals-from calendar-ui-utils.js */
/* import-globals-from calendar-views-utils.js */
/* import-globals-from today-pane.js */

{
  const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

  class Agenda extends CalFilterMixin(customElements.get("tree-listbox")) {
    _showsToday = false;

    constructor() {
      super();

      this.addEventListener("contextmenu", event => this._showContextMenu(event));
      this.addEventListener("keypress", event => {
        if (this.selectedIndex < 0) {
          return;
        }

        switch (event.key) {
          case "Enter":
            this.editSelectedItem();
            break;
          case "Delete":
            this.deleteSelectedItem();
            event.stopPropagation();
            event.preventDefault();
            break;
        }
      });
      this.addEventListener("dragover", event =>
        calendarCalendarButtonDNDObserver.onDragOver(event)
      );
      this.addEventListener("drop", event => calendarCalendarButtonDNDObserver.onDrop(event));
      document
        .getElementById("itemTooltip")
        .addEventListener("popupshowing", event => this._fillTooltip(event));

      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "numberOfDays",
        "calendar.agenda.days",
        14,
        () => this.update(this.startDate),
        value => {
          // Invalid values, return the default.
          if (value < 1 || value > 28) {
            return 14;
          }
          return value;
        }
      );
    }

    /**
     * Implementation as required by CalFilterMixin.
     */
    clearItems() {
      while (this.lastChild) {
        this.lastChild.remove();
      }
    }

    /**
     * Implementation as required by CalFilterMixin.
     *
     * @param {calIItemBase[]} items
     */
    addItems(items) {
      for (let item of items) {
        if (document.getElementById(`agenda-listitem-${item.hashId}`)) {
          // Item already added.
          continue;
        }

        let startItem = document.createElement("li", { is: "agenda-listitem" });
        startItem.item = item;
        this.insertListItem(startItem);

        // Try to maintain selection across item edits.
        if (this._lastRemovedID == startItem.id) {
          setTimeout(() => (this.selectedIndex = this.rows.indexOf(startItem)));
        }
      }
    }

    /**
     * Implementation as required by CalFilterMixin.
     *
     * @param {calIItemBase[]} items
     */
    removeItems(items) {
      for (let item of items) {
        let startItem = document.getElementById(`agenda-listitem-${item.hashId}`);
        if (!startItem) {
          // Item not found.
          continue;
        }

        this.removeListItem(startItem);
        this._lastRemovedID = startItem.id;
      }
    }

    /**
     * Implementation as required by CalFilterMixin.
     *
     * @param {string} calendarId
     */
    removeItemsFromCalendar(calendarId) {
      for (let li of [...this.children]) {
        if (li.item.calendar.id == calendarId) {
          if (li.displayDateHeader && li.nextElementSibling?.dateString == li.dateString) {
            li.nextElementSibling.displayDateHeader = true;
          }
          li.remove();
        }
      }
    }

    /**
     * Set the date displayed in the agenda. If the date is today, display the
     * full agenda, otherwise display just the given date.
     *
     * @param {calIDateTime} date
     */
    async update(date) {
      let today = cal.dtz.now();

      this.startDate = date.clone();
      this.startDate.isDate = true;

      this.endDate = this.startDate.clone();
      this._showsToday =
        date.year == today.year && date.month == today.month && date.day == today.day;
      if (this._showsToday) {
        this.endDate.day += this.numberOfDays;
      } else {
        this.endDate.day++;
      }

      this.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
      await this.refresh();
      this.selectedIndex = 0;
    }

    /**
     * If the agenda is showing today (true), or any other day (false).
     *
     * @type {boolean}
     */
    get showsToday() {
      return this._showsToday;
    }

    /**
     * Insert the given list item at the appropriate point in the list, and
     * shows or hides date headers as appropriate. Use this method rather than
     * DOM methods.
     *
     * @param {AgendaListItem} listItem
     */
    insertListItem(listItem) {
      cal.data.binaryInsertNode(this, listItem, listItem, this._compareListItems, false, n => n);

      if (listItem.previousElementSibling?.dateString == listItem.dateString) {
        listItem.displayDateHeader = false;
      } else if (listItem.nextElementSibling?.dateString == listItem.dateString) {
        listItem.nextElementSibling.displayDateHeader = false;
      }
    }

    /**
     * Remove the given list item from the list, and shows date headers as
     * appropriate. Use this method rather than DOM methods.
     *
     * @param {AgendaListItem} listItem
     */
    removeListItem(listItem) {
      if (
        listItem.displayDateHeader &&
        listItem.nextElementSibling?.dateString == listItem.dateString
      ) {
        listItem.nextElementSibling.displayDateHeader = true;
      }
      listItem.remove();
    }

    /**
     * Compare two list items for insertion order, using the `sortValue`
     * property on each item, deferring to `compareItems` if the same.
     *
     * @param {AgendaListItem} a
     * @param {AgendaListItem} b
     * @return {number}
     */
    _compareListItems(a, b) {
      let cmp = a.sortValue - b.sortValue;
      if (cmp != 0) {
        return cmp;
      }

      return cal.view.compareItems(a.item, b.item);
    }

    /**
     * Returns the calendar item of the selected row.
     *
     * @return {calIEvent}
     */
    get selectedItem() {
      return this.getRowAtIndex(this.selectedIndex)?.item;
    }

    /**
     * Shows the context menu.
     *
     * @param {MouseEvent} event
     */
    _showContextMenu(event) {
      let row = event.target.closest("li");
      if (!row) {
        return;
      }
      this.selectedIndex = this.rows.indexOf(row);

      let popup = document.getElementById("agenda-menupopup");
      let menu = document.getElementById("calendar-today-pane-menu-attendance-menu");
      setupAttendanceMenu(menu, [this.selectedItem]);
      popup.openPopupAtScreen(event.screenX, event.screenY, true);
    }

    /**
     * Opens the UI for editing the selected event.
     */
    editSelectedItem() {
      openEventDialogForViewing(this.selectedItem);
    }

    /**
     * Deletes the selected event.
     */
    deleteSelectedItem() {
      calendarViewController.deleteOccurrences([this.selectedItem], false, false);
    }

    /**
     * Called in the 'popupshowing' event of #itemTooltip.
     *
     * @param {Event} event
     */
    _fillTooltip(event) {
      let element = document.elementFromPoint(event.clientX, event.clientY);
      if (!this.contains(element)) {
        // Not on the agenda, ignore.
        return;
      }

      if (!element.closest(".agenda-listitem-details")) {
        // Not on an agenda item, cancel.
        event.preventDefault();
        return;
      }

      showToolTip(event.target, element.closest(".agenda-listitem").item);
    }
  }
  customElements.define("agenda-list", Agenda, { extends: "ul" });

  class AgendaListItem extends HTMLLIElement {
    constructor() {
      super();
      this.setAttribute("is", "agenda-listitem");
      this.classList.add("agenda-listitem");

      let template = document.getElementById("agenda-listitem");
      for (let element of template.content.children) {
        this.appendChild(element.cloneNode(true));
      }

      this.dateHeaderElement = this.querySelector(".agenda-date-header");
      this.detailsElement = this.querySelector(".agenda-listitem-details");
      this.calendarElement = this.querySelector(".agenda-listitem-calendar");
      this.timeElement = this.querySelector(".agenda-listitem-time");
      this.titleElement = this.querySelector(".agenda-listitem-title");
      this.overlapElement = this.querySelector(".agenda-listitem-overlap");

      this.detailsElement.addEventListener("dblclick", () => openEventDialogForViewing(this.item));
    }

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      if (!this.overlapsMidnight || this.overlapsEnd) {
        return;
      }

      // Where the start and end of an event are on different days, both within
      // the date range of the agenda, a second item is added representing the
      // end of the event. It's owned by this item (representing the start of
      // the event), and if this item is removed, it is too.
      this._endItem = document.createElement("li", { is: "agenda-listitem" });
      this._endItem.classList.add("end");
      this._endItem.item = this.item;
      TodayPane.agenda.insertListItem(this._endItem);
    }

    disconnectedCallback() {
      // When this item is removed, remove the item representing the end of
      // the event, if there is one.
      if (this._endItem) {
        TodayPane.agenda.removeListItem(this._endItem);
        delete this._endItem;
      }
    }

    /**
     * The date for this event, in ISO format (YYYYMMDD). This corresponds
     * to the date header shown for this event, so only the first event on
     * each day needs to show a header.
     *
     * @type string
     */
    get dateString() {
      return this._dateString;
    }

    set dateString(value) {
      this._dateString = value.substring(0, 8);

      let date = cal.createDateTime(value);
      let today = cal.dtz.now();
      let tomorrow = cal.dtz.now();
      tomorrow.day++;

      if (date.year == today.year && date.month == today.month && date.day == today.day) {
        this.dateHeaderElement.textContent = cal.l10n.getCalString("today");
      } else if (
        date.year == tomorrow.year &&
        date.month == tomorrow.month &&
        date.day == tomorrow.day
      ) {
        this.dateHeaderElement.textContent = cal.l10n.getCalString("tomorrow");
      } else {
        this.dateHeaderElement.textContent = cal.dtz.formatter.formatDateLongWithoutYear(date);
      }
    }

    /**
     * Whether or not to show the date header on this list item. If the item
     * is preceded by an item with the same `dateString` value, no header
     * should be shown.
     *
     * @type {boolean}
     */
    get displayDateHeader() {
      return !this.dateHeaderElement.hidden;
    }

    set displayDateHeader(value) {
      this.dateHeaderElement.hidden = !value;
    }

    /**
     * The calendar item for this list item.
     *
     * @type {calIEvent}
     */
    get item() {
      return this._item;
    }

    set item(item) {
      this._item = item;

      let defaultTimezone = cal.dtz.defaultTimezone;
      let isAllDay = item.startDate.isDate;
      this.classList.toggle("agenda-listitem-all-day", isAllDay);
      this.overlapsStart = item.startDate.compare(TodayPane.agenda.startDate) < 0;

      if (this.classList.contains("end")) {
        this.id = `agenda-listitem-end-${item.hashId}`;
        this.overlapsStart = true;

        let endDate = item.endDate.getInTimezone(defaultTimezone);
        if (endDate.isDate || (endDate.hour == 0 && endDate.minute == 0 && endDate.second == 0)) {
          endDate.day--;
        }
        this.dateString = endDate.icalString;
        this.sortValue = endDate.getInTimezone(defaultTimezone).nativeTime;
      } else {
        this.id = `agenda-listitem-${item.hashId}`;

        let labelDate;
        if (this.overlapsStart) {
          labelDate = cal.createDateTime();
          labelDate.resetTo(
            TodayPane.agenda.startDate.year,
            TodayPane.agenda.startDate.month,
            TodayPane.agenda.startDate.day,
            0,
            0,
            0,
            defaultTimezone
          );
          this.sortValue = labelDate.nativeTime;
        } else {
          labelDate = item.startDate.getInTimezone(defaultTimezone);
          this.sortValue = labelDate.nativeTime;
        }

        let nextDay = cal.createDateTime();
        nextDay.resetTo(
          labelDate.year,
          labelDate.month,
          labelDate.day + 1,
          0,
          0,
          0,
          defaultTimezone
        );
        this.overlapsMidnight = item.endDate.compare(nextDay) > 0;
        this.overlapsEnd =
          this.overlapsMidnight && item.endDate.compare(TodayPane.agenda.endDate) > 0;

        this.dateString = labelDate.icalString;
      }

      let cssSafeCalendar = cal.view.formatStringForCSSRule(this.item.calendar.id);
      this.style.setProperty("--item-backcolor", `var(--calendar-${cssSafeCalendar}-backcolor)`);
      this.style.setProperty("--item-forecolor", `var(--calendar-${cssSafeCalendar}-forecolor)`);

      this.timeElement.removeAttribute("datetime");
      this.timeElement.textContent = "";
      if (!isAllDay) {
        if (this.overlapsStart) {
          if (!this.overlapsMidnight) {
            this.timeElement.setAttribute("datetime", cal.dtz.toRFC3339(this.item.endDate));

            let localEndDate = item.endDate;
            if (localEndDate.timezone.tzid != defaultTimezone.tzid) {
              localEndDate = localEndDate.getInTimezone(defaultTimezone);
            }
            this.timeElement.textContent = cal.dtz.formatter.formatTime(localEndDate);
            this.sortValue = item.endDate.getInTimezone(defaultTimezone).nativeTime;
          }
        } else {
          this.timeElement.setAttribute("datetime", cal.dtz.toRFC3339(this.item.startDate));

          let localStartDate = item.startDate;
          if (localStartDate.timezone.tzid != defaultTimezone.tzid) {
            localStartDate = localStartDate.getInTimezone(defaultTimezone);
          }
          this.timeElement.textContent = cal.dtz.formatter.formatTime(localStartDate);
        }
      }
      this.titleElement.textContent = this.item.title;

      if (this.overlapsStart) {
        if (this.overlapsMidnight) {
          this.overlapElement.src = "chrome://calendar/skin/shared/event-continue.svg";
          document.l10n.setAttributes(
            this.overlapElement,
            "calendar-editable-item-multiday-event-icon-continue"
          );
        } else {
          this.overlapElement.src = "chrome://calendar/skin/shared/event-end.svg";
          document.l10n.setAttributes(
            this.overlapElement,
            "calendar-editable-item-multiday-event-icon-end"
          );
        }
      } else if (this.overlapsMidnight) {
        this.overlapElement.src = "chrome://calendar/skin/shared/event-start.svg";
        document.l10n.setAttributes(
          this.overlapElement,
          "calendar-editable-item-multiday-event-icon-start"
        );
      } else {
        this.overlapElement.removeAttribute("src");
        this.overlapElement.removeAttribute("data-l10n-id");
        this.overlapElement.removeAttribute("alt");
      }

      this.checkIfCurrent();
    }

    checkIfCurrent() {
      if (this._checkCurrentTimer) {
        window.clearTimeout(this._checkCurrentTimer);
        this._checkCurrentTimer = null;
      }

      let past = false;
      let current = false;

      if (TodayPane.agenda.showsToday && !this.classList.contains("agenda-listitem-all-day")) {
        let now = cal.dtz.now().nativeTime;
        let timeToStart = this._item.startDate.nativeTime - now;
        let timeToEnd = this._item.endDate.nativeTime - now;

        past = timeToEnd <= 0;
        current = timeToStart <= 0 && timeToEnd > 0;

        if (timeToStart > 0) {
          this._checkCurrentTimer = window.setTimeout(
            () => this.checkIfCurrent(),
            timeToStart / 1000
          );
        } else if (timeToEnd > 0) {
          this._checkCurrentTimer = window.setTimeout(
            () => this.checkIfCurrent(),
            timeToEnd / 1000
          );
        }
      }

      this.classList.toggle("agenda-listitem-past", past);
      this.classList.toggle("agenda-listitem-now", current);
    }
  }
  customElements.define("agenda-listitem", AgendaListItem, { extends: "li" });
}
