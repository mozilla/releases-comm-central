/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals VCardPropertyEntryView, vCardIdGen */

ChromeUtils.defineModuleGetter(
  this,
  "VCardPropertyEntry",
  "resource:///modules/VCardUtils.jsm"
);

const { ICAL } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");

/**
 * ANNIVERSARY and BDAY both have a cardinality of
 * *1 ("Exactly one instance per vCard MAY be present.").
 *
 * For Anniversary we changed the cardinality to
 * * ("One or more instances per vCard MAY be present.")".
 *
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 ANNIVERSARY and BDAY
 */
class VCardSpecialDateComponent extends HTMLElement {
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
   * @type {Object}
   */
  monthDays = {
    "1": 31,
    "2": 28,
    "3": 31,
    "4": 30,
    "5": 31,
    "6": 30,
    "7": 31,
    "8": 31,
    "9": 30,
    "10": 31,
    "11": 30,
    "12": 31,
  };

  static newAnniversaryVCardPropertyEntry() {
    return new VCardPropertyEntry("anniversary", {}, "date", "");
  }

  static newBdayVCardPropertyEntry() {
    return new VCardPropertyEntry("bday", {}, "date", "");
  }

  constructor() {
    super();
    let template = document.getElementById(
      "template-vcard-edit-bday-anniversary"
    );
    let clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.selectEl = this.querySelector(".vcard-type-selection");
      let selectId = vCardIdGen.next().value;
      this.selectEl.id = selectId;

      this.selectEl.addEventListener("change", event => {
        this.dispatchEvent(
          VCardSpecialDateComponent.ChangeVCardPropertyEntryEvent(
            event.target.value
          )
        );
      });

      this.month = this.querySelector("#month");
      let monthId = vCardIdGen.next().value;
      this.month.id = monthId;
      this.querySelector('label[for="month"]').htmlFor = monthId;
      this.month.addEventListener("change", () => {
        this.fillDayOptions();
      });

      this.day = this.querySelector("#day");
      let dayId = vCardIdGen.next().value;
      this.day.id = dayId;
      this.querySelector('label[for="day"]').htmlFor = dayId;

      this.year = this.querySelector("#year");
      let yearId = vCardIdGen.next().value;
      this.year.id = yearId;
      this.querySelector('label[for="year"]').htmlFor = yearId;
      this.year.addEventListener("input", () => {
        if (this.month.value === "2") {
          this.fillDayOptions();
        }
      });

      let button = this.querySelector(`button[type="button"]`);

      document.l10n
        .formatValues([
          { id: "vcard-date-year" },
          // FIXME: Temporarily use the existing "Delete" string for the remove
          // button. We should add a "Remove" fluent string for this after 102.
          { id: "about-addressbook-delete-edit-contact-button" },
        ])
        .then(([yearLabel, deleteLabel]) => {
          this.year.placeholder = yearLabel;
          button.title = deleteLabel;
        });

      button.addEventListener("click", () => {
        this.dispatchEvent(
          VCardSpecialDateComponent.RemoveVCardDateEntryEvent(this)
        );
        this.remove();
      });

      this.fillMonthOptions();
      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.inputEl = null;
      this.selectEl = null;
      this.vCardPropertyEntry = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.selectEl.value = this.vCardPropertyEntry.name;
    if (this.vCardPropertyEntry.type === "text") {
      /**
       * @TODO support of text type
       */
      this.hidden = true;
      return;
    }
    // Default value is date-and-or-time.
    let dateValue = ICAL.VCardTime.fromDateAndOrTimeString(
      this.vCardPropertyEntry.value || "",
      "date-and-or-time"
    );
    // Always set the month first since that controls the available days.
    this.month.value = dateValue.month || 0;
    this.fillDayOptions();
    this.day.value = dateValue.day || 0;
    this.year.value = dateValue.year === 0 ? "" : dateValue.year;
  }

  fromUIToVCardPropertyEntry() {
    if (this.vCardPropertyEntry.type === "text") {
      /**
       * @TODO support of text type
       */
      return;
    }
    // Default value is date-and-or-time.
    let dateValue = new ICAL.VCardTime({}, null, "date");
    // Set the properties directly instead of using the VCardTime
    // constructor argument, which causes null values to become 0.
    dateValue.year = this.year.value ? Number(this.year.value) : null;
    dateValue.month = this.month.value ? Number(this.month.value) : null;
    dateValue.day =
      dateValue.month && this.day.value ? Number(this.day.value) : null;
    this.vCardPropertyEntry.value = dateValue.toString();
  }

  valueIsEmpty() {
    return (
      this.year.value === "" &&
      this.month.value === "0" &&
      this.day.value === "0"
    );
  }

  /**
   * @param {"bday" | "anniversary"} name
   * @returns {CustomEvent}
   */
  static ChangeVCardPropertyEntryEvent(name) {
    return new CustomEvent("vcard-bday-anniversary-change", {
      detail: {
        name,
      },
      bubbles: true,
    });
  }

  /**
   * This event is fired when the checkbox is checked and we need to uncheck the
   * other checkboxes from each VCardEmailComponent.
   * FIXME: This should be a radio button part of radiogroup.
   *
   * @returns {CustomEvent}
   */
  static RemoveVCardDateEntryEvent(element) {
    return new CustomEvent("vcard-special-date-remove", {
      detail: {
        element,
      },
      bubbles: true,
    });
  }

  /**
   * Check if the specified year is a leap year in order to add or remove the
   * extra day to February.
   * @returns {boolean} True if the currently specified year is a leap year.
   */
  isLeapYear() {
    // No need to do anything if the year is empty.
    if (!this.year.checkValidity() || this.year.value === "") {
      return false;
    }

    let year = parseInt(this.year.value);
    return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
  }

  fillMonthOptions() {
    let formatter = Intl.DateTimeFormat(undefined, { month: "long" });
    for (let m = 1; m <= 12; m++) {
      let option = document.createElement("option");
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
    let defaultOption = document.createElement("option");
    defaultOption.value = 0;
    defaultOption.disabled = true;
    document.l10n
      .formatValues([{ id: "vcard-date-day" }])
      .then(([dayLabel]) => {
        defaultOption.textContent = dayLabel;
      });
    this.day.replaceChildren(defaultOption);

    if (this.month.value === "0") {
      return;
    }

    let monthValue = this.month.value;
    // Add a day to February if this is a leap year and we're in February.
    if (monthValue === "2") {
      this.monthDays["2"] = this.isLeapYear() ? 29 : 28;
    }

    let formatter = Intl.DateTimeFormat(undefined, { day: "numeric" });
    for (let d = 1; d <= this.monthDays[monthValue]; d++) {
      let option = document.createElement("option");
      option.setAttribute("value", d);
      option.setAttribute("label", formatter.format(new Date(2000, 0, d)));
      this.day.appendChild(option);
    }
    // Reset the previously selected day, if it's available in the currently
    // selected month.
    this.day.value = prevDay <= this.monthDays[monthValue] ? prevDay : 0;
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
