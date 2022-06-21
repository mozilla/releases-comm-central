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
 * @see RFC6350 EMAIL
 */
class VCardEmailComponent extends HTMLTableRowElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLSelectElement} */
  selectEl;
  /** @type {HTMLInputElement} */
  emailEl;
  /** @type {HTMLInputElement} */
  checkboxEl;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("email", {}, "text", "");
  }

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-email");
    let clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.emailEl = this.querySelector('input[type="email"]');
      this.selectEl = this.querySelector("select");
      this.checkboxEl = this.querySelector('input[type="checkbox"]');

      this.emailEl.addEventListener("input", () => {
        // Dispatch the event only if this field is the currently selected
        // default/preferred email address.
        if (this.checkboxEl.checked) {
          this.dispatchEvent(VCardEmailComponent.EmailEvent());
        }
      });

      // Uncheck the checkbox of other VCardEmailComponents if this one is
      // checked.
      this.checkboxEl.addEventListener("change", event => {
        if (event.target.checked === true) {
          this.dispatchEvent(VCardEmailComponent.CheckboxEvent());
        }
      });
      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.checkboxEl = null;
      this.emailEl = null;
      this.selectEl = null;
      this.vCardPropertyEntry = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.emailEl.value = this.vCardPropertyEntry.value;
    /**
     * @TODO
     * Create an element for type selection of home, work, ...
     */
    let paramsType = this.vCardPropertyEntry.params.type;
    if (paramsType && !Array.isArray(paramsType)) {
      this.selectEl.value = this.vCardPropertyEntry.params.type;
    }
    let pref = this.vCardPropertyEntry.params.pref;
    if (pref === "1") {
      this.checkboxEl.checked = true;
    }
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.emailEl.value;
    /**
     * @TODO
     * Create an element for type selection of home, work, ...
     */
    let paramsType = this.selectEl.value;
    if (paramsType && paramsType !== "") {
      this.vCardPropertyEntry.params.type = this.selectEl.value;
    } else if (paramsType && !Array.isArray(paramsType)) {
      /**
       * @TODO params.type is string | Array<string> | falsy.
       * Right now the case is only handled for string.
       */
      delete this.vCardPropertyEntry.params.type;
    }

    if (this.checkboxEl.checked) {
      this.vCardPropertyEntry.params.pref = "1";
    } else if (
      this.vCardPropertyEntry.params.pref &&
      this.vCardPropertyEntry.params.pref === "1"
    ) {
      // Only delete the pref if a pref of 1 is set and the checkbox is not
      // checked. The pref mechanic is not fully supported yet. Leave all other
      // prefs untouched.
      delete this.vCardPropertyEntry.params.pref;
    }
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }

  /**
   * This event is fired when the checkbox is checked and we need to uncheck the
   * other checkboxes from each VCardEmailComponent.
   * FIXME: This should be a radio button part of radiogroup.
   *
   * @returns {CustomEvent}
   */
  static CheckboxEvent() {
    return new CustomEvent("vcard-email-default-checkbox", {
      detail: {},
      bubbles: true,
    });
  }

  /**
   * This event is fired when the value of an email input field is changed. The
   * event is fired only if the current email si set as default/preferred.
   *
   * @returns {CustomEvent}
   */
  static EmailEvent() {
    return new CustomEvent("vcard-email-default-changed", {
      detail: {},
      bubbles: true,
    });
  }
}

customElements.define("vcard-email", VCardEmailComponent, { extends: "tr" });
