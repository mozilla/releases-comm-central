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
 * @see RFC6350 IMPP
 */
class VCardIMPPComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLInputElement} */
  imppEl;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("impp", {}, "uri", "");
  }

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-text");
    let clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.imppEl = this.querySelector('input[type="text"]');
      let imppId = vCardIdGen.next().value;
      this.imppEl.id = imppId;
      let imppLabel = this.querySelector('label[for="text"]');
      imppLabel.htmlFor = imppId;
      document.l10n.setAttributes(imppLabel, "vcard-impp-label");
      this.imppEl.type = "url";

      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.imppEl = null;
      this.vCardPropertyEntry = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.imppEl.value = this.vCardPropertyEntry.value;
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.imppEl.value;
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }
}

customElements.define("vcard-impp", VCardIMPPComponent);
