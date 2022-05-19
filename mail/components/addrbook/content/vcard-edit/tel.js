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
 * @see RFC6350 TEL
 *
 * @TODO missing type-param-tel support.
 * "text, voice, fax, cell, video, pager, textphone"
 */
class VCardTelComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLSelectElement} */
  selectEl;
  /** @type {HTMLInputElement} */
  inputElement;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("tel", {}, "text", "");
  }

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-type-text");
    let clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.inputElement = this.querySelector('input[type="text"]');
      let urlId = vCardIdGen.next().value;
      this.inputElement.id = urlId;
      let urlLabel = this.querySelector('label[for="text"]');
      urlLabel.htmlFor = urlId;
      document.l10n.setAttributes(urlLabel, "vcard-tel-label");
      this.inputElement.type = "tel";

      this.selectEl = this.querySelector("select");
      let selectId = vCardIdGen.next().value;
      this.selectEl.id = selectId;
      this.querySelector('label[for="select"]').htmlFor = selectId;

      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.inputElement = null;
      this.selectEl = null;
      this.vCardPropertyEntry = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.inputElement.value = this.vCardPropertyEntry.value;
    let paramsType = this.vCardPropertyEntry.params.type;
    if (paramsType && Array.isArray(paramsType)) {
      this.selectEl.value =
        paramsType.find(element => element === "home" || element === "work") ||
        "";
    } else if (paramsType === "home" || paramsType === "work") {
      this.selectEl.value = this.vCardPropertyEntry.params.type;
    }
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.inputElement.value;
    let paramsType = this.vCardPropertyEntry.params.type;

    let types;
    if (Array.isArray(paramsType)) {
      types = new Set(paramsType);
    } else if (paramsType) {
      types = new Set([paramsType]);
    } else {
      types = new Set();
    }

    types.delete("home");
    types.delete("work");
    if (this.selectEl.value) {
      types.add(this.selectEl.value);
    }

    if (types.size > 1) {
      this.vCardPropertyEntry.params.type = [...types];
    } else if (types.size == 1) {
      this.vCardPropertyEntry.params.type = [...types][0];
    } else {
      delete this.vCardPropertyEntry.params.type;
    }
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }
}

customElements.define("vcard-tel", VCardTelComponent);
