/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { UnifiedToolbarButton } from "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs";

const lazy = {};
ChromeUtils.defineModuleGetter(
  lazy,
  "FolderUtils",
  "resource:///modules/FolderUtils.jsm"
);

class FolderLocationButton extends UnifiedToolbarButton {
  /**
   * Image element displaying the icon on the button.
   *
   * @type {Image?}
   */
  #icon = null;

  /**
   * If we've added our event listeners, especially to the current about3pane.
   *
   * @type {boolean}
   */
  #addedListeners = false;

  connectedCallback() {
    super.connectedCallback();
    // We have to separately track if we added listeners, since
    // currentAbout3Pane might not be set when the button is initially created.
    if (this.#addedListeners) {
      return;
    }
    this.#icon = this.querySelector(".button-icon");
    this.#updateFromFolderPane();
    const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
    if (about3Pane) {
      this.#addedListeners = true;
      about3Pane.addEventListener("folderURIChanged", () => {
        this.#updateFromFolderPane();
      });
      const popup = document.getElementById(this.getAttribute("popup"));
      popup.addEventListener("command", event => {
        about3Pane.displayFolder(event.target._folder.folderURL);
      });
    }
  }

  /**
   * Update the label and icon of the button from the currently selected folder
   * in the local 3pane.
   */
  #updateFromFolderPane() {
    const { gFolder } =
      document.getElementById("tabmail").currentAbout3Pane ?? {};
    if (!gFolder) {
      return;
    }
    this.label.textContent = gFolder.name;
    this.#icon.style = `content: url(${lazy.FolderUtils.getFolderIcon(
      gFolder
    )});`;
  }
}
customElements.define("folder-location-button", FolderLocationButton, {
  extends: "button",
});
