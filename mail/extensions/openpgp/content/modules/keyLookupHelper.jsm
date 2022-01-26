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
  async lookupAndImportOnKeyserver(
    mode,
    window,
    identifier,
    giveFeedbackToUser
  ) {
    let defKs = EnigmailKeyserverURIs.getDefaultKeyServer();
    if (!defKs) {
      return false;
    }

    let somethingWasImported = false;
    let vks = await EnigmailKeyServer.downloadNoImport(identifier, defKs);
    if (vks && "keyData" in vks) {
      let errorInfo = {};
      let keyList = await EnigmailKey.getKeyListFromKeyBlock(
        vks.keyData,
        errorInfo,
        false,
        true,
        false
      );
      if (keyList) {
        if (keyList.length != 1) {
          throw new Error(
            "Unexpected multiple results from verifying keyserver."
          );
        }

        let oldKey = EnigmailKeyRing.getKeyById(keyList[0].fpr);
        if (oldKey) {
          await EnigmailKeyRing.importKeyDataSilent(
            window,
            vks.keyData,
            true,
            "0x" + keyList[0].fpr
          );

          let updatedKey = EnigmailKeyRing.getKeyById(keyList[0].fpr);
          // If new imported/merged key is equal to old key,
          // don't notify about new keys details.
          if (JSON.stringify(oldKey) !== JSON.stringify(updatedKey)) {
            somethingWasImported = true;
            if (mode == "interactive-import") {
              EnigmailDialog.keyImportDlg(
                window,
                keyList.map(a => a.id)
              );
            }
          }
        } else {
          if (mode == "interactive-import") {
            somethingWasImported = await EnigmailKeyRing.importKeyDataWithConfirmation(
              window,
              keyList,
              vks.keyData,
              true
            );
          }
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
            somethingWasImported = true;
          }
        }
      } else {
        console.log(
          "failed to process data retrieved from keyserver: " + errorInfo.value
        );
      }
    } else {
      console.debug("searchKeysOnInternet no data found on keyserver");
    }

    return somethingWasImported;
  },

  /**
   * @param {string} searchTerm - The 0x prefxed keyId or email address to search for.
   * @param {boolean} giveFeedbackToUser - Whether to show feedback to user or handle it silently.
   * @return {boolean} true if a key was imported
   */
  async lookupAndImportBySearchTerm(
    mode,
    window,
    searchTerm,
    giveFeedbackToUser
  ) {
    let somethingWasImported = await this.lookupAndImportOnKeyserver(
      mode,
      window,
      searchTerm,
      giveFeedbackToUser
    );
    return somethingWasImported;
  },

  async lookupAndImportByKeyID(mode, window, keyId, giveFeedbackToUser) {
    if (!/^0x/i.test(keyId)) {
      keyId = "0x" + keyId;
    }
    let somethingWasImported = await this.lookupAndImportBySearchTerm(
      mode,
      window,
      keyId,
      giveFeedbackToUser
    );
    if (
      mode == "interactive-import" &&
      giveFeedbackToUser &&
      !somethingWasImported
    ) {
      let value = await l10n.formatValue("no-key-found");
      EnigmailDialog.alert(window, value);
    }
    return somethingWasImported;
  },

  async lookupAndImportByEmail(mode, window, email, giveFeedbackToUser) {
    let somethingWasImported = false;

    let wkdResult;
    let wkdUrl;
    if (EnigmailWkdLookup.isWkdAvailable(email)) {
      wkdUrl = await EnigmailWkdLookup.getDownloadUrlFromEmail(email, true);
      wkdResult = await EnigmailWkdLookup.downloadKey(wkdUrl);
      if (!wkdResult) {
        wkdUrl = await EnigmailWkdLookup.getDownloadUrlFromEmail(email, false);
        wkdResult = await EnigmailWkdLookup.downloadKey(wkdUrl);
      }
    }

    if (!wkdResult) {
      console.debug("searchKeysOnInternet no wkd data for " + email);
    } else {
      let errorInfo = {};
      let keyList = await EnigmailKey.getKeyListFromKeyBlock(
        wkdResult,
        errorInfo,
        false,
        true,
        false,
        true
      );
      if (!keyList) {
        console.log(
          "failed to process data retrieved from WKD server: " + errorInfo.value
        );
      } else {
        let existingKeys = [];
        let newKeys = [];

        for (let wkdKey of keyList) {
          let oldKey = EnigmailKeyRing.getKeyById(wkdKey.fpr);
          if (oldKey) {
            await EnigmailKeyRing.importKeyDataSilent(
              window,
              wkdKey.pubKey,
              true,
              "0x" + wkdKey.fpr
            );

            let updatedKey = EnigmailKeyRing.getKeyById(wkdKey.fpr);
            // If new imported/merged key is equal to old key,
            // don't notify about new keys details.
            if (JSON.stringify(oldKey) !== JSON.stringify(updatedKey)) {
              existingKeys.push(wkdKey.id);
            }
          } else {
            newKeys.push(wkdKey);
          }
        }

        if (existingKeys.length) {
          if (mode == "interactive-import") {
            EnigmailDialog.keyImportDlg(window, existingKeys);
          }
          somethingWasImported = true;
        }

        if (newKeys.length && mode == "interactive-import") {
          somethingWasImported = await EnigmailKeyRing.importKeyArrayWithConfirmation(
            window,
            newKeys,
            true
          );
        }
        if (!somethingWasImported) {
          let db = await CollectedKeysDB.getInstance();
          for (let newKey of newKeys) {
            // If key is known in the db: merge + update.
            let key = await db.mergeExisting(newKey, newKey.pubKey, {
              uri: wkdUrl,
              type: "WKD",
            });
            await db.storeKey(key);
          }
          somethingWasImported = true;
        }
      }
    }

    let somethingWasImported2 = await this.lookupAndImportBySearchTerm(
      mode,
      window,
      email,
      giveFeedbackToUser
    );

    if (
      mode == "interactive-import" &&
      giveFeedbackToUser &&
      !somethingWasImported &&
      !somethingWasImported2
    ) {
      let value = await l10n.formatValue("no-key-found");
      EnigmailDialog.alert(window, value);
    }

    return somethingWasImported || somethingWasImported2;
  },

  /**
   * This function will perform discovery of new or updated OpenPGP
   * keys using various mechanisms.
   *
   * @param {string} mode - "interactive-import" or "silent-collection"
   * @param {string} email - search for keys for this email address,
   *                         (parameter allowed to be null or empty)
   * @param {string[]} keyIds - KeyIDs that should be updated.
   *                            (parameter allowed to be null or empty)
   *
   * @return {Boolean} - Returns true if at least one key was imported.
   */
  async fullOnlineDiscovery(mode, window, email, keyIds) {
    // Try to get updates for all existing keys from keyserver,
    // by key ID, to get updated validy/revocation info.
    // (A revoked key on the keyserver might have no user ID.)
    let atLeastoneImport = false;
    if (keyIds) {
      for (let keyId of keyIds) {
        // Ensure the function call goes first in the logic or expression,
        // to ensure it's always called, even if atLeastoneImport is already true.
        let rv = await this.lookupAndImportByKeyID(mode, window, keyId, false);
        atLeastoneImport = rv || atLeastoneImport;
      }
    }
    // Now check for updated or new keys by email address
    let rv2 = await this.lookupAndImportByEmail(mode, window, email, false);
    atLeastoneImport = rv2 || atLeastoneImport;
    return atLeastoneImport;
  },
};
