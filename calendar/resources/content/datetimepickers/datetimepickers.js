/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

customElements.whenDefined("menulist-editable").then(() => {
    class MozTimepickerMinute extends MozXULElement {
        static get observedAttributes() {
            return ["label", "selected"];
        }

        constructor() {
            super();

            this.addEventListener("wheel", (event) => {
                const pixelThreshold = 50;
                let deltaView = 0;

                if (event.deltaMode == event.DOM_DELTA_PAGE ||
                    event.deltaMode == event.DOM_DELTA_LINE) {
                    // Line/Page scrolling is usually vertical
                    if (event.deltaY) {
                        deltaView = event.deltaY < 0 ? -1 : 1;
                    }
                } else if (event.deltaMode == event.DOM_DELTA_PIXEL) {
                    // The natural direction for pixel scrolling is left/right
                    this.pixelScrollDelta += event.deltaX;
                    if (this.pixelScrollDelta > pixelThreshold) {
                        deltaView = 1;
                        this.pixelScrollDelta = 0;
                    } else if (this.pixelScrollDelta < -pixelThreshold) {
                        deltaView = -1;
                        this.pixelScrollDelta = 0;
                    }
                }

                if (deltaView != 0) {
                    this.moveMinutes(deltaView);
                }

                event.stopPropagation();
                event.preventDefault();
            });

            this.clickMinute = (minuteItem, minuteNumber) => {
                this.closest("timepicker-grids").clickMinute(minuteItem, minuteNumber);
            };
            this.moveMinutes = number => {
                this.closest("timepicker-grids").moveMinutes(number);
            };
        }

        connectedCallback() {
            if (this.hasChildNodes()) {
                return;
            }

            const spacer = document.createElement("spacer");
            spacer.setAttribute("flex", "1");

            const minutebox = document.createElement("vbox");
            minutebox.addEventListener("click", () => {
                this.clickMinute(this, this.getAttribute("value"));
            });

            const box = document.createElement("box");

            this.label = document.createElement("label");
            this.label.classList.add("time-picker-minute-label");

            box.appendChild(this.label);
            minutebox.appendChild(box);

            this.appendChild(spacer.cloneNode());
            this.appendChild(minutebox);
            this.appendChild(spacer);

            this.pixelScrollDelta = 0;

            this._updateAttributes();
        }

        attributeChangedCallback() {
            this._updateAttributes();
        }

        _updateAttributes() {
            if (!this.label) {
                return;
            }

            if (this.hasAttribute("label")) {
                this.label.setAttribute("value", this.getAttribute("label"));
            } else {
                this.label.removeAttribute("value");
            }

            if (this.hasAttribute("selected")) {
                this.label.setAttribute("selected", this.getAttribute("selected"));
            } else {
                this.label.removeAttribute("selected");
            }
        }
    }

    class MozTimepickerHour extends MozXULElement {
        static get observedAttributes() {
            return ["label", "selected"];
        }

        constructor() {
            super();

            this.addEventListener("wheel", (event) => {
                const pixelThreshold = 50;
                let deltaView = 0;

                if (event.deltaMode == event.DOM_DELTA_PAGE ||
                    event.deltaMode == event.DOM_DELTA_LINE) {
                    // Line/Page scrolling is usually vertical
                    if (event.deltaY) {
                        deltaView = event.deltaY < 0 ? -1 : 1;
                    }
                } else if (event.deltaMode == event.DOM_DELTA_PIXEL) {
                    // The natural direction for pixel scrolling is left/right
                    this.pixelScrollDelta += event.deltaX;
                    if (this.pixelScrollDelta > pixelThreshold) {
                        deltaView = 1;
                        this.pixelScrollDelta = 0;
                    } else if (this.pixelScrollDelta < -pixelThreshold) {
                        deltaView = -1;
                        this.pixelScrollDelta = 0;
                    }
                }

                if (deltaView != 0) {
                    this.moveHours(deltaView);
                }

                event.stopPropagation();
                event.preventDefault();
            });

            this.clickHour = (hourItem, hourNumber) => {
                this.closest("timepicker-grids").clickHour(hourItem, hourNumber);
            };
            this.moveHours = number => {
                this.closest("timepicker-grids").moveHours(number);
            };
            this.doubleClickHour = (hourItem, hourNumber) => {
                this.closest("timepicker-grids").doubleClickHour(hourItem, hourNumber);
            };
        }

        connectedCallback() {
            if (this.hasChildNodes()) {
                return;
            }

            const spacer = document.createElement("spacer");
            spacer.setAttribute("flex", "1");

            const hourbox = document.createElement("vbox");
            hourbox.addEventListener("click", () => {
                this.clickHour(this, this.getAttribute("value"));
            });
            hourbox.addEventListener("dblclick", () => {
                this.doubleClickHour(this, this.getAttribute("value"));
            });

            const box = document.createElement("box");

            this.label = document.createElement("label");
            this.label.classList.add("time-picker-hour-label");

            box.appendChild(this.label);
            hourbox.appendChild(box);
            hourbox.appendChild(spacer.cloneNode());

            this.appendChild(spacer.cloneNode());
            this.appendChild(hourbox);
            this.appendChild(spacer);

            this._updateAttributes();
        }

        attributeChangedCallback() {
            this._updateAttributes();
        }

        _updateAttributes() {
            if (!this.label) {
                return;
            }

            if (this.hasAttribute("label")) {
                this.label.setAttribute("value", this.getAttribute("label"));
            } else {
                this.label.removeAttribute("value");
            }

            if (this.hasAttribute("selected")) {
                this.label.setAttribute("selected", this.getAttribute("selected"));
            } else {
                this.label.removeAttribute("selected");
            }
        }
    }

    class CalendarDatePicker extends MozXULElement {
        connectedCallback() {
            if (this.delayConnectedCallback()) {
                return;
            }

            this.prepend(CalendarDatePicker.fragment.cloneNode(true));
            this._menulist = this.querySelector(".datepicker-menulist");
            this._inputField = this._menulist._inputField;
            this._popup = this._menulist.menupopup;
            this._minimonth = this.querySelector("minimonth");

            if (this.getAttribute("type") == "forever") {
                this._valueIsForever = false;
                this._foreverString =
                    cal.l10n.getString("calendar-event-dialog", "eventRecurrenceForeverLabel");

                this._foreverItem = document.createElement("button");
                this._foreverItem.setAttribute("label", this._foreverString);
                this._popup.appendChild(document.createElement("menuseparator"));
                this._popup.appendChild(this._foreverItem);

                this._foreverItem.addEventListener("command", () => {
                    this._inputBoxValue = "forever";
                    this._valueIsForever = true;
                    this._popup.hidePopup();
                });
            }

            this.value = this.getAttribute("value") || new Date();

            // Other attributes handled in inheritedAttributes.
            this._handleMutation = (mutations) => {
                this.value = this.getAttribute("value");
            };
            this._attributeObserver = new MutationObserver(this._handleMutation);
            this._attributeObserver.observe(this, {
                attributes: true,
                attributeFilter: ["value"],
            });

            this._inputField.addEventListener("change", (event) => {
                event.stopPropagation();

                let value = parseDateTime(this._inputBoxValue);
                if (!value) {
                    this._inputBoxValue = this._minimonthValue;
                    return;
                }
                this._inputBoxValue = this._minimonthValue = value;
                this._valueIsForever = false;

                this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
            });
            this._popup.addEventListener("popupshown", () => {
                this._minimonth.focusDate(this._minimonthValue);
                let calendar = document.getAnonymousElementByAttribute(
                    this._minimonth, "anonid", "minimonth-calendar"
                );
                calendar.querySelector("td[selected]").focus();
            });
            this._minimonth.addEventListener("change", (event) => {
                event.stopPropagation();
            });
            this._minimonth.addEventListener("select", () => {
                this._inputBoxValue = this._minimonthValue;
                this._valueIsForever = false;
                this._popup.hidePopup();

                this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
            });
        }

        disconnectedCallback() {
            super.disconnectedCallback();

            this._attributeObserver.disconnect();

            if (this._menulist) {
                this._menulist.remove();
                this._menulist = null;
                this._inputField = null;
                this._popup = null;
                this._minimonth = null;
                this._foreverItem = null;
            }
        }

        static get fragment() {
            // Accessibility information of these nodes will be
            // presented on XULComboboxAccessible generated from <menulist>;
            // hide these nodes from the accessibility tree.
            let frag = document.importNode(MozXULElement.parseXULToFragment(`
                <menulist is="menulist-editable" class="datepicker-menulist" editable="true" sizetopopup="false">
                    <menupopup ignorekeys="true" popupanchor="bottomright" popupalign="topright">
                        <minimonth tabindex="0"/>
                    </menupopup>
                </menulist>
            `), true);

            Object.defineProperty(this, "fragment", { value: frag });
            return frag;
        }

        static get inheritedAttributes() {
            return { ".datepicker-menulist": "disabled" };
        }

        set value(val) {
            let wasForever = this._valueIsForever;
            if (this.getAttribute("type") == "forever" && val == "forever") {
                this._valueIsForever = true;
                this._inputBoxValue = val;
                if (!wasForever) {
                    this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
                }
                return;
            } else if (typeof val == "string") {
                val = parseDateTime(val);
            }

            let existingValue = this._minimonthValue;
            this._valueIsForever = false;
            this._inputBoxValue = this._minimonthValue = val;

            if (wasForever ||
                existingValue.getFullYear() != val.getFullYear() ||
                existingValue.getMonth() != val.getMonth() ||
                existingValue.getDate() != val.getDate()
            ) {
                this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
            }
        }

        get value() {
            if (this._valueIsForever) {
                return "forever";
            }
            return this._minimonth.value;
        }

        set _inputBoxValue(val) {
            if (val == "forever") {
                this._inputField.value = this._foreverString;
                return;
            }
            this._inputField.value = formatDate(val);
        }

        get _inputBoxValue() {
            return this._inputField.value;
        }

        set _minimonthValue(val) {
            if (val == "forever") {
                return;
            }
            this._minimonth.value = val;
        }

        get _minimonthValue() {
            return this._minimonth.value;
        }
    }

    const MozXULMenuElement = MozElementMixin(XULMenuElement);
    const MenuBaseControl = BaseControlMixin(MozXULMenuElement);
    MenuBaseControl.implementCustomInterface(CalendarDatePicker, [
        Ci.nsIDOMXULMenuListElement,
        Ci.nsIDOMXULSelectControlElement
    ]);

    class CalendarTimePicker extends MozXULElement {
        connectedCallback() {
            if (this.delayConnectedCallback()) {
                return;
            }

            this.prepend(CalendarTimePicker.fragment.cloneNode(true));
            this._menulist = this.firstElementChild;
            this._inputField = this._menulist._inputField;
            this._popup = this._menulist.menupopup;
            this._grid = this._popup.firstElementChild;

            this.value = this.getAttribute("value") || new Date();

            // Other attributes handled in inheritedAttributes.
            this._handleMutation = (mutations) => {
                this.value = this.getAttribute("value");
            };
            this._attributeObserver = new MutationObserver(this._handleMutation);
            this._attributeObserver.observe(this, {
                attributes: true,
                attributeFilter: ["value"],
            });

            this._inputField.addEventListener("change", (event) => {
                event.stopPropagation();

                let value = parseTime(this._inputBoxValue);
                if (!value) {
                    this._inputBoxValue = this._gridValue;
                    return;
                }
                this._inputBoxValue = this._gridValue = value;

                this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
            });
            this._menulist.menupopup.addEventListener("popupshowing", () => {
                this._grid.onPopupShowing();
            });
            this._grid.addEventListener("select", (event) => {
                event.stopPropagation();

                this._inputBoxValue = this._gridValue;
                this._popup.hidePopup();

                this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
            });
        }

        disconnectedCallback() {
            super.disconnectedCallback();

            this._attributeObserver.disconnect();

            if (this._menulist) {
                this._menulist.remove();
                this._menulist = null;
                this._inputField = null;
                this._popup = null;
                this._grid = null;
            }
        }

        static get fragment() {
            // Accessibility information of these nodes will be
            // presented on XULComboboxAccessible generated from <menulist>;
            // hide these nodes from the accessibility tree.
            let frag = document.importNode(MozXULElement.parseXULToFragment(`
                <menulist is="menulist-editable" class="timepicker-menulist" editable="true" sizetopopup="false">
                    <menupopup popupanchor="bottomright" popupalign="topright">
                        <timepicker-grids/>
                    </menupopup>
                </menulist>
            `), true);

            Object.defineProperty(this, "fragment", { value: frag });
            return frag;
        }

        static get inheritedAttributes() {
            return { ".timepicker-menulist": "disabled" };
        }

        set value(val) {
            if (typeof val == "string") {
                val = parseTime(val);
            } else if (Array.isArray(val)) {
                let [hours, minutes] = val;
                val = new Date();
                val.setHours(hours);
                val.setMinutes(minutes);
            }
            let [existingHours, existingMinutes] = this._gridValue;
            if (val.getHours() != existingHours ||
                val.getMinutes() != existingMinutes) {
                this._inputBoxValue = this._gridValue = val;
            }
        }

        get value() {
            return this._gridValue;
        }

        set _inputBoxValue(val) {
            if (typeof val == "string") {
                val = parseTime(val);
            } else if (Array.isArray(val)) {
                let [hours, minutes] = val;
                val = new Date();
                val.setHours(hours);
                val.setMinutes(minutes);
            }
            this._inputField.value = formatTime(val);
        }

        get _inputBoxValue() {
            return this._inputField.value;
        }

        set _gridValue(val) {
            this._grid.value = val;
        }

        get _gridValue() {
            return this._grid.value;
        }
    }

    MenuBaseControl.implementCustomInterface(CalendarTimePicker, [
        Ci.nsIDOMXULMenuListElement,
        Ci.nsIDOMXULSelectControlElement
    ]);

    class CalendarDateTimePicker extends MozXULElement {
        connectedCallback() {
            if (this.delayConnectedCallback()) {
                return;
            }

            this._datepicker = document.createElement("datepicker");
            this._datepicker.classList.add("datetimepicker-datepicker");
            this._datepicker.setAttribute("anonid", "datepicker");
            this._timepicker = document.createElement("timepicker");
            this._timepicker.classList.add("datetimepicker-timepicker");
            this._timepicker.setAttribute("anonid", "timepicker");
            this.appendChild(this._datepicker);
            this.appendChild(this._timepicker);

            if (this.getAttribute("value")) {
                this._datepicker.value = this.getAttribute("value");
                this._timepicker.value = this.getAttribute("value");
            }

            this._datepicker.addEventListener("change", (event) => {
                event.stopPropagation();
                this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
            });
            this._timepicker.addEventListener("change", (event) => {
                event.stopPropagation();
                this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
            });
        }

        disconnectedCallback() {
            super.disconnectedCallback();

            if (this._datepicker) {
                this._datepicker.remove();
            }
            if (this._timepicker) {
                this._timepicker.remove();
            }
        }

        static get inheritedAttributes() {
            return {
                ".datetimepicker-datepicker": "value,disabled,disabled=datepickerdisabled",
                ".datetimepicker-timepicker": "value,disabled,disabled=timepickerdisabled",
            };
        }

        set value(val) {
            this._datepicker.value = this._timepicker.value = val;
        }

        get value() {
            let dateValue = this._datepicker.value;
            let [hours, minutes] = this._timepicker.value;
            dateValue.setHours(hours);
            dateValue.setMinutes(minutes);
            dateValue.setSeconds(0);
            dateValue.setMilliseconds(0);
            return dateValue;
        }
    }

    initDateFormat();
    initTimeFormat();
    customElements.define("timepicker-minute", MozTimepickerMinute);
    customElements.define("timepicker-hour", MozTimepickerHour);
    customElements.define("datepicker", CalendarDatePicker);
    customElements.define("timepicker", CalendarTimePicker);
    customElements.define("datetimepicker", CalendarDateTimePicker);
});

