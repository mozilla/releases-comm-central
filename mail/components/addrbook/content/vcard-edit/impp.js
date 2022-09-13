/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals VCardPropertyEntryView, vCardIdGen */

ChromeUtils.defineModuleGetter(
  this,
  "VCardPropertyEntry",
  "resource:///modules/VCardUtils.jsm"
);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 IMPP
 */
class VCardIMPPComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLInputElement} */
  imppEl;
  /** @type {HTMLSelectElement} */
  protocolEl;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("impp", {}, "uri", "");
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    let template = document.getElementById("template-vcard-edit-impp");
    this.appendChild(template.content.cloneNode(true));

    this.imppEl = this.querySelector('input[name="impp"]');
    document.l10n
      .formatValue("vcard-impp-input-title")
      .then(t => (this.imppEl.title = t));

    this.protocolEl = this.querySelector('select[name="protocol"]');
    this.protocolEl.id = vCardIdGen.next().value;

    let protocolLabel = this.querySelector('label[for="protocol"]');
    protocolLabel.htmlFor = this.protocolEl.id;

    this.protocolEl.addEventListener("change", event => {
      let entered = this.imppEl.value.split(":", 1)[0]?.toLowerCase();
      if (entered) {
        this.protocolEl.value =
          [...this.protocolEl.options].find(o => o.value.startsWith(entered))
            ?.value || "";
      }
      this.imppEl.placeholder = this.protocolEl.value;
      this.imppEl.pattern = this.protocolEl.selectedOptions[0].dataset.pattern;
    });

    this.imppEl.id = vCardIdGen.next().value;
    let imppLabel = this.querySelector('label[for="impp"]');
    imppLabel.htmlFor = this.imppEl.id;
    document.l10n.setAttributes(imppLabel, "vcard-impp-label");
    this.imppEl.addEventListener("change", event => {
      this.protocolEl.dispatchEvent(new CustomEvent("change"));
    });

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
