/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This file is a thin interface on top of the rest of the OpenPGP
 * integration ot minimize the amount of code that must be
 * included in files outside the extensions/openpgp directory. */

"use strict";

const EXPORTED_SYMBOLS = ["BondOpenPGP"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailConstants } = ChromeUtils.import(
  "resource:///modules/MailConstants.jsm"
);

var { EnigmailLazy } = ChromeUtils.import(
  "chrome://openpgp/content/modules/lazy.jsm"
);

var getEnigmailCore = EnigmailLazy.loader("enigmail/core.jsm", "EnigmailCore");
var getOpenPGPMasterpass = EnigmailLazy.loader(
  "enigmail/masterpass.jsm",
  "OpenPGPMasterpass"
);
var getRNP = EnigmailLazy.loader("enigmail/RNP.jsm", "RNP");
var getGPGME = EnigmailLazy.loader("enigmail/GPGME.jsm", "GPGME");
var getEnigmailWindows = EnigmailLazy.loader(
  "enigmail/windows.jsm",
  "EnigmailWindows"
);

/*
// Enable this block to view syntax errors in these files, which are
// difficult to see when lazy loading.
var { GPGME } = ChromeUtils.import(
  "chrome://openpgp/content/modules/GPGME.jsm"
);
var { RNP } = ChromeUtils.import(
  "chrome://openpgp/content/modules/RNP.jsm"
);
var { GPGMELibLoader } = ChromeUtils.import(
  "chrome://openpgp/content/modules/GPGMELib.jsm"
);
var { RNPLibLoader } = ChromeUtils.import(
  "chrome://openpgp/content/modules/RNPLib.jsm"
);
*/

var BondOpenPGP = {
  logException(exc) {
    try {
      Services.console.logStringMessage(exc.toString() + "\n" + exc.stack);
    } catch (x) {}
  },

  isEnabled: false,
  alreadyTriedInit: false,
  initiallyPrefEnabled: false,

  init() {
    if (!MailConstants.MOZ_OPENPGP) {
      return;
    }

    if (this.isEnabled) {
      // we never shut it off after pref change, requires restart
      return;
    }

    if (this.alreadyTriedInit && this.initiallyPrefEnabled) {
      // We have previously attempted to init, don't try again.
      return;
    }

    let nowEnabled = Services.prefs.getBoolPref("mail.openpgp.enable");

    if (!this.alreadyTriedInit) {
      this.initiallyPrefEnabled = nowEnabled;
    }

    if (!nowEnabled) {
      return;
    }

    this.alreadyTriedInit = true;

    let RNP = getRNP();
    if (!RNP.init({})) {
      return;
    }

    let OpenPGPMasterpass = getOpenPGPMasterpass();
    let [prot, unprot] = RNP.getProtectedKeysCount();
    let haveAtLeastOneSecretKey = prot || unprot;

    // For user support, troubleshooting bug 1656287
    console.debug(prot + " protected and " + unprot + " unprotected keys");

    if (!OpenPGPMasterpass.haveMasterPassword() && haveAtLeastOneSecretKey) {
      // We couldn't read the OpenPGP password from file.
      // This could either mean the file doesn't exist, which indicates
      // either a corruption, or the condition after a failed migration
      // from early Enigmail migrator versions.
      // Or it could mean the user has a master password set,
      // but the user failed to enter it correctly,
      // or we are facing the consequences of multiple password prompts.

      if (!OpenPGPMasterpass.getPassPath().exists()) {
        // corruption or bug 1656287

        let secFileName = OpenPGPMasterpass.getSecretKeyRingFile().path;
        let title = "OpenPGP corruption detected";

        if (prot) {
          let info;
          if (!unprot) {
            info =
              "Your Thunderbird Profile contains inconsistent or corrupted OpenPGP data. You have secret keys that were previously protected with an automatic passphrase, " +
              "but file encrypted-openpgp-passphrase.txt is missing. File " +
              secFileName +
              " that contains your secret keys cannot be accessed. " +
              "You must manually repair this corruption by moving the file to a different folder. Then restart, then import your secret keys from a backup. " +
              "The OpenPGP functionality will be disabled until repaired. ";
          } else {
            info =
              "Your Thunderbird Profile contains inconsistent or corrupted OpenPGP data. You have secret keys that were previously protected with an automatic passphrase, " +
              "but file encrypted-openpgp-passphrase.txt is missing. File " +
              secFileName +
              " contains secret keys cannot be accessed. However, it also contains unprotected keys, which you may continue to access. " +
              "You must manually repair this corruption by moving the file to a different folder. Then restart, then import your secret keys from a backup. You may also try to import the corrupted file, to import the unprotected keys. " +
              "The OpenPGP functionality will be disabled until repaired. ";
          }
          Services.prompt.alert(null, title, info);
          throw new Error(
            "Error, secring.gpg exists, but cannot obtain password from encrypted-openpgp-passphrase.txt"
          );
        } else {
          // only unprotected keys
          // maybe https://bugzilla.mozilla.org/show_bug.cgi?id=1656287
          let info =
            "Your Thunderbird Profile contains inconsistent or corrupted OpenPGP data. You have secret keys, " +
            "but file encrypted-openpgp-passphrase.txt is missing. " +
            "If you have recently used Enigmail version 2.2 to migrate your old keys, an incomplete migration is probably the cause of the corruption. " +
            "An automatic repair can be attempted. " +
            "The OpenPGP functionality will be disabled until repaired. " +
            "Before repairing, you should make a backup of file " +
            secFileName +
            " that contains your secret keys. " +
            "After repairing, you may run the Enigmail migration again, or use OpenPGP Key Manager to accept your keys as personal keys.";

          let button =
            "I confirm I created a backup. Perform automatic repair.";

          let promptFlags =
            Services.prompt.BUTTON_POS_0 *
              Services.prompt.BUTTON_TITLE_IS_STRING +
            Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL +
            Services.prompt.BUTTON_POS_1_DEFAULT;

          let confirm = Services.prompt.confirmEx(
            null, // window
            title,
            info,
            promptFlags,
            button,
            null,
            null,
            null,
            {}
          );

          if (confirm != 0) {
            throw new Error(
              "Error, secring.gpg exists, but cannot obtain password from encrypted-openpgp-passphrase.txt"
            );
          }

          OpenPGPMasterpass.ensureMasterPassword();
          RNP.protectUnprotectedKeys();
          RNP.saveKeyRings();
        }
      } else {
        // We couldn't obtain the OpenPGP password from file,
        // the file exists. That probably means the user didn't
        // enter the master password.
      }
    } else {
      OpenPGPMasterpass.ensureMasterPassword();
    }

    if (Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg")) {
      getGPGME().init({});
    }

    // trigger service init
    let svc = getEnigmailCore().getService();
    this.isEnabled = !!svc;
  },

  allDependenciesLoaded() {
    this.init();
    if (!this.isEnabled) {
      return false;
    }
    return getRNP().allDependenciesLoaded();
  },

  openKeyManager(window) {
    if (this.allDependenciesLoaded()) {
      getEnigmailWindows().openKeyManager(window);
    }
  },
};

BondOpenPGP.init();