/**
 * Parameter aValue may be a date or a date time. Dates are
 * read according to locale/OS setting (d-m-y or m-d-y or ...).
 * (see initDateFormat). Uses parseTime() for times.
 */
function parseDateTime(aValue) {
    this.mLastDateParseIncludedTime = false;
    let tempDate = null;
    if (!this.probeSucceeded) {
        return null; // avoid errors accessing uninitialized data.
    }

    let year = Number.MIN_VALUE;
    let month = -1;
    let day = -1;
    let timeString = null;

    if (this.alphaMonths == null) {
        // SHORT NUMERIC DATE, such as 2002-03-04, 4/3/2002, or CE2002Y03M04D.
        // Made of digits & nonDigits.  (Nondigits may be unicode letters
        // which do not match \w, esp. in CJK locales.)
        // (.*)? binds to null if no suffix.
        let parseNumShortDateRegex = /^\D*(\d+)\D+(\d+)\D+(\d+)(.*)?$/;
        let dateNumbersArray = parseNumShortDateRegex.exec(aValue);
        if (dateNumbersArray != null) {
            year = Number(dateNumbersArray[this.yearIndex]);
            month = Number(dateNumbersArray[this.monthIndex]) - 1; // 0-based
            day = Number(dateNumbersArray[this.dayIndex]);
            timeString = dateNumbersArray[4];
        }
    } else {
        // SHORT DATE WITH ALPHABETIC MONTH, such as "dd MMM yy" or "MMMM dd, yyyy"
        // (\d+|[^\d\W]) is digits or letters, not both together.
        // Allows 31dec1999 (no delimiters between parts) if OS does (w2k does not).
        // Allows Dec 31, 1999 (comma and space between parts)
        // (Only accepts ASCII month names; JavaScript RegExp does not have an
        // easy way to describe unicode letters short of a HUGE character range
        // regexp derived from the Alphabetic ranges in
        // http://www.unicode.org/Public/UNIDATA/DerivedCoreProperties.txt)
        // (.*)? binds to null if no suffix.
        let parseAlphShortDateRegex = /^\s*(\d+|[^\d\W]+)\W{0,2}(\d+|[^\d\W]+)\W{0,2}(\d+|[^\d\W]+)(.*)?$/;
        let datePartsArray = parseAlphShortDateRegex.exec(aValue);
        if (datePartsArray != null) {
            year = Number(datePartsArray[this.yearIndex]);
            let monthString = datePartsArray[this.monthIndex].toUpperCase();
            for (let monthIdx = 0; monthIdx < this.alphaMonths.length; monthIdx++) {
                if (monthString == this.alphaMonths[monthIdx]) {
                    month = monthIdx;
                    break;
                }
            }
            day = Number(datePartsArray[this.dayIndex]);
            timeString = datePartsArray[4];
        }
    }
    if (year != Number.MIN_VALUE && month != -1 && day != -1) {
        // year, month, day successfully parsed
        if (year >= 0 && year < 100) {
            // If 0 <= year < 100, treat as 2-digit year (like formatDate):
            //   parse year as up to 30 years in future or 69 years in past.
            //   (Covers 30-year mortgage and most working people's birthdate.)
            // otherwise will be treated as four digit year.
            let currentYear = new Date().getFullYear();
            let currentCentury = currentYear - currentYear % 100;
            year = currentCentury + year;
            if (year < currentYear - 69) {
                year += 100;
            }
            if (year > currentYear + 30) {
                year -= 100;
            }
        }
        // if time is also present, parse it
        let hours = 0;
        let minutes = 0;
        let seconds = 0;
        if (timeString != null) {
            let time = this.parseTime(timeString);
            if (time != null) {
                hours = time.getHours();
                minutes = time.getMinutes();
                seconds = time.getSeconds();
                this.mLastDateParseIncludedTime = true;
            }
        }
        tempDate = new Date(year, month, day, hours, minutes, seconds, 0);
    } // else did not match regex, not a valid date
    return tempDate;
}

