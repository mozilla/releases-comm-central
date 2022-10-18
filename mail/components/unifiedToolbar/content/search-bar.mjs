/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Search input with customizable search button and placeholder.
 * Attributes:
 * - label: Search field label for accessibility tree
 * Slots in template (#search-bar-template):
 * - placeholder: Content displayed as placeholder
 * - button: Content displayed on the search button
 *
 * @emits search: Event when a search should be executed. detail holds the
 *  search term.
 * @emits autocomplte: Auto complete update. detail holds the current search
 *  term.
 */
class SearchBar extends HTMLElement {
  static get observedAttributes() {
    return ["label"];
  }

  /**
   * Reference to the input field in the form.
   *
   * @type {?HTMLInputElement}
   */
  #input = null;

  #onSubmit = event => {
    event.preventDefault();
    if (!this.#input.value) {
      return;
    }

    const searchEvent = new CustomEvent("search", {
      detail: this.#input.value,
      cancelable: true,
    });
    if (this.dispatchEvent(searchEvent)) {
      this.#input.value = "";
    }
  };

  #onInput = () => {
    const autocompleteEvent = new CustomEvent("autocomplete", {
      detail: this.#input.value,
    });
    this.dispatchEvent(autocompleteEvent);
  };

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });

    const template = document
      .getElementById("search-bar-template")
      .content.cloneNode(true);
    this.#input = template.querySelector("input");

    template.querySelector("form").addEventListener("submit", this.#onSubmit, {
      passive: false,
    });

    this.#input.setAttribute("aria-label", this.getAttribute("label"));
    this.#input.addEventListener("input", this.#onInput);

    const styles = document.createElement("link");
    styles.setAttribute("rel", "stylesheet");
    styles.setAttribute(
      "href",
      "chrome://messenger/skin/shared/search-bar.css"
    );
    shadowRoot.append(styles, template);
  }

  attributeChangedCallback(attributeName, oldValue, newValue) {
    if (attributeName === "label" && this.#input) {
      this.#input.setAttribute("aria-label", newValue);
    }
  }

  focus() {
    this.#input.focus();
  }
}
customElements.define("search-bar", SearchBar);
