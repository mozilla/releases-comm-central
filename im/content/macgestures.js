/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Thomas K. Dyas <tdyas@zecador.org>
 *   Edward Lee <edward.lee@engineering.uiuc.edu>
 *   Florian Queze <florian@instantbird.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */


// Shamelessly taken from the implementation in browser/base/content/browser.js

let gGestureSupport = {
  _tabs: null,
  _lastSelectedTab: null,

  load: function GS_load() {
    gGestureSupport.init(true);

    let conversations = document.getElementById("conversations");
    if (conversations) {
      let tabs = conversations.tabContainer;
      let selectHandler = function() {
        gGestureSupport._lastSelectedTab = gGestureSupport._selectedTab;
        gGestureSupport._selectedTab = this.selectedItem;
      };
      tabs.addEventListener("select", selectHandler);
      gGestureSupport._selectedTab = tabs.selectedItem;
      gGestureSupport._tabs = tabs;
    }
  },

  /**
   * Add or remove mouse gesture event listeners
   *
   * @param aAddListener
   *        True to add/init listeners and false to remove/uninit
   */
  init: function GS_init(aAddListener) {
    const gestureEvents = ["SwipeGesture",
      "MagnifyGestureStart", "MagnifyGestureUpdate", "MagnifyGesture",
      "RotateGestureStart", "RotateGestureUpdate", "RotateGesture"];

    let addRemove = aAddListener ? window.addEventListener :
      window.removeEventListener;

    for each (let event in gestureEvents)
      addRemove("Moz" + event, this, true);
  },

  /**
   * Dispatch events based on the type of mouse gesture event. For now, make
   * sure to stop propagation of every gesture event so that web content cannot
   * receive gesture events.
   *
   * @param aEvent
   *        The gesture event to handle
   */
  handleEvent: function GS_handleEvent(aEvent) {
    aEvent.stopPropagation();

    // Create a preference object with some defaults
    let def = function(aThreshold, aLatched)
      ({ threshold: aThreshold, latched: !!aLatched });

    switch (aEvent.type) {
      case "MozSwipeGesture":
        return this.onSwipe(aEvent);
      case "MozMagnifyGestureStart":
        return this._setupGesture(aEvent, "pinch", def(150, 1), "out", "in");
      case "MozRotateGestureStart":
        return this._setupGesture(aEvent, "twist", def(25, 0), "right", "left");
      case "MozMagnifyGestureUpdate":
      case "MozRotateGestureUpdate":
        return this._doUpdate(aEvent);
    }
  },

  /**
   * Called at the start of "pinch" and "twist" gestures to setup all of the
   * information needed to process the gesture
   *
   * @param aEvent
   *        The continual motion start event to handle
   * @param aGesture
   *        Name of the gesture to handle
   * @param aPref
   *        Preference object with the names of preferences and defaults
   * @param aInc
   *        Command to trigger for increasing motion (without gesture name)
   * @param aDec
   *        Command to trigger for decreasing motion (without gesture name)
   */
  _setupGesture: function GS__setupGesture(aEvent, aGesture, aPref, aInc, aDec) {
    // Keep track of the total deltas and latching behavior
    let offset = 0;
    let latchDir = aEvent.delta > 0 ? 1 : -1;
    let isLatched = false;

    // Create the update function here to capture closure state
    this._doUpdate = function GS__doUpdate(aEvent) {
      // Update the offset with new event data
      offset += aEvent.delta;

      // Check if the cumulative deltas exceed the threshold
      if (Math.abs(offset) > aPref["threshold"]) {
        // Trigger the action if we don't care about latching; otherwise, make
        // sure either we're not latched and going the same direction of the
        // initial motion; or we're latched and going the opposite way
        let sameDir = (latchDir ^ offset) >= 0;
        if (!aPref["latched"] || (isLatched ^ sameDir)) {
          this._doAction(aEvent, [aGesture, offset > 0 ? aInc : aDec]);

          // We must be getting latched or leaving it, so just toggle
          isLatched = !isLatched;
        }

        // Reset motion counter to prepare for more of the same gesture
        offset = 0;
      }
    };

    // The start event also contains deltas, so handle an update right away
    this._doUpdate(aEvent);
  },

  /**
   * Determine what action to do for the gesture based on which keys are
   * pressed and which commands are set
   *
   * @param aEvent
   *        The original gesture event to convert into a fake click event
   * @param aGesture
   *        Array of gesture name parts (to be joined by periods)
   * @return Name of the command found for the event's keys and gesture. If no
   *         command is found, no value is returned (undefined).
   */
  _doAction: function GS__doAction(aEvent, aGesture) {
    let gesture = aGesture.join("-");
    switch (gesture) {
      case "pinch-out":
        document.getElementById("cmd_textZoomEnlarge").doCommand();
        break;
      case "pinch-in":
        document.getElementById("cmd_textZoomReduce").doCommand();
        break;
      case "twist-left":
        if (this._tabs)
          this._tabs.selectedIndex--;
        break;
      case "twist-right":
        if (this._tabs)
          this._tabs.selectedIndex++;
        break;
      case "swipe-down":
        if (aEvent.originalTarget.ownerDocument == getBrowser().contentDocument)
          getBrowser().contentWindow.focus();
        getBrowser().selectedBrowser.scrollToNextSection();
        break;
      case "swipe-up":
        if (aEvent.originalTarget.ownerDocument == getBrowser().contentDocument)
          getBrowser().contentWindow.focus();
        getBrowser().selectedBrowser.scrollToPreviousSection();
        break;
      case "swipe-left":
      case "swipe-right":
        var newIndex = -1;
        if (this._lastSelectedTab)
          newIndex = this._tabs.getIndexOfItem(this._lastSelectedTab);
        if (newIndex == -1)
          newIndex =
            gesture == "swipe-right" ? this._tabs.childNodes.length - 1 : 0;
        this._tabs.selectedIndex = newIndex;
        break;
      default:
        dump("mac gesture: "+ gesture +"\n");
    }
  },

  /**
   * Convert continual motion events into an action if it exceeds a threshold
   * in a given direction. This function will be set by _setupGesture to
   * capture state that needs to be shared across multiple gesture updates.
   *
   * @param aEvent
   *        The continual motion update event to handle
   */
  _doUpdate: function(aEvent) {},

  /**
   * Convert the swipe gesture into a browser action based on the direction
   *
   * @param aEvent
   *        The swipe event to handle
   */
  onSwipe: function GS_onSwipe(aEvent) {
    // Figure out which one (and only one) direction was triggered
    for each (let dir in ["UP", "RIGHT", "DOWN", "LEFT"])
      if (aEvent.direction == aEvent["DIRECTION_" + dir])
        return this._doAction(aEvent, ["swipe", dir.toLowerCase()]);
  }
};

this.addEventListener("load", gGestureSupport.load);
