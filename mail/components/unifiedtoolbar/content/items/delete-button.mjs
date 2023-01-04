/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailTabButton } from "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs";

const lazy = {};
ChromeUtils.defineModuleGetter(
  lazy,
  "FolderUtils",
  "resource:///modules/FolderUtils.jsm"
);

/**
 * Check if the given folder can be deleted.
 *
 * @param {?nsIMsgFolder} folder - Folder to check.
 * @returns {boolean} Whether the given folder can be deleted.
 */
function canDeleteFolder(folder) {
  return (
    folder &&
    (folder.flags & Ci.nsMsgFolderFlags.Junk
      ? lazy.FolderUtils.canRenameDeleteJunkMail(folder.URI)
      : folder.deletable) &&
    folder.isCommandEnabled("cmd_delete")
  );
}

/**
 * Unified toolbar button that deletes the selected message or folder.
 */
class DeleteButton extends MailTabButton {
  onCommandContextChange() {
    const controller = document.commandDispatcher.getControllerForCommand(
      "cmd_delete"
    );
    const tabmail = document.getElementById("tabmail");
    this.disabled =
      !controller?.isCommandEnabled("cmd_delete") &&
      !canDeleteFolder(tabmail.currentAbout3Pane?.gFolder);
  }

  handleClick = event => {
    const command = "cmd_delete";
    const controller = document.commandDispatcher.getControllerForCommand(
      command
    );
    if (controller) {
      event.preventDefault();
      event.stopPropagation();
      if (controller.isCommandEnabled(command)) {
        controller.doCommand(command);

        event.preventDefault();
        event.stopPropagation();

        return;
      }
    }
    const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
    if (!about3Pane || !canDeleteFolder(about3Pane.gFolder)) {
      return;
    }
    about3Pane.folderPane.deleteFolder(about3Pane.gFolder);
    event.preventDefault();
    event.stopPropagation();
  };
}
customElements.define("delete-button", DeleteButton, {
  extends: "button",
});
