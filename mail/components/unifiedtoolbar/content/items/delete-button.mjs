/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailTabButton } from "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs";

/* import-globals-from ../../../../base/content/globalOverlay.js */

/**
 * Unified toolbar button that deletes the selected message or folder.
 */
class DeleteButton extends MailTabButton {
  onCommandContextChange() {
    const tabmail = document.getElementById("tabmail");
    try {
      const controller = getEnabledControllerForCommand("cmd_deleteMessage");
      const tab = tabmail.currentTabInfo;
      const message = tab.message;

      this.disabled = !controller || !message;

      if (!this.disabled && message.flags & Ci.nsMsgMessageFlags.IMAPDeleted) {
        this.setAttribute("label-id", "toolbar-undelete-label");
        document.l10n.setAttributes(this, "toolbar-undelete");
      } else {
        this.setAttribute("label-id", "toolbar-delete-label");
        document.l10n.setAttributes(this, "toolbar-delete-title");
      }
    } catch {
      this.disabled = true;
    }
  }

  handleClick(event) {
    goDoCommand(
      event.shiftKey ? "cmd_shiftDeleteMessage" : "cmd_deleteMessage"
    );
    event.preventDefault();
    event.stopPropagation();
  }
}
customElements.define("delete-button", DeleteButton, {
  extends: "button",
});
