/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/****
   Private sub-module to GnuPGCryptoAPI.jsm for handling key import/export
 ****/

"use strict";

var EXPORTED_SYMBOLS = ["GnuPG_importKeyFromFile", "GnuPG_extractSecretKey"];

const { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);

async function GnuPG_importKeyFromFile(inputFile) {
  EnigmailLog.DEBUG(
    "gnupg-key.jsm: importKeysFromFile: fileName=" + inputFile.path + "\n"
  );
  throw new Error("Not implemented");
}

async function GnuPG_extractSecretKey(userId, minimalKey) {
  throw new Error("Not implemented");
}
