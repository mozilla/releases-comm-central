/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { UnifiedToolbarButton } from "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs";

/**
 * Unified toolbar button handling the events for the create address book button
 * popup.
 *
 * @attribute {string} popup - Element ID of the popup to show when the button
 *   is clicked. Must have menuitems with a data-command attribute with the
 *   command to execute when the item is clicked.
 */
class CreateAddressBookButton extends UnifiedToolbarButton {
  /**
   * If we've added our event listeners.
   *
   * @type {boolean}
   */
  #addedListeners = false;

  connectedCallback() {
    super.connectedCallback();
    if (this.#addedListeners) {
      return;
    }
    this.#addedListeners = true;
    const popup = document.getElementById(this.getAttribute("popup"));
    popup.addEventListener("command", this);
    window.addEventListener("commandstate", this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#addedListeners) {
      const popup = document.getElementById(this.getAttribute("popup"));
      popup.removeEventListener("command", this);
      window.removeEventListener("commandstate", this);
      this.#addedListeners = false;
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "command":
        window.goDoCommand(event.target.dataset.command);
        break;
      case "commandstate": {
        const popup = document.getElementById(this.getAttribute("popup"));
        const menuitem = popup.querySelector(
          `menuitem[data-command="${event.detail.command}"]`
        );
        if (menuitem) {
          menuitem.disabled = !event.detail.enabled;
          this.disabled = !popup.querySelector(
            'menuitem:not([disabled="true"])'
          );
          break;
        }
        super.handleEvent(event);
        break;
      }
      default:
        super.handleEvent(event);
    }
  }
}
customElements.define("create-address-book-button", CreateAddressBookButton, {
  extends: "button",
});
