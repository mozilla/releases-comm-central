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

const EnigmailLazy = ChromeUtils.import(
  "chrome://openpgp/content/modules/lazy.jsm"
).EnigmailLazy;

const getEnigmailApp = EnigmailLazy.loader("enigmail/app.jsm", "EnigmailApp");
const getEnigmailCore = EnigmailLazy.loader(
  "enigmail/core.jsm",
  "EnigmailCore"
);
const getEnigmailAmPrefsService = EnigmailLazy.loader(
  "enigmail/amPrefsService.jsm",
  "EnigmailAmPrefsService"
);
const getEnigmailPgpmimeHander = EnigmailLazy.loader(
  "enigmail/pgpmimeHandler.jsm",
  "EnigmailPgpmimeHander"
);
const getRNP = EnigmailLazy.loader("enigmail/rnp.jsm", "RNP");
const getEnigmailWindows = EnigmailLazy.loader(
  "enigmail/windows.jsm",
  "EnigmailWindows"
);

var BondOpenPGP = {
  logException(exc) {
    try {
      Services.console.logStringMessage(exc.toString() + "\n" + exc.stack);
    } catch (x) {}
  },

  initDone: false,

  init() {
    if (!MailConstants.MOZ_OPENPGP) {
      return;
    }
    if (this.initDone) {
      return;
    }
    this.initDone = true;
    console.log("loading OpenPGP");
    try {
      getRNP().init({});
      //TODO: check RNP.libLoaded

      getEnigmailApp().initAddon();
      getEnigmailAmPrefsService().startup(0);
      getEnigmailCore().startup(0);
      getEnigmailPgpmimeHander().startup(0);

      Services.console.logStringMessage("OpenPGP bootstrap completed");
    } catch (ex) {
      this.logException(ex);
    }
  },

  openKeyManager(window) {
    getEnigmailWindows().openKeyManager(window);
  },
};

BondOpenPGP.init();
