/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Forms a radio group with all other account-hub-radio-card-large in the same
 * form. If all of them are contained in one element, that element should be a
 * radiogroup. If no radio card starts out checked, the first card checks
 * itself.
 *
 * Template ID: #accountHubRadioCardLargeTemplate
 *
 * @tagname account-hub-radio-card-large
 * @slot title
 * @slot tag
 * @slot description
 * @attribute {string} value - The value of this radio checkbox.
 * @attribute {string} aria-checked - Set this to "true" to initialize in a
 *   checked state. After the element is attached, use the checked property to
 *   manipulate the state.
 */
class AccountHubRadioCardLarge extends HTMLElement {
  static formAssociated = true;

  /**
   * @type {ElementInternals}
   */
  #internals;

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    this.role = "radio";
    this.#internals.setFormValue(this.getAttribute("value"));

    const checkedCardExists = Boolean(
      this.#internals.form.querySelector(
        `${this.localName}[aria-checked="true"]`
      )
    );
    const isFirstCard = this.matches(":first-of-type");

    if (this.ariaChecked) {
      this.tabIndex = 0;
    } else if (!checkedCardExists && isFirstCard) {
      this.checked = true;
    } else {
      // Can't use checked property here, since it will see false as identical
      // to null.
      this.tabIndex = -1;
      this.ariaChecked = "false";
    }

    const shadowRoot = this.attachShadow({ mode: "open" });
    const template = document
      .getElementById("accountHubRadioCardLargeTemplate")
      .content.cloneNode(true);
    const style = document.createElement("link");
    style.href = "chrome://messenger/skin/accountHubRadioCardLarge.css";
    style.rel = "stylesheet";
    shadowRoot.append(style, template);

    this.addEventListener("keydown", this);
    this.addEventListener("click", this);
  }

  handleEvent(event) {
    if (!this.checked && (event.type == "click" || event.key == " ")) {
      this.checked = true;
      return;
    }
    if (event.type != "keydown") {
      return;
    }
    // Focus control, since we manage tabindex.
    const rightIsForward = document.dir == "ltr";
    const forwardKey = rightIsForward ? "ArrowRight" : "ArrowLeft";
    const backwardKey = rightIsForward ? "ArrowLeft" : "ArrowRight";
    const allRadios = Array.from(
      this.#internals.form.querySelectorAll(this.localName)
    );
    const thisIndex = allRadios.indexOf(this);
    if (event.key == forwardKey || event.key == "ArrowDown") {
      const next = allRadios.at((thisIndex + 1) % allRadios.length);
      next.focus();
      next.checked = true;
    } else if (event.key == backwardKey || event.key == "ArrowUp") {
      const previous = allRadios.at(thisIndex - 1);
      previous.focus();
      previous.checked = true;
    }
  }

  /**
   * @type {boolean}
   */
  get checked() {
    return this.ariaChecked == "true";
  }

  set checked(value) {
    const boolValue = Boolean(value);
    if (boolValue == this.checked) {
      return;
    }
    if (boolValue) {
      // Ensure all other radios are unchecked.
      const checkedElements = this.#internals.form.querySelectorAll(
        `${this.localName}[aria-checked="true"]`
      );
      for (const radio of checkedElements) {
        radio.checked = false;
      }
    }
    this.ariaChecked = boolValue.toString();
    this.tabIndex = boolValue ? 0 : -1;
  }

  /**
   * @type {string}
   * @readonly
   */
  get value() {
    return this.getAttribute("value");
  }
}
customElements.define("account-hub-radio-card-large", AccountHubRadioCardLarge);
