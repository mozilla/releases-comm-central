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
    const {
      getGnuPGAPI
    } = ChromeUtils.import("chrome://openpgp/content/modules/cryptoAPI/gnupg.js");

    gCurrentApi = getGnuPGAPI();
  }

  return gCurrentApi;
}
