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
 * @see RFC6350 TITLE
 */
export class VCardTitleComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLInputElement} */
  titleEl;

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("title", {}, "text", "");
  }

  constructor() {
    super();
    const template = document.getElementById("template-vcard-edit-title");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.titleEl = this.querySelector('input[name="title"]');
      this.assignIds(this.titleEl, this.querySelector('label[for="title"]'));

      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.vCardPropertyEntry = null;
      this.titleEl = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.titleEl.value = this.vCardPropertyEntry.value || "";
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.titleEl.value;
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }

  assignIds(inputEl, labelEl) {
    const labelInputId = vCardIdGen.next().value;
    inputEl.id = labelInputId;
    labelEl.htmlFor = labelInputId;
  }
}
customElements.define("vcard-title", VCardTitleComponent);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 ROLE
 */
export class VCardRoleComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLInputElement} */
  roleEl;

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("role", {}, "text", "");
  }

  constructor() {
    super();
    const template = document.getElementById("template-vcard-edit-role");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.roleEl = this.querySelector('input[name="role"]');
      this.assignIds(this.roleEl, this.querySelector('label[for="role"]'));

      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.vCardPropertyEntry = null;
      this.roleEl = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.roleEl.value = this.vCardPropertyEntry.value || "";
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.roleEl.value;
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }

  assignIds(inputEl, labelEl) {
    const labelInputId = vCardIdGen.next().value;
    inputEl.id = labelInputId;
    labelEl.htmlFor = labelInputId;
  }
}
customElements.define("vcard-role", VCardRoleComponent);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 ORG
 */
export class VCardOrgComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;
  /** @type {HTMLInputElement} */
  orgEl;
  /** @type {HTMLInputElement} */
  unitEl;

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("org", {}, "text", ["", ""]);
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document.getElementById("template-vcard-edit-org");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);

    this.orgEl = this.querySelector('input[name="org"]');
    this.orgEl.id = vCardIdGen.next().value;
    this.querySelector('label[for="org"]').htmlFor = this.orgEl.id;

    this.unitEl = this.querySelector('input[name="orgUnit"]');
    this.unitEl.id = vCardIdGen.next().value;
    this.querySelector('label[for="orgUnit"]').htmlFor = this.unitEl.id;

    this.fromVCardPropertyEntryToUI();
  }

  fromVCardPropertyEntryToUI() {
    let values = this.vCardPropertyEntry.value;
    if (!values) {
      this.orgEl.value = "";
      this.unitEl.value = "";
      return;
    }
    if (!Array.isArray(values)) {
      values = [values];
    }
    this.orgEl.value = values.shift() || "";
    // In case data had more levels of units, just pull them together.
    this.unitEl.value = values.join(", ");
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = [this.orgEl.value.trim()];
    if (this.unitEl.value.trim()) {
      this.vCardPropertyEntry.value.push(this.unitEl.value.trim());
    }
  }

  valueIsEmpty() {
    return (
      !this.vCardPropertyEntry.value ||
      (Array.isArray(this.vCardPropertyEntry.value) &&
        this.vCardPropertyEntry.value.every(v => v === ""))
    );
  }
}
customElements.define("vcard-org", VCardOrgComponent);
