/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./calendar-dialog-row.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-create-reminder-form.mjs"; // eslint-disable-line import-x/no-unassigned-import

/**
 * Template ID: #calendarDialogRemindersRowTemplate
 *
 * @tagname calendar-dialog-reminders-row
 * @attribute {boolean} disabled - If reminders can be added and removed.
 */
class CalendarDialogRemindersRow extends HTMLElement {
  /**
   * The reminder objects in the row.
   *
   * @type {calIAlarm[]}
   */
  #reminders = [];

  /**
   * A map containing the relationship between alarm objects (value) and the
   * reminder elements (key) in this row.
   *
   * @type {WeakMap<HTMLElement,calIAlarm>}
   */
  #alarmByRow = new WeakMap();

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");

    this.hasConnected = true;
    const template = document
      .getElementById("calendarDialogRemindersRowTemplate")
      .content.cloneNode(true);
    this.append(template);
  }

  handleEvent(event) {
    // The delete button click event is the only event in this custom element.
    const reminderElement = event.target.closest("li");
    this.#deleteReminder(reminderElement);
  }

  /**
   * Sets the list of reminders.
   *
   * @param {CalAlarm[]} reminders - An array of the event reminders.
   */
  setReminders(reminders) {
    this.#alarmByRow = new WeakMap();
    this.#reminders = reminders;

    const remindersList = this.querySelector("#reminderList");
    document.l10n.setAttributes(
      this.querySelector("#reminderCount"),
      "calendar-dialog-reminder-count",
      { count: reminders.length }
    );

    remindersList.replaceChildren(
      ...reminders.map(reminder => {
        const reminderListItem = document.createElement("li");
        reminderListItem.classList.add("actionable-item");

        const reminderText = document.createTextNode(reminder.toString());
        reminderListItem.append(reminderText);
        const deleteButton = document.createElement("button");
        deleteButton.classList.add(
          "button",
          "button-flat",
          "delete-button",
          "icon-button"
        );
        deleteButton.type = "button";

        const deleteImage = document.createElement("img");
        deleteImage.src = "";
        deleteImage.classList.add("icon-delete");
        document.l10n.setAttributes(
          deleteImage,
          "calendar-dialog-delete-reminder-button"
        );

        deleteButton.append(deleteImage);
        reminderListItem.append(deleteButton);
        this.#alarmByRow.set(reminderListItem, reminder);
        return reminderListItem;
      })
    );

    remindersList.querySelectorAll(".delete-button").forEach(deleteButton => {
      deleteButton.addEventListener("click", this);
    });
  }

  /**
   * Removes the reminder from the list of reminders, and sends an event
   * to the calendar dialog to update the reminders list.
   *
   * @param {HTMLElement} reminderElement - The list element of the reminder.
   */
  #deleteReminder(reminderElement) {
    const selectedAlarm = this.#alarmByRow.get(reminderElement);
    const reminderIndex = this.#reminders.indexOf(selectedAlarm);

    if (reminderIndex === -1) {
      return;
    }

    this.#reminders = this.#reminders.toSpliced(reminderIndex, 1);
    reminderElement.remove();

    this.dispatchEvent(
      new CustomEvent("update-reminders", {
        bubbles: true,
        detail: { reminders: this.#reminders },
      })
    );

    document.l10n.setAttributes(
      this.querySelector("#reminderCount"),
      "calendar-dialog-reminder-count",
      { count: this.#reminders.length }
    );

    // Update focus to a button.
    if (this.#reminders.length) {
      this.querySelector(".delete-button").focus();
    } else {
      this.querySelector("#addReminder").focus();
    }
  }

  set disabled(val) {
    this.toggleAttribute("disabled", val);
  }

  get disabled() {
    return this.hasAttribute("disabled");
  }
}

customElements.define(
  "calendar-dialog-reminders-row",
  CalendarDialogRemindersRow
);
