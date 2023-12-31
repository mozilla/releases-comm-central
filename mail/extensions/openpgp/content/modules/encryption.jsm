/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailEncryption"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.jsm",
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.jsm",
});

XPCOMUtils.defineLazyGetter(lazy, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

const gMimeHashAlgorithms = [
  null,
  "sha1",
  "ripemd160",
  "sha256",
  "sha384",
  "sha512",
  "sha224",
  "md5",
];

const ENC_TYPE_MSG = 0;
const ENC_TYPE_ATTACH_BINARY = 1;

var EnigmailEncryption = {
  // return object on success, null on failure
  getCryptParams(
    fromMailAddr,
    toMailAddr,
    bccMailAddr,
    hashAlgorithm,
    sendFlags,
    isAscii,
    errorMsgObj,
    logFileObj
  ) {
    const result = {};
    result.sender = "";
    result.sign = false;
    result.signatureHash = "";
    result.sigTypeClear = false;
    result.sigTypeDetached = false;
    result.encrypt = false;
    result.encryptToSender = false;
    result.armor = false;
    result.senderKeyIsExternal = false;

    lazy.EnigmailLog.DEBUG(
      "encryption.jsm: getCryptParams: hashAlgorithm=" + hashAlgorithm + "\n"
    );

    try {
      fromMailAddr = lazy.EnigmailFuncs.stripEmail(fromMailAddr);
      toMailAddr = lazy.EnigmailFuncs.stripEmail(toMailAddr);
      bccMailAddr = lazy.EnigmailFuncs.stripEmail(bccMailAddr);
    } catch (ex) {
      errorMsgObj.value = lazy.l10n.formatValueSync("invalid-email");
      return null;
    }

    var signMsg = sendFlags & lazy.EnigmailConstants.SEND_SIGNED;
    var encryptMsg = sendFlags & lazy.EnigmailConstants.SEND_ENCRYPTED;
    var usePgpMime = sendFlags & lazy.EnigmailConstants.SEND_PGP_MIME;

    if (sendFlags & lazy.EnigmailConstants.SEND_SENDER_KEY_EXTERNAL) {
      result.senderKeyIsExternal = true;
    }

    // Some day we might need to look at flag SEND_TWO_MIME_LAYERS here,
    // to decide which detached signature flag needs to be passed on
    // to the RNP or GPGME layers. However, today those layers can
    // derive their necessary behavior from being asked to do combined
    // or single encryption/signing. This is because today we always
    // create signed messages using the detached signature, and we never
    // need the OpenPGP signature encoding that includes the message
    // except when combining GPG signing with RNP encryption.

    var detachedSig =
      (usePgpMime || sendFlags & lazy.EnigmailConstants.SEND_ATTACHMENT) &&
      signMsg &&
      !encryptMsg;

    result.to = toMailAddr.split(/\s*,\s*/);
    result.bcc = bccMailAddr.split(/\s*,\s*/);
    result.aliasKeys = new Map();

    if (result.to.length == 1 && result.to[0].length == 0) {
      result.to.splice(0, 1); // remove the single empty entry
    }

    if (result.bcc.length == 1 && result.bcc[0].length == 0) {
      result.bcc.splice(0, 1); // remove the single empty entry
    }

    if (/^0x[0-9a-f]+$/i.test(fromMailAddr)) {
      result.sender = fromMailAddr;
    } else {
      result.sender = "<" + fromMailAddr + ">";
    }
    result.sender = result.sender.replace(/(["'`])/g, "\\$1");

    if (signMsg && hashAlgorithm) {
      result.signatureHash = hashAlgorithm;
    }

    if (encryptMsg) {
      if (isAscii != ENC_TYPE_ATTACH_BINARY) {
        result.armor = true;
      }
      result.encrypt = true;

      if (signMsg) {
        result.sign = true;
      }

      if (
        sendFlags & lazy.EnigmailConstants.SEND_ENCRYPT_TO_SELF &&
        fromMailAddr
      ) {
        result.encryptToSender = true;
      }

      const recipArrays = ["to", "bcc"];
      for (const recipArray of recipArrays) {
        const kMax = recipArray == "to" ? result.to.length : result.bcc.length;
        for (let k = 0; k < kMax; k++) {
          let email = recipArray == "to" ? result.to[k] : result.bcc[k];
          if (!email) {
            continue;
          }
          email = email.toLowerCase();
          if (/^0x[0-9a-f]+$/i.test(email)) {
            throw new Error(`Recipient should not be a key ID: ${email}`);
          }
          if (recipArray == "to") {
            result.to[k] = "<" + email + ">";
          } else {
            result.bcc[k] = "<" + email + ">";
          }

          const aliasKeyList = lazy.EnigmailKeyRing.getAliasKeyList(email);
          if (aliasKeyList) {
            // We have an alias definition.

            const aliasKeys = lazy.EnigmailKeyRing.getAliasKeys(aliasKeyList);
            if (!aliasKeys.length) {
              // An empty result means there was a failure obtaining the
              // defined keys, this happens if at least one key is missing
              // or unusable.
              // We don't allow composing an email that involves a
              // bad alias definition, return null to signal that
              // sending should be aborted.
              errorMsgObj.value = "bad alias definition for " + email;
              return null;
            }

            result.aliasKeys.set(email, aliasKeys);
          }
        }
      }
    } else if (detachedSig) {
      result.sigTypeDetached = true;
      result.sign = true;

      if (isAscii != ENC_TYPE_ATTACH_BINARY) {
        result.armor = true;
      }
    } else if (signMsg) {
      result.sigTypeClear = true;
      result.sign = true;
    }

    return result;
  },

  /**
   * Determine why a given key cannot be used for signing.
   *
   * @param {string} keyId - key ID
   *
   * @returns {string} The reason(s) as message to display to the user, or
   *   an empty string in case the key is valid.
   */
  determineInvSignReason(keyId) {
    lazy.EnigmailLog.DEBUG(
      "errorHandling.jsm: determineInvSignReason: keyId: " + keyId + "\n"
    );

    const key = lazy.EnigmailKeyRing.getKeyById(keyId);
    if (!key) {
      return lazy.l10n.formatValueSync("key-error-key-id-not-found", {
        keySpec: keyId,
      });
    }
    const r = key.getSigningValidity();
    if (!r.keyValid) {
      return r.reason;
    }

    return "";
  },

  /**
   * Determine why a given key cannot be used for encryption.
   *
   * @param {string} keyId - key ID
   *
   * @returns {string} The reason(s) as message to display to the user, or
   *   an empty string in case the key is valid.
   */
  determineInvRcptReason(keyId) {
    lazy.EnigmailLog.DEBUG(
      "errorHandling.jsm: determineInvRcptReason: keyId: " + keyId + "\n"
    );

    const key = lazy.EnigmailKeyRing.getKeyById(keyId);
    if (!key) {
      return lazy.l10n.formatValueSync("key-error-key-id-not-found", {
        keySpec: keyId,
      });
    }
    const r = key.getEncryptionValidity(false);
    if (!r.keyValid) {
      return r.reason;
    }

    return "";
  },

  /**
   * Determine if the sender key ID or user ID can be used for signing and/or
   * encryption
   *
   * @param {integer} sendFlags - The send Flags; need to contain SEND_SIGNED and/or SEND_ENCRYPTED
   * @param {string} fromKeyId - The sender key ID
   *
   * @returns {object} object
   *         - keyId:    String - the found key ID, or null if fromMailAddr is not valid
   *         - errorMsg: String - the error message if key not valid, or null if key is valid
   */
  async determineOwnKeyUsability(sendFlags, fromKeyId, isExternalGnuPG) {
    lazy.EnigmailLog.DEBUG(
      "encryption.jsm: determineOwnKeyUsability: sendFlags=" +
        sendFlags +
        ", sender=" +
        fromKeyId +
        "\n"
    );

    let foundKey = null;
    const ret = {
      errorMsg: null,
    };

    if (!fromKeyId) {
      return ret;
    }

    const sign = !!(sendFlags & lazy.EnigmailConstants.SEND_SIGNED);
    const encrypt = !!(sendFlags & lazy.EnigmailConstants.SEND_ENCRYPTED);

    if (/^(0x)?[0-9a-f]+$/i.test(fromKeyId)) {
      // key ID specified
      foundKey = lazy.EnigmailKeyRing.getKeyById(fromKeyId);
    }

    // even for isExternalGnuPG we require that the public key is available
    if (!foundKey) {
      ret.errorMsg = this.determineInvSignReason(fromKeyId);
      return ret;
    }

    if (!isExternalGnuPG && foundKey.secretAvailable) {
      const isPersonal = await lazy.PgpSqliteDb2.isAcceptedAsPersonalKey(
        foundKey.fpr
      );
      if (!isPersonal) {
        ret.errorMsg = lazy.l10n.formatValueSync(
          "key-error-not-accepted-as-personal",
          {
            keySpec: fromKeyId,
          }
        );
        return ret;
      }
    }

    let canSign = false;
    let canEncrypt = false;

    if (isExternalGnuPG) {
      canSign = true;
    } else if (sign && foundKey) {
      const v = foundKey.getSigningValidity();
      if (v.keyValid) {
        canSign = true;
      } else {
        // If we already have a reason for the key not being valid,
        // use that as error message.
        ret.errorMsg = v.reason;
      }
    }

    if (encrypt && foundKey) {
      let v;
      if (lazy.EnigmailKeyRing.isSubkeyId(fromKeyId)) {
        // If the configured own key ID points to a subkey, check
        // specifically that this subkey is a valid encryption key.

        const id = fromKeyId.replace(/^0x/, "");
        v = foundKey.getEncryptionValidity(false, null, id);
      } else {
        // Use parameter "false", because for isExternalGnuPG we cannot
        // confirm that the user has the secret key.
        // And for users of internal encryption code, we don't need to
        // check that here either, public key is sufficient for encryption.
        v = foundKey.getEncryptionValidity(false);
      }

      if (v.keyValid) {
        canEncrypt = true;
      } else {
        // If we already have a reason for the key not being valid,
        // use that as error message.
        ret.errorMsg = v.reason;
      }
    }

    if (sign && !canSign) {
      if (!ret.errorMsg) {
        // Only if we don't have an error message yet.
        ret.errorMsg = this.determineInvSignReason(fromKeyId);
      }
    } else if (encrypt && !canEncrypt) {
      if (!ret.errorMsg) {
        // Only if we don't have an error message yet.
        ret.errorMsg = this.determineInvRcptReason(fromKeyId);
      }
    }

    return ret;
  },

  // return 0 on success, non-zero on failure
  encryptMessageStart(
    win,
    uiFlags,
    fromMailAddr,
    toMailAddr,
    bccMailAddr,
    hashAlgorithm,
    sendFlags,
    listener,
    statusFlagsObj,
    errorMsgObj
  ) {
    lazy.EnigmailLog.DEBUG(
      "encryption.jsm: encryptMessageStart: uiFlags=" +
        uiFlags +
        ", from " +
        fromMailAddr +
        " to " +
        toMailAddr +
        ", hashAlgorithm=" +
        hashAlgorithm +
        " (" +
        sendFlags +
        ")\n"
    );

    // This code used to call determineOwnKeyUsability, and return on
    // failure. But now determineOwnKeyUsability is an async function,
    // and calling it from here with await results in a deadlock.
    // Instead we perform this check in Enigmail.msg.prepareSendMsg.

    var hashAlgo =
      gMimeHashAlgorithms[
        Services.prefs.getIntPref("temp.openpgp.mimeHashAlgorithm")
      ];

    if (hashAlgorithm) {
      hashAlgo = hashAlgorithm;
    }

    errorMsgObj.value = "";

    if (!sendFlags) {
      lazy.EnigmailLog.DEBUG(
        "encryption.jsm: encryptMessageStart: NO ENCRYPTION!\n"
      );
      errorMsgObj.value = lazy.l10n.formatValueSync("not-required");
      return 0;
    }

    lazy.EnigmailCore.init();

    const logFileObj = {};

    const encryptArgs = EnigmailEncryption.getCryptParams(
      fromMailAddr,
      toMailAddr,
      bccMailAddr,
      hashAlgo,
      sendFlags,
      ENC_TYPE_MSG,
      errorMsgObj,
      logFileObj
    );

    if (!encryptArgs) {
      return -1;
    }

    if (!listener) {
      throw new Error("unexpected no listener");
    }

    const resultStatus = {};
    const cApi = lazy.EnigmailCryptoAPI();
    const encrypted = cApi.sync(
      cApi.encryptAndOrSign(
        listener.getInputForCrypto(),
        encryptArgs,
        resultStatus
      )
    );

    if (resultStatus.exitCode) {
      if (resultStatus.errorMsg.length) {
        Services.prompt.alert(win, null, resultStatus.errorMsg);
      }
    } else if (encrypted) {
      listener.addCryptoOutput(encrypted);
    }

    if (resultStatus.exitCode === 0 && !listener.getCryptoOutputLength()) {
      resultStatus.exitCode = -1;
    }
    return resultStatus.exitCode;
  },

  encryptMessage(
    parent,
    uiFlags,
    plainText,
    fromMailAddr,
    toMailAddr,
    bccMailAddr,
    sendFlags,
    exitCodeObj,
    statusFlagsObj,
    errorMsgObj
  ) {
    throw new Error("Not implemented");
  },
};
