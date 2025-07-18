/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { MailStringUtils } from "resource:///modules/MailStringUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CollectedKeysDB: "chrome://openpgp/content/modules/CollectedKeysDB.sys.mjs",
  OpenPGPAlias: "chrome://openpgp/content/modules/OpenPGPAlias.sys.mjs",
  EnigmailArmor: "chrome://openpgp/content/modules/armor.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailTrust: "chrome://openpgp/content/modules/trust.sys.mjs",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.sys.mjs",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.sys.mjs",
  GPGME: "chrome://openpgp/content/modules/GPGME.sys.mjs",
  EnigmailKeyObj: "chrome://openpgp/content/modules/keyObj.sys.mjs",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.sys.mjs",
  RNP: "chrome://openpgp/content/modules/RNP.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "openpgp",
    maxLogLevel: "Warn",
    maxLogLevelPref: "openpgp.loglevel",
  });
});
ChromeUtils.defineLazyGetter(lazy, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"]);
});

import { openLinkExternally } from "resource:///modules/LinkHelper.sys.mjs";

/**
 * @typedef KeyList
 * @property {EnigmailKeyObj[]} keyList
 * @property {object[]} keySortList - Used for quickly sorting the keys.
 * @property {string} keySortList[].userId - User ID in lower case.
 * @property {string} keySortList[].keyId - Key ID.
 * @property {integer} keySortList[].keyNum
 */

/** @type {KeyList} */
let gKeyListObj = null;
let gKeyIndex = [];
let gSubkeyIndex = [];
let gLoadingKeys = false;

