/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["KeyLookupHelper"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  CollectedKeysDB: "chrome://openpgp/content/modules/CollectedKeysDB.jsm",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  EnigmailKey: "chrome://openpgp/content/modules/key.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailKeyServer: "chrome://openpgp/content/modules/keyserver.jsm",
  EnigmailKeyserverURIs: "chrome://openpgp/content/modules/keyserverUris.jsm",
  EnigmailWkdLookup: "chrome://openpgp/content/modules/wkdLookup.jsm",
});

XPCOMUtils.defineLazyGetter(lazy, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

var KeyLookupHelper = {
  /**
   * Internal helper function, search for keys by either keyID
   * or email address on a keyserver.
   * Returns additional flags regarding lookup and import.
   * Will never show feedback prompts.
   *
   * @param {string} mode - "interactive-import" or "silent-collection"
   *    In interactive-import mode, the user will be asked to confirm
   *    import of keys into the permanent keyring.
   *    In silent-collection mode, only updates to existing keys will
   *    be imported. New keys will only be added to CollectedKeysDB.
   * @param {nsIWindow} window - parent window
   * @param {string} identifier - search value, either key ID or fingerprint or email address.
   * @returns {object} flags
   * @returns {boolean} flags.keyImported - At least one key was imported.
   * @returns {boolean} flags.foundUpdated - At least one update for a local existing key was found and imported.
   * @returns {boolean} flags.foundUnchanged - All found keys are identical to already existing local keys.
   * @returns {boolean} flags.collectedForLater - At least one key was added to CollectedKeysDB.
   */

  isExpiredOrRevoked(keyTrust) {
    return keyTrust.match(/e/i) || keyTrust.match(/r/i);
  },

  async _lookupAndImportOnKeyserver(mode, window, identifier) {
    let keyImported = false;
    let foundUpdated = false;
    let foundUnchanged = false;
    let collectedForLater = false;

    const ksArray = lazy.EnigmailKeyserverURIs.getKeyServers();
    if (!ksArray.length) {
      return false;
    }

    let continueSearching = true;
    for (const ks of ksArray) {
      let foundKey;
      if (ks.startsWith("vks://")) {
        foundKey = await lazy.EnigmailKeyServer.downloadNoImport(
          identifier,
          ks
        );
      } else if (ks.startsWith("hkp://") || ks.startsWith("hkps://")) {
        foundKey =
          await lazy.EnigmailKeyServer.searchAndDownloadSingleResultNoImport(
            identifier,
            ks
          );
      }
      if (foundKey && "keyData" in foundKey) {
        const errorInfo = {};
        let keyList = await lazy.EnigmailKey.getKeyListFromKeyBlock(
          foundKey.keyData,
          errorInfo,
          false,
          true,
          false
        );
        // We might get a zero length keyList, if we refuse to use the key
        // that we received because of its properties.
        if (keyList && keyList.length == 1) {
          const oldKey = lazy.EnigmailKeyRing.getKeyById(keyList[0].fpr);
          if (oldKey) {
            await lazy.EnigmailKeyRing.importKeyDataSilent(
              window,
              foundKey.keyData,
              true,
              "0x" + keyList[0].fpr
            );

            const updatedKey = lazy.EnigmailKeyRing.getKeyById(keyList[0].fpr);
            // If new imported/merged key is equal to old key,
            // don't notify about new keys details.
            if (JSON.stringify(oldKey) !== JSON.stringify(updatedKey)) {
              foundUpdated = true;
              keyImported = true;
              if (mode == "interactive-import") {
                lazy.EnigmailDialog.keyImportDlg(
                  window,
                  keyList.map(a => a.id)
                );
              }
            } else {
              foundUnchanged = true;
            }
          } else {
            keyList = keyList.filter(k => k.userIds.length);
            keyList = keyList.filter(k => !this.isExpiredOrRevoked(k.keyTrust));
            if (keyList.length && mode == "interactive-import") {
              keyImported =
                await lazy.EnigmailKeyRing.importKeyDataWithConfirmation(
                  window,
                  keyList,
                  foundKey.keyData,
                  true
                );
              if (keyImported) {
                // In interactive mode, don't offer the user to import keys multiple times.
                // When silently collecting keys, it's fine to discover everything we can.
                continueSearching = false;
              }
            }
            if (!keyImported) {
              collectedForLater = true;
              const db = await lazy.CollectedKeysDB.getInstance();
              for (const newKey of keyList) {
                // If key is known in the db: merge + update.
                const key = await db.mergeExisting(newKey, foundKey.keyData, {
                  uri: lazy.EnigmailKeyServer.serverReqURL(
                    `0x${newKey.fpr}`,
                    ks
                  ),
                  type: "keyserver",
                });
                await db.storeKey(key);
              }
            }
          }
        } else {
          if (keyList && keyList.length > 1) {
            throw new Error("Unexpected multiple results from keyserver " + ks);
          }
          console.log(
            "failed to process data retrieved from keyserver " +
              ks +
              ": " +
              errorInfo.value
          );
        }
      }
      if (!continueSearching) {
        break;
      }
    }

    return { keyImported, foundUpdated, foundUnchanged, collectedForLater };
  },

  /**
   * Search online for keys by key ID on keyserver.
   *
   * @param {string} mode - "interactive-import" or "silent-collection"
   *    In interactive-import mode, the user will be asked to confirm
   *    import of keys into the permanent keyring.
   *    In silent-collection mode, only updates to existing keys will
   *    be imported. New keys will only be added to CollectedKeysDB.
   * @param {nsIWindow} window - parent window
   * @param {string} keyId - the key ID to search for.
   * @param {boolean} giveFeedbackToUser - false to be silent,
   *    true to show feedback to user after search and import is complete.
   * @returns {boolean} - true if at least one key was imported.
   */
  async lookupAndImportByKeyID(mode, window, keyId, giveFeedbackToUser) {
    if (!/^0x/i.test(keyId)) {
      keyId = "0x" + keyId;
    }
    const importResult = await this._lookupAndImportOnKeyserver(
      mode,
      window,
      keyId
    );
    if (
      mode == "interactive-import" &&
      giveFeedbackToUser &&
      !importResult.keyImported
    ) {
      let msgId;
      if (importResult.foundUnchanged) {
        msgId = "no-update-found";
      } else {
        msgId = "no-key-found2";
      }
      const value = await lazy.l10n.formatValue(msgId);
      lazy.EnigmailDialog.alert(window, value);
    }
    return importResult.keyImported;
  },

  /**
   * Search online for keys by email address.
   * Will search both WKD and keyserver.
   *
   * @param {string} mode - "interactive-import" or "silent-collection"
   *    In interactive-import mode, the user will be asked to confirm
   *    import of keys into the permanent keyring.
   *    In silent-collection mode, only updates to existing keys will
   *    be imported. New keys will only be added to CollectedKeysDB.
   * @param {nsIWindow} window - parent window
   * @param {string} email - the email address to search for.
   * @param {boolean} giveFeedbackToUser - false to be silent,
   *    true to show feedback to user after search and import is complete.
   * @returns {boolean} - true if at least one key was imported.
   */
  async lookupAndImportByEmail(mode, window, email, giveFeedbackToUser) {
    let resultKeyImported = false;

    let wkdKeyImported = false;
    let wkdFoundUnchanged = false;

    let wkdResult;
    let wkdUrl;
    if (lazy.EnigmailWkdLookup.isWkdAvailable(email)) {
      wkdUrl = await lazy.EnigmailWkdLookup.getDownloadUrlFromEmail(
        email,
        true
      );
      wkdResult = await lazy.EnigmailWkdLookup.downloadKey(wkdUrl);
      if (!wkdResult) {
        wkdUrl = await lazy.EnigmailWkdLookup.getDownloadUrlFromEmail(
          email,
          false
        );
        wkdResult = await lazy.EnigmailWkdLookup.downloadKey(wkdUrl);
      }
    }

    if (!wkdResult) {
      console.debug("searchKeysOnInternet no wkd data for " + email);
    } else {
      const errorInfo = {};
      const keyList = await lazy.EnigmailKey.getKeyListFromKeyBlock(
        wkdResult,
        errorInfo,
        false,
        true,
        false,
        true
      );
      if (!keyList) {
        console.debug(
          "failed to process data retrieved from WKD server: " + errorInfo.value
        );
      } else {
        const existingKeys = [];
        let newKeys = [];

        for (const wkdKey of keyList) {
          const oldKey = lazy.EnigmailKeyRing.getKeyById(wkdKey.fpr);
          if (oldKey) {
            await lazy.EnigmailKeyRing.importKeyDataSilent(
              window,
              wkdKey.pubKey,
              true,
              "0x" + wkdKey.fpr
            );

            const updatedKey = lazy.EnigmailKeyRing.getKeyById(wkdKey.fpr);
            // If new imported/merged key is equal to old key,
            // don't notify about new keys details.
            if (JSON.stringify(oldKey) !== JSON.stringify(updatedKey)) {
              // If a caller ever needs information what we found,
              // this is the place to set: wkdFoundUpdated = true
              existingKeys.push(wkdKey.id);
            } else {
              wkdFoundUnchanged = true;
            }
          } else if (wkdKey.userIds.length) {
            newKeys.push(wkdKey);
          }
        }

        if (existingKeys.length) {
          if (mode == "interactive-import") {
            lazy.EnigmailDialog.keyImportDlg(window, existingKeys);
          }
          wkdKeyImported = true;
        }

        newKeys = newKeys.filter(k => !this.isExpiredOrRevoked(k.keyTrust));
        if (newKeys.length && mode == "interactive-import") {
          wkdKeyImported =
            wkdKeyImported ||
            (await lazy.EnigmailKeyRing.importKeyArrayWithConfirmation(
              window,
              newKeys,
              true
            ));
        }
        if (!wkdKeyImported) {
          // If a caller ever needs information what we found,
          // this is the place to set: wkdCollectedForLater = true
          const db = await lazy.CollectedKeysDB.getInstance();
          for (const newKey of newKeys) {
            // If key is known in the db: merge + update.
            const key = await db.mergeExisting(newKey, newKey.pubKey, {
              uri: wkdUrl,
              type: "wkd",
            });
            await db.storeKey(key);
          }
        }
      }
    }

    const { keyImported, foundUnchanged } =
      await this._lookupAndImportOnKeyserver(mode, window, email);
    resultKeyImported = wkdKeyImported || keyImported;

    if (
      mode == "interactive-import" &&
      giveFeedbackToUser &&
      !resultKeyImported &&
      !keyImported
    ) {
      let msgId;
      if (wkdFoundUnchanged || foundUnchanged) {
        msgId = "no-update-found";
      } else {
        msgId = "no-key-found2";
      }
      const value = await lazy.l10n.formatValue(msgId);
      lazy.EnigmailDialog.alert(window, value);
    }

    return resultKeyImported;
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
   * @returns {boolean} - Returns true if at least one key was imported.
   */
  async fullOnlineDiscovery(mode, window, email, keyIds) {
    // Try to get updates for all existing keys from keyserver,
    // by key ID, to get updated validy/revocation info.
    // (A revoked key on the keyserver might have no user ID.)
    let atLeastoneImport = false;
    if (keyIds) {
      for (const keyId of keyIds) {
        // Ensure the function call goes first in the logic or expression,
        // to ensure it's always called, even if atLeastoneImport is already true.
        const rv = await this.lookupAndImportByKeyID(
          mode,
          window,
          keyId,
          false
        );
        atLeastoneImport = rv || atLeastoneImport;
      }
    }
    // Now check for updated or new keys by email address
    const rv2 = await this.lookupAndImportByEmail(mode, window, email, false);
    atLeastoneImport = rv2 || atLeastoneImport;
    return atLeastoneImport;
  },
};
