/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement, MozElements */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * The MozCalendarSubscriptionsRichlistitem widget is used to display the
   * calendar details: i.e. checkbox and label as a richlistitem in the calendar
   * subscriptions richlistbox.
   *
   * @extends {MozElements.MozRichlistitem}
   */
  class MozCalendarSubscriptionsRichlistitem extends MozElements.MozRichlistitem {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.setAttribute("is", "calendar-subscriptions-richlistitem");

      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <hbox flex="1" align="center">
            <checkbox class="calendar-subscriptions-richlistitem-checkbox"></checkbox>
            <label class="subscription-name" flex="1" crop="end"></label>
          </hbox>
        `)
      );

      this.mCalendar = null;
      this.mSubscribed = false;
    }

    set calendar(val) {
      this.setCalendar(val);
      return val;
    }

    get calendar() {
      return this.mCalendar;
    }

    set subscribed(val) {
      this.mSubscribed = val;
      this.checked = val;
      return val;
    }

    get subscribed() {
      return this.mSubscribed;
    }

    set checked(val) {
      let checkbox = this.querySelector(".calendar-subscriptions-richlistitem-checkbox");
      if (val) {
        checkbox.setAttribute("checked", "true");
      } else {
        checkbox.removeAttribute("checked");
      }
      return val;
    }

    get checked() {
      let checkbox = this.querySelector(".calendar-subscriptions-richlistitem-checkbox");
      return checkbox.getAttribute("disabled") == "true";
    }

    set disabled(val) {
      let checkbox = this.querySelector(".calendar-subscriptions-richlistitem-checkbox");
      if (val) {
        checkbox.setAttribute("disabled", "true");
      } else {
        checkbox.removeAttribute("disabled");
      }
      return val;
    }

    get disabled() {
      let checkbox = this.querySelector(".calendar-subscriptions-richlistitem-checkbox");
      return checkbox.getAttribute("disabled") == "true";
    }

    setCalendar(aCalendar) {
      this.mCalendar = aCalendar;
      let label = this.querySelector(".subscription-name");
      label.setAttribute("value", aCalendar.name);
    }
  }

  customElements.define(
    "calendar-subscriptions-richlistitem",
    MozCalendarSubscriptionsRichlistitem,
    { extends: "richlistitem" }
  );
}
