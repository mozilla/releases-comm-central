/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals CalendarFilteredViewMixin, calendarCalendarButtonDNDObserver, setupAttendanceMenu,
   openEventDialogForViewing, modifyEventWithDialog, calendarViewController, showToolTip,
   TodayPane */

{
  const { CalMetronome } = ChromeUtils.import("resource:///modules/CalMetronome.jsm");
  const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

  customElements.whenDefined("tree-listbox").then(() => {
    class Agenda extends CalendarFilteredViewMixin(customElements.get("tree-listbox")) {
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
            case "Backspace":
              // Fall through to "Backspace" to avoid deleting messages if the
              // preferred deletion button is not "Delete".
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

      connectedCallback() {
        if (this.hasConnected) {
          return;
        }
        super.connectedCallback();

        const metronomeCallback = () => {
          if (!this.showsToday) {
            return;
          }

          for (const item of this.children) {
            item.setRelativeTime();
          }
        };
        CalMetronome.on("minute", metronomeCallback);
        window.addEventListener("unload", () => CalMetronome.off("minute", metronomeCallback));
      }

      /**
       * Implementation as required by CalendarFilteredViewMixin.
       */
      clearItems() {
        while (this.lastChild) {
          this.lastChild.remove();
        }
      }

      /**
       * Implementation as required by CalendarFilteredViewMixin.
       *
       * @param {calIItemBase[]} items
       */
      addItems(items) {
        for (const item of items) {
          if (document.getElementById(`agenda-listitem-${item.hashId}`)) {
            // Item already added.
            continue;
          }

          const startItem = document.createElement("li", { is: "agenda-listitem" });
          startItem.item = item;
          this.insertListItem(startItem);

          // Try to maintain selection across item edits.
          if (this._lastRemovedID == startItem.id) {
            setTimeout(() => (this.selectedIndex = this.rows.indexOf(startItem)));
          }
        }
      }

      /**
       * Implementation as required by CalendarFilteredViewMixin.
       *
       * @param {calIItemBase[]} items
       */
      removeItems(items) {
        for (const item of items) {
          const startItem = document.getElementById(`agenda-listitem-${item.hashId}`);
          if (!startItem) {
            // Item not found.
            continue;
          }

          this.removeListItem(startItem);
          this._lastRemovedID = startItem.id;
        }
      }

      /**
       * Implementation as required by CalendarFilteredViewMixin.
       *
       * @param {string} calendarId
       */
      removeItemsFromCalendar(calendarId) {
        for (const li of [...this.children]) {
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
        const today = cal.dtz.now();

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
        if (this.isActive) {
          await this.refreshItems();
        } else {
          await this.activate();
        }
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
       * @returns {number}
       */
      _compareListItems(a, b) {
        const cmp = a.sortValue - b.sortValue;
        if (cmp != 0) {
          return cmp;
        }

        return cal.view.compareItems(a.item, b.item);
      }

      /**
       * Returns the calendar item of the selected row.
       *
       * @returns {calIEvent}
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
        const row = event.target.closest("li");
        if (!row) {
          return;
        }
        this.selectedIndex = this.rows.indexOf(row);

        const popup = document.getElementById("agenda-menupopup");
        const menu = document.getElementById("calendar-today-pane-menu-attendance-menu");
        setupAttendanceMenu(menu, [this.selectedItem]);
        popup.openPopupAtScreen(event.screenX, event.screenY, true);
      }

      /**
       * Opens the UI for editing the selected event.
       */
      editSelectedItem() {
        if (Services.prefs.getBoolPref("calendar.events.defaultActionEdit", true)) {
          modifyEventWithDialog(this.selectedItem, true);
          return;
        }
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
        const element = document.elementFromPoint(event.clientX, event.clientY);
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
  });

  class AgendaListItem extends HTMLLIElement {
    /**
     * If this element represents an event that starts before the displayed day(s).
     *
     * @type {boolean}
     */
    overlapsDisplayStart = false;

    /**
     * If this element represents an event on a day that is not the event's first day.
     *
     * @type {boolean}
     */
    overlapsDayStart = false;

    /**
     * If this element represents an event on a day that is not the event's last day.
     *
     * @type {boolean}
     */
    overlapsDayEnd = false;

    /**
     * If this element represents an event that ends after the displayed day(s).
     *
     * @type {boolean}
     */
    overlapsDisplayEnd = false;

    constructor() {
      super();
      this.setAttribute("is", "agenda-listitem");
      this.classList.add("agenda-listitem");

      const template = document.getElementById("agenda-listitem");
      for (const element of template.content.children) {
        this.appendChild(element.cloneNode(true));
      }

      this.dateHeaderElement = this.querySelector(".agenda-date-header");
      this.detailsElement = this.querySelector(".agenda-listitem-details");
      this.calendarElement = this.querySelector(".agenda-listitem-calendar");
      this.timeElement = this.querySelector(".agenda-listitem-time");
      this.titleElement = this.querySelector(".agenda-listitem-title");
      this.relativeElement = this.querySelector(".agenda-listitem-relative");
      this.overlapElement = this.querySelector(".agenda-listitem-overlap");

      this.detailsElement.addEventListener("dblclick", () => {
        if (Services.prefs.getBoolPref("calendar.events.defaultActionEdit", true)) {
          modifyEventWithDialog(this.item, true);
          return;
        }
        openEventDialogForViewing(this.item);
      });
    }

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      if (!this.overlapsDayEnd || this.overlapsDisplayEnd) {
        return;
      }

      // Where the start and end of an event are on different days, both within
      // the date range of the agenda, a second item is added representing the
      // end of the event. It's owned by this item (representing the start of
      // the event), and if this item is removed, it is too.
      this._endItem = document.createElement("li", { is: "agenda-listitem" });
      this._endItem.classList.add("agenda-listitem-end");
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

      const date = cal.createDateTime(value);
      const today = cal.dtz.now();
      const tomorrow = cal.dtz.now();
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

      const isAllDay = item.startDate.isDate;
      this.classList.toggle("agenda-listitem-all-day", isAllDay);

      const defaultTimezone = cal.dtz.defaultTimezone;
      this._localStartDate = item.startDate;
      if (this._localStartDate.timezone.tzid != defaultTimezone.tzid) {
        this._localStartDate = this._localStartDate.getInTimezone(defaultTimezone);
      }
      this._localEndDate = item.endDate;
      if (this._localEndDate.timezone.tzid != defaultTimezone.tzid) {
        this._localEndDate = this._localEndDate.getInTimezone(defaultTimezone);
      }
      this.overlapsDisplayStart = this._localStartDate.compare(TodayPane.agenda.startDate) < 0;

      // Work out the date and time to use when sorting events, and the date header.

      if (this.classList.contains("agenda-listitem-end")) {
        this.id = `agenda-listitem-end-${item.hashId}`;
        this.overlapsDayStart = true;

        const sortDate = this._localEndDate.clone();
        if (isAllDay) {
          // Sort all-day events at midnight on the previous day.
          sortDate.day--;
          this.sortValue = sortDate.getInTimezone(defaultTimezone).nativeTime;
        } else {
          // Sort at the end time of the event.
          this.sortValue = this._localEndDate.nativeTime;

          // If the event ends at midnight, remove a microsecond so that
          // it is placed at the end of the previous day's events.
          if (sortDate.hour == 0 && sortDate.minute == 0 && sortDate.second == 0) {
            sortDate.day--;
            this.sortValue--;
          }
        }
        this.dateString = sortDate.icalString;
      } else {
        this.id = `agenda-listitem-${item.hashId}`;
        this.overlapsDayStart = this.overlapsDisplayStart;

        let sortDate;
        if (this.overlapsDayStart) {
          // Use midnight for sorting.
          sortDate = cal.createDateTime();
          sortDate.resetTo(
            TodayPane.agenda.startDate.year,
            TodayPane.agenda.startDate.month,
            TodayPane.agenda.startDate.day,
            0,
            0,
            0,
            defaultTimezone
          );
        } else {
          // Use the real start time for sorting.
          sortDate = this._localStartDate.clone();
        }
        this.dateString = sortDate.icalString;

        const nextDay = cal.createDateTime();
        nextDay.resetTo(sortDate.year, sortDate.month, sortDate.day + 1, 0, 0, 0, defaultTimezone);
        this.overlapsDayEnd = this._localEndDate.compare(nextDay) > 0;
        this.overlapsDisplayEnd =
          this.overlapsDayEnd && this._localEndDate.compare(TodayPane.agenda.endDate) >= 0;

        if (isAllDay || !this.overlapsDayStart || this.overlapsDayEnd) {
          // Sort using the start of the event.
          this.sortValue = sortDate.nativeTime;
        } else {
          // Sort using the end of the event.
          this.sortValue = this._localEndDate.nativeTime;

          // If the event ends at midnight, remove a microsecond so that
          // it is placed at the end of the previous day's events.
          if (
            this._localEndDate.hour == 0 &&
            this._localEndDate.minute == 0 &&
            this._localEndDate.second == 0
          ) {
            this.sortValue--;
          }
        }
      }

      // Set the element's colours.

      const cssSafeCalendar = cal.view.formatStringForCSSRule(this.item.calendar.id);
      this.style.setProperty("--item-backcolor", `var(--calendar-${cssSafeCalendar}-backcolor)`);
      this.style.setProperty("--item-forecolor", `var(--calendar-${cssSafeCalendar}-forecolor)`);

      // Set the time label if necessary.

      this.timeElement.removeAttribute("datetime");
      this.timeElement.textContent = "";
      if (!isAllDay) {
        if (!this.overlapsDayStart) {
          this.timeElement.setAttribute("datetime", cal.dtz.toRFC3339(this.item.startDate));
          this.timeElement.textContent = cal.dtz.formatter.formatTime(this._localStartDate);
        } else if (!this.overlapsDayEnd) {
          this.timeElement.setAttribute("datetime", cal.dtz.toRFC3339(this.item.endDate));
          this.timeElement.textContent = cal.dtz.formatter.formatTime(
            this._localEndDate,
            // We prefer to show midnight as 24:00 if possible to indicate
            // that the event ends at the end of this day, rather than the
            // start of the next day.
            true
          );
        }
        this.setRelativeTime();
      }

      // Set the title.

      this.titleElement.textContent = this.item.title;

      // Display icons indicating if this event starts or ends on another day.

      if (this.overlapsDayStart) {
        if (this.overlapsDayEnd) {
          this.overlapElement.src = "chrome://messenger/skin/icons/new/event-continue.svg";
          document.l10n.setAttributes(
            this.overlapElement,
            "calendar-editable-item-multiday-event-icon-continue"
          );
        } else {
          this.overlapElement.src = "chrome://messenger/skin/icons/new/event-end.svg";
          document.l10n.setAttributes(
            this.overlapElement,
            "calendar-editable-item-multiday-event-icon-end"
          );
        }
      } else if (this.overlapsDayEnd) {
        this.overlapElement.src = "chrome://messenger/skin/icons/new/event-start.svg";
        document.l10n.setAttributes(
          this.overlapElement,
          "calendar-editable-item-multiday-event-icon-start"
        );
      } else {
        this.overlapElement.removeAttribute("src");
        this.overlapElement.removeAttribute("data-l10n-id");
        this.overlapElement.removeAttribute("alt");
      }

      // Set the invitation status.

      if (cal.itip.isInvitation(item)) {
        this.setAttribute("status", cal.itip.getInvitedAttendee(item).participationStatus);
      }
    }

    /**
     * Sets class names and a label depending on when the event occurs
     * relative to the current time.
     *
     * If the event happened today but has finished, sets the class
     * `agenda-listitem-past`, or if it is happening now, sets
     * `agenda-listitem-now`.
     *
     * For events that are today or within the next 12 hours (i.e. early
     * tomorrow) a label is displayed stating the when the start time is, e.g.
     * "1 hr ago", "now", "in 23 min".
     */
    setRelativeTime() {
      // These conditions won't change in the lifetime of an AgendaListItem,
      // so let's avoid any further work and return immediately.
      if (
        !TodayPane.agenda.showsToday ||
        this.item.startDate.isDate ||
        this.classList.contains("agenda-listitem-end")
      ) {
        return;
      }

      this.classList.remove("agenda-listitem-past");
      this.classList.remove("agenda-listitem-now");
      this.relativeElement.textContent = "";

      const now = cal.dtz.now();

      // The event has started.
      if (this._localStartDate.compare(now) <= 0) {
        // The event is happening now.
        if (this._localEndDate.compare(now) <= 0) {
          this.classList.add("agenda-listitem-past");
        } else {
          this.classList.add("agenda-listitem-now");
          this.relativeElement.textContent = AgendaListItem.relativeFormatter.format(0, "second");
        }
        return;
      }

      const relative = this._localStartDate.subtractDate(now);

      // Should we display a label? Is the event today or less than 12 hours away?
      if (this._localStartDate.day == now.day || relative.inSeconds < 12 * 60 * 60) {
        let unit = "hour";
        let value = relative.hours;
        if (relative.inSeconds <= 5400) {
          // 90 minutes.
          unit = "minute";
          value = value * 60 + relative.minutes;
          if (relative.seconds >= 30) {
            value++;
          }
        } else if (relative.minutes >= 30) {
          value++;
        }
        this.relativeElement.textContent = AgendaListItem.relativeFormatter.format(value, unit);
      }
    }
  }
  ChromeUtils.defineLazyGetter(
    AgendaListItem,
    "relativeFormatter",
    () => new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" })
  );
  customElements.define("agenda-listitem", AgendaListItem, { extends: "li" });
}
