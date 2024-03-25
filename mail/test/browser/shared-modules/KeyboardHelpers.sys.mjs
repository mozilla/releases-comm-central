/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as EventUtils from "resource://testing-common/mail/EventUtils.sys.mjs";

/**
 * Emulates manual input.
 *
 * @param {Window} aWin - The window to input keypresses into.
 * @param {string} aStr - The string to input into the control element.
 * @param {Element} [aElement] - Element on which to perform the input.
 */
export function input_value(aWin, aStr, aElement) {
  if (aElement) {
    aElement.focus();
  }
  for (let i = 0; i < aStr.length; i++) {
    EventUtils.synthesizeKey(aStr.charAt(i), {}, aWin);
  }
}

/**
 * Emulates deleting strings via the keyboard.
 *
 * @param {Window} aWin - The window to input keypresses into.
 * @param {Element} aElement - The element in which to delete characters.
 * @param {integer} aNumber - The number of times to press the delete key.
 */
export function delete_existing(aWin, aElement, aNumber) {
  for (let i = 0; i < aNumber; ++i) {
    aElement.focus();
    EventUtils.synthesizeKey("VK_BACK_SPACE", {}, aWin);
  }
}

/**
 * Emulates deleting the entire string by pressing Ctrl+A and DEL.
 *
 * @param {Window} aWin - The window to input keypresses into.
 * @param {Element} aElement - The element in which to delete characters.
 */
export function delete_all_existing(aWin, aElement) {
  aElement.focus();
  EventUtils.synthesizeKey("a", { accelKey: true }, aWin);
  aElement.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, aWin);
}
