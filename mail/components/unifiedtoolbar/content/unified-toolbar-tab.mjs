/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Template ID: #unifiedToolbarTabTemplate
 *
 * @tagname unified-toolbar-tab
 * @attribute {boolean} selected If the tab is active.
 * @attribute {string} aria-controls The ID of the tab pane this controls.
 * @slot The default slot contains the tab label.
 * @part icon - The tab icon.
 * @fires tabswitch When the active tab is changed.
 */
class UnifiedToolbarTab extends HTMLElement {
  /**
   * @type {?HTMLButtonElement}
   */
  #tab = null;

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }
    this.setAttribute("role", "presentation");
    const shadowRoot = this.attachShadow({ mode: "open" });

    const template = document
      .getElementById("unifiedToolbarTabTemplate")
      .content.cloneNode(true);
    this.#tab = template.querySelector("button");
    this.#tab.tabIndex = this.hasAttribute("selected") ? 0 : -1;
    if (this.hasAttribute("selected")) {
      this.#tab.setAttribute("aria-selected", "true");
    }
    this.#tab.setAttribute("aria-controls", this.getAttribute("aria-controls"));
    this.removeAttribute("aria-controls");

    const styles = document.createElement("link");
    styles.setAttribute("rel", "stylesheet");
    styles.setAttribute(
      "href",
      "chrome://messenger/skin/shared/unifiedToolbarTab.css"
    );

    shadowRoot.append(styles, template);

    this.#tab.addEventListener("click", () => {
      this.select();
    });
    this.#tab.addEventListener("keydown", this.#handleKey);
  }

  #handleKey = event => {
    const rightIsForward = document.dir === "ltr";
    const rightSibling =
      (rightIsForward ? "next" : "previous") + "ElementSibling";
    const leftSibling =
      (rightIsForward ? "previous" : "next") + "ElementSibling";
    switch (event.key) {
      case "ArrowLeft":
        this[leftSibling]?.focus();
        break;
      case "ArrowRight":
        this[rightSibling]?.focus();
        break;
      case "Home":
        this.parentNode.firstElementChild?.focus();
        break;
      case "End":
        this.parentNode.lastElementChild?.focus();
        break;
      default:
        return;
    }

    event.stopPropagation();
    event.preventDefault();
  };

  #toggleTabPane(visible) {
    this.pane.hidden = !visible;
  }

  /**
   * Select this tab. Deselects the previously selected tab and shows the tab
   * pane for this tab.
   */
  select() {
    this.parentElement
      .querySelector("unified-toolbar-tab[selected]")
      ?.unselect();
    this.#tab.setAttribute("aria-selected", "true");
    this.#tab.tabIndex = 0;
    this.setAttribute("selected", true);
    this.#toggleTabPane(true);
    const tabSwitchEvent = new Event("tabswitch", {
      bubbles: true,
    });
    this.dispatchEvent(tabSwitchEvent);
  }

  /**
   * Remove the selection for this tab and hide the associated tab pane.
   */
  unselect() {
    this.#tab.removeAttribute("aria-selected");
    this.#tab.tabIndex = -1;
    this.removeAttribute("selected");
    this.#toggleTabPane(false);
  }

  focus() {
    this.#tab.focus();
  }

  get pane() {
    return document.getElementById(this.#tab.getAttribute("aria-controls"));
  }
}
customElements.define("unified-toolbar-tab", UnifiedToolbarTab);
