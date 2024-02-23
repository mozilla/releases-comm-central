/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  VCardPropertyEntry: "resource:///modules/VCardUtils.sys.mjs",
});

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 Note
 */
export class VCardNoteComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLTextAreaElement} */
  textAreaEl;

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("note", {}, "text", "");
  }

  constructor() {
    super();
    const template = document.getElementById("template-vcard-edit-note");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.textAreaEl = this.querySelector("textarea");
      this.textAreaEl.addEventListener("input", () => {
        this.resizeTextAreaEl();
      });
      this.querySelector(".remove-property-button").addEventListener(
        "click",
        () => {
          document.getElementById("vcard-add-note").hidden = false;
          this.dispatchEvent(
            new CustomEvent("vcard-remove-property", { bubbles: true })
          );
          this.remove();
        }
      );
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
