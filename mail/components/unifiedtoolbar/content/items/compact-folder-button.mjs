/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailTabButton } from "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs";

/**
 * Unified toolbar button for compacting the current folder.
 */
class CompactFolderButton extends MailTabButton {
  observed3PaneEvents = ["folderURIChanged"];
  observedAboutMessageEvents = [];

  onCommandContextChange() {
    const { gFolder } =
      document.getElementById("tabmail").currentAbout3Pane ?? {};
    if (!gFolder) {
      this.disabled = true;
      return;
    }
    try {
      this.disabled = !gFolder.isCommandEnabled("cmd_compactFolder");
    } catch {
      this.disabled = true;
    }
  }

  handleClick = event => {
    const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
    if (!about3Pane) {
      return;
    }
    about3Pane.folderPane.compactFolder(about3Pane.gFolder);
    event.preventDefault();
    event.stopPropagation();
  };
}
customElements.define("compact-folder-button", CompactFolderButton, {
  extends: "button",
});
