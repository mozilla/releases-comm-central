/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { vCardIdGen } from "./id-gen.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  VCardPropertyEntry: "resource:///modules/VCardUtils.sys.mjs",
});

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 IMPP
 */
export class VCardIMPPComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLInputElement} */
  imppEl;
  /** @type {HTMLSelectElement} */
  protocolEl;

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("impp", {}, "uri", "");
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document.getElementById("template-vcard-edit-impp");
    this.appendChild(template.content.cloneNode(true));

    this.imppEl = this.querySelector('input[name="impp"]');
    document.l10n
      .formatValue("vcard-impp-input-title")
      .then(t => (this.imppEl.title = t));

    this.protocolEl = this.querySelector('select[name="protocol"]');
    this.protocolEl.id = vCardIdGen.next().value;

    const protocolLabel = this.querySelector('label[for="protocol"]');
    protocolLabel.htmlFor = this.protocolEl.id;

    this.protocolEl.addEventListener("change", () => {
      const entered = this.imppEl.value.split(":", 1)[0]?.toLowerCase();
      if (entered) {
        this.protocolEl.value =
          [...this.protocolEl.options].find(o => o.value.startsWith(entered))
            ?.value || "";
      }
      this.imppEl.placeholder = this.protocolEl.value;
      this.imppEl.pattern = this.protocolEl.selectedOptions[0].dataset.pattern;
    });

    this.imppEl.id = vCardIdGen.next().value;
    const imppLabel = this.querySelector('label[for="impp"]');
    imppLabel.htmlFor = this.imppEl.id;
    document.l10n.setAttributes(imppLabel, "vcard-impp-label");
    this.imppEl.addEventListener("change", () => {
      this.protocolEl.dispatchEvent(new CustomEvent("change"));
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

    this.fromVCardPropertyEntryToUI();
    this.imppEl.dispatchEvent(new CustomEvent("change"));
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
