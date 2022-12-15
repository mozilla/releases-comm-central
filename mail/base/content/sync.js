/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * AppMenu UI for Sync. This file is only loaded if NIGHTLY_BUILD is set.
 */

/* import-globals-from utilityOverlay.js */

ChromeUtils.defineModuleGetter(
  this,
  "FxAccounts",
  "resource://gre/modules/FxAccounts.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "EnsureFxAccountsWebChannel",
  "resource://gre/modules/FxAccountsWebChannel.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "UIState",
  "resource://services-sync/UIState.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "Weave",
  "resource://services-sync/main.js"
);

XPCOMUtils.defineLazyGetter(this, "fxAccounts", () => {
  return ChromeUtils.import(
    "resource://gre/modules/FxAccounts.jsm"
  ).getFxAccountsSingleton();
});

window.addEventListener("load", () => {
  updateFxAPanel();
  Services.obs.addObserver(updateFxAPanel, UIState.ON_UPDATE);
});
window.addEventListener("unload", () => {
  Services.obs.removeObserver(updateFxAPanel, UIState.ON_UPDATE);
});

function updateFxAPanel() {
  let state = UIState.get();
  let isSignedIn = state.status == UIState.STATUS_SIGNED_IN;
  document.getElementById("appmenu_signin").hidden = isSignedIn;
  document.getElementById("appmenu_sync").hidden = !isSignedIn;
  document.getElementById("syncSeparator").hidden = false;
  document.querySelectorAll(".appmenu-sync-account-email").forEach(el => {
    el.value = state.email;
    el.removeAttribute("data-l10n-id");
  });
  let button = document.getElementById("appmenu-submenu-sync-now");
  if (button) {
    if (state.syncing) {
      button.setAttribute("syncstatus", "active");
    } else {
      button.removeAttribute("syncstatus");
    }
  }
}

async function initFxA() {
  EnsureFxAccountsWebChannel();
  let url = await FxAccounts.config.promiseConnectAccountURI("");
  openContentTab(url);
}

async function openFxAManagePage(entryPoint = "") {
  EnsureFxAccountsWebChannel();
  const url = await FxAccounts.config.promiseManageURI(entryPoint);
  openContentTab(url);
}

async function openFxAAvatarPage(entryPoint = "") {
  EnsureFxAccountsWebChannel();
  const url = await FxAccounts.config.promiseChangeAvatarURI(entryPoint);
  openContentTab(url);
}

async function disconnect({ confirm = false, disconnectAccount = true }) {
  if (confirm) {
    let title, body, button;
    if (disconnectAccount) {
      [title, body, button] = await document.l10n.formatValues([
        "fxa-signout-dialog-title",
        "fxa-signout-dialog-body",
        "fxa-signout-dialog-button",
      ]);
    } else {
      [title, body, button] = await document.l10n.formatValues([
        "sync-disconnect-dialog-title",
        "sync-disconnect-dialog-body",
        "sync-disconnect-dialog-button",
      ]);
    }

    let flags =
      Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
      Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1;

    // buttonPressed will be 0 for disconnect, 1 for cancel.
    let buttonPressed = Services.prompt.confirmEx(
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

  if (disconnectAccount) {
    const { SyncDisconnect } = ChromeUtils.import(
      "resource://services-sync/SyncDisconnect.jsm"
    );
    await SyncDisconnect.disconnect(false);
    return true;
  }

  await fxAccounts.telemetry.recordDisconnection("sync", "ui");

  await Weave.Service.promiseInitialized;
  await Weave.Service.startOver();

  return true;
}
