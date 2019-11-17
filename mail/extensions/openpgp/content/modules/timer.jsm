/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailTimer"];

const {
  setTimeout,
  clearTimeout
} = ChromeUtils.import("resource://gre/modules/Timer.jsm");

var EnigmailTimer = {
  /**
   * wait a defined number of miliseconds, then call a callback function
   * asynchronously
   *
   * @param callbackFunction: Function - any function specification
   * @param sleepTimeMs:      Number - optional number of miliseconds to delay
   *                             (0 if not specified)
   *
   * @return Number: timeoutID
   */
  setTimeout: function(callbackFunction, sleepTimeMs = 0) {

    let timeoutID;

    function callbackWrapper() {
      callbackFunction();
      try {
        clearTimeout(timeoutID);
      } catch (ex) {}
    }

    timeoutID = setTimeout(callbackWrapper, sleepTimeMs);

    return timeoutID;
  },

  /**
   * Cancel a timeout callback
   *
   * @param Number: timeoutID
   */
  clearTimeout: clearTimeout
};