/**
 * Parse a variety of time formats so that cut and paste is likely to work.
 * separator:            ':'         '.'        ' '        symbol        none
 *                       "12:34:56"  "12.34.56" "12 34 56" "12h34m56s"   "123456"
 * seconds optional:     "02:34"     "02.34"    "02 34"    "02h34m"      "0234"
 * minutes optional:     "12"        "12"       "12"       "12h"         "12"
 * 1st hr digit optional:"9:34"      " 9.34"     "9 34"     "9H34M"       "934am"
 * skip nondigit prefix  " 12:34"    "t12.34"   " 12 34"   "T12H34M"     "T0234"
 * am/pm optional        "02:34 a.m.""02.34pm"  "02 34 A M" "02H34M P.M." "0234pm"
 * am/pm prefix          "a.m. 02:34""pm02.34"  "A M 02 34" "P.M. 02H34M" "pm0234"
 * am/pm cyrillic        "02:34\u0430.\u043c."  "02 34 \u0420 \u041c"
 * am/pm arabic          "\u063502:34" (RTL 02:34a) "\u0645 02.34" (RTL 02.34 p)
 * above/below noon      "\u4e0a\u534802:34"    "\u4e0b\u5348 02 34"
 * noon before/after     "\u5348\u524d02:34"    "\u5348\u5f8c 02 34"
 */
