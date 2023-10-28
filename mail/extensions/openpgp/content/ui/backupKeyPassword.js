/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/**
 * @file Implements the functionality of backupKeyPassword.xhtml:
 *       a dialog that lets the user enter the password used to protect
 *       a backup of OpenPGP secret keys.
 *       Based on setp12password.js and setp12password.xhtml
 */

/**
 * @property {boolean} confirmedPassword
 *           Set to true if the user entered two matching passwords and
 *           confirmed the dialog.
 * @property {string} password
 *           The password the user entered. Undefined value if
 *           |confirmedPassword| is not true.
 */

let gAcceptButton;

window.addEventListener("DOMContentLoaded", onLoad);

/**
 * onload() handler.
 */
function onLoad() {
  // Ensure the first password textbox has focus.
  document.getElementById("pw1").focus();
  document.addEventListener("dialogaccept", onDialogAccept);
  gAcceptButton = document
    .getElementById("backupKeyPassword")
    .getButton("accept");
  gAcceptButton.disabled = true;
}

/**
 * ondialogaccept() handler.
 */
function onDialogAccept() {
  window.arguments[0].okCallback(
    document.getElementById("pw1").value,
    window.arguments[0].fprArray,
    window.arguments[0].file,
    true
  );
}

/**
 * Calculates the strength of the given password, suitable for use in updating
 * a progress bar that represents said strength.
 *
 * The strength of the password is calculated by checking the number of:
 *   - Characters
 *   - Numbers
 *   - Non-alphanumeric chars
 *   - Upper case characters
 *
 * @param {string} password
 *        The password to calculate the strength of.
 * @returns {number}
 *          The strength of the password in the range [0, 100].
 */
function getPasswordStrength(password) {
  let lengthStrength = password.length;
  if (lengthStrength > 5) {
    lengthStrength = 5;
  }

  const nonNumericChars = password.replace(/[0-9]/g, "");
  let numericStrength = password.length - nonNumericChars.length;
  if (numericStrength > 3) {
    numericStrength = 3;
  }

  const nonSymbolChars = password.replace(/\W/g, "");
  let symbolStrength = password.length - nonSymbolChars.length;
  if (symbolStrength > 3) {
    symbolStrength = 3;
  }

  const nonUpperAlphaChars = password.replace(/[A-Z]/g, "");
  let upperAlphaStrength = password.length - nonUpperAlphaChars.length;
  if (upperAlphaStrength > 3) {
    upperAlphaStrength = 3;
  }

  let strength =
    lengthStrength * 10 -
    20 +
    numericStrength * 10 +
    symbolStrength * 15 +
    upperAlphaStrength * 10;
  if (strength < 0) {
    strength = 0;
  }
  if (strength > 100) {
    strength = 100;
  }

  return strength;
}

/**
 * oninput() handler for both password textboxes.
 *
 * @param {boolean} recalculatePasswordStrength
 *                  Whether to recalculate the strength of the first password.
 */
function onPasswordInput(recalculatePasswordStrength) {
  const pw1 = document.getElementById("pw1").value;

  if (recalculatePasswordStrength) {
    document.getElementById("pwmeter").value = getPasswordStrength(pw1);
  }

  // Disable the accept button if the two passwords don't match, and enable it
  // if the passwords do match.
  const pw2 = document.getElementById("pw2").value;
  gAcceptButton.disabled = pw1 != pw2 || !pw1.length;
}
