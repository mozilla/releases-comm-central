/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPIDatabase } = ChromeUtils.importESModule(
  "resource://gre/modules/addons/XPIDatabase.sys.mjs"
);

window.addEventListener("load", event => {
  onLoad();
});

function restartApp() {
  Services.startup.quit(
    Services.startup.eForceQuit | Services.startup.eRestart
  );
}

function deleteLocalstore() {
  // Delete the xulstore file.
  const xulstoreFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  xulstoreFile.append("xulstore.json");
  if (xulstoreFile.exists()) {
    xulstoreFile.remove(false);
  }
}

async function disableAddons() {
  XPIDatabase.syncLoadDB(false);
  const addons = XPIDatabase.getAddons();
  for (const addon of addons) {
    if (addon.type == "theme") {
      // Setting userDisabled to false on the default theme activates it,
      // disables all other themes and deactivates the applied persona, if
      // any.
      const DEFAULT_THEME_ID = "default-theme@mozilla.org";
      if (addon.id == DEFAULT_THEME_ID) {
        await XPIDatabase.updateAddonDisabledState(addon, {
          userDisabled: false,
        });
      }
    } else {
      await XPIDatabase.updateAddonDisabledState(addon, { userDisabled: true });
    }
  }
}

async function onOK(event) {
  event.preventDefault();
  if (document.getElementById("resetToolbars").checked) {
    deleteLocalstore();
  }
  if (document.getElementById("disableAddons").checked) {
    await disableAddons();
  }
  restartApp();
}

function onCancel() {
  Services.startup.quit(Services.startup.eForceQuit);
}

function onLoad() {
  document
    .getElementById("tasks")
    .addEventListener("CheckboxStateChange", updateOKButtonState);

  document.addEventListener("dialogaccept", onOK);
  document.addEventListener("dialogcancel", onCancel);
  document.addEventListener("dialogextra1", () => window.close());
}

function updateOKButtonState() {
  document.querySelector("dialog").getButton("accept").disabled =
    !document.getElementById("resetToolbars").checked &&
    !document.getElementById("disableAddons").checked;
}
