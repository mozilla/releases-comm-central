/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/preferencesBindings.js */

window.addEventListener("load", event => {
  gOfflineDialog.dialogSetup();
});

Preferences.addAll([
  { id: "offline.autoDetect", type: "bool" },
  { id: "offline.startup_state", type: "int" },
  { id: "offline.send.unsent_messages", type: "int" },
  { id: "offline.download.download_messages", type: "int" },
]);

var kAutomatic = 4;
var kRememberLastState = 0;

var gOfflineDialog = {
  dialogSetup() {
    const offlineAutoDetection = Preferences.get("offline.autoDetect");
    const offlineStartupStatePref = Preferences.get("offline.startup_state");

    offlineStartupStatePref.disabled = offlineAutoDetection.value;
    if (offlineStartupStatePref.disabled) {
      offlineStartupStatePref.value = kAutomatic;
    } else if (offlineStartupStatePref.value == kAutomatic) {
      offlineStartupStatePref.value = kRememberLastState;
    }
  },
};

Preferences.get("offline.autoDetect").on("change", gOfflineDialog.dialogSetup);
