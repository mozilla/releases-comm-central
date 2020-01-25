/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["EnigmailCryptoAPI"];

var gCurrentApi = null;
var Services = ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

function EnigmailCryptoAPI() {
  if (!gCurrentApi) {
    const gOpenPGPEngine = Services.prefs.getIntPref("temp.openpgp.engine");
    
    if (gOpenPGPEngine == 1) {
      const {
        getRNPAPI
      } = ChromeUtils.import("chrome://openpgp/content/modules/cryptoAPI/RNPCryptoAPI.jsm");
      gCurrentApi = getRNPAPI();
    } else if (gOpenPGPEngine == 2) {
      const {
        getGnuPGAPI
      } = ChromeUtils.import("chrome://openpgp/content/modules/cryptoAPI/GnuPGCryptoAPI.jsm");
      gCurrentApi = getGnuPGAPI();
    }
  }

  return gCurrentApi;
}
