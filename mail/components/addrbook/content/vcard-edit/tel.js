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
    let template = document.getElementById("template-vcard-edit-tel");
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

    // Just abandon any values we don't have UI for. We don't have any way to
    // know whether to keep them or not, and they're very rarely used.
    let types = ["work", "home", "cell", "fax", "pager"];
    let paramsType = this.vCardPropertyEntry.params.type;
    if (paramsType && Array.isArray(paramsType)) {
      this.selectEl.value = paramsType.find(t => types.includes(t)) || "";
    } else if (types.includes(paramsType)) {
      this.selectEl.value = this.vCardPropertyEntry.params.type;
    }
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.inputElement.value;

    if (this.selectEl.value) {
      this.vCardPropertyEntry.params.type = this.selectEl.value;
    } else {
      delete this.vCardPropertyEntry.params.type;
    }
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }
}

customElements.define("vcard-tel", VCardTelComponent);
