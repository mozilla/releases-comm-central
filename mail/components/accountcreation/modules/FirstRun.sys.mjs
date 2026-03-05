/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
let returnValue = false;

/**
 * Return if this should be considered as the first run of Thunderbird or not.
 *
 * @returns {boolean}
 */
export function isFirstRun() {
  return returnValue;
}

/**
 * This is a helper for testing to force the first run experience.
 *
 * @param {boolean} value - The value that should be returned from isFirstRun
 */
export function _setReturnValue(value) {
  returnValue = value;
}
