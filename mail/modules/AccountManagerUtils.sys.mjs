/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Utility methods for the account settings.
 */

import { FolderTreeProperties } from "resource:///modules/FolderTreeProperties.sys.mjs";

export class AccountManagerUtils {
  defaultServerColor = "#2493ef";

  /**
   * The account currently being edited.
   *
   * @type {nsIMsgAccount}
   */
  #account;

  /**
   * Get the color assigned to the current server or the default.
   *
   * @type {string}
   */
  get serverColor() {
    return (
      FolderTreeProperties.getColor(
        this.#account.incomingServer.rootFolder.URI
      ) || this.defaultServerColor
    );
  }

  /**
   * @param {nsIMsgAccount} account
   */
  constructor(account) {
    this.#account = account;
  }

  /**
   * Trigger a notification to alert of preview color changes.
   *
   * @param {string} color
   */
  previewServerColor(color) {
    Services.obs.notifyObservers(this.#account, "server-color-preview", color);
  }

  /**
   * Update the color of the server, or reset it to default.
   *
   * @param {string} color
   */
  updateServerColor(color) {
    if (color.toLowerCase() == this.defaultServerColor) {
      color = undefined;
    }
    FolderTreeProperties.setColor(
      this.#account.incomingServer.rootFolder.URI,
      color
    );
    Services.obs.notifyObservers(this.#account, "server-color-changed", color);
  }

  /**
   * Clear the saved custom server color.
   */
  resetServerColor() {
    FolderTreeProperties.setColor(
      this.#account.incomingServer.rootFolder.URI,
      undefined
    );
    Services.obs.notifyObservers(this.#account, "server-color-changed");
  }
}
