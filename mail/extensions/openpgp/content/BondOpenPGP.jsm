/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This file is a thin interface on top of the rest of the OpenPGP
 * integration ot minimize the amount of code that must be
 * included in files outside the extensions/openpgp directory. */

"use strict";

const EXPORTED_SYMBOLS = ["BondOpenPGP"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.jsm",
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
  RNP: "chrome://openpgp/content/modules/RNP.jsm",
  GPGME: "chrome://openpgp/content/modules/GPGME.jsm",
  MailConstants: "resource:///modules/MailConstants.jsm",
});

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

  // if null, we haven't yet read the pref
  // if true, pref was enabled and we already triggered init
  _isEnabled: null,

  _alreadyTriedInit: false, // if already true, we will not try again

  setIsEnabledFromPref() {
    this._isEnabled = Services.prefs.getBoolPref("mail.openpgp.enable");
  },

  async init() {
    if (!MailConstants.MOZ_OPENPGP) {
      return;
    }

    // We never shut off after pref change, disabling requires restart.
    // If null, it means we're here for the first time, read the pref.
    // If false, it could mean the pref was now turned on at runtime.
    // In both scenarios, null and false, we reread the pref to check
    // if now we may try to init.

    if (!this._isEnabled) {
      this.setIsEnabledFromPref();
      if (!this._isEnabled) {
        return;
      }
    }

    if (this._alreadyTriedInit) {
      // We have previously attempted to init, don't try again.
      return;
    }

    this._alreadyTriedInit = true;

    EnigmailKeyRing.init();
    EnigmailVerify.init();

    let initDone = await RNP.init({});
    if (!initDone) {
      return;
    }

    if (Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg")) {
      GPGME.init({});
    }

    // trigger service init
    await EnigmailCore.getService();
  },

  isEnabled() {
    if (this._isEnabled == null) {
      this.setIsEnabledFromPref();
    }
    return this._isEnabled;
  },

  // We don't support a blocking wait for all OpenPGP dependencies to
  // be loaded. But we keep this API for backwards compatibility with
  // the Enigmail migrator Add-on.
  allDependenciesLoaded() {
    return this.isEnabled();
  },

  openKeyManager(window) {
    if (this.isEnabled()) {
      EnigmailWindows.openKeyManager(window);
    }
  },
};
