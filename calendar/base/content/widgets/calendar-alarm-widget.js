/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global Cr MozElements MozXULElement Services */

// Wrap in a block to prevent leaking to window scope.
{
  var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  const lazy = {};
  ChromeUtils.defineLazyGetter(
    lazy,
    "l10n",
    () => new Localization(["calendar/calendar.ftl", "calendar/calendar-alarms.ftl"], true)
  );
  /**
   * Represents an alarm in the alarms dialog. It appears there when an alarm is fired, and
   * allows the alarm to be snoozed, dismissed, etc.
   *
   * @augments {MozElements.MozRichlistitem}
   */
  class MozCalendarAlarmWidgetRichlistitem extends MozElements.MozRichlistitem {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      this.hasConnected = true;
      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <vbox pack="start">
            <html:img class="alarm-calendar-image"
                      src="chrome://calendar/skin/shared/icons/icon32.svg"
                      alt="" />
          </vbox>
          <vbox class="alarm-calendar-event">
            <label class="alarm-title-label" crop="end"/>
            <vbox class="additional-information-box">
              <label class="alarm-date-label"/>
              <description class="alarm-location-description"
                           crop="end"
                           flex="1"/>
              <hbox pack="start">
                <label class="text-link alarm-details-label"
                       data-l10n-id="calendar-alarm-details"
                       onclick="showDetails(event)"
                       onkeypress="showDetails(event)"/>
              </hbox>
            </vbox>
          </vbox>
          <spacer flex="1"/>
          <label class="alarm-relative-date-label"/>
          <vbox class="alarm-action-buttons" pack="center">
            <button class="alarm-snooze-button"
                    type="menu"
                    data-l10n-id="calendar-alarm-snooze-for"
                    data-l10n-attrs="label">
              <menupopup is="calendar-snooze-popup" ignorekeys="true"/>
            </button>
            <button class="alarm-dismiss-button"
                    data-l10n-id="calendar-alarm-dismiss"
                    oncommand="dismissAlarm()"/>
          </vbox>
          `,
          ["chrome://calendar/locale/global.dtd", "chrome://calendar/locale/calendar.dtd"]
        )
      );
      this.mItem = null;
      this.mAlarm = null;
      this.setAttribute("is", "calendar-alarm-widget-richlistitem");
    }

    set item(val) {
      this.mItem = val;
      this.updateLabels();
    }

    get item() {
      return this.mItem;
    }

    set alarm(val) {
      this.mAlarm = val;
      this.updateLabels();
    }

    get alarm() {
      return this.mAlarm;
    }

    /**
     * Refresh UI text (dates, titles, locations) when the data has changed.
     */
    updateLabels() {
      if (!this.mItem || !this.mAlarm) {
        // Setup not complete, do nothing for now.
        return;
      }
      const formatter = cal.dtz.formatter;
      const titleLabel = this.querySelector(".alarm-title-label");
      const locationDescription = this.querySelector(".alarm-location-description");
      const dateLabel = this.querySelector(".alarm-date-label");

      // Dates
      if (this.mItem.isEvent()) {
        dateLabel.value = formatter.formatItemInterval(this.mItem);
      } else if (this.mItem.isTodo()) {
        let startDate = this.mItem.entryDate || this.mItem.dueDate;
        if (startDate) {
          // A task with a start or due date, show with label.
          startDate = startDate.getInTimezone(cal.dtz.defaultTimezone);
          document.l10n.setAttributes(dateLabel, "alarm-starts", {
            datetime: formatter.formatDateTime(startDate),
          });
        } else {
          // If the task has no start date, then format the alarm date.
          dateLabel.value = formatter.formatDateTime(this.mAlarm.alarmDate);
        }
      } else {
        throw Components.Exception("", Cr.NS_ERROR_ILLEGAL_VALUE);
      }

      // Relative Date
      this.updateRelativeDateLabel();

      // Title, Location
      titleLabel.value = this.mItem.title || "";
      locationDescription.value = this.mItem.getProperty("LOCATION") || "";
      if (locationDescription.value.length) {
        const urlMatch = locationDescription.value.match(/(https?:\/\/[^ ]*)/);
        const url = urlMatch && urlMatch[1];
        if (url) {
          locationDescription.setAttribute("link", url);
          locationDescription.setAttribute(
            "onclick",
            "launchBrowser(this.getAttribute('link'), event)"
          );
          locationDescription.setAttribute(
            "oncommand",
            "launchBrowser(this.getAttribute('link'), event)"
          );
          locationDescription.classList.add("text-link", "alarm-details-label");
        }
      } else {
        locationDescription.hidden = true;
      }
      // Hide snooze button if read-only.
      const snoozeButton = this.querySelector(".alarm-snooze-button");
      if (
        !cal.acl.isCalendarWritable(this.mItem.calendar) ||
        !cal.acl.userCanModifyItem(this.mItem)
      ) {
        snoozeButton.disabled = true;
        snoozeButton.setAttribute(
          "tooltiptext",
          lazy.l10n.formatValueSync("reminder-disabled-snooze-button-tooltip")
        );
      } else {
        snoozeButton.disabled = false;
        snoozeButton.removeAttribute("tooltiptext");
        document.l10n.setAttributes(snoozeButton, "calendar-alarm-snooze-for");
        document.l10n.translateElements([snoozeButton]);
      }
    }

    /**
     * Refresh UI text for relative date when the data has changed.
     */
    updateRelativeDateLabel() {
      const formatter = cal.dtz.formatter;
      const item = this.mItem;
      const relativeDateLabel = this.querySelector(".alarm-relative-date-label");
      let relativeDateString;
      let startDate = item[cal.dtz.startDateProp(item)] || item[cal.dtz.endDateProp(item)];

      if (startDate) {
        startDate = startDate.getInTimezone(cal.dtz.defaultTimezone);
        const currentDate = cal.dtz.now();

        const sinceDayStart = currentDate.hour * 3600 + currentDate.minute * 60;

        currentDate.second = 0;
        startDate.second = 0;

        const sinceAlarm = currentDate.subtractDate(startDate).inSeconds;

        this.mAlarmToday = sinceAlarm < sinceDayStart && sinceAlarm > sinceDayStart - 86400;

        if (this.mAlarmToday) {
          // The alarm is today.
          relativeDateString = lazy.l10n.formatValueSync("alarm-today-at", {
            datetime: formatter.formatTime(startDate),
          });
        } else if (sinceAlarm <= sinceDayStart - 86400 && sinceAlarm > sinceDayStart - 172800) {
          // The alarm is tomorrow.
          relativeDateString = lazy.l10n.formatValueSync("alarm-tomorrow-at", {
            datetime: formatter.formatTime(startDate),
          });
        } else if (sinceAlarm < sinceDayStart + 86400 && sinceAlarm > sinceDayStart) {
          // The alarm is yesterday.
          relativeDateString = lazy.l10n.formatValueSync("alarm-yesterday-at", {
            datetime: formatter.formatTime(startDate),
          });
        } else {
          // The alarm is way back.
          relativeDateString = [formatter.formatDateTime(startDate)];
        }
      } else {
        // No start or end date, therefore the alarm must be absolute
        // and have an alarm date.
        relativeDateString = [formatter.formatDateTime(this.mAlarm.alarmDate)];
      }

      relativeDateLabel.value = relativeDateString;
    }

    /**
     * Click/keypress handler for "Details" link. Dispatches an event to open an item dialog.
     *
     * @param {Event} event - The click or keypress event.
     */
    showDetails(event) {
      if (event.type == "click" || (event.type == "keypress" && event.key == "Enter")) {
        const detailsEvent = new Event("itemdetails", { bubbles: true, cancelable: false });
        this.dispatchEvent(detailsEvent);
      }
    }

    /**
     * Click handler for "Dismiss" button.  Dispatches an event to dismiss the alarm.
     */
    dismissAlarm() {
      const dismissEvent = new Event("dismiss", { bubbles: true, cancelable: false });
      this.dispatchEvent(dismissEvent);
    }
  }

  customElements.define("calendar-alarm-widget-richlistitem", MozCalendarAlarmWidgetRichlistitem, {
    extends: "richlistitem",
  });

  /**
   * A popup panel for selecting how long to snooze alarms/reminders.
   * It appears when a snooze button is clicked.
   *
   * @augments MozElements.MozMenuPopup
   */
  class MozCalendarSnoozePopup extends MozElements.MozMenuPopup {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      this.hasConnected = true;
      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <menuitem data-l10n-id="calendar-alarm-snooze-preset-minutes"
                    data-l10n-args='{"count": 5}'
                    value="5"
                    oncommand="snoozeItem(event)"/>
          <menuitem data-l10n-id="calendar-alarm-snooze-preset-minutes"
                    data-l10n-args='{"count": 10}'
                    value="10"
                    oncommand="snoozeItem(event)"/>
          <menuitem data-l10n-id="calendar-alarm-snooze-preset-minutes"
                    data-l10n-args='{"count": 15}'
                    value="15"
                    oncommand="snoozeItem(event)"/>
          <menuitem data-l10n-id="calendar-alarm-snooze-preset-minutes"
                    data-l10n-args='{"count": 30}'
                    value="30"
                    oncommand="snoozeItem(event)"/>
          <menuitem data-l10n-id="calendar-alarm-snooze-preset-minutes"
                    data-l10n-args='{"count": 45}'
                    value="45"
                    oncommand="snoozeItem(event)"/>
          <menuitem data-l10n-id="calendar-alarm-snooze-preset-hours"
                    data-l10n-args='{"count": 1}'
                    value="60"
                    oncommand="snoozeItem(event)"/>
          <menuitem data-l10n-id="calendar-alarm-snooze-preset-hours"
                    data-l10n-args='{"count": 2}'
                    value="120"
                    oncommand="snoozeItem(event)"/>
          <menuitem data-l10n-id="calendar-alarm-snooze-preset-days"
                    data-l10n-args='{"count": 1}'
                    value="1440"
                    oncommand="snoozeItem(event)"/>
          <menuseparator/>
          <hbox class="snooze-options-box">
            <html:input type="number"
                        class="size3 snooze-value-textbox"
                        oninput="updateUIText()"
                        onselect="updateUIText()"/>
            <menulist class="snooze-unit-menulist" allowevents="true">
              <menupopup class="snooze-unit-menupopup menulist-menupopup"
                         position="after_start"
                         ignorekeys="true">
                <menuitem closemenu="single" class="unit-menuitem" value="1"></menuitem>
                <menuitem closemenu="single" class="unit-menuitem" value="60"></menuitem>
                <menuitem closemenu="single" class="unit-menuitem" value="1440"></menuitem>
              </menupopup>
            </menulist>
            <toolbarbutton class="snooze-popup-button snooze-popup-ok-button"
                           oncommand="snoozeOk()"/>
            <toolbarbutton class="snooze-popup-button snooze-popup-cancel-button"
                           data-l10n-id="calendar-alarm-snooze-cancel"
                           oncommand="snoozeCancel()"/>
          </hbox>
          `
        )
      );

      const defaultSnoozeLength = Services.prefs.getIntPref(
        "calendar.alarms.defaultsnoozelength",
        0
      );
      const snoozeLength = defaultSnoozeLength <= 0 ? 5 : defaultSnoozeLength;

      const unitList = this.querySelector(".snooze-unit-menulist");
      const unitValue = this.querySelector(".snooze-value-textbox");

      if ((snoozeLength / 60) % 24 == 0) {
        // Days
        unitValue.value = snoozeLength / 60 / 24;
        unitList.selectedIndex = 2;
      } else if (snoozeLength % 60 == 0) {
        // Hours
        unitValue.value = snoozeLength / 60;
        unitList.selectedIndex = 1;
      } else {
        // Minutes
        unitValue.value = snoozeLength;
        unitList.selectedIndex = 0;
      }

      this.updateUIText();
    }

    /**
     * Dispatch a snooze event when an alarm is snoozed.
     *
     * @param {number|string} minutes  - The number of minutes to snooze for.
     */
    snoozeAlarm(minutes) {
      const snoozeEvent = new Event("snooze", { bubbles: true, cancelable: false });
      snoozeEvent.detail = minutes;

      // For single alarms the event.target has to be the calendar-alarm-widget element,
      // (so call dispatchEvent on that). For snoozing all alarms the event.target is not
      // relevant but the snooze all popup is not inside a calendar-alarm-widget (so call
      // dispatchEvent on 'this').
      const eventTarget = this.id == "alarm-snooze-all-popup" ? this : this.closest("richlistitem");
      eventTarget.dispatchEvent(snoozeEvent);
    }

    /**
     * Click handler for snooze popup menu items (like "5 Minutes", "1 Hour", etc.).
     *
     * @param {Event} event - The click event.
     */
    snoozeItem(event) {
      this.snoozeAlarm(event.target.value);
    }

    /**
     * Click handler for the "OK" (checkmark) button when snoozing for a custom amount of time.
     */
    snoozeOk() {
      const unitList = this.querySelector(".snooze-unit-menulist");
      const unitValue = this.querySelector(".snooze-value-textbox");
      const minutes = (unitList.value || 1) * unitValue.value;
      this.snoozeAlarm(minutes);
    }

    /**
     * Click handler for the "cancel" ("X") button for not snoozing a custom amount of time.
     */
    snoozeCancel() {
      this.hidePopup();
    }

    /**
     * Initializes and updates the dynamic UI text. This text can change depending on
     * input, like for plurals, when you change from "[1] [minute]" to "[2] [minutes]".
     */
    updateUIText() {
      const unitPopup = this.querySelector(".snooze-unit-menupopup");
      const unitValue = this.querySelector(".snooze-value-textbox");

      function unitName(list) {
        return (
          {
            1: "event-duration-menuitem-minutes",
            60: "event-duration-menuitem-hours",
            1440: "event-duration-menuitem-days",
          }[list.value] || "event-duration-menuitem-minutes"
        );
      }

      const items = unitPopup.getElementsByTagName("menuitem");
      for (const menuItem of items) {
        document.l10n.setAttributes(menuItem, unitName(menuItem), {
          count: unitValue.value,
        });
      }
    }
  }

  customElements.define("calendar-snooze-popup", MozCalendarSnoozePopup, { extends: "menupopup" });
}
