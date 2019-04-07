/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement, cal */

/**
 * Date info that is displayed on task details and event details.
 *
 * @extends MozXULElement
 */
class MozCalendarItemDate extends MozXULElement {
    static get inheritedAttributes() {
        return { ".selectable-label": "mode", };
    }

    connectedCallback() {
        this.appendChild(MozXULElement.parseXULToFragment(`
            <textbox readonly="true" class="selectable-label plain" flex="1"></textbox>
        `));
        this.mItem = null;
        this.initializeAttributeInheritance();
    }

    /**
     * Returns the mode of the date, defaulting to "start
     *
     * @returns {string} mode of the date(start/end).
     */
    get mode() {
        if (this.hasAttribute("mode")) {
            return this.getAttribute("mode");
        }
        return "start";
    }

    /**
     * Sets up the value of the date string which is displayed
     * on task details and event details. It takes mode of the
     * date in consideration and generates the date string.
     *
     * @param {Object} event/task item object.
     */
    set item(val) {
        this.mItem = val;
        let itemDateTimeLabel = this.querySelector(".selectable-label");
        let date;
        if (this.mode == "start") {
            date = this.mItem[cal.dtz.startDateProp(this.mItem)];
        } else {
            date = this.mItem[cal.dtz.endDateProp(this.mItem)];
        }
        let hideTextbox = (date == null);
        if (hideTextbox) {
            this.style.visibility = "collapse";
        } else {
            const kDefaultTimezone = cal.dtz.defaultTimezone;
            let localTime = date.getInTimezone(kDefaultTimezone);
            let formatter = cal.getDateFormatter();
            itemDateTimeLabel.value = formatter.formatDateTime(localTime);
            if (!date.timezone.isFloating && date.timezone.tzid != kDefaultTimezone.tzid) {
                // we additionally display the original datetime with timezone
                let orgTime = cal.l10n.getCalString("datetimeWithTimezone", [
                    formatter.formatDateTime(date),
                    date.timezone.tzid
                ]);
                itemDateTimeLabel.value += " (" + orgTime + ")";
            }
            this.style.visibility = "visible";
        }
    }

    /**
     * Returns the event/task item object.
     *
     * @returns {Object} event/task item object.
     */
    get item() {
        return this.mItem;
    }
}

customElements.define("calendar-item-date", MozCalendarItemDate);
