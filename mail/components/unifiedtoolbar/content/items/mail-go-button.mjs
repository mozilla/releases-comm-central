/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailTabButton } from "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs";

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/**
 * Map from the direction attribute value to the command the button executes on
 * click.
 *
 * @type {{[string]: string}}
 */
const COMMAND_FOR_DIRECTION = {
  forward: "cmd_goForward",
  back: "cmd_goBack",
};

/**
 * Unified toolbar button to add the selected message to a calendar as event or
 * task.
 * Attributes:
 * - direction: "forward" or "back".
 */
class MailGoButton extends MailTabButton {
  /**
   * @type {?XULPopupElement}
   */
  #contextMenu = null;

  connectedCallback() {
    if (!this.hasConnected) {
      const command = COMMAND_FOR_DIRECTION[this.getAttribute("direction")];
      if (!command) {
        throw new Error(
          `Unknown direction "${this.getAttribute("direction")}"`
        );
      }
      this.setAttribute("command", command);
      this.#contextMenu = document.getElementById("messageHistoryPopup");
      this.addEventListener("contextmenu", this.#handleContextMenu, true);
    }
    super.connectedCallback();
  }

  /**
   * Build and show the history popup containing a list of messages to navigate
   * to. Messages that can't be found or that were in folders we can't find are
   * ignored. The currently displayed message is marked.
   *
   * @param {MouseEvent} event - Event triggering the context menu.
   */
  #handleContextMenu = event => {
    event.preventDefault();
    event.stopPropagation();

    const tabmail = document.getElementById("tabmail");
    const currentWindow = tabmail.currentTabInfo.chromeBrowser.contentWindow;
    const { messageHistory } = tabmail.currentAboutMessage;
    const { entries, currentIndex } = messageHistory.getHistory();

    // For populating the back menu, we want the most recently visited
    // messages first in the menu. So we go backward from curPos to 0.
    // For the forward menu, we want to go forward from curPos to the end.
    const items = [];
    const relativePositionBase = entries.length - 1 - currentIndex;
    for (const [index, entry] of entries.reverse().entries()) {
      const folder = MailServices.folderLookup.getFolderForURL(entry.folderURI);
      if (!folder) {
        // Where did the folder go?
        continue;
      }

      let menuText = "";
      let msgHdr;
      try {
        msgHdr = MailServices.messageServiceFromURI(
          entry.messageURI
        ).messageURIToMsgHdr(entry.messageURI);
      } catch (ex) {
        // Let's just ignore this history entry.
        continue;
      }
      const messageSubject = msgHdr.mime2DecodedSubject;
      const messageAuthor = msgHdr.mime2DecodedAuthor;

      if (!messageAuthor && !messageSubject) {
        // Avoid empty entries in the menu. The message was most likely (re)moved.
        continue;
      }

      // If the message was not being displayed via the current folder, prepend
      // the folder name.  We do not need to check underlying folders for
      // virtual folders because 'folder' is the display folder, not the
      // underlying one.
      if (folder != currentWindow.gFolder) {
        menuText = folder.prettyName + " - ";
      }

      let subject = "";
      if (msgHdr.flags & Ci.nsMsgMessageFlags.HasRe) {
        subject = "Re: ";
      }
      if (messageSubject) {
        subject += messageSubject;
      }
      if (subject) {
        menuText += subject + " - ";
      }

      menuText += messageAuthor;
      const newMenuItem = document.createXULElement("menuitem");
      newMenuItem.setAttribute("label", menuText);
      const relativePosition = relativePositionBase - index;
      newMenuItem.setAttribute("value", relativePosition);
      newMenuItem.addEventListener("command", commandEvent => {
        this.#navigateToUri(commandEvent.target);
        commandEvent.stopPropagation();
      });
      if (relativePosition === 0 && !messageHistory.canPop(0)) {
        newMenuItem.setAttribute("checked", true);
        newMenuItem.setAttribute("type", "radio");
      }
      items.push(newMenuItem);
    }
    this.#contextMenu.replaceChildren(...items);

    this.#contextMenu.openPopupAtScreen(
      event.screenX,
      event.screenY,
      true,
      event
    );
  };

  /**
   * Select the message in the appropriate folder for the history popup entry.
   * Finds the message based on the value of the item, which is the relative
   * index of the item in the message history.
   *
   * @param {Element} target
   */
  #navigateToUri(target) {
    const nsMsgViewIndex_None = 0xffffffff;
    const historyIndex = Number.parseInt(target.getAttribute("value"), 10);
    const tabmail = document.getElementById("tabmail");
    const currentWindow = tabmail.currentTabInfo.chromeBrowser.contentWindow;
    const messageHistory = tabmail.currentAboutMessage.messageHistory;
    if (!messageHistory || !messageHistory.canPop(historyIndex)) {
      return;
    }
    const item = messageHistory.pop(historyIndex);

    if (
      currentWindow.displayFolder &&
      currentWindow.gFolder?.URI !== item.folderURI
    ) {
      const folder = MailServices.folderLookup.getFolderForURL(item.folderURI);
      currentWindow.displayFolder(folder);
    }
    const msgHdr = MailServices.messageServiceFromURI(
      item.messageURI
    ).messageURIToMsgHdr(item.messageURI);
    const index = currentWindow.gDBView.findIndexOfMsgHdr(msgHdr, true);
    if (index != nsMsgViewIndex_None) {
      if (currentWindow.threadTree) {
        currentWindow.threadTree.selectedIndex = index;
        currentWindow.threadTree.table.body.focus();
      } else {
        currentWindow.gViewWrapper.dbView.selection.select(index);
        currentWindow.displayMessage(
          currentWindow.gViewWrapper.dbView.URIForFirstSelectedMessage
        );
      }
    }
  }
}
customElements.define("mail-go-button", MailGoButton, {
  extends: "button",
});
