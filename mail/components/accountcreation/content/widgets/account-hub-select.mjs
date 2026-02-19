/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const attrs = ["id", "disabled", "l10n-label-id", "warning", "l10n-error-id"];

const { openLinkExternally } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);

/**
 * Main action button for in app notifications.
 *
 * @tagname account-hub-select
 */
class AccountHubSelect extends HTMLElement {
  static observedAttributes = attrs;

  /**
   * The internal select element.
   *
   * @type {HTMLSelectElement}
   */
  select;

  /**
   * The internal label element.
   *
   * @type {HTMLLabelElement}
   */
  label;

  /**
   * The slot containing the options for the select
   *
   * @type {HTMLSlotElement}
   */
  #slot;

  /**
   * Error message element for invalid state.
   *
   * @type {HTMLElement}
   */
  #error;

  get value() {
    return this.select.value;
  }

  set value(newValue) {
    this.select.value = newValue;
  }

  connectedCallback() {
    const detached = !this.shadowRoot;
    let template;
    let styles;
    let shadowRoot;
    if (detached) {
      template = document
        .getElementById("accountHubSelectTemplate")
        .content.cloneNode(true);
      shadowRoot = this.attachShadow({ mode: "open" });
      styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = "chrome://messenger/skin/accountHubSelect.css";
    }

    window.MozXULElement?.insertFTLIfNeeded(
      "messenger/accountcreation/accountHub.ftl"
    );

    document.l10n.connectRoot(this.shadowRoot);

    if (detached) {
      shadowRoot.append(styles, template);
    }

    this.select = this.shadowRoot.querySelector("select");
    this.label = this.shadowRoot.querySelector("label");
    this.#slot = this.shadowRoot.querySelector("slot");
    this.#error = this.shadowRoot.querySelector("#securityWarning");

    this.#slot.addEventListener("slotchange", this);
    this.select.addEventListener("change", this);
    this.#error.querySelector("a").addEventListener("click", this);
    this.#updateOptions(); // Initial update

    for (const attr of attrs) {
      this.attributeChangedCallback(attr, "", this.getAttribute(attr));
    }
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
    this.#slot.removeEventListener("slotchange", this);
    this.select.removeEventListener("change", this);
    this.#error.querySelector("a").removeEventListener("click", this);
  }

  #updateOptions() {
    const options = this.#slot.assignedElements();
    this.select.innerHTML = "";

    for (const option of options) {
      const element = option.cloneNode(true);
      element.part = "option";
      if (element.id) {
        element.part.add(element.id);
      }
      this.select.append(element);
    }
  }

  async attributeChangedCallback(attr, _oldValue, newValue) {
    if (!this.shadowRoot) {
      return;
    }

    switch (attr) {
      case "id":
        this.select.id = `${newValue}Select`;
        this.label.setAttribute("for", `${newValue}Select`);
        break;
      case "l10n-label-id": {
        const labelText = await document.l10n.formatValue(newValue);
        this.label.innerText = labelText;
        this.select.setAttribute("aria-label", labelText);
        break;
      }
      case "disabled":
        this.select.disabled = newValue;
        break;
      case "warning": {
        const isWarning = this.hasAttribute(attr);
        this.select.classList.toggle("warning", isWarning);
        this.select.setAttribute("aria-invalid", isWarning);
        if (isWarning) {
          this.select.setAttribute("aria-describedby", "securityWarning");
          this.#error.setAttribute("role", "alert");
        } else {
          this.select.removeAttribute("aria-describedby");
          this.#error.removeAttribute("role");
        }
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

  handleEvent(event) {
    switch (event.type) {
      case "slotchange":
        this.#updateOptions();
        break;
      case "change": {
        const customChangeEvent = new CustomEvent("change", {
          ...event,
          bubbles: true,
          composed: true,
        });

        for (const option of this.select.selectedOptions) {
          option.state = "selected";
        }

        // Dispatch the event from the custom element itself (the host)
        this.dispatchEvent(customChangeEvent);
        break;
      }
      case "click":
        openLinkExternally(
          Services.urlFormatter.formatURLPref("app.support.baseURL"),
          { addToHistory: false }
        );
        break;
    }
  }
}

customElements.define("account-hub-select", AccountHubSelect);
