/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const optionalAttributes = ["name", "placeholder", "required", "min", "max"];

/**
 * Input, label and error message for account hub. You can listen to the normal
 * input events.
 *
 * Template ID: #accountHubInputTemplate (from #accountHubInputTemplate.inc.xhtml)
 *
 * @tagname account-hub-input
 * @attribute {string} id - ID used to create IDs for input and error message. Not observed.
 * @attribute {string} l10n-label-id - The fluent ID of the input label.
 * @attribute {string} l10n-error-id - The fluent ID of the error message.
 * @attribute {string} type - The type of input (text, number, etc.). Not observed.
 * @attribute {string} classes - The classes to be applied to the input element. Not observed.
 * @attribute {string} name - The name of the input in the form. Not observed.
 * @attribute {string} placeholder - The placeholder to show in the input. Not observed.
 * @attribute {boolean} required - If the input is required. Not observed.
 * @attribute {number} min - Minimum value if the input is of type number. Not observed.
 * @attribute {number} max - Maximum value if the input is of type number. Not observed.
 */
class AccountHubInput extends HTMLElement {
  static observedAttributes = ["l10n-label-id", "l10n-error-id"];
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
   * Error message element for invalid state.
   *
   * @type {HTMLElement}
   */
  #error;

  /**
   * The value of the input element.
   *
   * @type {string}
   */
  get value() {
    return this.#input.value;
  }

  set value(newValue) {
    this.#input.value = newValue;
  }

  /**
   * The number value of the input element.
   *
   * @type {number}
   * @readonly
   */
  get valueAsNumber() {
    return this.#input.valueAsNumber;
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubInputTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#input = this.querySelector("input");
    this.#label = this.querySelector("label");
    this.#error = this.querySelector("span");

    this.#input.id = `${this.id}Input`;
    this.#input.type = this.getAttribute("type");
    this.#input.className = this.getAttribute("classes");

    this.#label.htmlFor = this.#input.id;
    this.#error.id = `${this.#input.id}ErrorMessage`;

    for (const attribute of optionalAttributes) {
      const attributeValue = this.getAttribute(attribute);

      if (attributeValue) {
        this.#input.setAttribute(attribute, attributeValue);
      }
    }

    this.attributeChangedCallback(
      "l10n-label-id",
      "",
      this.getAttribute("l10n-label-id")
    );
    this.attributeChangedCallback(
      "l10n-error-id",
      "",
      this.getAttribute("l10n-error-id")
    );
  }

  async attributeChangedCallback(attribute, _oldValue, newValue) {
    if (!this.hasConnected) {
      return;
    }

    switch (attribute) {
      case "l10n-label-id": {
        const labelText = await document.l10n.formatValue(newValue);
        document.l10n.setAttributes(this.#label, newValue);
        this.#input.ariaLabel = labelText;
        break;
      }
      case "l10n-error-id": {
        if (newValue) {
          document.l10n.setAttributes(this.#error, newValue);
        }
        break;
      }
    }
  }

  /**
   * Sets the error state of the input.
   *
   * @param {string} error - Error message that determines error state. If
   *  empty, remove error state from input.
   */
  setErrorState(error) {
    if (!error?.length) {
      this.#input.setCustomValidity("");
      this.#input.ariaInvalid = "false";
      this.#input.ariaDescribedByElements = [];
      this.#error.role = null;
      return;
    }

    this.#input.setCustomValidity(this.#label.textContent || error);
    this.#input.ariaInvalid = "true";
    this.#input.ariaDescribedByElements = [this.#error];
    this.#error.role = "alert";
  }
}

customElements.define("account-hub-input", AccountHubInput);
