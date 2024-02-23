/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  VCardPropertyEntry: "resource:///modules/VCardUtils.sys.mjs",
});

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 NICKNAME
 */
export class VCardNickNameComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;
  /** @type {HTMLElement} */
  nickNameEl;

  constructor() {
    super();
    const template = document.getElementById("template-vcard-edit-nickname");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("nickname", {}, "text", "");
  }

  connectedCallback() {
    if (this.isConnected) {
      this.nickNameEl = this.querySelector("#vCardNickName");
      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.nickNameEl = null;
      this.vCardPropertyEntry = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.nickNameEl.value = this.vCardPropertyEntry.value;
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.nickNameEl.value;
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }
}
customElements.define("vcard-nickname", VCardNickNameComponent);
