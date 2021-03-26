/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "input_value",
  "delete_existing",
  "delete_all_existing",
];

var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

/**
 * Emulates manual input
 *
 * @param aController The window controller to input keypresses into
 * @param aStr        The string to input into the control element
 * @param aElement    (optional) Element on which to perform the input
 */
function input_value(aController, aStr, aElement) {
  if (aElement) {
    aElement.focus();
  }
  for (let i = 0; i < aStr.length; i++) {
    EventUtils.synthesizeKey(aStr.charAt(i), {}, aController.window);
  }
}

/**
 * Emulates deleting strings via the keyboard
 *
 * @param aController The window controller to input keypresses into
 * @param aElement    The element in which to delete characters
 * @param aNumber     The number of times to press the delete key.
 */
function delete_existing(aController, aElement, aNumber) {
  for (let i = 0; i < aNumber; ++i) {
    aElement.focus();
    EventUtils.synthesizeKey("VK_BACK_SPACE", {}, aController.window);
  }
}

/**
 * Emulates deleting the entire string by pressing Ctrl-A and DEL
 *
 * @param aController The window controller to input keypresses into
 * @param aElement    The element in which to delete characters
 */
function delete_all_existing(aController, aElement) {
  aElement.focus();
  EventUtils.synthesizeKey("a", { accelKey: true }, aController.window);
  aElement.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, aController.window);
}
