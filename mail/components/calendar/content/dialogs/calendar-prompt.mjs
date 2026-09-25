/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let isRecurring;

window.addEventListener("DOMContentLoaded", () => {
  initializePrompt(window.arguments[0]);
});

/**
 * Initializes the calendar prompt using the arguments passed to the dialog.
 *
 * @param {object} args - The arguments passed to the dialog.
 * @param {boolean} args.isRecurring - Whether the event is recurring.
 */
function initializePrompt(args) {
  isRecurring = args.isRecurring;
  setPromptText();

  const deleteButton = document.querySelector("#delete");
  deleteButton.addEventListener("click", confirmPrompt);
}

/**
 * Sets the selected deletion option as the dialog return value and closes the
 * prompt.
 */
function confirmPrompt() {
  // Set default return value as 1 (single occurrence).
  const selectedValue = isRecurring
    ? document.querySelector("radio[selected]").value
    : 1;
  window.arguments[0].value = Number(selectedValue);
  window.close();
}

/**
 * Updates the prompt text based on whether the event is recurring.
 */
function setPromptText() {
  document.querySelector("#calendarPromptRadioOptions").hidden = !isRecurring;

  const promptHeaderFluentId = isRecurring
    ? "calendar-event-prompt-delete-header"
    : "calendar-single-event-prompt-delete-header";

  document.l10n.setAttributes(
    document.querySelector("#calendarPromptHeader"),
    promptHeaderFluentId
  );
}
