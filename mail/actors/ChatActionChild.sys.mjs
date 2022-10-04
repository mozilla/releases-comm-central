/* -*- mode: js; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 sw=2 sts=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class ChatActionChild extends JSWindowActorChild {
  constructor() {
    super();

    this.messageActions = null;
  }

  receiveMessage(message) {
    if (!this.messageActions) {
      return;
    }
    if (message.name === "ChatAction:Run") {
      this.messageActions[message.data.index].run();
    } else if (message.name === "ChatAction:Hide") {
      this.messageActions = null;
    }
  }

  async handleEvent(event) {
    let node = event.composedTarget;

    // Set the node to containing <video>/<audio>/<embed>/<object> if the node
    // is in the videocontrols UA Widget.
    if (node.containingShadowRoot?.isUAWidget()) {
      const host = node.containingShadowRoot.host;
      if (
        this.contentWindow.HTMLMediaElement.isInstance(host) ||
        this.contentWindow.HTMLEmbedElement.isInstance(host) ||
        this.contentWindow.HTMLObjectElement.isInstance(host)
      ) {
        node = host;
      }
    }

    while (node) {
      if (node._originalMsg) {
        this.messageActions = node._originalMsg.getActions();
        break;
      }
      node = node.parentNode;
    }
    if (!this.messageActions) {
      return;
    }
    this.sendAsyncMessage("ChatAction:Actions", {
      actions: this.messageActions.map(action => action.label),
    });
  }
}