export var EnigmailKeyRing = {
  _initialized: false,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this.clearCache();
  },

  /**
   * Get the complete list of all public keys, optionally sorted by a column.
   *
   * @param {?window} win - Parent window for displaying error messages.
   * @param {string} sortColumn - The column name for sorting. One of:
   *   userid, keyid, keyidshort, fpr, keytype, validity, trust, created, expiry.
   * @param {1|-1} sortDirection - Sort direction: 1 = ascending / -1 = descending.
   * @returns {object} keys - Key list; { keyList, keySortList }
   * @returns {EnigmailKeyObj[]} keys.keyList - Key list. See {KeyList}.
   * @returns {object[]} keys.keySortList - Key list. See {KeyList}.
   */
  getAllKeys(win, sortColumn, sortDirection) {
    if (gKeyListObj.keySortList.length === 0) {
      loadKeyList(win, sortColumn, sortDirection);
    } else if (sortColumn) {
      gKeyListObj.keySortList.sort(
        getSortFunction(sortColumn.toLowerCase(), gKeyListObj, sortDirection)
      );
    }
    return gKeyListObj;
  },

  /**
   * Get 1st key object that matches a given key ID or subkey ID.
   *
   * @param {string} keyId - Key ID with 16 characters (preferred) or 8 characters),
   *  or fingerprint (40 or 32 characters). Optionally preceded with "0x".
   * @param {boolean} [noLoadKeys=false] - Do not try to load the key list first.
   * @returns {?EnigmailKeyObj}
   */
  getKeyById(keyId, noLoadKeys = false) {
    if (!keyId) {
      return null;
    }

    if (keyId.search(/^0x/) === 0) {
      keyId = keyId.substr(2);
    }
    keyId = keyId.toUpperCase();

    if (!noLoadKeys) {
      this.getAllKeys(); // ensure keylist is loaded;
    }

    let keyObj = gKeyIndex[keyId];

    if (keyObj === undefined) {
      keyObj = gSubkeyIndex[keyId];
    }

    return keyObj !== undefined ? keyObj : null;
  },

  isSubkeyId(keyId) {
    if (!keyId) {
      throw new Error("keyId parameter not set");
    }

    keyId = keyId.replace(/^0x/, "").toUpperCase();

    const keyObj = gSubkeyIndex[keyId];

    return keyObj !== undefined;
  },

  /**
   * Get all key objects that match a given email address.
   *
   * @param {string} email - An email address to match against all UIDs
   *   of the keys. An empty string will return no result.
   * @param {boolean} [onlyValidUid=true] - If true (default), invalid (e.g. revoked)
   *   UIDs are not matched.
   * @param {boolean} [allowExpired=false] - If true, expired keys are matched.
   * @returns {EnigmailKeyObj[]} the found keys.
   */
  getKeysByEmail(email, onlyValidUid = true, allowExpired = false) {
    const res = [];
    if (!email) {
      return res;
    }

    this.getAllKeys(); // ensure keylist is loaded;
    email = email.toLowerCase();

    for (const key of gKeyListObj.keyList) {
      if (!allowExpired && key.keyTrust == "e") {
        continue;
      }

      for (const userId of key.userIds) {
        if (userId.type !== "uid") {
          continue;
        }

        // Skip test if it's expired. If expired isn't allowed, we
        // already skipped it above.
        if (
          onlyValidUid &&
          userId.keyTrust != "e" &&
          lazy.EnigmailTrust.isInvalid(userId.keyTrust)
        ) {
          continue;
        }

        if (
          lazy.EnigmailFuncs.getEmailFromUserID(userId.userId).toLowerCase() ===
          email
        ) {
          res.push(key);
          break;
        }
      }
    }
    return res;
  },

  emailAddressesWithSecretKey: null,

  async _populateEmailHasSecretKeyCache() {
    this.getAllKeys(); // ensure keylist is loaded;
    const emailAddressesWithSecretKey = new Set();
    for (const key of gKeyListObj.keyList) {
      if (!key.secretAvailable) {
        continue;
      }
      const isPersonal = await lazy.PgpSqliteDb2.isAcceptedAsPersonalKey(
        key.fpr
      );
      if (!isPersonal) {
        continue;
      }
      for (const userId of key.userIds) {
        if (userId.type !== "uid") {
          continue;
        }
        if (lazy.EnigmailTrust.isInvalid(userId.keyTrust)) {
          continue;
        }
        emailAddressesWithSecretKey.add(
          lazy.EnigmailFuncs.getEmailFromUserID(userId.userId).toLowerCase()
        );
      }
    }
    this.emailAddressesWithSecretKey = emailAddressesWithSecretKey;
  },

  /**
   * This API uses a cache. It helps when making lookups from multiple
   * places, during a longer transaction.
   * Currently, the cache isn't refreshed automatically.
   * this.emailAddressesWithSecretKey should be set to null when keys have
   * changed and the cache needs to be refreshed.
   *
   * @param {string} emailAddr
   */
  async hasSecretKeyForEmail(emailAddr) {
    if (!this.emailAddressesWithSecretKey) {
      await this._populateEmailHasSecretKeyCache();
    }
    return this.emailAddressesWithSecretKey.has(emailAddr);
  },

  /**
   * Specialized function that takes into account the specifics of email
   * addresses in UIDs.
   *
   * @param {string} emailAddr - Email address to search for without any
   *   angulars or names.
   * @returns {?EnigmailKeyObj} with the found key, or null if no key found.
   */
  async getSecretKeyByEmail(emailAddr) {
    const result = {};
    await this.getAllSecretKeysByEmail(emailAddr, result, true);
    return result.best;
  },

  async getAllSecretKeysByEmail(emailAddr, result, allowExpired) {
    const keyList = this.getKeysByEmail(emailAddr, true, true);

    result.all = [];
    result.best = null;

    var nowDate = new Date();
    var nowSecondsSinceEpoch = nowDate.valueOf() / 1000;
    let bestIsExpired = false;

    for (const key of keyList) {
      if (!key.secretAvailable) {
        continue;
      }
      const isPersonal = await lazy.PgpSqliteDb2.isAcceptedAsPersonalKey(
        key.fpr
      );
      if (!isPersonal) {
        continue;
      }
      if (
        key.getEncryptionValidity(true, "ignoreExpired").keyValid &&
        key.getSigningValidity("ignoreExpired").keyValid
      ) {
        const thisIsExpired =
          key.expiryTime != 0 && key.expiryTime < nowSecondsSinceEpoch;
        if (!allowExpired && thisIsExpired) {
          continue;
        }
        result.all.push(key);
        if (!result.best) {
          result.best = key;
          bestIsExpired = thisIsExpired;
        } else if (
          result.best.algoSym === key.algoSym &&
          result.best.keySize === key.keySize
        ) {
          if (!key.expiryTime || key.expiryTime > result.best.expiryTime) {
            result.best = key;
          }
        } else if (bestIsExpired && !thisIsExpired) {
          if (
            result.best.algoSym.search(/^(DSA|RSA)$/) < 0 &&
            key.algoSym.search(/^(DSA|RSA)$/) === 0
          ) {
            // prefer RSA or DSA over ECC (long-term: change this once ECC keys are widely supported)
            result.best = key;
            bestIsExpired = thisIsExpired;
          } else if (
            key.getVirtualKeySize() > result.best.getVirtualKeySize()
          ) {
            result.best = key;
            bestIsExpired = thisIsExpired;
          }
        }
      }
    }
  },

  /**
   * Get a list of keys for a given set of (sub-) key IDs.
   *
   * @param {string[]|string} keyIdList - Key IDs, or
   *   string, with space-separated list of key IDs.
   */
  getKeyListById(keyIdList) {
    let keyArr;
    if (typeof keyIdList === "string") {
      keyArr = keyIdList.split(/ +/);
    } else {
      keyArr = keyIdList;
    }

    const ret = [];
    for (const i in keyArr) {
      const r = this.getKeyById(keyArr[i]);
      if (r) {
        ret.push(r);
      }
    }

    return ret;
  },

  /**
   * @param {nsIFile} file - ASCII armored file containing the revocation.
   */
  async importRevFromFile(file) {
    const contents = await IOUtils.readUTF8(file.path);

    const beginIndexObj = {};
    const endIndexObj = {};
    const blockType = lazy.EnigmailArmor.locateArmoredBlock(
      contents,
      0,
      "",
      beginIndexObj,
      endIndexObj,
      {}
    );
    if (!blockType) {
      return;
    }

    if (blockType.search(/^(PUBLIC|PRIVATE) KEY BLOCK$/) !== 0) {
      return;
    }

    const pgpBlock = contents.substr(
      beginIndexObj.value,
      endIndexObj.value - beginIndexObj.value + 1
    );

    const res = await lazy.RNP.importRevImpl(pgpBlock);
    if (res.exitCode) {
      return;
    }

    EnigmailKeyRing.clearCache();
    lazy.EnigmailWindows.keyManReloadKeys();
  },

  /**
   * Import a secret key from the given file.
   *
   * @param {window} win - parent window
   * @param {Function} passCB - a callback function that will be called if the user needs
   *   to enter a passphrase to unlock a secret key. See passphrasePromptCallback
   *   for the function signature.
   * @param {boolean} keepPassphrases - Whether to keep passphrases.
   * @param {nsIFile} inputFile - ASCII armored file containing the revocation.
   * @param {object} errorMsgObj - errorMsgObj.value will contain an error
   *   message in case of failures
   * @param {object} importedKeysObj - importedKeysObj.value will contain
   *   an array of the FPRs imported.
   */
  async importSecKeyFromFile(
    win,
    passCB,
    keepPassphrases,
    inputFile,
    errorMsgObj,
    importedKeysObj
  ) {
    const data = await IOUtils.read(inputFile.path);
    const contents = MailStringUtils.uint8ArrayToByteString(data);
    let res;

    let failed = true;

    try {
      res = await lazy.RNP.importSecKeyBlockImpl(
        win,
        passCB,
        keepPassphrases,
        contents
      );
      failed =
        !res || res.exitCode || !res.importedKeys || !res.importedKeys.length;
    } catch (ex) {
      Services.prompt.alert(win, null, ex);
    }

    if (failed) {
      Services.prompt.alert(
        win,
        null,
        await lazy.l10n.formatValue("import-keys-failed")
      );
    }

    if (!res || !res.importedKeys) {
      errorMsgObj.value = res.errorMsg ? res.errorMsg : "";
      return 1;
    }

    if (importedKeysObj) {
      importedKeysObj.keys = res.importedKeys;
    }
    if (res.importedKeys.length > 0) {
      EnigmailKeyRing.updateKeys(res.importedKeys);
    }
    EnigmailKeyRing.clearCache();

    if (res.fingerprintsWithUnsupportedFeatures.length) {
      const fingerprints = res.fingerprintsWithUnsupportedFeatures.join(", ");

      const [info, title, help] = await lazy.l10n.formatValues([
        {
          id: "imported-secret-with-unsupported-features",
          args: {
            fingerprints,
          },
        },
        { id: "import-key-file" },
        { id: "help-button" },
      ]);

      const buttonPressed = Services.prompt.confirmEx(
        win,
        title,
        info,
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
          Services.prompt.BUTTON_TITLE_OK * Services.prompt.BUTTON_POS_1 +
          Services.prompt.BUTTON_POS_1_DEFAULT,
        help,
        null,
        null,
        null,
        {}
      );
      if (buttonPressed == 0) {
        openLinkExternally(
          "https://support.mozilla.org/kb/openpgp-secret-keys-with-unsupported-feature-flags"
        );
      }
    }

    if (res.exitCode) {
      errorMsgObj.value = res.errorMsg || "";
    }
    return res.exitCode;
  },

  /**
   * Empty the key cache, such that it will get loaded next time it is accessed.
   */
  clearCache() {
    this.emailAddressesWithSecretKey = null;
    gKeyListObj = {
      keyList: [],
      keySortList: [],
    };

    gKeyIndex = [];
    gSubkeyIndex = [];
  },

  /**
   * Check if the cache is empty.
   *
   * @returns {boolean} true if cache is empty.
   */
  getCacheEmpty() {
    return gKeyIndex.length === 0;
  },

  /**
   * Get a list of UserIds for a given key.
   * Only the Only UIDs with highest trust level are returned.
   *
   * @param {string} keyId - Key ID, optionally preceded with 0x.
   *
   * @returns {string[]} a list of user IDs.
   */
  getValidUids(keyId) {
    const keyObj = this.getKeyById(keyId);
    if (keyObj) {
      return this.getValidUidsFromKeyObj(keyObj);
    }
    return [];
  },

  getValidUidsFromKeyObj(keyObj) {
    let r = [];
    if (keyObj) {
      const TRUSTLEVELS_SORTED = lazy.EnigmailTrust.trustLevelsSorted();
      let hideInvalidUid = true;
      let maxTrustLevel = TRUSTLEVELS_SORTED.indexOf(keyObj.keyTrust);

      if (lazy.EnigmailTrust.isInvalid(keyObj.keyTrust)) {
        // pub key not valid (anymore)-> display all UID's
        hideInvalidUid = false;
      }

      for (const i in keyObj.userIds) {
        if (keyObj.userIds[i].type !== "uat") {
          if (hideInvalidUid) {
            const thisTrust = TRUSTLEVELS_SORTED.indexOf(
              keyObj.userIds[i].keyTrust
            );
            if (thisTrust > maxTrustLevel) {
              r = [keyObj.userIds[i].userId];
              maxTrustLevel = thisTrust;
            } else if (thisTrust === maxTrustLevel) {
              r.push(keyObj.userIds[i].userId);
            }
            // else do not add uid
          } else if (
            !lazy.EnigmailTrust.isInvalid(keyObj.userIds[i].keyTrust) ||
            !hideInvalidUid
          ) {
            // UID valid  OR  key not valid, but invalid keys allowed
            r.push(keyObj.userIds[i].userId);
          }
        }
      }
    }

    return r;
  },

  /**
   * Export public key(s) to a file.
   *
   * @param {string[]} idArrayFull - array of key IDs or fingerprints
   *   to export (full keys).
   * @param {string[]} idArrayReduced - array of key IDs or fingerprints
   *   to export (reduced keys, non-self signatures stripped).
   * @param {string[]} idArrayMinimal - array of key IDs or fingerprints
   *   to export (minimal keys, user IDs and non-self signatures stripped).
   * @param {string|nsIFile|null} outputFile - output file name or Object.
   * @param {object} exitCodeObj - o.value will contain exit code
   * @param {object} errorMsgObj - o.value will contain error message
   * @returns {string}  the key block data if outputFile is null; "" if a file
   *   is written.
   */
  async extractPublicKeys(
    idArrayFull,
    idArrayReduced,
    idArrayMinimal,
    outputFile,
    exitCodeObj,
    errorMsgObj
  ) {
    // At least one array must have valid input
    if (
      (!idArrayFull || !Array.isArray(idArrayFull) || !idArrayFull.length) &&
      (!idArrayReduced ||
        !Array.isArray(idArrayReduced) ||
        !idArrayReduced.length) &&
      (!idArrayMinimal ||
        !Array.isArray(idArrayMinimal) ||
        !idArrayMinimal.length)
    ) {
      throw new Error("invalid parameter given to EnigmailKeyRing.extractKey");
    }

    exitCodeObj.value = -1;

    const keyBlock = lazy.RNP.getMultiplePublicKeys(
      idArrayFull,
      idArrayReduced,
      idArrayMinimal
    );
    if (!keyBlock) {
      errorMsgObj.value = await lazy.l10n.formatValue("fail-key-extract");
      return "";
    }

    exitCodeObj.value = 0;
    if (outputFile) {
      return IOUtils.writeUTF8(outputFile.path, keyBlock)
        .then(() => {
          return "";
        })
        .catch(async () => {
          exitCodeObj.value = -1;
          errorMsgObj.value = await lazy.l10n.formatValue("file-write-failed", {
            output: outputFile.path,
          });
          return null;
        });
    }
    return keyBlock;
  },

  async promptKeyExport2AsciiFilename(window, title, defaultFilename) {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window.browsingContext, title, Ci.nsIFilePicker.modeSave);
    fp.defaultString = defaultFilename;
    fp.defaultExtension = "*.asc";
    fp.appendFilter(await lazy.l10n.formatValue("ascii-armor-file"), "*.asc");
    fp.appendFilters(Ci.nsIFilePicker.filterAll);
    const rv = await new Promise(resolve => fp.open(resolve));
    if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
      return null;
    }
    return fp.file;
  },

  async exportPublicKeysInteractive(window, defaultFileName, keyIdArray) {
    const outFile = await EnigmailKeyRing.promptKeyExport2AsciiFilename(
      window,
      await lazy.l10n.formatValue("export-to-file"),
      defaultFileName
    );
    if (!outFile) {
      return;
    }

    var exitCodeObj = {};
    var errorMsgObj = {};

    await EnigmailKeyRing.extractPublicKeys(
      keyIdArray, // full
      null,
      null,
      outFile,
      exitCodeObj,
      errorMsgObj
    );
    if (exitCodeObj.value !== 0) {
      Services.prompt.alert(
        window,
        null,
        await lazy.l10n.formatValue("save-keys-failed")
      );
      return;
    }
    Services.prompt.alert(
      window,
      null,
      await lazy.l10n.formatValue("save-keys-ok")
    );
  },

  async backupSecretKeysInteractive(window, defaultFileName, fprArray) {
    const outFile = await EnigmailKeyRing.promptKeyExport2AsciiFilename(
      window,
      await lazy.l10n.formatValue("export-keypair-to-file"),
      defaultFileName
    );

    if (!outFile) {
      return;
    }

    window.openDialog(
      "chrome://openpgp/content/ui/backupKeyPassword.xhtml",
      "",
      "dialog,modal,centerscreen,resizable",
      {
        okCallback: EnigmailKeyRing.exportSecretKey,
        file: outFile,
        fprArray,
      }
    );
  },

  /**
   * Export the secret key after a successful password setup.
   *
   * @param {string} password - The declared password to protect the keys.
   * @param {string[]} fprArray - The array of fingerprint of the selected keys.
   * @param {object} file - The file where the keys should be saved.
   * @param {boolean} [confirmed=false] - If the password was properly typed
   *   in the prompt.
   */
  async exportSecretKey(password, fprArray, file, confirmed = false) {
    // Interrupt in case this method has been called directly without confirming
    // the input password through the password prompt.
    if (!confirmed) {
      return;
    }

    const backupKeyBlock = await lazy.RNP.backupSecretKeys(fprArray, password);
    if (!backupKeyBlock) {
      Services.prompt.alert(
        null,
        await lazy.l10n.formatValue("save-keys-failed")
      );
      return;
    }

    await IOUtils.writeUTF8(file.path, backupKeyBlock)
      .then(async () => {
        Services.prompt.alert(
          null,
          null,
          await lazy.l10n.formatValue("save-keys-ok")
        );
      })
      .catch(async () => {
        Services.prompt.alert(
          null,
          null,
          await lazy.l10n.formatValue("file-write-failed", {
            output: file.path,
          })
        );
      });
  },

  /**
   * Import public key from provided key data.
   *
   * @param {window} parent
   * @param {boolean} askToConfirm - If true, display confirmation dialog.
   * @param {string} keyBlock - Data containing key.
   * @param {boolean} isBinary - Whether the key is binary.
   * @param {string}  keyId - Key ID expected to import (no meaning).
   * @param {object} errorMsgObj - Error object. object.value will contain
   *   error message from GnuPG
   * @param {object} [importedKeysObj] - Imported keys object. object.value
   *    will contain an array of the FPRs imported.
   * @param {boolean} [minimizeKey=false] - Minimize key for importing.
   * @param {string[]} [limitedUids] - Restrict importing the key(s) to a given
   *   set of UIDs.
   * @param {string} [acceptance] - Acceptance for the keys to import,
   *   which are new, or still have acceptance "undecided".
   * @returns {integer} an exit code:
   *   - code 0:  success
   *   - code > 0: error
   *   - code == -1: Cancelled by user
   */
  async importKeyAsync(
    parent,
    askToConfirm,
    keyBlock,
    isBinary,
    keyId, // ignored
    errorMsgObj,
    importedKeysObj,
    minimizeKey = false,
    limitedUids = [],
    acceptance = null
  ) {
    var pgpBlock;
    if (!isBinary) {
      const beginIndexObj = {};
      const endIndexObj = {};
      const blockType = lazy.EnigmailArmor.locateArmoredBlock(
        keyBlock,
        0,
        "",
        beginIndexObj,
        endIndexObj,
        {}
      );
      if (!blockType) {
        errorMsgObj.value = await lazy.l10n.formatValue("no-pgp-block");
        return 1;
      }

      if (blockType.search(/^(PUBLIC|PRIVATE) KEY BLOCK$/) !== 0) {
        errorMsgObj.value = await lazy.l10n.formatValue("not-first-block");
        return 1;
      }

      pgpBlock = keyBlock.substr(
        beginIndexObj.value,
        endIndexObj.value - beginIndexObj.value + 1
      );
    }

    if (askToConfirm) {
      if (
        Services.prompt.confirmEx(
          parent,
          null,
          await lazy.l10n.formatValue("import-key-confirm"),
          Services.prompt.STD_OK_CANCEL_BUTTONS,
          await lazy.l10n.formatValue("key-man-button-import"),
          null,
          null,
          null,
          {}
        )
      ) {
        errorMsgObj.value = await lazy.l10n.formatValue("fail-cancel");
        return -1;
      }
    }

    if (minimizeKey) {
      throw new Error("importKeyAsync with minimizeKey not implemented");
    }

    let result = undefined;
    const blockParam = isBinary ? keyBlock : pgpBlock;

    // TODO: The filtering might not work, because the underlying
    // implementation wants to filter by fingerprint, but the filter
    // input is apparently user IDs? Really?
    result = await lazy.RNP.importPubkeyBlockAutoAcceptImpl(
      parent,
      blockParam,
      acceptance,
      limitedUids
    );

    const failed =
      !result ||
      result.exitCode ||
      !result.importedKeys ||
      !result.importedKeys.length;
    if (failed) {
      if (askToConfirm) {
        // if !askToConfirm the caller is responsible to inform the user
        Services.prompt.alert(
          parent,
          null,
          await lazy.l10n.formatValue("import-keys-failed")
        );
      }
    }

    if (!result) {
      result = {};
      result.exitCode = -1;
    } else if (result.importedKeys) {
      if (importedKeysObj) {
        importedKeysObj.value = result.importedKeys;
      }
      if (result.importedKeys.length > 0) {
        EnigmailKeyRing.updateKeys(result.importedKeys);
      }
    }

    EnigmailKeyRing.clearCache();
    return result.exitCode;
  },

  async importKeyDataWithConfirmation(
    window,
    preview,
    keyData,
    isBinary,
    limitedUids = []
  ) {
    if (preview.length > 0) {
      const acceptance = lazy.EnigmailDialog.confirmPubkeyImport(
        window,
        preview
      );
      if (!acceptance) {
        return false;
      }
      const errorMsgObj = {};
      try {
        const exitStatus = await EnigmailKeyRing.importKeyAsync(
          window,
          false,
          keyData,
          isBinary,
          "",
          errorMsgObj,
          null,
          false,
          limitedUids,
          acceptance
        );

        if (exitStatus === 0) {
          const keyList = preview.map(a => a.id);
          lazy.EnigmailDialog.keyImportDlg(window, keyList);
          return true;
        }
      } catch (ex) {
        lazy.log.warn("Importing key FAILED.", ex);
      }
      lazy.l10n.formatValue("fail-key-import").then(value => {
        Services.prompt.alert(window, null, value + "\n" + errorMsgObj.value);
      });
    } else {
      lazy.l10n.formatValue("no-key-found2").then(value => {
        Services.prompt.alert(window, null, value);
      });
    }
    return false;
  },

  async importKeyArrayWithConfirmation(
    window,
    keyArray,
    isBinary,
    limitedUids = []
  ) {
    let somethingWasImported = false;
    if (keyArray.length > 0) {
      const acceptance = lazy.EnigmailDialog.confirmPubkeyImport(
        window,
        keyArray
      );
      if (acceptance) {
        const importedKeys = [];
        let allErrors = "";
        for (const key of keyArray) {
          let exitStatus;
          const errorMsgObj = {};
          try {
            exitStatus = await EnigmailKeyRing.importKeyAsync(
              window,
              false,
              key.pubKey,
              isBinary,
              "",
              errorMsgObj,
              null,
              false,
              limitedUids,
              acceptance
            );
          } catch (ex) {
            lazy.log.warn("Importing key FAILED!", ex);
          }

          if (exitStatus === 0) {
            importedKeys.push(key.id);
          } else {
            allErrors += "\n" + errorMsgObj.value;
          }
        }

        if (importedKeys.length) {
          lazy.EnigmailDialog.keyImportDlg(window, importedKeys);
          somethingWasImported = true;
        } else {
          lazy.l10n.formatValue("fail-key-import").then(value => {
            Services.prompt.alert(window, null, value + allErrors);
          });
        }
      }
    } else {
      lazy.l10n.formatValue("no-key-found2").then(value => {
        Services.prompt.alert(window, null, value);
      });
    }
    return somethingWasImported;
  },

  async importKeyDataSilent(window, keyData, isBinary, onlyFingerprint = "") {
    const errorMsgObj = {};
    let exitStatus = -1;
    try {
      exitStatus = await EnigmailKeyRing.importKeyAsync(
        window,
        false,
        keyData,
        isBinary,
        "",
        errorMsgObj,
        undefined,
        false,
        onlyFingerprint ? [onlyFingerprint] : []
      );
      this.clearCache();
    } catch (ex) {
      lazy.log.warn("Importing key FAILED!", ex);
    }
    return exitStatus === 0;
  },

  /**
   * @param {EnigmailKeyObj} keyObj
   * @returns {boolean} true if the key is valid for encryption.
   */
  isValidForEncryption(keyObj) {
    return this._getValidityLevelIgnoringAcceptance(keyObj, null, false) == 0;
  },

  /**
   * @param {EnigmailKeyObj} keyObj
   * @param {string} emailAddr - Email address.
   * @param {boolean} allowExpired - Whether to allow expired keys.
   * @returns {integer} an acceptance level from -1 to 3. Or -2 for
   *   "doesn't match email" or "not usable"
   */
  async isValidKeyForRecipient(keyObj, emailAddr, allowExpired) {
    if (!emailAddr) {
      return -2;
    }
    const level = this._getValidityLevelIgnoringAcceptance(
      keyObj,
      emailAddr,
      allowExpired
    );
    if (level < 0) {
      return level;
    }
    return this._getAcceptanceLevelForEmail(keyObj, emailAddr);
  },

  /**
   * This function checks that given key is not expired, not revoked,
   * and that a (related) encryption (sub-)key is available.
   * If an email address is provided by the caller, the function
   * also requires that a matching user id is available.
   *
   * @param {EnigmailKeyObj} keyObj - The key to check.
   * @param {string} [emailAddr] - Email address.
   * @returns {integer} the validity level, negative for invalid,
   *   0 if no problem were found (neutral).
   */
  _getValidityLevelIgnoringAcceptance(keyObj, emailAddr, allowExpired) {
    if (keyObj.keyTrust == "r") {
      return -2;
    }

    if (keyObj.keyTrust == "e" && !allowExpired) {
      return -2;
    }

    if (emailAddr) {
      let uidMatch = false;
      for (const uid of keyObj.userIds) {
        if (uid.type !== "uid") {
          continue;
        }

        if (
          lazy.EnigmailFuncs.getEmailFromUserID(uid.userId).toLowerCase() ===
          emailAddr
        ) {
          uidMatch = true;
          break;
        }
      }
      if (!uidMatch) {
        return -2;
      }
    }

    // key valid for encryption?
    if (!keyObj.keyUseFor.includes("E")) {
      return -2;
    }

    // Ensure we have at least one key usable for encryption
    // that is not expired/revoked.

    // We already checked above, the primary key is not revoked/expired
    let foundGoodEnc = keyObj.keyUseFor.match(/e/);
    if (!foundGoodEnc) {
      for (const aSub of keyObj.subKeys) {
        if (aSub.keyTrust == "r") {
          continue;
        }
        if (aSub.keyTrust == "e" && !allowExpired) {
          continue;
        }
        if (aSub.keyUseFor.match(/e/)) {
          foundGoodEnc = true;
          break;
        }
      }
    }

    if (!foundGoodEnc) {
      return -2;
    }

    return 0; // no problem found
  },

  async _getAcceptanceLevelForEmail(keyObj, emailAddr) {
    let acceptanceLevel;
    if (keyObj.secretAvailable) {
      const isPersonal = await lazy.PgpSqliteDb2.isAcceptedAsPersonalKey(
        keyObj.fpr
      );
      if (isPersonal) {
        acceptanceLevel = 3;
      } else {
        acceptanceLevel = -1; // rejected
      }
    } else {
      acceptanceLevel = await this.getKeyAcceptanceLevelForEmail(
        keyObj,
        emailAddr
      );
    }

    return acceptanceLevel;
  },

  /**
   * Try to find valid key for encryption to passed email address.
   *
   * @param {string} emailAddr - Email address.
   * @param {object} details - If not null returns error in details.msg.
   *
   * @returns {?string} the found key ID (without leading "0x") or null.
   */
  async getValidKeyForRecipient(emailAddr, details) {
    const FULLTRUSTLEVEL = 2;

    emailAddr = emailAddr.toLowerCase();

    var foundKeyId = null;
    var foundAcceptanceLevel = null;

    const k = this.getAllKeys(null, null);
    const keyList = k.keyList;

    for (const keyObj of keyList) {
      const acceptanceLevel = await this.isValidKeyForRecipient(
        keyObj,
        emailAddr,
        false
      );

      // immediately return as best match, if a fully or ultimately
      // trusted key is found
      if (acceptanceLevel >= FULLTRUSTLEVEL) {
        return keyObj.keyId;
      }

      if (acceptanceLevel < 1) {
        continue;
      }

      if (foundKeyId != keyObj.keyId) {
        // different matching key found
        if (
          !foundKeyId ||
          (foundKeyId && acceptanceLevel > foundAcceptanceLevel)
        ) {
          foundKeyId = keyObj.keyId;
          foundAcceptanceLevel = acceptanceLevel;
        }
      }
    }

    if (!foundKeyId) {
      if (details) {
        details.msg = "ProblemNoKey";
      }
      lazy.log.debug(
        `Found no valid encryption key with enough trust level for ${emailAddr}`
      );
    }
    return foundKeyId;
  },

  getAcceptanceStringFromAcceptanceLevel(level) {
    switch (level) {
      case 3:
        return "personal";
      case 2:
        return "verified";
      case 1:
        return "unverified";
      case -1:
        return "rejected";
      case 0:
      default:
        return "undecided";
    }
  },

  async getKeyAcceptanceLevelForEmail(keyObj, email) {
    if (keyObj.secretAvailable) {
      throw new Error(
        `Should not get acceptance. ${keyObj.fpr} is a private key.`
      );
    }

    let acceptanceLevel = 0;

    const acceptanceResult = {};
    try {
      await lazy.PgpSqliteDb2.getAcceptance(
        keyObj.fpr,
        email,
        acceptanceResult
      );
    } catch (ex) {
      lazy.log.warn("Get acceptance FAILED!", ex);
      return null;
    }

    if (acceptanceResult.fingerprintAcceptance == "rejected") {
      // rejecting is always global for all email addresses
      return -1;
    }

    if (acceptanceResult.emailDecided) {
      switch (acceptanceResult.fingerprintAcceptance) {
        case "verified":
          acceptanceLevel = 2;
          break;
        case "unverified":
          acceptanceLevel = 1;
          break;
        default:
        case "undecided":
          acceptanceLevel = 0;
          break;
      }
    }
    return acceptanceLevel;
  },

  async getKeyAcceptanceForEmail(keyObj, email) {
    const acceptanceResult = {};

    try {
      await lazy.PgpSqliteDb2.getAcceptance(
        keyObj.fpr,
        email,
        acceptanceResult
      );
    } catch (ex) {
      lazy.log.warn("Get acceptance FAILED!", ex);
      return null;
    }

    if (acceptanceResult.fingerprintAcceptance == "rejected") {
      // rejecting is always global for all email addresses
      return acceptanceResult.fingerprintAcceptance;
    }

    if (acceptanceResult.emailDecided) {
      switch (acceptanceResult.fingerprintAcceptance) {
        case "verified":
        case "unverified":
        case "undecided":
          return acceptanceResult.fingerprintAcceptance;
      }
    }

    return "undecided";
  },

  /**
   *  Determine the key ID for a set of given addresses
   *
   * @param {string[]} addresses - Email addresses
   * @param {object} details - Holds details for invalid keys.
   * @param {object} details.errArray
   * @param {object} details.errArray.addr - Email addresses.
   * @param {object} details.errArray.msg - Related error.
   * @returns {boolean} true if at least one key missing; false otherwise.
   */
  async getValidKeysForAllRecipients(addresses, details) {
    if (!addresses) {
      return null;
    }
    // check whether each address is or has a key:
    let keyMissing = false;
    if (details) {
      details.errArray = [];
    }
    for (let i = 0; i < addresses.length; i++) {
      let addr = addresses[i];
      if (!addr) {
        continue;
      }
      // try to find current address in key list:
      var errMsg = null;
      addr = addr.toLowerCase();
      if (!addr.includes("@")) {
        throw new Error(
          "getValidKeysForAllRecipients unexpected lookup for non-email addr: " +
            addr
        );
      }

      const aliasKeyList = this.getAliasKeyList(addr);
      if (aliasKeyList) {
        for (const entry of aliasKeyList) {
          let foundError = true;

          let key;
          if ("fingerprint" in entry) {
            key = this.getKeyById(entry.fingerprint);
          } else if ("id" in entry) {
            key = this.getKeyById(entry.id);
          }
          if (key && this.isValidForEncryption(key)) {
            const acceptanceResult =
              await lazy.PgpSqliteDb2.getFingerprintAcceptance(null, key.fpr);
            // If we don't have acceptance info for the key yet,
            // or, we have it and it isn't rejected,
            // then we accept the key for using it in alias definitions.
            if (!acceptanceResult || acceptanceResult != "rejected") {
              foundError = false;
            }
          }

          if (foundError) {
            keyMissing = true;
            if (details) {
              const detEl = {};
              detEl.addr = addr;
              detEl.msg = "alias problem";
              details.errArray.push(detEl);
            }
            lazy.log.warn(`Alias key for ${addr} missing/unusable.`);
          }
        }

        // skip the lookup for direct matching keys by email
        continue;
      }

      // try email match:
      var addrErrDetails = {};
      const foundKeyId = await this.getValidKeyForRecipient(
        addr,
        addrErrDetails
      );
      if (details && addrErrDetails.msg) {
        errMsg = addrErrDetails.msg;
      }
      if (!foundKeyId) {
        // no key for this address found
        keyMissing = true;
        if (details) {
          if (!errMsg) {
            errMsg = "ProblemNoKey";
          }
          var detailsElem = {};
          detailsElem.addr = addr;
          detailsElem.msg = errMsg;
          details.errArray.push(detailsElem);
        }
        lazy.log.warn(`No single valid key for ${addr}`);
      }
    }
    return keyMissing;
  },

  async getMultValidKeysForOneRecipient(emailAddr, allowExpired = false) {
    emailAddr = emailAddr.toLowerCase();
    if (emailAddr.startsWith("<") && emailAddr.endsWith(">")) {
      emailAddr = emailAddr.substr(1, emailAddr.length - 2);
    }

    const found = [];

    const k = this.getAllKeys(null, null);
    const keyList = k.keyList;

    for (const keyObj of keyList) {
      const acceptanceLevel = await this.isValidKeyForRecipient(
        keyObj,
        emailAddr,
        allowExpired
      );
      if (acceptanceLevel < -1) {
        continue;
      }
      if (!keyObj.secretAvailable) {
        keyObj.acceptance =
          this.getAcceptanceStringFromAcceptanceLevel(acceptanceLevel);
      }
      found.push(keyObj);
    }
    return found;
  },

  /**
   * If the given email address has an alias definition, return its
   * list of key identifiers.
   *
   * The function will prefer a match to an exact email alias.
   * If no email alias could be found, the function will search for
   * an alias rule that matches the domain.
   *
   * @param {string} email - The email address to look up
   * @returns {object[]} - An array with alias key identifiers found for the
   *  input, or null if no alias matches the address.
   */
  getAliasKeyList(email) {
    const ekl = lazy.OpenPGPAlias.getEmailAliasKeyList(email);
    if (ekl) {
      return ekl;
    }
    return lazy.OpenPGPAlias.getDomainAliasKeyList(email);
  },

  /**
   * Return the fingerprint of each usable alias key for the given
   * email address.
   *
   * @param {string[]} keyList - Array of key identifiers
   * @returns {string[]} An array with fingerprints of all alias keys,
   *   or an empty array on failure.
   */
  getAliasKeys(keyList) {
    const keys = [];

    for (const entry of keyList) {
      let key;
      let lookupId;
      if ("fingerprint" in entry) {
        lookupId = entry.fingerprint;
        key = this.getKeyById(entry.fingerprint);
      } else if ("id" in entry) {
        lookupId = entry.id;
        key = this.getKeyById(entry.id);
      }
      if (key && this.isValidForEncryption(key)) {
        keys.push(key.fpr);
      } else {
        const reason = key ? "not usable" : "missing";
        lazy.log.warn(`Alias key for ${lookupId} ${reason}`);
        return [];
      }
    }
    return keys;
  },

  /**
   * Rebuild the quick access search indexes after the key list was loaded
   */
  rebuildKeyIndex() {
    gKeyIndex = [];
    gSubkeyIndex = [];

    for (const i in gKeyListObj.keyList) {
      const k = gKeyListObj.keyList[i];
      gKeyIndex[k.keyId] = k;
      gKeyIndex[k.fpr] = k;
      gKeyIndex[k.keyId.substr(-8, 8)] = k;

      // add subkeys
      for (const j in k.subKeys) {
        gSubkeyIndex[k.subKeys[j].keyId] = k;
      }
    }
  },

  /**
   * Update specific keys in the key cache. If the key objects don't exist yet,
   * they will be created
   *
   * @param {string[]} keys - Key IDs or fingerprints.
   */
  updateKeys(keys) {
    const uniqueKeys = [...new Set(keys)]; // make key IDs unique

    deleteKeysFromCache(uniqueKeys);

    if (gKeyListObj.keyList.length > 0) {
      loadKeyList(null, null, 1, uniqueKeys);
    } else {
      loadKeyList(null, null, 1);
    }

    lazy.EnigmailWindows.keyManReloadKeys();
  },

  /**
   * @param {string} email
   */
  findRevokedPersonalKeysByEmail(email) {
    const res = [];
    if (email === "") {
      return res;
    }
    email = email.toLowerCase();
    this.getAllKeys(); // ensure keylist is loaded;
    for (const k of gKeyListObj.keyList) {
      if (k.keyTrust != "r") {
        continue;
      }
      let hasAdditionalEmail = false;
      let isMatch = false;

      for (const userId of k.userIds) {
        if (userId.type !== "uid") {
          continue;
        }

        const emailInUid = lazy.EnigmailFuncs.getEmailFromUserID(
          userId.userId
        ).toLowerCase();
        if (emailInUid == email) {
          isMatch = true;
        } else {
          // For privacy reasons, exclude revoked keys that point to
          // other email addresses.
          hasAdditionalEmail = true;
          break;
        }
      }

      if (isMatch && !hasAdditionalEmail) {
        res.push("0x" + k.fpr);
      }
    }
    return res;
  },

  /**
   * @param {string} email
   */
  async getRecipientAutocryptKeyForEmail(email) {
    // Forward to RNP, to avoid that other modules depend on RNP
    return lazy.RNP.getRecipientAutocryptKeyForEmail(email);
  },

  /**
   * @param {string} keyId
   * @param {string} email
   */
  getAutocryptKey(keyId, email) {
    const keyObj = this.getKeyById(keyId);
    if (
      !keyObj ||
      !keyObj.subKeys.length ||
      !keyObj.userIds.length ||
      !keyObj.keyUseFor.includes("s")
    ) {
      return null;
    }
    const uid = keyObj.getUserIdWithEmail(email);
    if (!uid) {
      return null;
    }
    return lazy.RNP.getAutocryptKeyB64(keyId, null, uid.userId);
  },

  alreadyCheckedGnuPG: new Set(),

  /**
   * @typedef {object} EncryptionKeyMeta
   * @property {string} readiness - one of
   *   "accepted", "expiredAccepted",
   *   "otherAccepted", "expiredOtherAccepted",
   *   "undecided", "expiredUndecided",
   *   "rejected", "expiredRejected",
   *   "collected", "rejectedPersonal", "revoked", "alias"
   *
   *   The meaning of "otherAccepted" is: the key is undecided for this
   *   email address, but accepted for at least on other address.
   *
   * @property {KeyObj} keyObj -
   *   undefined if an alias
   * @property {CollectedKey} collectedKey -
   *   undefined if not a collected key or an alias
   */

  /**
   * Obtain information on the availability of recipient keys
   * for the given email address, and the status of the keys.
   *
   * No key details are returned for alias keys.
   *
   * If readiness is "collected" it's an unexpired key that hasn't
   * been imported into permanent storage (keyring) yet.
   *
   * @param {string} email - Email address.
   *
   * @returns {EncryptionKeyMeta[]} meta information for an encryption key.
   *
   *   Callers can filter it keys according to needs, like
   *
   *   let meta = getEncryptionKeyMeta("foo@example.com");
   *   let readyToUse = meta.filter(k => k.readiness == "accepted" || k.readiness == "alias");
   *   let hasAlias = meta.filter(k => k.readiness == "alias");
   *   let accepted = meta.filter(k => k.readiness == "accepted");
   *   let expiredAccepted = meta.filter(k => k.readiness == "expiredAccepted");
   *   let unaccepted = meta.filter(k => k.readiness == "undecided" || k.readiness == "rejected" );
   *   let expiredUnaccepted = meta.filter(k => k.readiness == "expiredUndecided" || k.readiness == "expiredRejected");
   *   let unacceptedNotYetImported = meta.filter(k => k.readiness == "collected");
   *   let invalidKeys = meta.some(k => k.readiness == "revoked" || k.readiness == "rejectedPersonal" || );
   *
   *   let keyReadiness = meta.groupBy(({readiness}) => readiness);
   */
  async getEncryptionKeyMeta(email) {
    email = email.toLowerCase();

    const result = [];

    result.hasAliasRule = lazy.OpenPGPAlias.hasAliasDefinition(email);
    if (result.hasAliasRule) {
      const keyMeta = {};
      keyMeta.readiness = "alias";
      result.push(keyMeta);
      return result;
    }

    const fingerprintsInKeyring = new Set();

    for (const keyObj of this.getAllKeys(null, null).keyList) {
      const keyMeta = {};
      keyMeta.keyObj = keyObj;

      let uidMatch = false;
      for (const uid of keyObj.userIds) {
        if (uid.type !== "uid") {
          continue;
        }
        // key valid for encryption?
        if (!keyObj.keyUseFor.includes("E")) {
          continue;
        }

        if (
          lazy.EnigmailFuncs.getEmailFromUserID(uid.userId).toLowerCase() ===
          email
        ) {
          uidMatch = true;
          break;
        }
      }
      if (!uidMatch) {
        continue;
      }
      fingerprintsInKeyring.add(keyObj.fpr);

      if (keyObj.keyTrust == "r") {
        keyMeta.readiness = "revoked";
        result.push(keyMeta);
        continue;
      }
      let isExpired = keyObj.keyTrust == "e";

      // Ensure we have at least one primary key or subkey usable for
      // encryption that is not expired/revoked.
      // We already checked above, the primary key is not revoked.
      // If the primary key is good for encryption, we don't need to
      // check subkeys.
      if (!keyObj.keyUseFor.match(/e/)) {
        let hasExpiredSubkey = false;
        let hasRevokedSubkey = false;
        let hasUsableSubkey = false;

        for (const aSub of keyObj.subKeys) {
          if (!aSub.keyUseFor.match(/e/)) {
            continue;
          }
          if (aSub.keyTrust == "e") {
            hasExpiredSubkey = true;
          } else if (aSub.keyTrust == "r") {
            hasRevokedSubkey = true;
          } else {
            hasUsableSubkey = true;
          }
        }

        if (!hasUsableSubkey) {
          if (hasExpiredSubkey) {
            isExpired = true;
          } else if (hasRevokedSubkey) {
            keyMeta.readiness = "revoked";
            result.push(keyMeta);
            continue;
          }
        }
      }

      if (keyObj.secretAvailable) {
        const isPersonal = await lazy.PgpSqliteDb2.isAcceptedAsPersonalKey(
          keyObj.fpr
        );
        if (isPersonal) {
          keyMeta.readiness = "accepted";
        } else {
          // We don't allow encrypting to rejected secret/personal keys.
          keyMeta.readiness = "rejectedPersonal";
          result.push(keyMeta);
          continue;
        }
      } else {
        const acceptanceLevel = await this.getKeyAcceptanceLevelForEmail(
          keyObj,
          email
        );
        switch (acceptanceLevel) {
          case 1:
          case 2:
            keyMeta.readiness = isExpired ? "expiredAccepted" : "accepted";
            break;
          case -1:
            keyMeta.readiness = isExpired ? "expiredRejected" : "rejected";
            break;
          case 0:
          default: {
            const other = await lazy.PgpSqliteDb2.getFingerprintAcceptance(
              null,
              keyObj.fpr
            );
            if (other == "verified" || other == "unverified") {
              // If the check for the email returned undecided, but
              // overall the key is marked as accepted, it means that
              // the key is only accepted for another email address.
              keyMeta.readiness = isExpired
                ? "expiredOtherAccepted"
                : "otherAccepted";
            } else {
              keyMeta.readiness = isExpired ? "expiredUndecided" : "undecided";
            }
            break;
          }
        }
      }
      result.push(keyMeta);
    }

    if (
      Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg") &&
      Services.prefs.getBoolPref("mail.openpgp.fetch_pubkeys_from_gnupg") &&
      !this.alreadyCheckedGnuPG.has(email)
    ) {
      this.alreadyCheckedGnuPG.add(email);
      const keysFromGnuPGMap = lazy.GPGME.getPublicKeysForEmail(email);
      for (const aFpr of keysFromGnuPGMap.keys()) {
        const oldKey = this.getKeyById(aFpr);
        const gpgKeyData = keysFromGnuPGMap.get(aFpr);
        if (oldKey) {
          await this.importKeyDataSilent(null, gpgKeyData, false);
        } else {
          const k = await lazy.RNP.getKeyListFromKeyBlockImpl(gpgKeyData);
          if (!k) {
            continue;
          }
          if (k.length != 1) {
            continue;
          }
          const db = await lazy.CollectedKeysDB.getInstance();
          // If key is known in the db: merge + update.
          const key = await db.mergeExisting(k[0], gpgKeyData, {
            uri: "",
            type: "gnupg",
          });
          await db.storeKey(key);
        }
      }
    }

    const collDB = await lazy.CollectedKeysDB.getInstance();
    const coll = await collDB.findKeysForEmail(email);
    for (const c of coll) {
      const k = await lazy.RNP.getKeyListFromKeyBlockImpl(c.pubKey);
      if (!k) {
        continue;
      }
      if (k.length != 1) {
        // Past code could have store key blocks that contained
        // multiple entries. Ignore and delete.
        collDB.deleteKey(k[0].fpr);
        continue;
      }

      let deleteFromCollected = false;

      if (fingerprintsInKeyring.has(k[0].fpr)) {
        deleteFromCollected = true;
      } else {
        const trust = k[0].keyTrust;
        if (trust == "r" || trust == "e") {
          deleteFromCollected = true;
        }
      }

      if (!deleteFromCollected) {
        // Ensure we have at least one primary key or subkey usable for
        // encryption that is not expired/revoked.
        // If the primary key is good for encryption, we don't need to
        // check subkeys.

        if (!k[0].keyUseFor.match(/e/)) {
          let hasUsableSubkey = false;

          for (const aSub of k[0].subKeys) {
            if (!aSub.keyUseFor.match(/e/)) {
              continue;
            }
            if (aSub.keyTrust != "e" && aSub.keyTrust != "r") {
              hasUsableSubkey = true;
              break;
            }
          }

          if (!hasUsableSubkey) {
            deleteFromCollected = true;
          }
        }
      }

      if (deleteFromCollected) {
        collDB.deleteKey(k[0].fpr);
        continue;
      }

      const keyMeta = {};
      keyMeta.readiness = "collected";
      keyMeta.keyObj = k[0];
      keyMeta.collectedKey = c;

      result.push(keyMeta);
    }

    return result;
  },
}; //  EnigmailKeyRing