function parseTime(aValue) {
    let now = new Date();

    let noon = cal.l10n.getDateFmtString("noon");
    if (aValue.toLowerCase() == noon.toLowerCase()) {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    }

    let midnight = cal.l10n.getDateFmtString("midnight");
    if (aValue.toLowerCase() == midnight.toLowerCase()) {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    }

    let time = null;
    let timePartsArray = this.parseTimeRegExp.exec(aValue);
    const PRE_INDEX = 1, HR_INDEX = 2, MIN_INDEX = 4, SEC_INDEX = 6, POST_INDEX = 8;

    if (timePartsArray != null) {
        let hoursString = timePartsArray[HR_INDEX];
        let hours = Number(hoursString);
        if (!(hours >= 0 && hours < 24)) {
            return null;
        }

        let minutesString = timePartsArray[MIN_INDEX];
        let minutes = (minutesString == null ? 0 : Number(minutesString));
        if (!(minutes >= 0 && minutes < 60)) {
            return null;
        }

        let secondsString = timePartsArray[SEC_INDEX];
        let seconds = (secondsString == null ? 0 : Number(secondsString));
        if (!(seconds >= 0 && seconds < 60)) {
            return null;
        }

        let ampmCode = null;
        if (timePartsArray[PRE_INDEX] || timePartsArray[POST_INDEX]) {
            if (this.ampmIndex && timePartsArray[this.ampmIndex]) {
                // try current format order first
                let ampmString = timePartsArray[this.ampmIndex];
                if (this.amRegExp.test(ampmString)) {
                    ampmCode = "AM";
                } else if (this.pmRegExp.test(ampmString)) {
                    ampmCode = "PM";
                }
            }
            if (ampmCode == null) { // not yet found
                // try any format order
                let preString = timePartsArray[PRE_INDEX];
                let postString = timePartsArray[POST_INDEX];
                if (
                    (preString && this.amRegExp.test(preString)) ||
                    (postString && this.amRegExp.test(postString))
                ) {
                    ampmCode = "AM";
                } else if (
                    (preString && this.pmRegExp.test(preString)) ||
                    (postString && this.pmRegExp.test(postString))
                ) {
                    ampmCode = "PM";
                } // else no match, ignore and treat as 24hour time.
            }
        }
        if (ampmCode == "AM") {
            if (hours == 12) {
                hours = 0;
            }
        } else if (ampmCode == "PM") {
            if (hours < 12) {
                hours += 12;
            }
        }
        time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds, 0);
    }  // else did not match regex, not valid time
    return time;
}

