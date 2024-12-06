/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "chrome://messenger/content/customizableshortcuts/shortcut-row.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Base container element that opens a modal overlay to list all currently
 * available customizable shortcuts.
 *
 * Template ID: #shortcutsContainerTemplate
 */
class ShortcutsContainer extends HTMLElement {
  /** @type {HTMLDialogElement} */
  modal;

  /** @type {HTMLElement} */
  main;

  /** @type {DOMLocalization} */
  l10n;

  /**
   * Track if the customizable shortcuts dialog is currently being working on
   * and some operations are ongoing.
   *
   * @type {boolean}
   */
  #isBusy = false;

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });
    // Load styles in the shadowRoot so we don't leak it.
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "chrome://messenger/skin/shortcuts-container.css";
    shadowRoot.appendChild(style);

    // Load the template.
    const template = document.getElementById("shortcutsContainerTemplate");
    const clonedNode = template.content.cloneNode(true);
    shadowRoot.appendChild(clonedNode);
    this.modal = shadowRoot.querySelector("dialog");
    this.main = shadowRoot.querySelector("main");

    // Connect fluent strings.
    this.l10n = new DOMLocalization([
      "messenger/customizableshortcuts/customizableShortcuts.ftl",
    ]);
    this.l10n.connectRoot(shadowRoot);

    // Add event listeners.
    shadowRoot.querySelector("button").addEventListener("click", this);
    this.modal.addEventListener("cancel", this);

    // TODO: Temporarily add a single row just to show placeholder data.
    const row = document.createElement("shortcut-row");
    this.main.appendChild(row);
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        this.close();
        break;
      case "cancel":
        this.onBeforeClosing(event);
        break;

      default:
        break;
    }
  }

  /**
   * Open the modal dialog if it's not already opened.
   */
  open() {
    if (this.modal.open) {
      return;
    }

    this.modal.showModal();
  }

  /**
   * Close the modal dialog.
   */
  close() {
    if (this.#isBusy) {
      return;
    }

    this.modal.close();
  }

  /**
   * Helper function to check if we can safely close the dialog without killing
   * any ongoing operations if the user presses the Escape key.
   */
  onBeforeClosing(event) {
    if (this.#isBusy) {
      event.preventDefault();
    }
  }
}
customElements.define("shortcuts-container", ShortcutsContainer);
