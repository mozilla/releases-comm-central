/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { vCardIdGen } from "./id-gen.mjs";

export class VCardCustomComponent extends HTMLElement {
  /** @type {VCardPropertyEntry[]} */
  vCardPropertyEntries = null;
  /** @type {HTMLInputElement[]} */
  inputEls = null;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document.getElementById("template-vcard-edit-custom");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);

    this.inputEls = this.querySelectorAll("input");
    const labelEls = this.querySelectorAll("label");
    for (let i = 0; i < 4; i++) {
      const inputId = vCardIdGen.next().value;
      document.l10n.setAttributes(
        labelEls[i],
        `about-addressbook-entry-name-custom${i + 1}`
      );
      labelEls[i].htmlFor = inputId;
      this.inputEls[i].id = inputId;
    }
    this.fromVCardPropertyEntryToUI();
    this.querySelector(".remove-property-button").addEventListener(
      "click",
      () => {
        document.getElementById("vcard-add-custom").hidden = false;
        this.dispatchEvent(
          new CustomEvent("vcard-remove-property", { bubbles: true })
        );
        this.remove();
      }
    );
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
