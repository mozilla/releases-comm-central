/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailCryptoAPI", "EnigmailGnuPGAPI"];

var gCurrentApi = null;
var gGnuPGApi = null;

function EnigmailCryptoAPI() {
  if (!gCurrentApi) {
    const { getRNPAPI } = ChromeUtils.import(
      "chrome://openpgp/content/modules/cryptoAPI/RNPCryptoAPI.jsm"
    );
    gCurrentApi = getRNPAPI();
  }
  return gCurrentApi;
}

function EnigmailGnuPGAPI() {
  if (!gGnuPGApi) {
    const { getGnuPGAPI } = ChromeUtils.import(
      "chrome://openpgp/content/modules/cryptoAPI/GnuPGCryptoAPI.jsm"
    );
    gGnuPGApi = getGnuPGAPI();
  }
  return gGnuPGApi;
}