function initDateFormat() {
    // probe the dateformat
    this.yearIndex = -1;
    this.monthIndex = -1;
    this.dayIndex = -1;
    this.twoDigitYear = false;
    this.alphaMonths = null;
    this.probeSucceeded = false;
    this.mLastDateParseIncludedTime = false;

    // SHORT NUMERIC DATE, such as 2002-03-04, 4/3/2002, or CE2002Y03M04D.
    // Made of digits & nonDigits.  (Nondigits may be unicode letters
    // which do not match \w, esp. in CJK locales.)
    this.parseShortDateRegex = /^\D*(\d+)\D+(\d+)\D+(\d+)\D?$/;
    // Make sure to use UTC date and timezone here to avoid the pattern
    // detection to fail if the probe date output would have an timezone
    // offset due to our lack of support of historic timezone definitions.
    let probeDate = new Date(Date.UTC(2002, 3, 6)); // month is 0-based
    let probeString = this.formatDate(probeDate, cal.dtz.UTC);
    let probeArray = this.parseShortDateRegex.exec(probeString);
    if (probeArray) {
        // Numeric month format
        for (let i = 1; i <= 3; i++) {
            switch (Number(probeArray[i])) {
                case 2: this.twoDigitYear = true; // falls through
                case 2002: this.yearIndex = i; break;
                case 4: this.monthIndex = i; break;
                case 5: // falls through for OS timezones western to GMT
                case 6: this.dayIndex = i; break;
            }
        }
        // All three indexes are set (not -1) at this point.
        this.probeSucceeded = true;
    } else {
        // SHORT DATE WITH ALPHABETIC MONTH, such as "dd MMM yy" or "MMMM dd, yyyy"
        // (\d+|[^\d\W]) is digits or letters, not both together.
        // Allows 31dec1999 (no delimiters between parts) if OS does (w2k does not).
        // Allows Dec 31, 1999 (comma and space between parts)
        // (Only accepts ASCII month names; JavaScript RegExp does not have an
        // easy way to describe unicode letters short of a HUGE character range
        // regexp derived from the Alphabetic ranges in
        // http://www.unicode.org/Public/UNIDATA/DerivedCoreProperties.txt)
        this.parseShortDateRegex = /^\s*(\d+|[^\d\W]+)\W{0,2}(\d+|[^\d\W]+)\W{0,2}(\d+|[^\d\W]+)\s*$/;
        probeArray = this.parseShortDateRegex.exec(probeString);
        if (probeArray != null) {
            for (let j = 1; j <= 3; j++) {
                switch (Number(probeArray[j])) {
                    case 2: this.twoDigitYear = true; // falls through
                    case 2002: this.yearIndex = j; break;
                    case 5: // falls through for OS timezones western to GMT
                    case 6: this.dayIndex = j; break;
                    default: this.monthIndex = j; break;
                }
            }
            if (this.yearIndex != -1 && this.dayIndex != -1 && this.monthIndex != -1) {
                this.probeSucceeded = true;
                // Fill this.alphaMonths with month names.
                this.alphaMonths = new Array(12);
                for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
                    probeDate.setMonth(monthIdx);
                    probeString = this.formatDate(probeDate);
                    probeArray = this.parseShortDateRegex.exec(probeString);
                    if (probeArray) {
                        this.alphaMonths[monthIdx] = probeArray[this.monthIndex].toUpperCase();
                    } else {
                        this.probeSucceeded = false;
                    }
                }
            }
        }
    }
    if (!this.probeSucceeded) {
        dump("\nOperating system short date format is not recognized: " + probeString + "\n");
    }
}

