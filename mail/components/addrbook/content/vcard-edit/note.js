/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals VCardPropertyEntryView */

ChromeUtils.defineModuleGetter(
  this,
  "VCardPropertyEntry",
  "resource:///modules/VCardUtils.jsm"
);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 Note
 */
class VCardNoteComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLTextAreaElement} */
  textAreaEl;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("note", {}, "text", "");
  }

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-note");
    let clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.textAreaEl = this.querySelector("textarea");
      this.textAreaEl.addEventListener("input", () => {
        this.resizeTextAreaEl();
      });
      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.textAreaEl = null;
      this.vCardPropertyEntry = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.textAreaEl.value = this.vCardPropertyEntry.value;
    this.resizeTextAreaEl();
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.textAreaEl.value;
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }

  resizeTextAreaEl() {
    this.textAreaEl.rows = Math.min(
      15,
      Math.max(5, this.textAreaEl.value.split("\n").length)
    );
  }
}

customElements.define("vcard-note", VCardNoteComponent);
