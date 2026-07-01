/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Checkbox input and its label for account hub. You can listen to the normal
 * input events.
 *
 * Template ID: #accountHubInputTemplate (from #accountHubInputTemplate.inc.xhtml)
 *
 * @tagname account-hub-input
 * @attribute {string} id - ID used to create IDs for input and error message.
 *  Not observed.
 * @attribute {string} l10n-label-id - The fluent ID of the input label.
 * @attribute {string} classes - The classes to be applied to the input element.
 *  Not observed.
 * @attribute {string} checkbox-type - The type of checkbox, either "check"
 *  or "toggle". Not observed.
 */
class AccountHubCheckbox extends HTMLElement {
  static observedAttributes = ["l10n-label-id"];
  /**
   * The internal input element.
   *
   * @type {HTMLInputElement}
   */
  #input;

  /**
   * The internal label element.
   *
   * @type {HTMLLabelElement}
   */
  #label;

  /**
   * The checked value of the checkbox input.
   *
   * @type {string}
   */
  get checked() {
    return this.#input.checked;
  }

  set checked(isChecked) {
    this.#input.checked = isChecked;
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubCheckboxTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#input = this.querySelector("input");
    this.#label = this.querySelector("label");

    this.#input.id = `${this.id}Input`;
    this.#input.className = this.getAttribute("classes");
    this.#input.ariaLabelledByElements = [this.#label];

    this.#label.htmlFor = this.#input.id;

    const checkboxType = this.getAttribute("checkbox-type");
    const typeLabel = checkboxType == "toggle" ? "toggle" : "checkbox";
    const typeClass =
      checkboxType == "toggle" ? "toggle-checkbox" : "check-button";
    this.querySelector("div").className = `${typeLabel}-group`;
    this.#input.classList.add(typeClass);
    this.#label.className = `${typeLabel}-label`;

    this.attributeChangedCallback(
      "l10n-label-id",
      "",
      this.getAttribute("l10n-label-id")
    );
  }

  async attributeChangedCallback(attribute, _oldValue, newValue) {
    if (!this.hasConnected) {
      return;
    }

    document.l10n.setAttributes(this.#label, newValue);
  }
}

customElements.define("account-hub-checkbox", AccountHubCheckbox);