/**
 * Time format in 24-hour format or 12-hour format with am/pm string.
 * Should match formats
 *      HH:mm,       H:mm,       HH:mm:ss,       H:mm:ss
 *      hh:mm tt,    h:mm tt,    hh:mm:ss tt,    h:mm:ss tt
 *   tt hh:mm,    tt h:mm,    tt hh:mm:ss,    tt h:mm:ss
 * where
 * HH is 24 hour digits, with leading 0.  H is 24 hour digits, no leading 0.
 * hh is 12 hour digits, with leading 0.  h is 12 hour digits, no leading 0.
 * mm and ss are is minutes and seconds digits, with leading 0.
 * tt is localized AM or PM string.
 * ':' may be ':' or a units marker such as 'h', 'm', or 's' in  15h12m00s
 * or may be omitted as in 151200.
 */
function initTimeFormat() {
    // probe the Time format
    this.ampmIndex = null;
    // Digits         HR       sep      MIN     sep      SEC     sep
    //   Index:       2        3        4       5        6       7
    let digitsExpr = "(\\d?\\d)(\\D)?(?:(\\d\\d)(\\D)?(?:(\\d\\d)(\\D)?)?)?";
    // any letters or '.': non-digit alphanumeric, period (a.m.), or space (P M)
    let anyAmPmExpr = "(?:[^\\d\\W]|[. ])+";
    // digitsExpr has 6 captures, so index of first ampmExpr is 1, of last is 8.
    let probeTimeRegExp =
        new RegExp("^(" + anyAmPmExpr + ")?\\s?" + digitsExpr + "(" + anyAmPmExpr + ")?\\s*$");
    const PRE_INDEX = 1, HR_INDEX = 2, MIN_INDEX = 4, SEC_INDEX = 6, POST_INDEX = 8; // eslint-disable-line no-unused-vars
    let amProbeTime = new Date(2000, 0, 1, 6, 12, 34);
    let pmProbeTime = new Date(2000, 0, 1, 18, 12, 34);
    let formatter = new Services.intl.DateTimeFormat(undefined, { timeStyle: "short" });
    let amProbeString = formatter.format(amProbeTime);
    let pmProbeString = formatter.format(pmProbeTime);
    let amFormatExpr = null, pmFormatExpr = null;
    if (amProbeString != pmProbeString) {
        let amProbeArray = probeTimeRegExp.exec(amProbeString);
        let pmProbeArray = probeTimeRegExp.exec(pmProbeString);
        if (amProbeArray != null && pmProbeArray != null) {
            if (amProbeArray[PRE_INDEX] && pmProbeArray[PRE_INDEX] &&
                amProbeArray[PRE_INDEX] != pmProbeArray[PRE_INDEX]) {
                this.ampmIndex = PRE_INDEX;
            } else if (amProbeArray[POST_INDEX] && pmProbeArray[POST_INDEX]) {
                if (amProbeArray[POST_INDEX] == pmProbeArray[POST_INDEX]) {
                    // check if need to append previous character,
                    // captured by the optional separator pattern after seconds digits,
                    // or after minutes if no seconds, or after hours if no minutes.
                    for (let k = SEC_INDEX; k >= HR_INDEX; k -= 2) {
                        let nextSepI = k + 1;
                        let nextDigitsI = k + 2;
                        if ((k == SEC_INDEX ||
                            (!amProbeArray[nextDigitsI] && !pmProbeArray[nextDigitsI])) &&
                            amProbeArray[nextSepI] && pmProbeArray[nextSepI] &&
                            amProbeArray[nextSepI] != pmProbeArray[nextSepI]) {
                            amProbeArray[POST_INDEX] =
                                amProbeArray[nextSepI] + amProbeArray[POST_INDEX];
                            pmProbeArray[POST_INDEX] =
                                pmProbeArray[nextSepI] + pmProbeArray[POST_INDEX];
                            this.ampmIndex = POST_INDEX;
                            break;
                        }
                    }
                } else {
                    this.ampmIndex = POST_INDEX;
                }
            }
            if (this.ampmIndex) {
                let makeFormatRegExp = function(string) {
                    // make expr to accept either as provided, lowercased, or uppercased
                    let regExp = string.replace(/(\W)/g, "[$1]"); // escape punctuation
                    let lowercased = string.toLowerCase();
                    if (string != lowercased) {
                        regExp += "|" + lowercased;
                    }
                    let uppercased = string.toUpperCase();
                    if (string != uppercased) {
                        regExp += "|" + uppercased;
                    }
                    return regExp;
                };
                amFormatExpr = makeFormatRegExp(amProbeArray[this.ampmIndex]);
                pmFormatExpr = makeFormatRegExp(pmProbeArray[this.ampmIndex]);
            }
        }
    }
    // International formats ([roman, cyrillic]|arabic|chinese/kanji characters)
    // covering languages of U.N. (en,fr,sp,ru,ar,zh) and G8 (en,fr,de,it,ru,ja).
    // See examples at parseTimeOfDay.
    let amExpr =
        "[Aa\u0410\u0430][. ]?[Mm\u041c\u043c][. ]?|\u0635|\u4e0a\u5348|\u5348\u524d";
    let pmExpr =
        "[Pp\u0420\u0440][. ]?[Mm\u041c\u043c][. ]?|\u0645|\u4e0b\u5348|\u5348\u5f8c";
    if (this.ampmIndex) {
        amExpr = amFormatExpr + "|" + amExpr;
        pmExpr = pmFormatExpr + "|" + pmExpr;
    }
    let ampmExpr = amExpr + "|" + pmExpr;
    // Must build am/pm formats into parse time regexp so that it can
    // match them without mistaking the initial char for an optional divider.
    // (For example, want to be able to parse both "12:34pm" and
    // "12H34M56Spm" for any characters H,M,S and any language's "pm".
    // The character between the last digit and the "pm" is optional.
    // Must recogize "pm" directly, otherwise in "12:34pm" the "S" pattern
    // matches the "p" character so only "m" is matched as ampm suffix.)
    //
    // digitsExpr has 6 captures, so index of first ampmExpr is 1, of last is 8.
    this.parseTimeRegExp =
        new RegExp("(" + ampmExpr + ")?\\s?" + digitsExpr + "(" + ampmExpr + ")?\\s*$");
    this.amRegExp = new RegExp("^(?:" + amExpr + ")$");
    this.pmRegExp = new RegExp("^(?:" + pmExpr + ")$");
}

function formatDate(aDate, aTimezone) {
    // Usually, floating is ok here, so no need to pass aTimezone - we just need to pass
    // it in if we need to make sure formatting happens without a timezone conversion.
    let timezone = aTimezone || cal.dtz.floating;
    return cal.getDateFormatter().formatDateShort(cal.dtz.jsDateToDateTime(aDate, timezone));
}

function formatTime(aValue) {
    let formatter = new Services.intl.DateTimeFormat(undefined, { timeStyle: "short" });
    return formatter.format(aValue);
}
