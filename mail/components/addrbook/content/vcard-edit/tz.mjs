/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});
ChromeUtils.defineModuleGetter(
  lazy,
  "VCardPropertyEntry",
  "resource:///modules/VCardUtils.jsm"
);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 URL
 */
export class VCardTZComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLSelectElement} */
  selectEl;

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("tz", {}, "text", "");
  }

  constructor() {
    super();
    const template = document.getElementById("template-vcard-edit-tz");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.selectEl = this.querySelector("select");
      for (const tzid of lazy.cal.timezoneService.timezoneIds) {
        const option = this.selectEl.appendChild(
          document.createElement("option")
        );
        option.value = tzid;
        option.textContent =
          lazy.cal.timezoneService.getTimezone(tzid).displayName;
      }

      this.querySelector(".remove-property-button").addEventListener(
        "click",
        () => {
          document.getElementById("vcard-add-tz").hidden = false;
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
      this.selectEl = null;
      this.vCardPropertyEntry = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.selectEl.value = this.vCardPropertyEntry.value;
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.selectEl.value;
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }
}

customElements.define("vcard-tz", VCardTZComponent);
