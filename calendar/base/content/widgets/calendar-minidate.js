/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals cal */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  const format = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  const parts = ["month", "day", "year"];

  function getParts(date) {
    return format.formatToParts(date).reduce((prev, curr) => {
      if (parts.includes(curr.type)) {
        prev[curr.type] = curr.value;
      }
      return prev;
    }, {});
  }

  /**
   * CalendarMinidate displays a date in a visually appealing box meant to be
   * glanced at quickly to figure out the date of an event.
   */
  class CalendarMinidate extends HTMLElement {
    /**
     * @type {HTMLElement}
     */
    _monthSpan;

    /**
     * @type {HTMLElement}
     */
    _daySpan;

    /**
     * @type {HTMLElement}
     */
    _yearSpan;

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      document.l10n.connectRoot(this.shadowRoot);
      this.shadowRoot.appendChild(
        document.getElementById("calendarMinidate").content.cloneNode(true)
      );
      this._monthSpan = this.shadowRoot.querySelector(".calendar-minidate-month");
      this._daySpan = this.shadowRoot.querySelector(".calendar-minidate-day");
      this._yearSpan = this.shadowRoot.querySelector(".calendar-minidate-year");
    }

    /**
     * Setting the date property will trigger the rendering of this widget.
     *
     * @type {calIDateTime}
     */
    set date(value) {
      let { month, day, year } = getParts(cal.dtz.dateTimeToJsDate(value));
      this._monthSpan.textContent = month;
      this._daySpan.textContent = day;
      this._yearSpan.textContent = year;
    }

    /**
     * Provides the displayed date as a string in the format
     * "month day year".
     *
     * @type {string}
     */
    get fullDate() {
      return `${this._monthSpan.textContent} ${this._daySpan.textContent} ${this._yearSpan.textContent}`;
    }
  }
  customElements.define("calendar-minidate", CalendarMinidate);
}
