/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Reusable row element to show the usable shortcuts.
 *
 * Template ID: #shortcutRowTemplate
 */
export default class ShortcutRow extends HTMLElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    this.hasConnected = true;

    // Load the template.
    const template = document.getElementById("shortcutRowTemplate");
    const clonedNode = template.content.cloneNode(true);
    this.appendChild(clonedNode);
  }
}
customElements.define("shortcut-row", ShortcutRow);