/************************ INTERNAL FUNCTIONS ************************/

function sortByUserId(keyListObj, sortDirection) {
  return function (a, b) {
    return a.userId < b.userId ? -sortDirection : sortDirection;
  };
}

const sortFunctions = {
  keyid(keyListObj, sortDirection) {
    return function (a, b) {
      return a.keyId < b.keyId ? -sortDirection : sortDirection;
    };
  },

  keyidshort(keyListObj, sortDirection) {
    return function (a, b) {
      return a.keyId.substr(-8, 8) < b.keyId.substr(-8, 8)
        ? -sortDirection
        : sortDirection;
    };
  },

  fpr(keyListObj, sortDirection) {
    return function (a, b) {
      return keyListObj.keyList[a.keyNum].fpr < keyListObj.keyList[b.keyNum].fpr
        ? -sortDirection
        : sortDirection;
    };
  },

  keytype(keyListObj, sortDirection) {
    return function (a, b) {
      return keyListObj.keyList[a.keyNum].secretAvailable <
        keyListObj.keyList[b.keyNum].secretAvailable
        ? -sortDirection
        : sortDirection;
    };
  },

  validity(keyListObj, sortDirection) {
    return function (a, b) {
      return lazy.EnigmailTrust.trustLevelsSorted().indexOf(
        lazy.EnigmailTrust.getTrustCode(keyListObj.keyList[a.keyNum])
      ) <
        lazy.EnigmailTrust.trustLevelsSorted().indexOf(
          lazy.EnigmailTrust.getTrustCode(keyListObj.keyList[b.keyNum])
        )
        ? -sortDirection
        : sortDirection;
    };
  },

  trust(keyListObj, sortDirection) {
    return function (a, b) {
      return lazy.EnigmailTrust.trustLevelsSorted().indexOf(
        keyListObj.keyList[a.keyNum].ownerTrust
      ) <
        lazy.EnigmailTrust.trustLevelsSorted().indexOf(
          keyListObj.keyList[b.keyNum].ownerTrust
        )
        ? -sortDirection
        : sortDirection;
    };
  },

  created(keyListObj, sortDirection) {
    return function (a, b) {
      return keyListObj.keyList[a.keyNum].keyCreated <
        keyListObj.keyList[b.keyNum].keyCreated
        ? -sortDirection
        : sortDirection;
    };
  },

  expiry(keyListObj, sortDirection) {
    return function (a, b) {
      return keyListObj.keyList[a.keyNum].expiryTime <
        keyListObj.keyList[b.keyNum].expiryTime
        ? -sortDirection
        : sortDirection;
    };
  },
};

