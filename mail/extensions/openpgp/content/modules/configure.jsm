/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailConfigure"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
const { EnigmailPrefs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/prefs.jsm"
);
const { EnigmailTimer } = ChromeUtils.import(
  "chrome://openpgp/content/modules/timer.jsm"
);
const { EnigmailApp } = ChromeUtils.import(
  "chrome://openpgp/content/modules/app.jsm"
);
const { EnigmailLocale } = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
);
const { EnigmailDialog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
);
const { EnigmailWindows } = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
);
const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
const { EnigmailCore } = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
);
const { EnigmailStdlib } = ChromeUtils.import(
  "chrome://openpgp/content/modules/stdlib.jsm"
);
const { EnigmailLazy } = ChromeUtils.import(
  "chrome://openpgp/content/modules/lazy.jsm"
);
const { EnigmailAutoSetup } = ChromeUtils.import(
  "chrome://openpgp/content/modules/autoSetup.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * Upgrade sending prefs
 * (v1.6.x -> v1.7 )
 */
function upgradePrefsSending() {
  EnigmailLog.DEBUG("enigmailCommon.jsm: upgradePrefsSending()\n");

  var cbs = EnigmailPrefs.getPref("confirmBeforeSend");
  var ats = EnigmailPrefs.getPref("alwaysTrustSend");
  var ksfr = EnigmailPrefs.getPref("keepSettingsForReply");
  EnigmailLog.DEBUG(
    "enigmailCommon.jsm: upgradePrefsSending cbs=" +
      cbs +
      " ats=" +
      ats +
      " ksfr=" +
      ksfr +
      "\n"
  );

  // Upgrade confirmBeforeSend (bool) to confirmBeforeSending (int)
  switch (cbs) {
    case false:
      EnigmailPrefs.setPref("confirmBeforeSending", 0); // never
      break;
    case true:
      EnigmailPrefs.setPref("confirmBeforeSending", 1); // always
      break;
  }

  // Upgrade alwaysTrustSend (bool)   to acceptedKeys (int)
  switch (ats) {
    case false:
      EnigmailPrefs.setPref("acceptedKeys", 0); // valid
      break;
    case true:
      EnigmailPrefs.setPref("acceptedKeys", 1); // all
      break;
  }

  // if all settings are default settings, use convenient encryption
  if (cbs === false && ats === true && ksfr === true) {
    EnigmailPrefs.setPref("encryptionModel", 0); // convenient
    EnigmailLog.DEBUG(
      "enigmailCommon.jsm: upgradePrefsSending() encryptionModel=0 (convenient)\n"
    );
  } else {
    EnigmailPrefs.setPref("encryptionModel", 1); // manually
    EnigmailLog.DEBUG(
      "enigmailCommon.jsm: upgradePrefsSending() encryptionModel=1 (manually)\n"
    );
  }

  // clear old prefs
  EnigmailPrefs.getPrefBranch().clearUserPref("confirmBeforeSend");
  EnigmailPrefs.getPrefBranch().clearUserPref("alwaysTrustSend");
}

/**
 * Replace short key IDs with FPR in identity settings
 * (v1.9 -> v2.0)
 */
function replaceKeyIdWithFpr() {
  try {
    const GetKeyRing = EnigmailLazy.loader(
      "enigmail/keyRing.jsm",
      "EnigmailKeyRing"
    );

    var accountManager = Cc[
      "@mozilla.org/messenger/account-manager;1"
    ].getService(Ci.nsIMsgAccountManager);
    for (var i = 0; i < accountManager.allIdentities.length; i++) {
      var id = accountManager.allIdentities.queryElementAt(
        i,
        Ci.nsIMsgIdentity
      );
      if (id.getBoolAttribute("enablePgp")) {
        let keyId = id.getCharAttribute("pgpkeyId");

        if (keyId.search(/^(0x)?[a-fA-F0-9]{8}$/) === 0) {
          EnigmailCore.getService();

          let k = GetKeyRing().getKeyById(keyId);
          if (k) {
            id.setCharAttribute("pgpkeyId", "0x" + k.fpr);
          } else {
            id.setCharAttribute("pgpkeyId", "");
          }
        }
      }
    }
  } catch (ex) {
    EnigmailDialog.alert("config upgrade: error" + ex.toString());
  }
}

/**
 * Change the default to PGP/MIME for all accounts, except nntp
 * (v1.8.x -> v1.9)
 */
function defaultPgpMime() {
  let changedSomething = false;

  for (let ac of MailServices.accounts.accounts) {
    if (ac.incomingServer.type.search(/(pop3|imap|movemail)/) >= 0) {
      for (let i = 0; i < ac.identities.length; i++) {
        let id = ac.identities.queryElementAt(i, Ci.nsIMsgIdentity);
        if (
          id.getBoolAttribute("enablePgp") &&
          !id.getBoolAttribute("pgpMimeMode")
        ) {
          changedSomething = true;
        }
        id.setBoolAttribute("pgpMimeMode", true);
      }
    }
  }

  if (EnigmailPrefs.getPref("advancedUser") && changedSomething) {
    EnigmailDialog.alert(
      null,
      EnigmailLocale.getString("preferences.defaultToPgpMime")
    );
  }
}

/**
 * set the Autocrypt prefer-encrypt option to "mutual" for all existing
 * accounts
 */
function setAutocryptForOldAccounts() {
  try {
    for (let ac of MailServices.accounts.accounts) {
      if (ac.incomingServer.type.search(/(pop3|imap|movemail)/) >= 0) {
        ac.incomingServer.setIntValue("acPreferEncrypt", 1);
      }
    }
  } catch (ex) {}
}

function setDefaultKeyServer() {
  EnigmailLog.DEBUG("configure.jsm: setDefaultKeyServer()\n");

  let ks = EnigmailPrefs.getPref("keyserver");

  if (ks.search(/^ldaps?:\/\//) < 0) {
    ks = "vks://keys.openpgp.org, " + ks;
  }

  ks = ks.replace(/hkps:\/\/keys.openpgp.org/g, "vks://keys.openpgp.org");
  EnigmailPrefs.setPref("keyserver", ks);
}

function displayUpgradeInfo() {
  EnigmailLog.DEBUG("configure.jsm: displayUpgradeInfo()\n");
  try {
    EnigmailWindows.openMailTab("chrome://openpgp/content/ui/upgradeInfo.html");
  } catch (ex) {}
}

var EnigmailConfigure = {
  /**
   * configureEnigmail: main function for configuring Enigmail during the first run
   * this method is called from core.jsm if Enigmail has not been set up before
   * (determined via checking the configuredVersion in the preferences)
   *
   * @param {nsIWindow} win:                 The parent window. Null if no parent window available
   * @param {Boolean}   startingPreferences: if true, called while switching to new preferences
   *                        (to avoid re-check for preferences)
   *
   * @return {Promise<null>}
   */
  async configureEnigmail(win, startingPreferences) {
    EnigmailLog.DEBUG("configure.jsm: configureEnigmail()\n");

    if (!EnigmailStdlib.hasConfiguredAccounts()) {
      EnigmailLog.DEBUG(
        "configure.jsm: configureEnigmail: no account configured. Waiting 60 seconds.\n"
      );

      // try again in 60 seconds
      EnigmailTimer.setTimeout(function() {
        EnigmailConfigure.configureEnigmail(win, startingPreferences);
      }, 60000);
      return;
    }

    let oldVer = EnigmailPrefs.getPref("configuredVersion");

    if (oldVer === "") {
      try {
        await EnigmailAutoSetup.determinePreviousInstallType();

        switch (EnigmailAutoSetup.value) {
          case EnigmailConstants.AUTOSETUP_NOT_INITIALIZED:
          case EnigmailConstants.AUTOSETUP_NO_ACCOUNT:
            break;
          default:
            EnigmailPrefs.setPref(
              "configuredVersion",
              EnigmailApp.getVersion()
            );
            EnigmailWindows.openSetupWizard(win);
        }
      } catch (x) {
        // ignore exceptions and proceed without setup wizard
      }
    } else {
      if (Services.vc.compare(oldVer, "1.7a1pre") < 0) {
        // 1: rules only
        //     => assignKeysByRules true; rest false
        // 2: rules & email addresses (normal)
        //     => assignKeysByRules/assignKeysByEmailAddr/assignKeysManuallyIfMissing true
        // 3: email address only (no rules)
        //     => assignKeysByEmailAddr/assignKeysManuallyIfMissing true
        // 4: manually (always prompt, no rules)
        //     => assignKeysManuallyAlways true
        // 5: no rules, no key selection
        //     => assignKeysByRules/assignKeysByEmailAddr true

        upgradePrefsSending();
      }
      if (Services.vc.compare(oldVer, "1.7") < 0) {
        // open a modal dialog. Since this might happen during the opening of another
        // window, we have to do this asynchronously
        EnigmailTimer.setTimeout(function() {
          var doIt = EnigmailDialog.confirmDlg(
            win,
            EnigmailLocale.getString(
              "enigmailCommon.versionSignificantlyChanged"
            ),
            EnigmailLocale.getString("enigmailCommon.checkPreferences"),
            EnigmailLocale.getString("dlg.button.close")
          );
          if (!startingPreferences && doIt) {
            // same as:
            // - EnigmailWindows.openPrefWindow(window, true, 'sendingTab');
            // but
            // - without starting the service again because we do that right now
            // - and modal (waiting for its end)
            win.openDialog(
              "chrome://openpgp/content/ui/pref-enigmail.xhtml",
              "_blank",
              "chrome,resizable=yes,modal",
              {
                showBasic: true,
                clientType: "thunderbird",
                selectTab: "sendingTab",
              }
            );
          }
        }, 100);
      }

      if (Services.vc.compare(oldVer, "1.9a2pre") < 0) {
        defaultPgpMime();
      }
      if (Services.vc.compare(oldVer, "2.0a1pre") < 0) {
        this.upgradeTo20();
      }
      if (Services.vc.compare(oldVer, "2.0.1a2pre") < 0) {
        this.upgradeTo201();
      }
      if (Services.vc.compare(oldVer, "2.1b2") < 0) {
        this.upgradeTo21();
      }
    }

    EnigmailPrefs.setPref("configuredVersion", EnigmailApp.getVersion());
    EnigmailPrefs.savePrefs();
  },

  upgradeTo20() {
    replaceKeyIdWithFpr();
    displayUpgradeInfo();
  },

  upgradeTo201() {
    setAutocryptForOldAccounts();
  },

  upgradeTo21() {
    setDefaultKeyServer();
  },
};
