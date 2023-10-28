/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailKeyserverURIs"];

function getKeyServers() {
  const keyservers = Services.prefs
    .getCharPref("mail.openpgp.keyserver_list")
    .split(/\s*[,;]\s*/g);
  return keyservers.filter(
    ks =>
      ks.startsWith("vks://") ||
      ks.startsWith("hkp://") ||
      ks.startsWith("hkps://")
  );
}

function getUploadKeyServer() {
  const keyservers = Services.prefs
    .getCharPref("mail.openpgp.keyserver_list")
    .split(/\s*[,;]\s*/g);
  for (const ks of keyservers) {
    if (
      !ks.startsWith("vks://") &&
      !ks.startsWith("hkp://") &&
      !ks.startsWith("hkps://")
    ) {
      continue;
    }
    return ks;
  }
  return null;
}

var EnigmailKeyserverURIs = {
  getKeyServers,
  getUploadKeyServer,
};
