/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

var gCurrentApi = null;
var gGnuPGApi = null;

export function EnigmailCryptoAPI() {
  if (!gCurrentApi) {
    const { getRNPAPI } = ChromeUtils.importESModule(
      "chrome://openpgp/content/modules/cryptoAPI/RNPCryptoAPI.sys.mjs"
    );
    gCurrentApi = getRNPAPI();
  }
  return gCurrentApi;
}

export function EnigmailGnuPGAPI() {
  if (!gGnuPGApi) {
    const { getGnuPGAPI } = ChromeUtils.importESModule(
      "chrome://openpgp/content/modules/cryptoAPI/GnuPGCryptoAPI.sys.mjs"
    );
    gGnuPGApi = getGnuPGAPI();
  }
  return gGnuPGApi;
}
