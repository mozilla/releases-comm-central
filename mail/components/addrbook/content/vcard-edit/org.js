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
 * @see RFC6350 TITLE
 */
class VCardTitleComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLInputElement} */
  titleEl;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("title", {}, "text", "");
  }

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-title");
    let clonedTemplate = template.content.cloneNode(true);
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
    let labelInputId = vCardIdGen.next().value;
    inputEl.id = labelInputId;
    labelEl.htmlFor = labelInputId;
  }
}
customElements.define("vcard-title", VCardTitleComponent);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 ROLE
 */
class VCardRoleComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLInputElement} */
  roleEl;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("role", {}, "text", "");
  }

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-role");
    let clonedTemplate = template.content.cloneNode(true);
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
    let labelInputId = vCardIdGen.next().value;
    inputEl.id = labelInputId;
    labelEl.htmlFor = labelInputId;
  }
}
customElements.define("vcard-role", VCardRoleComponent);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 ORG
 */
class VCardOrgComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLInputElement} */
  orgEl;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("org", {}, "text", ["", ""]);
  }

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-org");
    let clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.orgEl = this.querySelector('textarea[name="org"]');
      this.assignIds(this.orgEl, this.querySelector('label[for="org"]'));
      this.orgEl.addEventListener("input", () => {
        this.resizeOrgEl();
        this.orgEl.scrollIntoView();
      });

      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.vCardPropertyEntry = null;
      this.orgEl = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    let values = this.vCardPropertyEntry.value;
    if (!values) {
      this.orgEl.value = "";
      return;
    }
    if (!Array.isArray(values)) {
      values = [values];
    }

    this.orgEl.value = values
      .filter(Boolean)
      .reverse()
      .join("\n");
    this.resizeOrgEl();
  }

  fromUIToVCardPropertyEntry() {
    let orgValue = this.orgEl.value.trim();
    if (orgValue.includes("\n")) {
      orgValue = orgValue.replaceAll("\r", "");
      this.vCardPropertyEntry.value = orgValue
        .split("\n")
        .filter(Boolean)
        .reverse();
    } else {
      this.vCardPropertyEntry.value = orgValue;
    }
  }

  valueIsEmpty() {
    return (
      !this.vCardPropertyEntry.value ||
      (Array.isArray(this.vCardPropertyEntry.value) &&
        this.vCardPropertyEntry.value.every(v => v === ""))
    );
  }

  assignIds(inputEl, labelEl) {
    let labelInputId = vCardIdGen.next().value;
    inputEl.id = labelInputId;
    labelEl.htmlFor = labelInputId;
  }

  resizeOrgEl() {
    this.orgEl.rows = Math.max(1, this.orgEl.value.split("\n").length);
  }
}
customElements.define("vcard-org", VCardOrgComponent);
