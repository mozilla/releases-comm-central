/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["EnigmailEvents"];

const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailTimer = ChromeUtils.import("chrome://openpgp/content/modules/timer.jsm").EnigmailTimer;

/**** DEPRECATED - use EnigmailTimer instead *****/

var EnigmailEvents = {
  /**
   * dispatch event aynchronously to the main thread
   *
   * @callbackFunction: Function - any function specification
   * @sleepTimeMs:      Number - optional number of miliseconds to delay
   *                             (0 if not specified)
   * @arrayOfArgs:      Array - arguments to pass to callbackFunction
   */
  dispatchEvent: function(callbackFunction, sleepTimeMs, arrayOfArgs) {
    EnigmailLog.DEBUG("enigmailCommon.jsm: dispatchEvent f=" + callbackFunction.name + "\n");

    return EnigmailTimer.setTimeout(() => {
      callbackFunction(arrayOfArgs);
    }, sleepTimeMs);
  }
};
