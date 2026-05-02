/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

export class ContextMenuParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name != "contextmenu") {
      return;
    }

    const browser = this.manager.rootFrameLoader.ownerElement;
    const win = browser.ownerGlobal.top;

    // Send events from a message display browser to about:3pane or
    // about:message if possible.
    const tabmail = win.document.getElementById("tabmail");
    if (tabmail) {
      const chromeBrowser = tabmail.currentTabInfo.chromeBrowser;
      if (
        chromeBrowser?.contentWindow.openContextMenu(message, browser, this)
      ) {
        return;
      }
    }
    const messageBrowser = win.document.getElementById("messageBrowser");
    if (messageBrowser?.contentWindow.openContextMenu(message, browser, this)) {
      return;
    }

    // Otherwise, send them to the outer window.
    if ("openContextMenu" in win) {
      win.openContextMenu(message, browser, this);
    }
  }

  hiding() {
    try {
      this.sendAsyncMessage("ContextMenu:Hiding", {});
    } catch (e) {
      // This will throw if the content goes away while the
      // context menu is still open.
    }
  }
}
