/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


// Shamelessly taken from the implementation in browser/base/content/browser.js

var gGestureSupport = {
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

    for (let event of gestureEvents)
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
    let def = (aThreshold, aLatched) =>
      ({ threshold: aThreshold, latched: !!aLatched });

    switch (aEvent.type) {
      case "MozSwipeGesture":
        this.onSwipe(aEvent);
        break;
      case "MozMagnifyGestureStart":
        this._setupGesture(aEvent, "pinch", def(150, 1), "out", "in");
        break;
      case "MozRotateGestureStart":
        this._setupGesture(aEvent, "twist", def(25, 0), "right", "left");
        break;
      case "MozMagnifyGestureUpdate":
      case "MozRotateGestureUpdate":
        this._doUpdate(aEvent);
        break;
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
        // This gesture isn't available if there's no browser.
        if (!getBrowser())
          break;
        if (aEvent.originalTarget.ownerDocument == getBrowser().contentDocument)
          getBrowser().contentWindow.focus();
        if ("scrollToNextSection" in getBrowser())
          getBrowser().scrollToNextSection();
        else
          goDoCommand("cmd_scrollBottom");
        break;
      case "swipe-up":
        // This gesture isn't available if there's no browser.
        if (!getBrowser())
          break;
        if (aEvent.originalTarget.ownerDocument == getBrowser().contentDocument)
          getBrowser().contentWindow.focus();
        if ("scrollToPreviousSection" in getBrowser())
          getBrowser().scrollToPreviousSection();
        else
          goDoCommand("cmd_scrollTop");
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
    for (let dir of ["UP", "RIGHT", "DOWN", "LEFT"]) {
      if (aEvent.direction == aEvent["DIRECTION_" + dir]) {
        this._doAction(aEvent, ["swipe", dir.toLowerCase()]);
        return;
      }
    }
  }
};

this.addEventListener("load", gGestureSupport.load);
