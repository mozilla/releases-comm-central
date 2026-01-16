/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./calendar-dialog-row.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Template ID: #calendarDialogRemindersRowTemplate
 *
 * @tagname calendar-dialog-reminders-row
 */
class CalendarDialogRemindersRow extends HTMLElement {
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

  /**
   * Sets the list of reminders.
   *
   * @param {CalAlarm[]} reminders - An array of the event reminders.
   */
  setReminders(reminders) {
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
        return reminderListItem;
      })
    );
  }
}

customElements.define(
  "calendar-dialog-reminders-row",
  CalendarDialogRemindersRow
);
