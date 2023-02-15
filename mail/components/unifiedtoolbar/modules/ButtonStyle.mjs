/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Array of button styles with the class name at the index of the corresponding
 * button style pref integer value.
 *
 * @type {Array<string>}
 */
export const BUTTON_STYLE_MAP = [
  "icons-beside-text",
  "icons-above-text",
  "icons-only",
  "text-only",
];

/**
 * Name of preference that stores the button style as an integer.
 *
 * @type {string}
 */
export const BUTTON_STYLE_PREF = "toolbar.unifiedtoolbar.buttonstyle";
