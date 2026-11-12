/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let isRecurring;
let promptType;

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
  promptType = args.type;
  setPromptText();
  setConfirmationButton();

  const confirmButton = document.querySelector("#confirm");
  confirmButton.addEventListener("click", confirmPrompt);
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
 * Updates the prompt text based on whether the event is recurring, and if
 * the prompt is for editing or deleting.
 */
function setPromptText() {
  document.querySelector("#calendarPromptRadioOptions").hidden = !isRecurring;
  let promptHeaderFluentId;
  let promptTitleFluentId;

  if (promptType === "delete") {
    promptHeaderFluentId = isRecurring
      ? "calendar-event-prompt-delete-header"
      : "calendar-single-event-prompt-delete-header";
    promptTitleFluentId = "calendar-event-prompt-delete-title";
  } else if (promptType === "edit") {
    promptHeaderFluentId = "calendar-event-prompt-edit-header";
    promptTitleFluentId = "calendar-event-prompt-edit-title";
  }

  document.l10n.setAttributes(
    document.querySelector("#calendarPromptHeader"),
    promptHeaderFluentId
  );

  document.l10n.setAttributes(
    document.head.querySelector("title"),
    promptTitleFluentId
  );
}

/**
 * Updates the confirmation button based on whether we are deleting or
 * editing an event.
 */
function setConfirmationButton() {
  const confirmationButton = document.querySelector("#confirm");
  const isDelete = promptType === "delete";

  document.l10n.setAttributes(
    confirmationButton,
    isDelete
      ? "calendar-prompt-delete-button"
      : "calendar-prompt-edit-confirm-button"
  );

  confirmationButton.classList.toggle("destructive-button", isDelete);
  confirmationButton.classList.toggle("primary-button", !isDelete);
}
