/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals VCardPropertyEntryView, vCardIdGen */

ChromeUtils.defineModuleGetter(
  this,
  "VCardPropertyEntry",
  "resource:///modules/VCardUtils.jsm"
);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 ADR
 */
class VCardAdrComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLSelectElement} */
  selectEl;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("adr", {}, "text", [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-adr");
    let clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.poboxEl = this.querySelector('input[name="pobox"]');
      this.assignIds(this.poboxEl, this.querySelector('label[for="pobox"]'));

      this.extEl = this.querySelector('input[name="ext"]');
      this.assignIds(this.extEl, this.querySelector('label[for="ext"]'));

      this.streetEl = this.querySelector('textarea[name="street"]');
      this.assignIds(this.streetEl, this.querySelector('label[for="street"]'));
      this.streetEl.addEventListener("input", () => {
        this.resizeStreetEl();
        this.streetEl.scrollIntoView();
      });

      this.localityEl = this.querySelector('input[name="locality"]');
      this.assignIds(
        this.localityEl,
        this.querySelector('label[for="locality"]')
      );

      this.regionEl = this.querySelector('input[name="region"]');
      this.assignIds(this.regionEl, this.querySelector('label[for="region"]'));

      this.codeEl = this.querySelector('input[name="code"]');
      this.assignIds(this.regionEl, this.querySelector('label[for="code"]'));

      this.countryEl = this.querySelector('input[name="country"]');
      this.assignIds(
        this.countryEl,
        this.querySelector('label[for="country"]')
      );

      this.selectEl = this.querySelector("select");
      let selectId = vCardIdGen.next().value;
      this.selectEl.id = selectId;
      this.querySelector('label[for="select"]').htmlFor = selectId;

      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.selectEl = null;
      this.vCardPropertyEntry = null;
      this.poboxEl = null;
      this.extEl = null;
      this.streetEl = null;
      this.localityEl = null;
      this.regionEl = null;
      this.codeEl = null;
      this.countryEl = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.poboxEl.value = this.vCardPropertyEntry.value[0] || "";
    this.poboxEl.parentNode.hidden = !this.poboxEl.value;
    this.extEl.value = this.vCardPropertyEntry.value[1] || "";
    this.extEl.parentNode.hidden = !this.extEl.value;
    if (Array.isArray(this.vCardPropertyEntry.value[2])) {
      this.streetEl.value = this.vCardPropertyEntry.value[2].join("\n");
    } else {
      this.streetEl.value = this.vCardPropertyEntry.value[2] || "";
    }
    this.resizeStreetEl();
    this.localityEl.value = this.vCardPropertyEntry.value[3] || "";
    this.regionEl.value = this.vCardPropertyEntry.value[4] || "";
    this.codeEl.value = this.vCardPropertyEntry.value[5] || "";
    this.countryEl.value = this.vCardPropertyEntry.value[6] || "";

    /**
     * @TODO
     * Create an element for type selection of home, work, ...
     */
    let paramsType = this.vCardPropertyEntry.params.type;
    if (paramsType && !Array.isArray(paramsType)) {
      this.selectEl.value = this.vCardPropertyEntry.params.type;
    }
  }

  fromUIToVCardPropertyEntry() {
    /**
     * @TODO
     * Create an element for type selection of home, work, ...
     */
    let paramsType = this.selectEl.value;
    if (paramsType) {
      this.vCardPropertyEntry.params.type = paramsType;
    }

    let streetValue = this.streetEl.value || "";
    streetValue = streetValue.trim();
    if (streetValue.includes("\n")) {
      streetValue = streetValue.replaceAll("\r", "");
      streetValue = streetValue.split("\n");
    }

    this.vCardPropertyEntry.value = [
      this.poboxEl.value || "",
      this.extEl.value || "",
      streetValue,
      this.localityEl.value || "",
      this.regionEl.value || "",
      this.codeEl.value || "",
      this.countryEl.value || "",
    ];
  }

  valueIsEmpty() {
    let filterdValues = [
      this.poboxEl,
      this.extEl,
      this.streetEl,
      this.localityEl,
      this.regionEl,
      this.codeEl,
      this.countryEl,
    ].filter(e => e.value !== "");
    return filterdValues.length === 0;
  }

  assignIds(inputEl, labelEl) {
    let labelInputId = vCardIdGen.next().value;
    inputEl.id = labelInputId;
    labelEl.htmlFor = labelInputId;
  }

  resizeStreetEl() {
    this.streetEl.rows = Math.max(1, this.streetEl.value.split("\n").length);
  }
}

customElements.define("vcard-adr", VCardAdrComponent);
