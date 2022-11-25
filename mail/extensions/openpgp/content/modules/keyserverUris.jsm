/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailKeyserverURIs"];

function getDefaultKeyServer() {
  let keyservers = Services.prefs
    .getCharPref("mail.openpgp.keyserver_list")
    .split(/\s*[,;]\s*/g);
  let defKs = keyservers[0];
  // We don't have great code yet to handle multiple results,
  // or poisoned results. So avoid SKS.
  // Let's start with verifying keyservers, only, which return only
  // one result.
  if (
    !defKs.startsWith("vks://") &&
    !defKs.startsWith("hkp://") &&
    !defKs.startsWith("hkps://")
  ) {
    console.debug("Not using " + defKs + " in getDefaultKeyServer");
    return null;
  }
  return defKs;
}

function getKeyServers() {
  let keyservers = Services.prefs
    .getCharPref("mail.openpgp.keyserver_list")
    .split(/\s*[,;]\s*/g);
  return keyservers.filter(
    ks =>
      ks.startsWith("vks://") ||
      ks.startsWith("hkp://") ||
      ks.startsWith("hkps://")
  );
}

var EnigmailKeyserverURIs = {
  getDefaultKeyServer,
  getKeyServers,
};
