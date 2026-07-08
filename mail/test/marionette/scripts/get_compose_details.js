/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global arguments */

const [resolve] = arguments;

function finish() {
  function getRecipients(field) {
    return Array.from(
      document.querySelectorAll(`#${field} mail-address-pill`),
      pill => pill.label
    );
  }
  resolve({
    to: getRecipients("addressRowTo"),
    cc: getRecipients("addressRowCc"),
    bcc: getRecipients("addressRowBcc"),
    subject: document.getElementById("msgSubject").value,
  });
}

if (window.composeEditorReady) {
  finish();
} else {
  window.addEventListener("compose-editor-ready", finish, { once: true });
}
