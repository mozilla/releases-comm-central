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

      const areIMAPDeleted = () => {
        return tab?.mode.name == "mail3PaneTab"
          ? tab.chromeBrowser?.contentWindow.gDBView
              ?.getSelectedMsgHdrs()
              .every(msg => msg.flags & Ci.nsMsgMessageFlags.IMAPDeleted)
          : message?.flags & Ci.nsMsgMessageFlags.IMAPDeleted;
      };

      if (!this.disabled && areIMAPDeleted()) {
        this.setAttribute("label-id", "toolbar-undelete-label");
        document.l10n.setAttributes(this, "toolbar-undelete");
      } else {
        this.setAttribute("label-id", "toolbar-delete-label");
        document.l10n.setAttributes(this, "toolbar-delete-title");
      }
      this.dataset.imapDeleted = !!areIMAPDeleted();
    } catch {
      this.disabled = true;
    }
  }

  handleClick(event) {
    goDoCommand(
      event.shiftKey && event.target.dataset.imapDeleted == "false"
        ? "cmd_shiftDelete"
        : "cmd_delete"
    );
    // IMAP deleted state may have changed.
    this.onCommandContextChange();
    event.preventDefault();
    event.stopPropagation();
  }
}
customElements.define("delete-button", DeleteButton, {
  extends: "button",
});
