/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals VCardPropertyEntryView, vCardIdGen */

ChromeUtils.defineModuleGetter(
  this,
  "VCardPropertyEntry",
  "resource:///modules/VCardUtils.jsm"
);

class VCardCustomComponent extends HTMLElement {
  /** @type {VCardPropertyEntry[]} */
  vCardPropertyEntries = null;
  /** @type {HTMLInputElement[]} */
  inputEls = null;

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-custom");
    let clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      // FIXME: Add some Fluent strings so that we don't have to do this.
      let stringBundle = Services.strings.createBundle(
        "chrome://messenger/locale/addressbook/addressBook.properties"
      );

      this.inputEls = this.querySelectorAll("input");
      let labelEls = this.querySelectorAll("label");
      for (let i = 0; i < 4; i++) {
        let inputId = vCardIdGen.next().value;
        labelEls[i].textContent = stringBundle.GetStringFromName(
          `propertyCustom${i + 1}`
        );
        labelEls[i].htmlFor = inputId;
        this.inputEls[i].id = inputId;
      }
      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.inputEls = null;
      this.vCardPropertyEntries = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    for (let i = 0; i < 4; i++) {
      this.inputEls[i].value = this.vCardPropertyEntries[i].value;
    }
  }

  fromUIToVCardPropertyEntry() {
    for (let i = 0; i < 4; i++) {
      this.vCardPropertyEntries[i].value = this.inputEls[i].value;
    }
  }
}

customElements.define("vcard-custom", VCardCustomComponent);