function getSortFunction(type, keyListObj, sortDirection) {
  return (sortFunctions[type] || sortByUserId)(keyListObj, sortDirection);
}

/**
 * Load the key list into memory and return it sorted by a specified column.
 *
 * @param {?window} win - Parent window for displaying error messages.
 * @param {string} sortColumn - The column name for sorting. One of:
 *   userid, keyid, keyidshort, fpr, keytype, validity, trust, created, expiry.
 * @param {1|-1} sortDirection - Sort direction: 1 = ascending / -1 = descending.
 * @param {?string[]} onlyKeys - Only (re-)load these key IDs.
 */
function loadKeyList(win, sortColumn, sortDirection, onlyKeys = null) {
  if (gLoadingKeys) {
    waitForKeyList();
    return;
  }
  gLoadingKeys = true;

  lazy.RNP.getKeys(onlyKeys)
    .then(keyList => {
      createAndSortKeyList(
        keyList,
        sortColumn,
        sortDirection,
        onlyKeys === null
      );
      gLoadingKeys = false;
    })
    .catch(e => {
      lazy.log.warn("Loading keylist FAILED.", e);
      gLoadingKeys = false;
    });
  waitForKeyList();
}

/**
 * Update the global key sort-list (quick index to keys).
 */
function updateSortList() {
  gKeyListObj.keySortList = [];
  for (let i = 0; i < gKeyListObj.keyList.length; i++) {
    const keyObj = gKeyListObj.keyList[i];
    gKeyListObj.keySortList.push({
      userId: keyObj.userId ? keyObj.userId.toLowerCase() : "",
      keyId: keyObj.keyId,
      fpr: keyObj.fpr,
      keyNum: i,
    });
  }
}

