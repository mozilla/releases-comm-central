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
    }

    connectedCallback() {
      this._image = document.createXULElement("image");
      this._image.setAttribute("pack", "center");

      this.appendChild(this._image);

      this.parentorient = this.getAttribute("parentorient");
    }

    /**
     * Sets the orientation for image of the gripbar which
     * is inherited from the parent box.
     *
     * @param {String} orientation value.
     */
    set parentorient(val) {
      this.setAttribute("parentorient", val);
      let otherOrient = val == "horizontal" ? "vertical" : "horizontal";
      this._image.setAttribute("orient", otherOrient);
      return val;
    }

    get parentorient() {
      return this.getAttribute("parentorient");
    }
  }

  customElements.define("calendar-event-gripbar", MozCalendarEventGripbar);
}
