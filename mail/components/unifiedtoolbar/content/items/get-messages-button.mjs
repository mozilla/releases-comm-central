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

/* globals MsgGetMessagesForAccount */

/**
 * Unified toolbar button for getting messages.
 */
class GetMessagesButton extends UnifiedToolbarButton {
  /**
   * @type {?XULPopupElement}
   */
  #contextMenu = null;

  connectedCallback() {
    if (!this.hasConnected) {
      this.#contextMenu = document.getElementById("toolbarGetMessagesContext");
      this.addEventListener("contextmenu", this, true);
    }
    super.connectedCallback();
  }

  handleEvent(event) {
    if (event.type !== "contextmenu") {
      super.handleEvent(event);
      return;
    }
    this.#handleContextMenu(event);
  }

  #handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    // Get all servers in the proper sorted order.
    const serverItems = lazy.FolderUtils.allAccountsSorted(true)
      .map(a => a.incomingServer)
      .filter(s => s.rootFolder.isServer && s.type != "none")
      .map(server => {
        const menuitem = document.createXULElement("menuitem");
        menuitem.classList.add("menuitem-iconic", "server");
        menuitem.dataset.serverKey = server.key;
        menuitem.dataset.serverType = server.type;
        menuitem.dataset.serverSecure = server.isSecure;
        menuitem.label = server.prettyName;
        menuitem.addEventListener("command", () =>
          MsgGetMessagesForAccount(server.rootFolder)
        );
        return menuitem;
      });

    const allMessagesItem = this.#contextMenu.querySelector(
      "#tolbarContextGetAllNewMessages"
    );
    allMessagesItem.disabled = !serverItems.length;
    const separator = this.#contextMenu.querySelector(
      "#separatorToolbarContextAfterGetAllNewMessages"
    );
    separator.hidden = !serverItems.length;

    this.#contextMenu.replaceChildren(
      allMessagesItem,
      separator,
      ...serverItems
    );

    this.#contextMenu.openPopup(this, {
      event,
      position: "bottomleft topleft",
    });
  }
}
customElements.define("get-messages-button", GetMessagesButton, {
  extends: "button",
});
