/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["KeyLookupHelper"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  CollectedKeysDB: "chrome://openpgp/content/modules/CollectedKeysDB.jsm",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  EnigmailKey: "chrome://openpgp/content/modules/key.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailKeyServer: "chrome://openpgp/content/modules/keyserver.jsm",
  EnigmailKeyserverURIs: "chrome://openpgp/content/modules/keyserverUris.jsm",
  EnigmailWkdLookup: "chrome://openpgp/content/modules/wkdLookup.jsm",
});

XPCOMUtils.defineLazyGetter(this, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

var KeyLookupHelper = {
  async lookupAndImportOnKeyserver(window, identifier, giveFeedbackToUser) {
    let defKs = EnigmailKeyserverURIs.getDefaultKeyServer();
    if (!defKs) {
      return false;
    }

    let somethingWasImported = false;
    let vks = await EnigmailKeyServer.downloadNoImport(identifier, defKs);
    if (vks && "keyData" in vks) {
      let keyList = await EnigmailKey.getKeyListFromKeyBlock(
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
        if (!somethingWasImported) {
          let db = await CollectedKeysDB.getInstance();
          for (let newKey of keyList) {
            // If key is known in the db: merge + update.
            let key = await db.mergeExisting(newKey, vks.keyData, {
              uri: EnigmailKeyServer.serverReqURL(`0x${newKey.fpr}`, defKs),
              type: "keyserver",
            });
            await db.storeKey(key);
          }
        }
      } else {
        EnigmailDialog.alert(window, await l10n.formatValue("preview-failed"));
      }
    } else {
      console.debug("searchKeysOnInternet no data in keys.openpgp.org");
    }

    return somethingWasImported;
  },

  /**
   * @param {string} searchTerm - The 0x prefxed keyId or email address to search for.
   * @param {boolean} giveFeedbackToUser - Whether to show feedback to user or handle it silently.
   * @return {boolean} true if a key was imported
   */
  async lookupAndImportBySearchTerm(window, searchTerm, giveFeedbackToUser) {
    let somethingWasImported = await this.lookupAndImportOnKeyserver(
      window,
      searchTerm,
      giveFeedbackToUser
    );
    if (!somethingWasImported) {
      let value = await l10n.formatValue("no-key-found");
      EnigmailDialog.alert(window, value);
    }
    return somethingWasImported;
  },

  async lookupAndImportByKeyID(window, keyId, giveFeedbackToUser) {
    if (!/^0x/i.test(keyId)) {
      keyId = "0x" + keyId;
    }
    return this.lookupAndImportBySearchTerm(window, keyId, giveFeedbackToUser);
  },

  async lookupAndImportByEmail(window, email, giveFeedbackToUser) {
    let wkdKeys = await EnigmailWkdLookup.downloadKey(email);
    if (!wkdKeys) {
      console.debug("searchKeysOnInternet no wkd data for " + email);
    } else {
      let keyList = await EnigmailKey.getKeyListFromKeyBlock(
        wkdKeys.keyData,
        {},
        false,
        true,
        false
      );
      if (!keyList) {
        EnigmailDialog.alert(window, await l10n.formatValue("preview-failed"));
      } else {
        let somethingWasImported = EnigmailKeyRing.importKeyDataWithConfirmation(
          window,
          keyList,
          wkdKeys.keyData,
          true
        );
        if (somethingWasImported) {
          return true;
        }
      }
    }

    return this.lookupAndImportBySearchTerm(window, email, giveFeedbackToUser);
  },
};
