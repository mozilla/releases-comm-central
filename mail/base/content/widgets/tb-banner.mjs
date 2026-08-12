/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const VARIANTS = new Set(["info", "success", "warning", "danger"]);

/**
 * Notification banner with customizable variants and optional description.
 * Handles expand/collapse functionality, and maintains keyboard accessibility.
 *
 * The component does not set a live-region role by default; consumers that need
 * dynamic announcements should set ARIA directly on the <tb-banner> tag,
 * for example `<tb-banner role="alert">`.
 *
 * Template ID: #tbBannerTemplate (from tb-banner.inc.xhtml)
 *
 * @tagname tb-banner
 *
 * @attribute {"info"|"success"|"warning"|"danger"} variant - Banner variant.
 *   Unsupported values are normalized to "info".
 * @attribute {boolean} expanded - When present, expands the optional
 *   description, if it's available.
 *
 * @slot title - Consumer-provided title content.
 * @slot description - Consumer-provided description content.
 *
 * @property {boolean} expanded - Whether the description is expanded. Setting
 *   `true` expands the banner only when description slot content is present;
 *   otherwise it has no effect. Setting `false` always collapses.
 * @property {"info"|"success"|"warning"|"danger"} variant - Current banner
 *   variant. Setting an unsupported value changes the `variant` attribute to
 *   `"info"`.
 */
export class Banner extends HTMLElement {
  /**
   * Disclosure label element showing the localized "Show more"/"Show less"
   * text. Hidden when there is no description.
   *
   * @type {?HTMLElement}
   */
  #actionText;

  /**
   * Native details disclosure container.
   *
   * @type {?HTMLDetailsElement}
   */
  #details;

  /**
   * Native summary disclosure control.
   *
   * @type {?HTMLElement}
   */
  #summary;

  /**
   * Container for optional description content.
   *
   * @type {?HTMLElement}
   */
  #description;

  /**
   * Slot for consumer-provided description content.
   *
   * @type {?HTMLSlotElement}
   */
  #descriptionSlot;

  /**
   * Slot for consumer-provided title content.
   *
   * @type {?HTMLSlotElement}
   */
  #titleSlot;

  static get observedAttributes() {
    return ["variant", "expanded"];
  }

  connectedCallback() {
    if (this.shadowRoot) {
      document.l10n.connectRoot(this.shadowRoot);
      return;
    }

    window.MozXULElement?.insertFTLIfNeeded("messenger/tb-banner.ftl");

    const template = document.getElementById("tbBannerTemplate");
    if (!template) {
      console.error("tb-banner requires #tbBannerTemplate to be present.");
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });
    const styles = document.createElement("link");
    styles.setAttribute("rel", "stylesheet");
    styles.setAttribute("href", "chrome://messenger/skin/shared/tb-banner.css");

    shadowRoot.append(styles, template.content.cloneNode(true));
    document.l10n.connectRoot(shadowRoot);
    this.#titleSlot = shadowRoot.querySelector('slot[name="title"]');
    this.#descriptionSlot = shadowRoot.querySelector(
      'slot[name="description"]'
    );
    this.#description = shadowRoot.getElementById("description");
    this.#actionText = shadowRoot.getElementById("actionText");
    this.#details = shadowRoot.querySelector("details");
    this.#summary = shadowRoot.querySelector("summary");

    this.#addEventListeners();

    // Normalize any invalid variant values
    this.#setVariant(this.getAttribute("variant"));

    this.#render();
  }

  disconnectedCallback() {
    if (this.shadowRoot) {
      document.l10n.disconnectRoot(this.shadowRoot);
    }
  }

  attributeChangedCallback(attributeName, oldValue, newValue) {
    if (oldValue === newValue || !this.shadowRoot) {
      return;
    }

    if (attributeName === "variant") {
      this.#setVariant(newValue);
    }

    this.#render();
  }

  #addEventListeners() {
    this.#titleSlot.addEventListener("slotchange", this);
    this.#descriptionSlot.addEventListener("slotchange", this);
    this.#details.addEventListener("toggle", this);
    this.#summary.addEventListener("click", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        if (!this.#hasDescription()) {
          event.preventDefault();
        }
        break;
      case "slotchange":
        this.#render();
        break;
      case "toggle":
        this.expanded = this.#details.open;
        break;
    }
  }

  /**
   * Applies supported banner options.
   *
   * Only `variant` and `expanded` are applied. Unknown option keys and `null` or
   * `undefined` values are ignored. Unsupported variants are normalized to
   * `"info"`.
   *
   * @param {{
   *   variant?: "info"|"success"|"warning"|"danger",
   *   expanded?: boolean,
   * }} [options={}] - Banner options to apply.
   */
  update(options = {}) {
    for (const [optionName, value] of Object.entries(options)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (optionName == "variant" || optionName == "expanded") {
        this[optionName] = value;
      }
    }
  }

  get expanded() {
    return this.hasAttribute("expanded");
  }

  set expanded(value) {
    this.toggleAttribute("expanded", Boolean(value) && this.#hasDescription());
  }

  get variant() {
    return this.getAttribute("variant");
  }

  set variant(value) {
    this.#setVariant(value);
  }

  /**
   * Updates the shadow DOM and host state to match the current slot content and
   * attributes.
   *
   * Marks the banner `invalid` (and warns) when no title slot content is
   * present, shows or hides the action text and description based on description
   * slot content, opens the native disclosure only when expanded with a
   * description, removes the summary from the tab order when there is no
   * description, and localizes the action text for the current disclosure state.
   */
  #render() {
    const hasTitle = this.#hasSlotContent(this.#titleSlot);
    this.toggleAttribute("invalid", !hasTitle);

    if (!hasTitle) {
      console.warn("tb-banner requires a title to render");
    }

    const hasDescription = this.#hasDescription();
    this.#actionText.hidden = !hasDescription;
    this.#description.hidden = !hasDescription;
    this.#details.open = hasDescription && this.expanded;

    if (hasDescription) {
      this.#summary.removeAttribute("tabindex");
    } else {
      this.#summary.tabIndex = -1;
      delete this.#actionText.dataset.l10nId;
      return;
    }

    document.l10n.setAttributes(
      this.#actionText,
      this.#details.open ? "tb-banner-show-less" : "tb-banner-show-more"
    );
  }

  /**
   * Normalizes and reflects the `variant` attribute on the host. Unsupported
   * values, `null`, and `undefined` all resolve to `"info"`.
   *
   * @param {?string} [variant="info"] - Requested variant.
   */
  #setVariant(variant = "info") {
    const normalizedVariant = VARIANTS.has(variant) ? variant : "info";
    this.setAttribute("variant", normalizedVariant);
  }

  /**
   * Check whether a slot has consumer-provided readable content.
   *
   * @param {?HTMLSlotElement} slot - Slot to inspect.
   * @returns {boolean} `true` when the slot has readable assigned content,
   *   otherwise `false` (including when no slot is available).
   */
  #hasSlotContent(slot) {
    return Boolean(
      slot
        ?.assignedNodes()
        .some(
          node =>
            node.nodeType == Node.ELEMENT_NODE ||
            (node.nodeType == Node.TEXT_NODE && node.textContent.trim() != "")
        )
    );
  }

  /**
   * Check whether the description slot has consumer-provided readable content.
   *
   * @returns {boolean} Whether the description slot has readable assigned content.
   */
  #hasDescription() {
    return this.#hasSlotContent(this.#descriptionSlot);
  }
}

customElements.define("tb-banner", Banner);
