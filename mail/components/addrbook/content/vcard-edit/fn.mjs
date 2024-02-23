/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  VCardPropertyEntry: "resource:///modules/VCardUtils.sys.mjs",
});

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 FN
 */
export class VCardFNComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLElement} */
  displayEl;
  /** @type {HTMLElement} */
  preferDisplayEl;

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("fn", {}, "text", "");
  }

  constructor() {
    super();
    const template = document.getElementById("template-vcard-edit-fn");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.displayEl = this.querySelector("#vCardDisplayName");
      this.displayEl.addEventListener(
        "input",
        () => {
          this.displayEl.isDirty = true;
        },
        { once: true }
      );
      this.preferDisplayEl = this.querySelector("#vCardPreferDisplayName");
      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.displayEl = null;
      this.vCardPropertyEntry = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.displayEl.value = this.vCardPropertyEntry.value;
    this.displayEl.isDirty = !!this.displayEl.value.trim();
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.displayEl.value;
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }
}
customElements.define("vcard-fn", VCardFNComponent);
