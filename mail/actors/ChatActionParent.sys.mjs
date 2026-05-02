/* -*- mode: js; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 sw=2 sts=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class ChatActionParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name === "ChatAction:Actions") {
      const browser = this.manager.rootFrameLoader.ownerElement;
      if (browser.contentWindow?.gChatContextMenu) {
        browser.contentWindow.gChatContextMenu.initActions(
          message.data.actions
        );
        return;
      }

      // Otherwise, send them to the outer window.
      const win = browser.ownerGlobal;
      if (win.gChatContextMenu) {
        win.gChatContextMenu.initActions(message.data.actions);
        return;
      }
      this.actions = message.data.actions;
    }
  }

  reportHide() {
    this.sendAsyncMessage("ChatAction:Hide");
    this.actions = null;
  }
}
