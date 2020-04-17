/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals loadEventsFromFile */

/* exported onLoad */

async function onLoad() {
  let file = window.arguments[0];
  let fileName = file.leafName;

  // Add the main dialog message, with file name. Use l10n.formatValue so we
  // can await it and then resize the window to fit its content.
  let message = await document.l10n.formatValue("calendar-ics-file-dialog-message", { fileName });

  document.getElementById("calendar-ics-file-dialog-message").value = message;
  window.sizeToContent();
}

/**
 * "Import" button click handler.
 */
async function handleImportClick(event) {
  event.preventDefault();

  let dialog = document.getElementsByTagName("dialog")[0];
  let acceptButton = dialog.getButton("accept");
  let cancelButton = dialog.getButton("cancel");

  acceptButton.disabled = true;
  cancelButton.disabled = true;

  let file = window.arguments[0];

  let [importResult] = await Promise.allSettled([
    loadEventsFromFile(file),
    new Promise(resolve => setTimeout(resolve, 500)),
  ]);

  acceptButton.disabled = false;
  cancelButton.disabled = false;

  if (importResult.status === "fulfilled" && importResult.value === false) {
    // Do nothing, user probably canceled out of the calendar picker dialog.
    return;
  } else if (importResult.status === "rejected") {
    // An error occurred, change the text and resize the window to fit its new content.
    let errorMessage = await document.l10n.formatValue("calendar-ics-file-import-error");

    document.getElementById("calendar-ics-file-dialog-message").value = errorMessage;
    document.getElementById("calendar-ics-file-dialog-error-message").value = importResult.reason;

    window.sizeToContent();
  } else {
    // Import succeeded.
    let successMessage = await document.l10n.formatValue("calendar-ics-file-import-success");
    document.getElementById("calendar-ics-file-dialog-message").value = successMessage;
  }

  cancelButton.hidden = true;
  acceptButton.label = await document.l10n.formatValue("calendar-ics-file-accept-button-ok-label");

  document.removeEventListener("dialogaccept", handleImportClick);
}

document.addEventListener("dialogaccept", handleImportClick);

/**
 * These functions are called via `loadEventsFromFile` in import-export.js so
 * they need to be defined in global scope but they aren't needed in this case.
 */
function startBatchTransaction() {}
function endBatchTransaction() {}
