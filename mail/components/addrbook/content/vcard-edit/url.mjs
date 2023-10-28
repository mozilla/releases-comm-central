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
 * @see RFC6350 URL
 */
export class VCardURLComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLInputElement} */
  urlEl;

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("url", {}, "uri", "");
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document.getElementById("template-vcard-edit-type-text");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);

    this.urlEl = this.querySelector('input[type="text"]');
    const urlId = vCardIdGen.next().value;
    this.urlEl.id = urlId;
    const urlLabel = this.querySelector('label[for="text"]');
    urlLabel.htmlFor = urlId;
    this.urlEl.type = "url";
    document.l10n.setAttributes(urlLabel, "vcard-url-label");

    this.urlEl.addEventListener("input", () => {
      // Auto add https:// if the url is missing scheme.
      if (
        this.urlEl.value.length > "https://".length &&
        !/^https?:\/\//.test(this.urlEl.value)
      ) {
        this.urlEl.value = "https://" + this.urlEl.value;
      }
    });

    // Create the url type selection.
    this.vCardType = this.querySelector("vcard-type");
    this.vCardType.createTypeSelection(this.vCardPropertyEntry, {
      createLabel: true,
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
  }

  fromVCardPropertyEntryToUI() {
    this.urlEl.value = this.vCardPropertyEntry.value;
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.urlEl.value;
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }
}

customElements.define("vcard-url", VCardURLComponent);