/**
 * Delete a set of keys from the key cache. Does not rebuild key indexes.
 * Not found keys are skipped.
 *
 * @param {string[]} keyList - Key IDs (or fpr) to delete.
 * @returns {EnigmailKeyObj[]} the deleted key objects.
 */

function deleteKeysFromCache(keyList) {
  const deleted = [];
  const foundKeys = [];
  for (const keyId of keyList) {
    const k = EnigmailKeyRing.getKeyById(keyId, true);
    if (k) {
      foundKeys.push(k);
    }
  }

  for (const k of foundKeys) {
    let foundIndex = -1;
    for (let i = 0; i < gKeyListObj.keyList.length; i++) {
      if (gKeyListObj.keyList[i].fpr == k.fpr) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex >= 0) {
      gKeyListObj.keyList.splice(foundIndex, 1);
      deleted.push(k);
    }
  }

  return deleted;
}

function createAndSortKeyList(
  keyList,
  sortColumn,
  sortDirection,
  resetKeyCache
) {
  if (typeof sortColumn !== "string") {
    sortColumn = "userid";
  }
  if (!sortDirection) {
    sortDirection = 1;
  }

  if (!("keyList" in gKeyListObj) || resetKeyCache) {
    gKeyListObj.keyList = [];
    gKeyListObj.keySortList = [];
  }

  gKeyListObj.keyList = gKeyListObj.keyList.concat(
    keyList.map(k => new lazy.EnigmailKeyObj(k))
  );

  // update the quick index for sorting keys
  updateSortList();

  // create a hash-index on key ID (8 and 16 characters and fingerprint)
  // in a single array

  EnigmailKeyRing.rebuildKeyIndex();

  gKeyListObj.keySortList.sort(
    getSortFunction(sortColumn.toLowerCase(), gKeyListObj, sortDirection)
  );
}

function waitForKeyList() {
  const mainThread = Services.tm.mainThread;
  while (gLoadingKeys) {
    mainThread.processNextEvent(true);
  }
}
