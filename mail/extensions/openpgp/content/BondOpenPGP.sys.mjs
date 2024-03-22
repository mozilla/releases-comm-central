/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * This file is a thin interface on top of the rest of the OpenPGP
 * integration ot minimize the amount of code that must be
 * included in files outside the extensions/openpgp directory.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.sys.mjs",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.sys.mjs",
  EnigmailCore: "chrome://openpgp/content/modules/core.sys.mjs",
  RNP: "chrome://openpgp/content/modules/RNP.sys.mjs",
  GPGME: "chrome://openpgp/content/modules/GPGME.sys.mjs",
});

export var BondOpenPGP = {
  logException(exc) {
    try {
      Services.console.logStringMessage(exc.toString() + "\n" + exc.stack);
    } catch (x) {}
  },

  _alreadyTriedInit: false, // if already true, we will not try again

  async init() {
    if (this._alreadyTriedInit) {
      // We have previously attempted to init, don't try again.
      return;
    }

    this._alreadyTriedInit = true;

    lazy.EnigmailKeyRing.init();
    lazy.EnigmailVerify.init();

    const initDone = await lazy.RNP.init();
    if (!initDone) {
      const { error } = this.getRNPLibStatus();
      throw new Error(error);
    }

    if (Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg")) {
      lazy.GPGME.init();
    }

    // trigger service init
    await lazy.EnigmailCore.init();
  },

  getRNPLibStatus() {
    return lazy.RNP.getRNPLibStatus();
  },
};
