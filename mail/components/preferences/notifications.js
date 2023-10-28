/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/preferencesBindings.js */

Preferences.addAll([
  { id: "mail.biff.alert.show_preview", type: "bool" },
  { id: "mail.biff.alert.show_subject", type: "bool" },
  { id: "mail.biff.alert.show_sender", type: "bool" },
  { id: "alerts.totalOpenTime", type: "int" },
]);

var gNotificationsDialog = {
  init() {
    const element = document.getElementById("totalOpenTime");
    Preferences.addSyncFromPrefListener(
      element,
      () => Preferences.get("alerts.totalOpenTime").value / 1000
    );
    Preferences.addSyncToPrefListener(element, element => element.value * 1000);
  },
};

window.addEventListener("load", () => gNotificationsDialog.init());
