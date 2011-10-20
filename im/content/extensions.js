/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Communicator client code, released
 * March 31, 1998.
 *
 * The Initial Developer of the Original Code is
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998-1999
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Patrick Cloke <clokep@gmail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/PluralForm.jsm");

var addonsRegister = {
  onload: function () {
    Services.obs.addObserver(addonsRegister, "addon-install-disabled", false);
    Services.obs.addObserver(addonsRegister, "addon-install-blocked", false);
    Services.obs.addObserver(addonsRegister, "addon-install-failed", false);
    Services.obs.addObserver(addonsRegister, "addon-install-complete", false);

    window.removeEventListener("load", addonsRegister.onload, false);
    window.addEventListener("unload", addonsRegister.onunload);

    let win = document.getElementById("dummychromebrowser").contentWindow;
    let open = win.open;
    win.open = function(aUrl) {
      let uri = Services.io.newURI(aUrl, null, null);

      // http and https are the only schemes that are exposed even
      // though we don't handle them internally.
      if (!uri.schemeIs("http") && !uri.schemeIs("https"))
        open.apply(this, arguments);
      else {
        Cc["@mozilla.org/uriloader/external-protocol-service;1"]
          .getService(Ci.nsIExternalProtocolService).loadUrl(uri);
      }
    };
  },

  onunload: function () {
    window.removeEventListener("unload", addonsRegister.onunload, false);

    Services.obs.removeObserver(addonsRegister, "addon-install-disabled");
    Services.obs.removeObserver(addonsRegister, "addon-install-blocked");
    Services.obs.removeObserver(addonsRegister, "addon-install-failed");
    Services.obs.removeObserver(addonsRegister, "addon-install-complete");
  },

  // Originally taken from
  // comm-central/source/mail/base/content/specialTabs.js
  observe: function (aSubject, aTopic, aData) {
    let brandBundle = document.getElementById("bundle_brand");
    let extensionsBundle = document.getElementById("bundle_extensions");

    let installInfo = aSubject.QueryInterface(Ci.amIWebInstallInfo);
    let notificationBox = document.getElementById("addonsNotify");
    if (!notificationBox)
      return;
    let notificationID = aTopic;
    let brandShortName = brandBundle.getString("brandShortName");
    let notificationName, messageString, buttons;
    const iconURL = "chrome://mozapps/skin/extensions/extensionGeneric.png";

    switch (aTopic) {
    case "addon-install-disabled":
      notificationID = "xpinstall-disabled";

      if (Services.prefs.prefIsLocked("xpinstall.enabled")) {
        messageString =
          extensionsBundle.getString("xpinstallDisabledMessageLocked");
        buttons = [];
      } else {
        messageString = extensionsBundle.getString("xpinstallDisabledMessage");

        buttons = [{
          label: extensionsBundle.getString("xpinstallDisabledButton"),
          accessKey:
            extensionsBundle.getString("xpinstallDisabledButton.accesskey"),
          popup: null,
          callback: function editPrefs() {
            Services.prefs.setBoolPref("xpinstall.enabled", true);
            return false;
          }
        }];
      }
      if (!notificationBox.getNotificationWithValue(notificationID)) {
        notificationBox.appendNotification(
          messageString, notificationID, iconURL,
          notificationBox.PRIORITY_CRITICAL_HIGH, buttons);
      }
      break;
    case "addon-install-blocked":
      messageString =
        extensionsBundle.getFormattedString("xpinstallPromptWarning",
                                            [brandShortName,
                                             installInfo.originatingURI.host]);

      buttons = [{
        label: extensionsBundle.getString("xpinstallPromptAllowButton"),
        accessKey:
          extensionsBundle.getString("xpinstallPromptAllowButton.accesskey"),
        popup: null,
        callback: function() {
          installInfo.install();
        }
      }];

      if (!notificationBox.getNotificationWithValue(notificationName)) {
        notificationBox.appendNotification(messageString, notificationName,
                                           iconURL,
                                           notificationBox.PRIORITY_MEDIUM_HIGH,
                                           buttons);
      }
      break;
    case "addon-install-failed":
      // XXX TODO This isn't terribly ideal for the multiple failure case
      for (let [, install] in Iterator(installInfo.installs)) {
        let host = ((installInfo.originatingURI instanceof Ci.nsIStandardURL) &&
                    installInfo.originatingURI.host) ||
                   ((install.sourceURI instanceof Ci.nsIStandardURL) &&
                    install.sourceURI.host);

        let error = (host || install.error == 0) ?
                     "addonError" : "addonLocalError";
        if (install.error != 0)
          error += install.error;
        else if (install.addon.blocklistState ==
                 Ci.nsIBlocklistService.STATE_BLOCKED)
          error += "Blocklisted";
        else
          error += "Incompatible";

        messageString = extensionsBundle.getString(error);
        messageString = messageString.replace("#1", install.name);
        if (host)
          messageString = messageString.replace("#2", host);
        messageString = messageString.replace("#3", brandShortName);
        messageString = messageString.replace("#4", Services.appinfo.version);

        if (!notificationBox.getNotificationWithValue(notificationID)) {
          notificationBox.appendNotification(
            messageString, notificationID, iconURL,
            notificationBox.PRIORITY_CRITICAL_HIGH, []);
        }
      }
      break;
    case "addon-install-complete":
      let needsRestart = installInfo.installs.some(function(i) {
        return i.addon.pendingOperations != AddonManager.PENDING_NONE;
      });

      if (needsRestart) {
        messageString =
          extensionsBundle.getString("addonsInstalledNeedsRestart");
        buttons = [{
          label: extensionsBundle.getString("addonInstallRestartButton"),
          accessKey:
            extensionsBundle.getString("addonInstallRestartButton.accesskey"),
          popup: null,
          callback: function() {
            let cancelQuit = Cc["@mozilla.org/supports-PRBool;1"]
                               .createInstance(Ci.nsISupportsPRBool);
            Services.obs.notifyObservers(cancelQuit,
                                         "quit-application-requested",
                                         "restart");
            if (cancelQuit.data)
              return; // somebody canceled our quit request

            let appStartup = Cc["@mozilla.org/toolkit/app-startup;1"]
                               .getService(Ci.nsIAppStartup);
            appStartup.quit(Ci.nsIAppStartup.eAttemptQuit |
                            Ci.nsIAppStartup.eRestart);
          }
        }];
      } else {
        messageString = extensionsBundle.getString("addonsInstalled");
        buttons = [];

        // Calculate the add-on type that is most popular in the list of
        // installs.
        let types = {};
        let bestType = null;
        for (let [, install] in Iterator(installInfo.installs)) {
          if (install.type in types)
            types[install.type]++;
          else
            types[install.type] = 1;

          if (!bestType || types[install.type] > types[bestType])
            bestType = install.type;
        }

        // Switch to the correct type of addons
        document.getElementById("dummychromebrowser")
                .contentWindow
                .loadView("addons://list/" + bestType);
      }

      messageString =
        PluralForm.get(installInfo.installs.length, messageString);
      messageString = messageString.replace("#1", installInfo.installs[0].name);
      messageString = messageString.replace("#2", installInfo.installs.length);
      messageString = messageString.replace("#3", brandShortName);

      notificationBox.appendNotification(messageString, notificationID,
                                         iconURL,
                                         notificationBox.PRIORITY_INFO_MEDIUM,
                                         buttons);
      break;
    }
  }
};

window.addEventListener("load", addonsRegister.onload);
