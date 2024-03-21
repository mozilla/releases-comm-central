/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailTabButton } from "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FolderUtils: "resource:///modules/FolderUtils.sys.mjs",
});

class FolderLocationButton extends MailTabButton {
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

  observed3PaneEvents = ["folderURIChanged"];

  observedAboutMessageEvents = [];

  connectedCallback() {
    super.connectedCallback();
    if (this.#addedListeners) {
      return;
    }
    this.#icon = this.querySelector(".button-icon");
    this.onCommandContextChange();
    this.#addedListeners = true;
    const popup = document.getElementById(this.getAttribute("popup"));
    popup.addEventListener("command", this.#handlePopupCommand);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#addedListeners) {
      const popup = document.getElementById(this.getAttribute("popup"));
      popup.removeEventListener("command", this.#handlePopupCommand);
    }
  }

  #handlePopupCommand = event => {
    const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
    about3Pane.displayFolder(event.target._folder.URI);
  };

  /**
   * Update the label and icon of the button from the currently selected folder
   * in the local 3pane.
   */
  onCommandContextChange() {
    if (!this.#icon) {
      return;
    }
    const { gFolder } =
      document.getElementById("tabmail").currentAbout3Pane ?? {};
    if (!gFolder) {
      this.disabled = true;
      return;
    }
    this.disabled = false;
    this.label.textContent = gFolder.name;
    this.#icon.style = `content: url(${lazy.FolderUtils.getFolderIcon(
      gFolder
    )});`;
  }
}
customElements.define("folder-location-button", FolderLocationButton, {
  extends: "button",
});
