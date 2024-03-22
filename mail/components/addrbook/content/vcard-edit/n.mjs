/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  VCardPropertyEntry: "resource:///modules/VCardUtils.sys.mjs",
});

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 N
 */
export class VCardNComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLElement} */
  prefixEl;
  /** @type {HTMLElement} */
  firstNameEl;
  /** @type {HTMLElement} */
  middleNameEl;
  /** @type {HTMLElement} */
  lastNameEl;
  /** @type {HTMLElement} */
  suffixEl;

  constructor() {
    super();
    const template = document.getElementById("template-vcard-edit-n");
    const clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.registerListComponents();
      this.fromVCardPropertyEntryToUI();
      this.sortAsOrder();
    }
  }

  static newVCardPropertyEntry() {
    return new lazy.VCardPropertyEntry("n", {}, "text", ["", "", "", "", ""]);
  }

  /**
   * Assigns the vCardPropertyEntry values to the individual
   * NListComponentText elements.
   *
   * @TODO sort-as param should be used for the order.
   * The use-case is that not every language has the order of
   * prefix, firstName, middleName, lastName, suffix.
   * Aswell that the user is able to change the sorting as he like
   * on a per contact base.
   */
  sortAsOrder() {
    if (!this.vCardPropertyEntry.params["sort-as"]) {
      // eslint-disable-next-line no-useless-return
      return;
    }
    /**
     * @TODO
     * The sort-as DOM Mutation
     */
  }

  fromVCardPropertyEntryToUI() {
    const prefixVal = this.vCardPropertyEntry.value[3] || "";
    const prefixInput = this.prefixEl.querySelector("input");
    prefixInput.value = prefixVal;
    if (prefixVal) {
      this.prefixEl.querySelector("button").hidden = true;
    } else {
      this.prefixEl.classList.add("hasButton");
      this.prefixEl.querySelector("label").hidden = true;
      prefixInput.hidden = true;
    }

    // First Name is always shown.
    this.firstNameEl.querySelector("input").value =
      this.vCardPropertyEntry.value[1] || "";

    const middleNameVal = this.vCardPropertyEntry.value[2] || "";
    const middleNameInput = this.middleNameEl.querySelector("input");
    middleNameInput.value = middleNameVal;
    if (middleNameVal) {
      this.middleNameEl.querySelector("button").hidden = true;
    } else {
      this.middleNameEl.classList.add("hasButton");
      this.middleNameEl.querySelector("label").hidden = true;
      middleNameInput.hidden = true;
    }

    // Last Name is always shown.
    this.lastNameEl.querySelector("input").value =
      this.vCardPropertyEntry.value[0] || "";

    const suffixVal = this.vCardPropertyEntry.value[4] || "";
    const suffixInput = this.suffixEl.querySelector("input");
    suffixInput.value = suffixVal;
    if (suffixVal) {
      this.suffixEl.querySelector("button").hidden = true;
    } else {
      this.suffixEl.classList.add("hasButton");
      this.suffixEl.querySelector("label").hidden = true;
      suffixInput.hidden = true;
    }
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = [
      this.lastNameEl.querySelector("input").value,
      this.firstNameEl.querySelector("input").value,
      this.middleNameEl.querySelector("input").value,
      this.prefixEl.querySelector("input").value,
      this.suffixEl.querySelector("input").value,
    ];
  }

  valueIsEmpty() {
    const noEmptyStrings = [
      this.prefixEl,
      this.firstNameEl,
      this.middleNameEl,
      this.lastNameEl,
      this.suffixEl,
    ].filter(node => {
      return node.querySelector("input").value !== "";
    });
    return noEmptyStrings.length === 0;
  }

  registerListComponents() {
    this.prefixEl = this.querySelector("#n-list-component-prefix");
    const prefixInput = this.prefixEl.querySelector("input");
    const prefixButton = this.prefixEl.querySelector("button");
    prefixButton.addEventListener("click", () => {
      this.prefixEl.querySelector("label").hidden = false;
      prefixInput.hidden = false;
      prefixButton.hidden = true;
      this.prefixEl.classList.remove("hasButton");
      prefixInput.focus();
    });

    this.firstNameEl = this.querySelector("#n-list-component-firstname");

    this.middleNameEl = this.querySelector("#n-list-component-middlename");
    const middleNameInput = this.middleNameEl.querySelector("input");
    const middleNameButton = this.middleNameEl.querySelector("button");
    middleNameButton.addEventListener("click", () => {
      this.middleNameEl.querySelector("label").hidden = false;
      middleNameInput.hidden = false;
      middleNameButton.hidden = true;
      this.middleNameEl.classList.remove("hasButton");
      middleNameInput.focus();
    });

    this.lastNameEl = this.querySelector("#n-list-component-lastname");

    this.suffixEl = this.querySelector("#n-list-component-suffix");
    const suffixInput = this.suffixEl.querySelector("input");
    const suffixButton = this.suffixEl.querySelector("button");
    suffixButton.addEventListener("click", () => {
      this.suffixEl.querySelector("label").hidden = false;
      suffixInput.hidden = false;
      suffixButton.hidden = true;
      this.suffixEl.classList.remove("hasButton");
      suffixInput.focus();
    });
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.prefixEl = null;
      this.firstNameEl = null;
      this.middleNameEl = null;
      this.lastNameEl = null;
      this.suffixEl = null;
    }
  }
}
customElements.define("vcard-n", VCardNComponent);
