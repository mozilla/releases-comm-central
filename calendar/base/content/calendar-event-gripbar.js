/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * A simple gripbar that is displayed at the start and end of an
   * event box. Needs to handle being dragged and resizing the
   * event, thus changing its start/end time.
   *
   * @extends MozXULElement
   */
  class MozCalendarEventGripbar extends MozXULElement {
    constructor() {
      super();

      this.addEventListener("mousedown", event => {
        if (event.button != 0) {
          return;
        }

        // store the attribute 'whichside' in the event object
        // but *don't* call stopPropagation(). as soon as the
        // enclosing event box will receive the event it will
        // make use of this information in order to invoke the
        // appropriate action.
        event.whichside = this.getAttribute("whichside");
      });

      this.addEventListener("click", event => {
        if (event.button != 0) {
          return;
        }
        // parent event-column has event listener for click so
        // stopPropagation() is called.
        event.stopPropagation();
      });

      this._image = document.createElement("img");
      /* Make sure the img doesn't interfere with dragging the gripbar to
       * resize. */
      this._image.setAttribute("draggable", "false");
      this._image.setAttribute("alt", "");
      this.appendChild(this._image);
    }

    static get observedAttributes() {
      return ["parentorient", "whichside"];
    }

    attributeChangedCallback(name, oldVal, newVal) {
      let side;
      let orient;
      switch (name) {
        case "parentorient":
          orient = newVal;
          side = this.getAttribute("whichside");
          break;
        case "whichside":
          orient = this.getAttribute("parentorient");
          side = newVal;
          break;
        default:
          return;
      }
      let src;
      if (side === "start" && orient === "vertical") {
        src = "chrome://calendar/skin/shared/event-grippy-top.png";
      } else if (side === "start" && orient === "horizontal") {
        src = "chrome://calendar/skin/shared/event-grippy-left.png";
      } else if (side === "end" && orient === "vertical") {
        src = "chrome://calendar/skin/shared/event-grippy-bottom.png";
      } else if (side === "end" && orient === "horizontal") {
        src = "chrome://calendar/skin/shared/event-grippy-right.png";
      }
      if (src) {
        this._image.setAttribute("src", src);
      } else {
        this._image.removeAttribute("src");
      }
    }
  }

  customElements.define("calendar-event-gripbar", MozCalendarEventGripbar);
}
