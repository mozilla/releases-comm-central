/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});

//TODO should this only offer reminder times that aren't already used in the
// event?
//TODO possibly initialize to some sane value every time the form is shown.
//TODO observe the preferences for the default reminder and update when they
// change.

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;

/**
 * Template ID: #calendarDialogCreateReminderFormTemplate
 *
 * @tagname calendar-dialog-create-reminder-form
 * @fires CustomEvent - Event "new-reminder" emitted when a new reminder should
 *   be added to the event. The detail is an object with the property
 *   `minutesBefore` specifying how many minutes before the event the reminder
 *   should trigger. When the reminder is created, `setReminders` should be
 *   called with the updated list of reminders, though the new reminder should
 *   explicitly be at the bottom of the list. TODO maybe handle adding the new
 *   reminder in a closed loop here? That means we might show incorrect data
 *   though.
 */
class CalendarDialogCreateReminderForm extends HTMLElement {
  /** @type {HTMLFormElement} */
  #form;

  /** @type {HTMLButtonElement} */
  #addButton;

  /** @type {HTMLSelectElement} */
  #select;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");

    this.hasConnected = true;
    const template = document
      .getElementById("calendarDialogCreateReminderFormTemplate")
      .content.cloneNode(true);
    this.append(template);

    this.#form = this.querySelector("form");
    this.#addButton = this.querySelector(".add-reminder-button");
    this.#select = this.#form.querySelector(".select");

    this.#addButton.addEventListener("click", this);
    this.#form.addEventListener("submit", this);
    this.#form.querySelector(".delete-button").addEventListener("click", this);

    const alarmOffset = lazy.cal.alarms.getDefaultOffset("event");
    if (alarmOffset.isNegative) {
      const offsetMinutes = Math.floor(
        -alarmOffset.inSeconds / SECONDS_PER_MINUTE
      );
      const existingOption = this.#form.querySelector(
        `option[value="${offsetMinutes}"]`
      );
      if (existingOption) {
        existingOption.selected = true;
        this.#select.value = existingOption.value;
      } else {
        const newOption = new Option("", offsetMinutes, true, true);
        let offsetString = "calendar-dialog-reminder-minutes-before";
        let adjustedOffset = offsetMinutes;
        if (offsetMinutes >= MINUTES_PER_DAY) {
          offsetString = "calendar-dialog-reminder-days-before";
          adjustedOffset = Math.floor(offsetMinutes / MINUTES_PER_DAY);
        } else if (offsetMinutes >= MINUTES_PER_HOUR) {
          offsetString = "calendar-dialog-reminder-hours-before";
          adjustedOffset = Math.floor(offsetMinutes / MINUTES_PER_HOUR);
        }
        document.l10n.setAttributes(newOption, offsetString, {
          count: adjustedOffset,
        });
        // Add the new option to the start of the list, so it is clearly
        // separated from the sorted options.
        this.#select.add(newOption, 0);
      }
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "click": {
        const add = event.target == this.#addButton;
        this.#form.hidden = !add;
        this.#addButton.hidden = add;
        if (add) {
          this.#select.focus();
        } else {
          this.#addButton.focus();
        }
        break;
      }
      case "submit":
        event.preventDefault();
        this.dispatchEvent(
          new CustomEvent("new-reminder", {
            bubbles: true,
            detail: {
              minutesBefore: Number.parseInt(this.#select.value, 10),
            },
          })
        );
        this.#form.hidden = true;
        this.#addButton.hidden = false;
        this.#addButton.focus();
        break;
    }
  }
}
customElements.define(
  "calendar-dialog-create-reminder-form",
  CalendarDialogCreateReminderForm
);
