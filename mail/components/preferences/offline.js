/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var kAutomatic         = 4;
var kRememberLastState = 0;

var gOfflineDialog = {
  dialogSetup: function() {
    let offlineAutoDetection = document.getElementById("offline.autoDetect");
    let offlineStartupStatePref = document.getElementById("offline.startup_state");

    offlineStartupStatePref.disabled = offlineAutoDetection.value;
    if (offlineStartupStatePref.disabled) {
      offlineStartupStatePref.value = kAutomatic;
    } else {
      if (offlineStartupStatePref.value == kAutomatic)
        offlineStartupStatePref.value = kRememberLastState;
    }
  }
};
