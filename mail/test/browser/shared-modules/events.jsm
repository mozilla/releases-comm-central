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

var EXPORTED_SYMBOLS = [
  "createEventObject",
  "getKeyCodeFromKeySequence",
  "triggerKeyEvent",
  "fakeOpenPopup",
];

var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var createEventObject = function(
  element,
  controlKeyDown,
  altKeyDown,
  shiftKeyDown,
  metaKeyDown
) {
  var evt = element.ownerDocument.createEventObject();
  evt.shiftKey = shiftKeyDown;
  evt.metaKey = metaKeyDown;
  evt.altKey = altKeyDown;
  evt.ctrlKey = controlKeyDown;
  return evt;
};

/**
 * Fakes a click on a menupopup
 *
 * @param window aWindow
 *               Browser window to use
 * @param menupopup aPopup
 *                  Popup to fake the click for
 */
function fakeOpenPopup(aWindow, aPopup) {
  var popupEvent = aWindow.document.createEvent("MouseEvent");
  popupEvent.initMouseEvent(
    "popupshowing",
    true,
    true,
    aWindow,
    0,
    0,
    0,
    0,
    0,
    false,
    false,
    false,
    false,
    0,
    null
  );
  aPopup.dispatchEvent(popupEvent);
}

var getKeyCodeFromKeySequence = function(keySequence) {
  var match = /^\\(\d{1,3})$/.exec(keySequence);
  if (match != null) {
    return match[1];
  }
  match = /^.$/.exec(keySequence);
  if (match != null) {
    return match[0].charCodeAt(0);
  }
  // this is for backward compatibility with existing tests
  // 1 digit ascii codes will break however because they are used for the digit chars
  match = /^\d{2,3}$/.exec(keySequence);
  if (match != null) {
    return match[0];
  }
  if (keySequence != null) {
    // eventsLogger.error("invalid keySequence "+String(keySequence));
  }
  // mozmill.results.writeResult("invalid keySequence");
  throw new Error("Should never reach here");
};

var triggerKeyEvent = function(
  element,
  eventType,
  aKey,
  modifiers,
  expectedEvent
) {
  // get the window and send focus event
  var win = element.ownerDocument ? element.ownerGlobal : element;
  win.focus();
  utils.sleep(5);

  // If we have an element check if it needs to be focused
  if (element.ownerDocument) {
    let chromeWindow = win.docShell.rootTreeItem.domWindow;
    let focusedElement = chromeWindow.document.commandDispatcher.focusedElement;
    let node = focusedElement;
    while (node && node != element) {
      node = node.parentNode;
    }

    // Only focus the element when it's not focused yet
    if (!node) {
      element.focus();
    }
  }

  if (expectedEvent) {
    // The expected event type has to be set
    if (!expectedEvent.type) {
      throw new Error("triggerKeyEvent: Expected event type not specified");
    }

    // If no target has been specified use the specified element
    var target = expectedEvent.target || element;

    EventUtils.synthesizeKeyExpectEvent(
      aKey,
      modifiers,
      target,
      expectedEvent.type,
      "events.triggerKeyEvent()",
      win
    );
  } else {
    EventUtils.synthesizeKey(aKey, modifiers, win);
  }
};
