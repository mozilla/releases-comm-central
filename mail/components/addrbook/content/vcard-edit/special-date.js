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

      this.querySelector("legend").setAttribute("aria-labelledby", selectId);

      this.month = this.querySelector("#month");
      let monthId = vCardIdGen.next().value;
      this.month.id = monthId;
      this.querySelector('label[for="month"]').htmlFor = monthId;

      this.day = this.querySelector("#day");
      let dayId = vCardIdGen.next().value;
      this.day.id = dayId;
      this.querySelector('label[for="day"]').htmlFor = dayId;

      this.year = this.querySelector("#year");
      let yearId = vCardIdGen.next().value;
      this.year.id = yearId;
      this.querySelector('label[for="year"]').htmlFor = yearId;

      document.l10n
        .formatValues([{ id: "vcard-date-year" }])
        .then(([yearLabel]) => {
          this.year.placeholder = yearLabel;
        });

      /**
       * @TODO
       * Order the fields according to the locale date formatting.
       */
      // this.localeDOMOrdering();

      this.fillOptions();

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
    this.day.value = dateValue.day | "";
    this.month.value = dateValue.month | "";
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
    dateValue.day = this.day.value ? Number(this.day.value) : null;
    this.vCardPropertyEntry.value = dateValue.toString();
  }

  valueIsEmpty() {
    return (
      this.year.value === "" && this.month.value === "" && this.day.value === ""
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

  fillOptions() {
    let formatter = Intl.DateTimeFormat(undefined, { month: "long" });
    for (let m = 1; m <= 12; m++) {
      let option = document.createElement("option");
      option.setAttribute("value", m);
      option.setAttribute("label", formatter.format(new Date(2000, m - 1, 2)));
      this.month.appendChild(option);
    }

    formatter = Intl.DateTimeFormat(undefined, { day: "numeric" });
    for (let d = 1; d <= 31; d++) {
      let option = document.createElement("option");
      option.setAttribute("value", d);
      option.setAttribute("label", formatter.format(new Date(2000, 0, d)));
      this.day.appendChild(option);
    }
  }

  /**
   * @param {boolean} options.hasBday
   */
  birthdayAvailabilty(options) {
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
