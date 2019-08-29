/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * The MozCalendarDaypicker widget is used to display the days of
   * the week and month for event recurrence.
   *
   * @extends {MozButton}
   */
  class MozCalendarDaypicker extends customElements.get("button") {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      super.connectedCallback();

      this.setAttribute("type", "checkbox");
      this.setAttribute("autoCheck", "true");
      this.setAttribute("disable-on-readonly", "true");
      this.setAttribute("disable-on-occurrence", "true");

      this.addEventListener("DOMAttrModified", this.onModified);
    }

    onModified(aEvent) {
      if (aEvent.attrName == "checked") {
        let event = document.createEvent("Events");
        event.initEvent("select", true, true);
        this.calendar.dispatchEvent(event);
      }
    }
  }

  customElements.define("calendar-daypicker", MozCalendarDaypicker, { extends: "button" });
}
