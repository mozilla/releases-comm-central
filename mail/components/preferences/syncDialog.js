/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const engineItems = {
  configSyncAccount: "services.sync.engine.accounts",
  configSyncAddress: "services.sync.engine.addressbooks",
  configSyncCalendar: "services.sync.engine.calendars",
  configSyncIdentity: "services.sync.engine.identities",
  configSyncPasswords: "services.sync.engine.passwords",
};

window.addEventListener("load", function () {
  for (const [id, prefName] of Object.entries(engineItems)) {
    const element = document.getElementById(id);
    element.checked = Services.prefs.getBoolPref(prefName, false);
  }

  const options = window.arguments[0];
  if (options.disconnectFun) {
    window.addEventListener("dialogextra2", function () {
      options.disconnectFun().then(disconnected => {
        if (disconnected) {
          window.close();
        }
      });
    });
  } else {
    document.querySelector("dialog").getButton("extra2").hidden = true;
  }
});

window.addEventListener("dialogaccept", function () {
  for (const [id, prefName] of Object.entries(engineItems)) {
    const element = document.getElementById(id);
    Services.prefs.setBoolPref(prefName, element.checked);
  }
});
