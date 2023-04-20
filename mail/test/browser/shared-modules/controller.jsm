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
//  Aaron Train <atrain@mozilla.com>
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

var EXPORTED_SYMBOLS = ["MozMillController", "sleep"];

var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

// Declare most used utils functions in the controller namespace
var sleep = utils.sleep;

var MozMillController = function(win) {
  this.window = win;

  utils.waitFor(
    function() {
      return (
        win != null &&
        win.document.readyState == "complete" &&
        win.location.href != "about:blank"
      );
    },
    "controller(): Window could not be initialized.",
    undefined,
    undefined,
    this
  );
};

MozMillController.prototype.sleep = utils.sleep;

/**
 * Synthesize a general mouse event on the given element
 *
 * @param {Element} element
 *        Element which will receive the mouse event
 * @param {number} aOffsetX
 *        Relative x offset in the elements bounds to click on
 * @param {number} aOffsetY
 *        Relative y offset in the elements bounds to click on
 * @param {object} aEvent
 *        Information about the event to send
 *        Elements: accelKey   - Hold down the accelerator key (ctrl/meta)
 *                               [optional - default: false]
 *                  altKey     - Hold down the alt key
 *                               [optional - default: false]
 *                  button     - Mouse button to use
 *                               [optional - default: 0]
 *                  clickCount - Number of counts to click
 *                               [optional - default: 1]
 *                  ctrlKey    - Hold down the ctrl key
 *                               [optional - default: false]
 *                  metaKey    - Hold down the meta key (command key on Mac)
 *                               [optional - default: false]
 *                  shiftKey   - Hold down the shift key
 *                               [optional - default: false]
 *                  type       - Type of the mouse event ('click', 'mousedown',
 *                               'mouseup', 'mouseover', 'mouseout')
 *                               [optional - default: 'mousedown' + 'mouseup']
 * @param {object} aExpectedEvent
 *        Information about the expected event to occur
 *        Elements: target     - Element which should receive the event
 *                               [optional - default: current element]
 *                  type       - Type of the expected mouse event
 */
MozMillController.prototype.mouseEvent = function(
  element,
  aOffsetX,
  aOffsetY,
  aEvent,
  aExpectedEvent
) {
  if (!element) {
    throw new Error("mouseEvent: Missing element");
  }

  // If no offset is given we will use the center of the element to click on.
  var rect = element.getBoundingClientRect();
  if (isNaN(aOffsetX)) {
    aOffsetX = rect.width / 2;
  }
  if (isNaN(aOffsetY)) {
    aOffsetY = rect.height / 2;
  }

  // Scroll element into view otherwise the click will fail
  if (element.scrollIntoView) {
    element.scrollIntoView();
  }

  if (aExpectedEvent) {
    // The expected event type has to be set
    if (!aExpectedEvent.type) {
      throw new Error("mouseEvent: Expected event type not specified");
    }

    // If no target has been specified use the specified element
    var target = aExpectedEvent.target || element;

    EventUtils.synthesizeMouseExpectEvent(
      element,
      aOffsetX,
      aOffsetY,
      aEvent,
      target,
      aExpectedEvent.event,
      "controller.mouseEvent()",
      element.ownerGlobal
    );
  } else {
    EventUtils.synthesizeMouse(
      element,
      aOffsetX,
      aOffsetY,
      aEvent,
      element.ownerGlobal
    );
  }

  sleep(0);
};

/**
 * Synthesize a mouse right click event on the given element
 */
MozMillController.prototype.rightClick = function(
  element,
  left,
  top,
  expectedEvent
) {
  this.mouseEvent(
    element,
    left,
    top,
    { type: "contextmenu", button: 2 },
    expectedEvent
  );
  return true;
};

MozMillController.prototype.waitFor = function(
  callback,
  message,
  timeout,
  interval,
  thisObject
) {
  utils.waitFor(callback, message, timeout, interval, thisObject);
};
