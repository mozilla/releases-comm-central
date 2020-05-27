/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["KeyLookupHelper"];

var EnigmailDialog = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
).EnigmailDialog;
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var EnigmailKeyRing = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
).EnigmailKeyRing;
var EnigmailKeyServer = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyserver.jsm"
).EnigmailKeyServer;
var { EnigmailKeyserverURIs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyserverUris.jsm"
);
var EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;
var EnigmailWkdLookup = ChromeUtils.import(
  "chrome://openpgp/content/modules/wkdLookup.jsm"
).EnigmailWkdLookup;

var KeyLookupHelper = {
  async lookupAndImportOnKeyserver(
    window,
    identifier,
    giveFeedbackToUser,
    whenDoneCB
  ) {
    let defKs = EnigmailKeyserverURIs.getDefaultKeyServer();
    if (!defKs) {
      return false;
    }

    let somethingWasImported = false;
    let vks = await EnigmailKeyServer.downloadNoImport(identifier, defKs);
    if (vks && "keyData" in vks) {
      let keyList = EnigmailKey.getKeyListFromKeyBlock(
        vks.keyData,
        {},
        false,
        true,
        false
      );
      if (keyList) {
        somethingWasImported = EnigmailKeyRing.importKeyDataWithConfirmation(
          window,
          keyList,
          vks.keyData,
          true
        );
      } else {
        EnigmailDialog.alert(window, EnigmailLocale.getString("previewFailed"));
      }
    } else {
      console.debug("searchKeysOnInternet no data in keys.openpgp.org");
    }

    return somethingWasImported;
  },

  async lookupAndImportByKeyID(window, keyId, giveFeedbackToUser, whenDoneCB) {
    return this.lookupAndImportOnKeyserver(
      window,
      "0x" + keyId,
      giveFeedbackToUser,
      whenDoneCB
    );
  },

  async lookupAndImportByEmail(window, email, giveFeedbackToUser, whenDoneCB) {
    let somethingWasImported = false;
    let wkdKeys = await EnigmailWkdLookup.downloadKey(email);
    if (!wkdKeys) {
      console.debug("searchKeysOnInternet no wkd data for " + email);
    } else {
      let keyList = EnigmailKey.getKeyListFromKeyBlock(
        wkdKeys.keyData,
        {},
        false
      );
      if (!keyList) {
        EnigmailDialog.alert(window, EnigmailLocale.getString("previewFailed"));
      } else {
        somethingWasImported = EnigmailKeyRing.importKeyDataWithConfirmation(
          window,
          keyList,
          wkdKeys.keyData,
          true
        );
        if (somethingWasImported && whenDoneCB) {
          whenDoneCB();
        }
        return;
      }
    }

    if (!somethingWasImported) {
      somethingWasImported = await this.lookupAndImportByKeyID(
        window,
        email,
        giveFeedbackToUser,
        whenDoneCB
      );
    }

    if (!somethingWasImported) {
      EnigmailDialog.alert(window, EnigmailLocale.getString("noKeyFound"));
    }
  },
};
