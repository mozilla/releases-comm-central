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
 * @see RFC6350 URL
 */
class VCardURLComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLSelectElement} */
  selectEl;
  /** @type {HTMLInputElement} */
  urlEl;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("url", {}, "uri", "");
  }

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-type-text");
    let clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.urlEl = this.querySelector('input[type="text"]');
      let urlId = vCardIdGen.next().value;
      this.urlEl.id = urlId;
      let urlLabel = this.querySelector('label[for="text"]');
      urlLabel.htmlFor = urlId;
      this.urlEl.type = "url";
      document.l10n.setAttributes(urlLabel, "vcard-url-label");

      this.selectEl = this.querySelector("select");
      let selectId = vCardIdGen.next().value;
      this.selectEl.id = selectId;
      this.querySelector('label[for="select"]').htmlFor = selectId;

      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.urlEl = null;
      this.selectEl = null;
      this.vCardPropertyEntry = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.urlEl.value = this.vCardPropertyEntry.value;
    let paramsType = this.vCardPropertyEntry.params.type;
    if (paramsType && !Array.isArray(paramsType)) {
      this.selectEl.value = this.vCardPropertyEntry.params.type;
    }
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.urlEl.value;
    let paramsType = this.selectEl.value;
    if (paramsType && !Array.isArray(paramsType) && paramsType !== "") {
      this.vCardPropertyEntry.params.type = this.selectEl.value;
    } else if (paramsType && !Array.isArray(paramsType)) {
      /**
       * @TODO params.type is string | Array<string> | falsy.
       * Right now the case is only handled for string.
       */
      delete this.vCardPropertyEntry.params.type;
    }
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }
}

customElements.define("vcard-url", VCardURLComponent);
