/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { vCardIdGen } from "./id-gen.mjs";

const lazy = {};
ChromeUtils.defineModuleGetter(
  lazy,
  "VCardPropertyEntry",
  "resource:///modules/VCardUtils.jsm"
);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 ADR
 */
export class VCardAdrComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("adr", {}, "text", [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document.getElementById("template-vcard-edit-adr");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);

    this.streetEl = this.querySelector('textarea[name="street"]');
    this.assignIds(this.streetEl, this.querySelector('label[for="street"]'));
    this.streetEl.addEventListener("input", () => {
      this.resizeStreetEl();
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
    this.assignIds(this.countryEl, this.querySelector('label[for="country"]'));

    // Create the adr type selection.
    this.vCardType = this.querySelector("vcard-type");
    this.vCardType.createTypeSelection(this.vCardPropertyEntry, {
      createLabel: true,
      propertyType: "adr",
    });

    this.fromVCardPropertyEntryToUI();

    this.querySelector(".remove-property-button").addEventListener(
      "click",
      () => {
        this.dispatchEvent(
          new CustomEvent("vcard-remove-property", { bubbles: true })
        );
        this.remove();
      }
    );
  }

  fromVCardPropertyEntryToUI() {
    if (Array.isArray(this.vCardPropertyEntry.value[2])) {
      this.streetEl.value = this.vCardPropertyEntry.value[2].join("\n");
    } else {
      this.streetEl.value = this.vCardPropertyEntry.value[2] || "";
    }
    // Per RFC 6350, post office box and extended address SHOULD be empty.
    const pobox = this.vCardPropertyEntry.value[0] || "";
    const extendedAddr = this.vCardPropertyEntry.value[1] || "";
    if (extendedAddr) {
      this.streetEl.value = this.streetEl.value + "\n" + extendedAddr.trim();
      delete this.vCardPropertyEntry.value[1];
    }
    if (pobox) {
      this.streetEl.value = pobox.trim() + "\n" + this.streetEl.value;
      delete this.vCardPropertyEntry.value[0];
    }

    this.resizeStreetEl();
    this.localityEl.value = this.vCardPropertyEntry.value[3] || "";
    this.regionEl.value = this.vCardPropertyEntry.value[4] || "";
    this.codeEl.value = this.vCardPropertyEntry.value[5] || "";
    this.countryEl.value = this.vCardPropertyEntry.value[6] || "";
  }

  fromUIToVCardPropertyEntry() {
    let streetValue = this.streetEl.value || "";
    streetValue = streetValue.trim();
    if (streetValue.includes("\n")) {
      streetValue = streetValue.replaceAll("\r", "");
      streetValue = streetValue.split("\n");
    }

    this.vCardPropertyEntry.value = [
      "",
      "",
      streetValue,
      this.localityEl.value || "",
      this.regionEl.value || "",
      this.codeEl.value || "",
      this.countryEl.value || "",
    ];
  }

  valueIsEmpty() {
    return [
      this.streetEl,
      this.localityEl,
      this.regionEl,
      this.codeEl,
      this.countryEl,
    ].every(e => !e.value);
  }

  assignIds(inputEl, labelEl) {
    const labelInputId = vCardIdGen.next().value;
    inputEl.id = labelInputId;
    labelEl.htmlFor = labelInputId;
  }

  resizeStreetEl() {
    this.streetEl.rows = Math.max(1, this.streetEl.value.split("\n").length);
  }
}

customElements.define("vcard-adr", VCardAdrComponent);
