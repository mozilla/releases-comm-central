/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Utility methods for the defining and consuming custom colors for accounts.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FolderTreeProperties: "resource:///modules/FolderTreeProperties.sys.mjs",
  FolderUtils: "resource:///modules/FolderUtils.sys.mjs",
});

export const AccountColorUtils = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  /**
   * Holds all the windows that need to be registered in order to properly
   * generate and update the DOM CSS style.
   *
   * @type {Set}
   */
  registeredWindows: new Set(),

  /**
   * Register a window to be updated when needed. The current style is applied
   * to the window. Deregistration is automatic.
   *
   * @param {Window} win
   */
  async registerWindow(win) {
    await lazy.FolderTreeProperties.ready;

    // Only register the needed observers if this is the first window we're
    // dealing with.
    if (!this.registeredWindows.size) {
      Services.obs.addObserver(this, "server-color-changed");
    }

    this.registeredWindows.add(win);
    win.addEventListener("unload", () => this.unloadWindow(win));
    const accounts = lazy.FolderUtils.allAccountsSorted(true);
    this.updateWindow(win, accounts);
  },

  /**
   * Handle the unloading of a previously registered window.
   *
   * @param {Window} win
   */
  unloadWindow(win) {
    this.registeredWindows.delete(win);
    // Remove the observers if we don't have any other windows to deal with.
    if (!this.registeredWindows.size) {
      Services.obs.removeObserver(this, "server-color-changed");
    }
  },

  observe(subject, topic) {
    switch (topic) {
      case "server-color-changed":
        this.updateAllRegisteredWindows();
        break;
    }
  },

  /**
   * Update the CSS style of the registed window.
   *
   * @param {Window} win
   */
  updateWindow(win, accounts) {
    const style = win.document.documentElement.style;

    // Loop through all the currently available accounts.
    for (const account of accounts) {
      const server = account.incomingServer;
      if (!server) {
        continue;
      }

      const serverProperty = `--server-${CSS.escape(server.key)}-color`;
      const color = lazy.FolderTreeProperties.getColor(server.rootFolder.URI);
      // Try to clear the property if no color is available in order to account
      // for custom colors that have been reset to default.
      if (!color) {
        style.removeProperty(serverProperty);
        continue;
      }

      style.setProperty(serverProperty, color);
    }
  },

  /**
   * Loop through all the currently registered windows and update the needed CSS
   * properties.
   */
  updateAllRegisteredWindows() {
    // Fetch all accounts once so we don't do it every time for each window.
    const accounts = lazy.FolderUtils.allAccountsSorted(true);
    // TODO: A potential future improvement would be to fetch all accounts
    // colors at once as well rather than doing it for every window.
    for (const win of this.registeredWindows) {
      this.updateWindow(win, accounts);
    }
  },
};
