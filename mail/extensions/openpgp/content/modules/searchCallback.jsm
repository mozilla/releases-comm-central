/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailSearchCallback"];

ChromeUtils.defineModuleGetter(
  this,
  "setTimeout",
  "resource://gre/modules/Timer.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "clearTimeout",
  "resource://gre/modules/Timer.jsm"
);

var EnigmailSearchCallback = {
  /**
   * Set up a callback function on a textbox that tiggers an action.
   * If ESC is pressed, the input field is emtpied; return triggers the action immediately.
   *
   * @param targetObj {XULElement}: the XUL element to observe
   * @param timoeoutObj {object}: timeoutObj.value will hold the timeout ID
   * @param actionCallback {function}: callback function that is called if something is typed
   * @param timeoutMs {number}: delay triggering the function (in miliseconds)
   */
  setup(targetObj, timeoutObj, actionCallback, timeoutMs = 200) {
    function applyActionImmediately() {
      if (timeoutObj.value) {
        clearTimeout(timeoutObj.value);
        timeoutObj.value = null;
      }
      applyAction();
    }

    function applyAction() {
      actionCallback();
    }

    timeoutObj.value = null;

    targetObj.addEventListener(
      "keypress",
      function(event) {
        if (event.type === "keypress") {
          if (event.keyCode === 27) {
            // Escape key
            if (event.target.value !== "") {
              event.target.value = "";
              event.preventDefault();
            }
            applyActionImmediately();

            return;
          } else if (event.keyCode === 10 || event.keyCode === 13) {
            // return key
            applyActionImmediately();
            event.preventDefault();
            return;
          }
        }

        if (!timeoutObj.value) {
          timeoutObj.value = setTimeout(function() {
            timeoutObj.value = null;
            applyAction();
          }, timeoutMs);
        }
      },
      true
    );
  },
};
