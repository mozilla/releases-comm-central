/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const optionalAttributes = [
  "name",
  "placeholder",
  "required",
  "min",
  "max",
  "pattern",
];

/**
 * Input, label and error message for account hub. You can listen to the normal
 * input events.
 *
 * Template ID: #accountHubInputTemplate (from
 * #accountHubInputTemplate.inc.xhtml)
 *
 * @tagname account-hub-input
 * @attribute {string} id - ID used to create IDs for input and error message.
 *   Not observed.
 * @attribute {string} l10n-label-id - The fluent ID of the input label.
 * @attribute {string} l10n-error-id - The fluent ID of the error message.
 * @attribute {string} l10n-help-text-id - The fluent ID for the help text. Can
 *   be omitted to not show any help text. Not observed.
 * @attribute {string} help-text-class - Extra class to apply to visible help
 *   text. Not observed.
 * @attribute {string} type - The type of input (text, number, etc.). Not
 *   observed.
 * @attribute {string} classes - The classes to be applied to the input element.
 *   Not observed.
 * @attribute {string} name - The name of the input in the form. Not observed.
 * @attribute {string} placeholder - The placeholder to show in the input. Not
 *   observed.
 * @attribute {boolean} required - If the input is required. Not observed.
 * @attribute {RegExp} pattern - A regular expression the form control's value should match. Not observed.
 * @attribute {number} min - Minimum value if the input is of type number. Not
 *   observed.
 * @attribute {number} max - Maximum value if the input is of type number. Not
 *   observed.
 * @attribute {string} aria-live - The politeness setting of the input. Not
 *   observed.
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
   * Help text element for additional input context.
   *
   * @type {HTMLElement}
   */
  #helpText;

  /**
   * The default fluent ID for the help text.
   *
   * @type {string}
   */
  #staticHelpTextId = "";

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

  /**
   * Whether the internal input is required.
   *
   * @type {boolean}
   */
  get required() {
    return this.#input?.required ?? this.hasAttribute("required");
  }

  set required(isRequired) {
    this.toggleAttribute("required", isRequired);
    if (this.#input) {
      this.#input.required = isRequired;
    }
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
    this.#helpText = this.querySelector(".account-hub-form-small-comment");

    this.#input.id = `${this.id}Input`;
    this.#input.type = this.getAttribute("type");
    this.#input.className = this.getAttribute("classes");
    this.#input.ariaLabelledByElements = [this.#label];

    this.#label.htmlFor = this.#input.id;
    this.#error.id = `${this.#input.id}ErrorMessage`;
    this.#helpText.id = `${this.#input.id}HelpText`;

    const helpTextId = this.getAttribute("l10n-help-text-id");
    if (helpTextId) {
      this.#staticHelpTextId = helpTextId;
      this.#showHelpText(helpTextId);
    }

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
        document.l10n.setAttributes(this.#label, newValue);
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
      this.#syncDescription();
      this.#error.removeAttribute("role");
      return;
    }

    this.#input.setCustomValidity(this.#label.textContent || error);
    this.#input.ariaInvalid = "true";
    this.#input.setAttribute("aria-describedby", this.#error.id);
    this.#error.role = "alert";
  }

  /**
   * Set or replace the visible help text for the input.
   *
   * @param {string} l10nId - Fluent ID for the help text.
   * @param {object} [l10nArgs] - Fluent args for the help text.
   */
  setHelpText(l10nId, l10nArgs) {
    this.#showHelpText(l10nId, l10nArgs);
  }

  /**
   * Clear custom help text and restore the default help text if one exists.
   */
  clearHelpText() {
    if (this.#staticHelpTextId) {
      this.#showHelpText(this.#staticHelpTextId);
      return;
    }

    this.#helpText.hidden = true;
    this.#helpText.className = "account-hub-form-small-comment";
    this.#helpText.textContent = "";
    this.#helpText.removeAttribute("data-l10n-id");
    this.#helpText.removeAttribute("data-l10n-args");
    this.#syncDescription();
  }

  /**
   * Show the help text.
   *
   * @param {string} l10nId - Fluent ID for the help text.
   * @param {object} [l10nArgs] - Fluent args for the help text.
   */
  #showHelpText(l10nId, l10nArgs) {
    this.#helpText.hidden = false;
    this.#helpText.className = "account-hub-form-small-comment";
    const className = this.getAttribute("help-text-class");
    if (className) {
      this.#helpText.classList.add(className);
    }
    document.l10n.setAttributes(this.#helpText, l10nId, l10nArgs);
    this.#syncDescription();
  }

  /**
   * Keep the input's accessible description aligned with its visual state.
   */
  #syncDescription() {
    if (this.#input.getAttribute("aria-invalid") == "true") {
      this.#input.setAttribute("aria-describedby", this.#error.id);
      return;
    }

    if (!this.#helpText.hidden) {
      this.#input.setAttribute("aria-describedby", this.#helpText.id);
      return;
    }

    this.#input.ariaDescribedByElements = [];
  }

  /**
   * Focuses the internal input element.
   *
   * @param {FocusOptions} [options] - Options for focusing the input.
   */
  focus(options) {
    this.#input?.focus(options);
  }
}

customElements.define("account-hub-input", AccountHubInput);
