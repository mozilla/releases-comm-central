/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Search input with customizable search button and placeholder.
 * Template ID: #searchBarTemplate (from search-bar.inc.xhtml)
 *
 * @tagname search-bar
 * @attribute {string} label - Search field label for accessibility tree.
 * @attribute {boolean} disabled - When present, disable the search field and
 *   button.
 * @attribute {number} maxlength - Max length of the input in the search field.
 * @slot placeholder - Content displayed as placeholder. When not provided, the
 *   value of the label attribute is shown as placeholder.
 * @slot clear-button - Content displayed on the clear button.
 * @slot search-button - Content displayed on the search button.
 * @fires {CustomEvent} search - Event when a search should be executed. detail
 *   holds the search term.
 * @fires {CustomEvent} autocomplete - Auto complete update. detail holds the
 *   current search term.
 * @cssproperty --search-bar-color - Text color of the search bar.
 * @cssproperty --search-bar-border-color - Border color of the search bar.
 * @cssproperty --search-bar-background - Background color of the search bar.
 * @cssproperty --search-bar-focus-background - Background color of the search
 *   bar when focused.
 */
export class SearchBar extends HTMLElement {
  static get observedAttributes() {
    return ["label", "disabled"];
  }

  /**
   * Reference to the input field in the form.
   *
   * @type {?HTMLInputElement}
   */
  #input = null;

  /**
   * Reference to the clear button in the form.
   *
   * @type {?HTMLButtonElement}
   */
  #clearButton = null;

  /**
   * Reference to the search button in the form.
   *
   * @type {?HTMLButtonElement}
   */
  #searchButton = null;

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
      this.reset();
    }
  };

  #onInput = () => {
    const autocompleteEvent = new CustomEvent("autocomplete", {
      detail: this.#input.value,
    });

    this.dispatchEvent(autocompleteEvent);
    this.#clearButton.hidden = !this.#input.value;
  };

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });

    const template = document
      .getElementById("searchBarTemplate")
      .content.cloneNode(true);
    this.#input = template.querySelector("input");
    this.#searchButton = template.querySelector("#search-button");
    this.#clearButton = template.querySelector("#clear-button");

    template.querySelector("form").addEventListener("submit", this, {
      passive: false,
    });
    template.querySelector("form").addEventListener("reset", this);

    this.#input.setAttribute("aria-label", this.getAttribute("label"));
    this.#input.setAttribute("maxlength", this.getAttribute("maxlength"));
    template.querySelector("slot[name=placeholder]").textContent =
      this.getAttribute("label");
    this.#input.addEventListener("input", this);
    this.#input.addEventListener("keyup", this);

    const styles = document.createElement("link");
    styles.setAttribute("rel", "stylesheet");
    styles.setAttribute(
      "href",
      "chrome://messenger/skin/shared/search-bar.css"
    );
    this.l10n = new DOMLocalization(["messenger/searchbar.ftl"]);
    this.l10n.connectRoot(shadowRoot);
    shadowRoot.append(styles, template);
  }

  attributeChangedCallback(attributeName, oldValue, newValue) {
    if (!this.#input) {
      return;
    }
    switch (attributeName) {
      case "label":
        this.#input.setAttribute("aria-label", newValue);
        this.shadowRoot.querySelector("slot[name=placeholder]").textContent =
          newValue;
        break;
      case "disabled": {
        const isDisabled = this.hasAttribute("disabled");
        this.#input.disabled = isDisabled;
        this.#searchButton.disabled = isDisabled;
      }
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "submit":
        this.#onSubmit(event);
        break;
      case "input":
        this.#onInput(event);
        break;
      case "reset":
        this.reset();
        this.#onInput();
        break;
      case "keyup":
        if (event.key === "Escape" && this.#input.value) {
          this.reset();
          this.#onInput();
          event.preventDefault();
          event.stopPropagation();
        }
        break;
    }
  }

  focus() {
    this.#input.focus();
    if (this.#input.value) {
      this.#input.select();
    }
  }

  /**
   * Reset the search bar to its empty state.
   */
  reset() {
    this.#input.value = "";
    this.#clearButton.hidden = true;
  }

  /**
   * Force the search term to a specific string, overriding what the user has
   * input. Will do nothing if the user is currently typing.
   *
   * @param {string} term
   * @returns {boolean} If the search value was updated.
   */
  overrideSearchTerm(term) {
    if (term === this.#input.value) {
      return true;
    }
    if (
      this === document.activeElement &&
      this.#input === this.shadowRoot.activeElement &&
      this.#input.value
    ) {
      return false;
    }
    this.#input.value = term;
    this.#onInput();
    return true;
  }
}
customElements.define("search-bar", SearchBar);
