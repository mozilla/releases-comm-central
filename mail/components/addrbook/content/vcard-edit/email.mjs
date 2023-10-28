/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineModuleGetter(
  lazy,
  "VCardPropertyEntry",
  "resource:///modules/VCardUtils.jsm"
);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 EMAIL
 */
export class VCardEmailComponent extends HTMLTableRowElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLInputElement} */
  emailEl;
  /** @type {HTMLInputElement} */
  checkboxEl;

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("email", {}, "text", "");
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document.getElementById("template-vcard-edit-email");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);

    this.emailEl = this.querySelector('input[type="email"]');
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

    // Create the email type selection.
    this.vCardType = this.querySelector("vcard-type");
    this.vCardType.createTypeSelection(this.vCardPropertyEntry, {
      labelledBy: "addr-book-edit-email-type",
    });

    this.querySelector(".remove-property-button").addEventListener(
      "click",
      () => {
        this.dispatchEvent(
          new CustomEvent("vcard-remove-property", { bubbles: true })
        );
        this.remove();
        document.querySelector("vcard-edit").toggleDefaultEmailView();
      }
    );

    this.fromVCardPropertyEntryToUI();
  }

  fromVCardPropertyEntryToUI() {
    this.emailEl.value = this.vCardPropertyEntry.value;

    const pref = this.vCardPropertyEntry.params.pref;
    if (pref === "1") {
      this.checkboxEl.checked = true;
    }
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.emailEl.value;

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
