/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * AppMenu UI for Sync. This file is only loaded if NIGHTLY_BUILD is set.
 */

/* import-globals-from utilityOverlay.js */

ChromeUtils.defineESModuleGetters(this, {
  EnsureFxAccountsWebChannel:
    "resource://gre/modules/FxAccountsWebChannel.sys.mjs",
  FxAccounts: "resource://gre/modules/FxAccounts.sys.mjs",
  UIState: "resource://services-sync/UIState.sys.mjs",
  Weave: "resource://services-sync/main.sys.mjs",
});

var gSync = {
  handleEvent(event) {
    if (event.type == "load") {
      this.updateFxAPanel();
      Services.obs.addObserver(this, UIState.ON_UPDATE);
      window.addEventListener("unload", this, { once: true });
    } else if (event.type == "unload") {
      Services.obs.removeObserver(this, UIState.ON_UPDATE);
    }
  },

  observe(subject, topic, data) {
    this.updateFxAPanel();
  },

  /**
   * Update the app menu items to match the current state.
   */
  updateFxAPanel() {
    const state = UIState.get();
    const isSignedIn = state.status == UIState.STATUS_SIGNED_IN;
    document.getElementById("appmenu_signin").hidden = isSignedIn;
    document.getElementById("appmenu_sync").hidden = !isSignedIn;
    document.getElementById("syncSeparator").hidden = false;
    document.querySelectorAll(".appmenu-sync-account-email").forEach(el => {
      el.value = state.email;
      el.removeAttribute("data-l10n-id");
    });
    const button = document.getElementById("appmenu-submenu-sync-now");
    if (button) {
      if (state.syncing) {
        button.setAttribute("syncstatus", "active");
      } else {
        button.removeAttribute("syncstatus");
      }
    }
  },

  /**
   * Opens the FxA log-in page in a tab.
   *
   * @param {string = ""} entryPoint
   */
  async initFxA() {
    EnsureFxAccountsWebChannel();
    const url = await FxAccounts.config.promiseConnectAccountURI("");
    openContentTab(url);
  },

  /**
   * Opens the FxA account management page in a tab.
   *
   * @param {string = ""} entryPoint
   */
  async openFxAManagePage(entryPoint = "") {
    EnsureFxAccountsWebChannel();
    const url = await FxAccounts.config.promiseManageURI(entryPoint);
    openContentTab(url);
  },

  /**
   * Opens the FxA avatar management page in a tab.
   *
   * @param {string = ""} entryPoint
   */
  async openFxAAvatarPage(entryPoint = "") {
    EnsureFxAccountsWebChannel();
    const url = await FxAccounts.config.promiseChangeAvatarURI(entryPoint);
    openContentTab(url);
  },

  /**
   * Disconnect from sync, and optionally disconnect from the FxA account.
   *
   * @param {boolean} confirm - Should the user be asked to confirm the
   *   disconnection?
   * @param {boolean} disconnectAccount - If true, disconnect from FxA as well
   *   as Sync. If false, just disconnect from Sync.
   * @returns {boolean} - true if the disconnection happened (ie, if the user
   *   didn't decline when asked to confirm)
   */
  async disconnect({ confirm = false, disconnectAccount = true }) {
    if (confirm) {
      let title, body, button;
      if (disconnectAccount) {
        [title, body, button] = await document.l10n.formatValues([
          "sync-signout-dialog-title",
          "sync-signout-dialog-body",
          "sync-signout-dialog-button",
        ]);
      } else {
        [title, body, button] = await document.l10n.formatValues([
          "sync-disconnect-dialog-title",
          "sync-disconnect-dialog-body",
          "sync-disconnect-dialog-button",
        ]);
      }

      const flags =
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
        Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1;

      // buttonPressed will be 0 for disconnect, 1 for cancel.
      const buttonPressed = Services.prompt.confirmEx(
        window,
        title,
        body,
        flags,
        button,
        null,
        null,
        null,
        {}
      );
      if (buttonPressed != 0) {
        return false;
      }
    }

    const fxAccounts = ChromeUtils.importESModule(
      "resource://gre/modules/FxAccounts.sys.mjs"
    ).getFxAccountsSingleton();

    if (disconnectAccount) {
      const { SyncDisconnect } = ChromeUtils.importESModule(
        "resource://services-sync/SyncDisconnect.sys.mjs"
      );
      await fxAccounts.telemetry.recordDisconnection(null, "ui");
      await SyncDisconnect.disconnect(false);
      return true;
    }

    await fxAccounts.telemetry.recordDisconnection("sync", "ui");
    await Weave.Service.promiseInitialized;
    await Weave.Service.startOver();
    return true;
  },
};
window.addEventListener("load", gSync, { once: true });
