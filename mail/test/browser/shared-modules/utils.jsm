// ***** BEGIN LICENSE BLOCK *****
// Version: MPL 1.1/GPL 2.0/LGPL 2.1
//
// The contents of this file are subject to the Mozilla Public License Version
// 1.1 (the "License"); you may not use this file except in compliance with
// the License. You may obtain a copy of the License at
// http://www.mozilla.org/MPL/
//
// Software distributed under the License is distributed on an "AS IS" basis,
// WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
// for the specific language governing rights and limitations under the
// License.
//
// The Original Code is Mozilla Corporation Code.
//
// The Initial Developer of the Original Code is
// Adam Christian.
// Portions created by the Initial Developer are Copyright (C) 2008
// the Initial Developer. All Rights Reserved.
//
// Contributor(s):
//  Adam Christian <adam.christian@gmail.com>
//  Mikeal Rogers <mikeal.rogers@gmail.com>
//  Henrik Skupin <hskupin@mozilla.com>
//
// Alternatively, the contents of this file may be used under the terms of
// either the GNU General Public License Version 2 or later (the "GPL"), or
// the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
// in which case the provisions of the GPL or the LGPL are applicable instead
// of those above. If you wish to allow use of your version of this file only
// under the terms of either the GPL or the LGPL, and not to allow others to
// use your version of this file under the terms of the MPL, indicate your
// decision by deleting the provisions above and replace them with the notice
// and other provisions required by the GPL or the LGPL. If you do not delete
// the provisions above, a recipient may use your version of this file under
// the terms of any one of the MPL, the GPL or the LGPL.
//
// ***** END LICENSE BLOCK *****

var EXPORTED_SYMBOLS = ["sleep", "TimeoutError", "waitFor"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var hwindow = Services.appShell.hiddenDOMWindow;

/**
 * Sleep for the given amount of milliseconds
 *
 * @param {number} milliseconds
 *        Sleeps the given number of milliseconds
 */
function sleep(milliseconds) {
  // We basically just call this once after the specified number of milliseconds
  var timeup = false;
  function wait() {
    timeup = true;
  }
  hwindow.setTimeout(wait, milliseconds);

  var thread = Services.tm.currentThread;
  while (!timeup) {
    thread.processNextEvent(true);
  }
}

/**
 * TimeoutError
 *
 * Error object used for timeouts
 */
function TimeoutError(message, fileName, lineNumber) {
  var err = new Error();
  if (err.stack) {
    this.stack = err.stack;
  }
  this.message = message === undefined ? err.message : message;
  this.fileName = fileName === undefined ? err.fileName : fileName;
  this.lineNumber = lineNumber === undefined ? err.lineNumber : lineNumber;
}
TimeoutError.prototype = new Error();
TimeoutError.prototype.constructor = TimeoutError;
TimeoutError.prototype.name = "TimeoutError";

/**
 * Waits for the callback evaluates to true
 *
 * @param callback    Function that returns true when the waiting thould end.
 * @param message {string or function}  A message to throw if the callback didn't
 *                                      succeed until the timeout. Use a function
 *                                      if the message is to show some object state
 *                                      after the end of the wait (not before wait).
 * @param timeout     Milliseconds to wait until callback succeeds.
 * @param interval    Milliseconds to 'sleep' between checks of callback.
 * @param thisObject (optional) 'this' to be passed into the callback.
 */
function waitFor(callback, message, timeout, interval, thisObject) {
  timeout = timeout || 5000;
  interval = interval || 100;

  var self = { counter: 0, result: callback.call(thisObject) };

  function wait() {
    self.counter += interval;
    self.result = callback.call(thisObject);
  }

  var timeoutInterval = hwindow.setInterval(wait, interval);
  var thread = Services.tm.currentThread;

  while (!self.result && self.counter < timeout) {
    thread.processNextEvent(true);
  }

  hwindow.clearInterval(timeoutInterval);

  if (self.counter >= timeout) {
    let messageText;
    if (message) {
      if (typeof message === "function") {
        messageText = message();
      } else {
        messageText = message;
      }
    } else {
      messageText = "waitFor: Timeout exceeded for '" + callback + "'";
    }

    throw new TimeoutError(messageText);
  }

  return true;
}
