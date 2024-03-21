/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { vCardIdGen } from "./id-gen.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  VCardPropertyEntry: "resource:///modules/VCardUtils.sys.mjs",
});

const { ICAL } = ChromeUtils.importESModule(
  "resource:///modules/calendar/Ical.sys.mjs"
);

/**
 * ANNIVERSARY and BDAY both have a cardinality of
 * 1 ("Exactly one instance per vCard MAY be present.").
 *
 * For Anniversary we changed the cardinality to
 * ("One or more instances per vCard MAY be present.")".
 *
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 ANNIVERSARY and BDAY
 */
export class VCardSpecialDateComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLSelectElement} */
  selectEl;
  /** @type {HTMLInputElement} */
  year;
  /** @type {HTMLSelectElement} */
  month;
  /** @type {HTMLSelectElement} */
  day;

  /**
   * Object containing the available days for each month.
   *
   * @type {object}
   */
  monthDays = {
    1: 31,
    2: 28,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31,
  };

  static newAnniversaryVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("anniversary", {}, "date", "");
  }

  static newBdayVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("bday", {}, "date", "");
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document.getElementById(
      "template-vcard-edit-bday-anniversary"
    );
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);

    this.selectEl = this.querySelector(".vcard-type-selection");
    const selectId = vCardIdGen.next().value;
    this.selectEl.id = selectId;
    this.querySelector(".vcard-type-label").htmlFor = selectId;

    this.selectEl.addEventListener("change", event => {
      this.dispatchEvent(
        VCardSpecialDateComponent.ChangeVCardPropertyEntryEvent(
          event.target.value
        )
      );
    });

    this.month = this.querySelector("#month");
    const monthId = vCardIdGen.next().value;
    this.month.id = monthId;
    this.querySelector('label[for="month"]').htmlFor = monthId;
    this.month.addEventListener("change", () => {
      this.fillDayOptions();
    });

    this.day = this.querySelector("#day");
    const dayId = vCardIdGen.next().value;
    this.day.id = dayId;
    this.querySelector('label[for="day"]').htmlFor = dayId;

    this.year = this.querySelector("#year");
    const yearId = vCardIdGen.next().value;
    this.year.id = yearId;
    this.querySelector('label[for="year"]').htmlFor = yearId;
    this.year.addEventListener("input", () => {
      this.fillDayOptions();
    });

    document.l10n.formatValues([{ id: "vcard-date-year" }]).then(yearLabel => {
      this.year.placeholder = yearLabel;
    });

    this.querySelector(".remove-property-button").addEventListener(
      "click",
      () => {
        this.dispatchEvent(
          new CustomEvent("vcard-remove-property", { bubbles: true })
        );
        this.remove();
      }
    );

    this.fillMonthOptions();
    this.fromVCardPropertyEntryToUI();
  }

  fromVCardPropertyEntryToUI() {
    this.selectEl.value = this.vCardPropertyEntry.name;
    if (this.vCardPropertyEntry.type === "text") {
      // TODO: support of text type for special-date
      this.hidden = true;
      return;
    }
    // Default value is date-and-or-time.
    let dateValue;
    try {
      dateValue = ICAL.VCardTime.fromDateAndOrTimeString(
        this.vCardPropertyEntry.value || "",
        "date-and-or-time"
      );
    } catch (ex) {
      console.error(ex);
    }
    // Always set the month first since that controls the available days.
    this.month.value = dateValue?.month || "";
    this.fillDayOptions();
    this.day.value = dateValue?.day || "";
    this.year.value = dateValue?.year || "";
  }

  fromUIToVCardPropertyEntry() {
    if (this.vCardPropertyEntry.type === "text") {
      // TODO: support of text type for special-date
      return;
    }
    // Default value is date-and-or-time.
    const dateValue = new ICAL.VCardTime({}, null, "date");
    // Set the properties directly instead of using the VCardTime
    // constructor argument, which causes null values to become 0.
    dateValue.year = this.year.value ? Number(this.year.value) : null;
    dateValue.month = this.month.value ? Number(this.month.value) : null;
    dateValue.day = this.day.value ? Number(this.day.value) : null;
    this.vCardPropertyEntry.value = dateValue.toString();
  }

  valueIsEmpty() {
    return !this.year.value && !this.month.value && !this.day.value;
  }

  /**
   * @param {"bday" | "anniversary"} entryName
   * @returns {CustomEvent}
   */
  static ChangeVCardPropertyEntryEvent(entryName) {
    return new CustomEvent("vcard-bday-anniversary-change", {
      detail: {
        name: entryName,
      },
      bubbles: true,
    });
  }

  /**
   * Check if the specified year is a leap year in order to add or remove the
   * extra day to February.
   *
   * @returns {boolean} True if the currently specified year is a leap year,
   *   or if no valid year value is available.
   */
  isLeapYear() {
    // If the year is empty, we can't know if it's a leap year so must assume
    // it is. Otherwise year-less dates can't show Feb 29.
    if (!this.year.checkValidity() || this.year.value === "") {
      return true;
    }

    const year = parseInt(this.year.value);
    return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
  }

  fillMonthOptions() {
    const formatter = Intl.DateTimeFormat(undefined, { month: "long" });
    for (let m = 1; m <= 12; m++) {
      const option = document.createElement("option");
      option.setAttribute("value", m);
      option.setAttribute("label", formatter.format(new Date(2000, m - 1, 2)));
      this.month.appendChild(option);
    }
  }

  /**
   * Update the Day select element to reflect the available days of the selected
   * month.
   */
  fillDayOptions() {
    let prevDay = 0;
    // Save the previously selected day if we have one.
    if (this.day.childNodes.length > 1) {
      prevDay = this.day.value;
    }

    // Always clear old options.
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    document.l10n
      .formatValues([{ id: "vcard-date-day" }])
      .then(([dayLabel]) => {
        defaultOption.textContent = dayLabel;
      });
    this.day.replaceChildren(defaultOption);

    const monthValue = this.month.value || 1;
    // Add a day to February if this is a leap year and we're in February.
    if (monthValue === "2") {
      this.monthDays["2"] = this.isLeapYear() ? 29 : 28;
    }

    const formatter = Intl.DateTimeFormat(undefined, { day: "numeric" });
    for (let d = 1; d <= this.monthDays[monthValue]; d++) {
      const option = document.createElement("option");
      option.setAttribute("value", d);
      option.setAttribute("label", formatter.format(new Date(2000, 0, d)));
      this.day.appendChild(option);
    }
    // Reset the previously selected day, if it's available in the currently
    // selected month.
    this.day.value = prevDay <= this.monthDays[monthValue] ? prevDay : "";
  }

  /**
   * @param {boolean} options.hasBday
   */
  birthdayAvailability(options) {
    if (this.vCardPropertyEntry.name === "bday") {
      return;
    }
    Array.from(this.selectEl.options).forEach(option => {
      if (option.value === "bday") {
        option.disabled = options.hasBday;
      }
    });
  }
}

customElements.define("vcard-special-date", VCardSpecialDateComponent);
