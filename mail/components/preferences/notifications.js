/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/preferencesBindings.js */

var { MailNotificationManager } = ChromeUtils.importESModule(
  "resource:///modules/MailNotificationManager.sys.mjs"
);

Preferences.addAll([
  { id: "mail.biff.alert.show_preview", type: "bool" },
  { id: "mail.biff.alert.show_subject", type: "bool" },
  { id: "mail.biff.alert.show_sender", type: "bool" },
  { id: "alerts.totalOpenTime", type: "int" },
]);

var gNotificationsDialog = {
  init() {
    const sysAlert = Services.prefs.getBoolPref(
      "mail.biff.use_system_alert",
      true
    );
    if (sysAlert) {
      const list = document.getElementById("enabledActions");
      const enabledActions = Array.from(
        MailNotificationManager.enabledActions,
        a => a.action
      );
      for (const action of MailNotificationManager.availableActions) {
        const checkbox = list.appendChild(
          document.createXULElement("checkbox")
        );
        checkbox.id = action.action;
        checkbox.classList.add("indent");
        checkbox.label = action.title;
        checkbox.checked = enabledActions.includes(action.action);
      }

      document.getElementById("totalOpenTimeBefore").hidden = true;
      document.getElementById("totalOpenTime").hidden = true;
      document.getElementById("totalOpenTimeEnd").hidden = true;
    } else {
      document.getElementById("enabledActionsDescription").hidden = true;
    }

    const element = document.getElementById("totalOpenTime");
    Preferences.addSyncFromPrefListener(
      element,
      () => Preferences.get("alerts.totalOpenTime").value / 1000
    );
    Preferences.addSyncToPrefListener(element, e => e.value * 1000);
  },

  saveActions() {
    if (!Services.prefs.getBoolPref("mail.biff.use_system_alert", true)) {
      return;
    }

    const list = document.getElementById("enabledActions");
    const enabledActions = Array.from(
      list.querySelectorAll("checkbox[checked]"),
      checkbox => checkbox.id
    );
    Services.prefs.setStringPref(
      "mail.biff.alert.enabled_actions",
      enabledActions.join(",")
    );
  },
};

window.addEventListener("load", () => gNotificationsDialog.init());
window.addEventListener("dialogaccept", () =>
  gNotificationsDialog.saveActions()
);
