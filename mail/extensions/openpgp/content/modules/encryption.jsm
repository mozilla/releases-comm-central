/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailEncryption"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.jsm",
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

XPCOMUtils.defineLazyGetter(this, "l10n", () => {
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
    let result = {};
    result.sender = "";
    result.sign = false;
    result.signatureHash = "";
    result.sigTypeClear = false;
    result.sigTypeDetached = false;
    result.encrypt = false;
    result.encryptToSender = false;
    result.armor = false;
    result.senderKeyIsExternal = false;

    EnigmailLog.DEBUG(
      "encryption.jsm: getCryptParams: hashAlgorithm=" + hashAlgorithm + "\n"
    );

    console.debug(
      `getCryptParams parameters: from=${fromMailAddr}, to=${toMailAddr}, bcc=${bccMailAddr}, hash=${hashAlgorithm}, flags=${sendFlags}, ascii=${isAscii}, errorObj=%o, logObj=%o`,
      errorMsgObj,
      logFileObj
    );

    try {
      fromMailAddr = EnigmailFuncs.stripEmail(fromMailAddr);
      toMailAddr = EnigmailFuncs.stripEmail(toMailAddr);
      bccMailAddr = EnigmailFuncs.stripEmail(bccMailAddr);
    } catch (ex) {
      errorMsgObj.value = l10n.formatValueSync("invalid-email");
      return null;
    }

    var signMsg = sendFlags & EnigmailConstants.SEND_SIGNED;
    var encryptMsg = sendFlags & EnigmailConstants.SEND_ENCRYPTED;
    var usePgpMime = sendFlags & EnigmailConstants.SEND_PGP_MIME;

    if (sendFlags & EnigmailConstants.SEND_SENDER_KEY_EXTERNAL) {
      result.senderKeyIsExternal = true;
    }

    var detachedSig =
      (usePgpMime || sendFlags & EnigmailConstants.SEND_ATTACHMENT) &&
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

    console.debug(`getCryptParams, got: to=${result.to}, bcc=${result.bcc}`);

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

      if (sendFlags & EnigmailConstants.SEND_ENCRYPT_TO_SELF && fromMailAddr) {
        result.encryptToSender = true;
      }

      let recipArrays = ["to", "bcc"];
      for (let recipArray of recipArrays) {
        let kMax = recipArray == "to" ? result.to.length : result.bcc.length;
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

          let aliasKeyList = EnigmailKeyRing.getAliasKeyList(email);
          if (aliasKeyList) {
            // We have an alias definition.

            let aliasKeys = EnigmailKeyRing.getAliasKeys(aliasKeyList);
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

    console.debug(`getCryptParams returning:`);
    console.debug(result);
    return result;
  },

  /**
   * Determine why a given key cannot be used for signing.
   *
   * @param {string} keyId - key ID
   *
   * @return {string} The reason(s) as message to display to the user, or
   *   an empty string in case the key is valid.
   */
  determineInvSignReason(keyId) {
    EnigmailLog.DEBUG(
      "errorHandling.jsm: determineInvSignReason: keyId: " + keyId + "\n"
    );

    let key = EnigmailKeyRing.getKeyById(keyId);
    if (!key) {
      return l10n.formatValueSync("key-error-key-id-not-found", {
        keySpec: keyId,
      });
    }
    let r = key.getSigningValidity();
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
   * @return {string} The reason(s) as message to display to the user, or
   *   an empty string in case the key is valid.
   */
  determineInvRcptReason(keyId) {
    EnigmailLog.DEBUG(
      "errorHandling.jsm: determineInvRcptReason: keyId: " + keyId + "\n"
    );

    let key = EnigmailKeyRing.getKeyById(keyId);
    if (!key) {
      return l10n.formatValueSync("key-error-key-id-not-found", {
        keySpec: keyId,
      });
    }
    let r = key.getEncryptionValidity(false);
    if (!r.keyValid) {
      return r.reason;
    }

    return "";
  },

  /**
   * Determine if the sender key ID or user ID can be used for signing and/or encryption
   *
   * @param sendFlags:    Number  - the send Flags; need to contain SEND_SIGNED and/or SEND_ENCRYPTED
   * @param fromKeyId:    String  - the sender key ID
   *
   * @return Object:
   *         - keyId:    String - the found key ID, or null if fromMailAddr is not valid
   *         - errorMsg: String - the erorr message if key not valid, or null if key is valid
   */
  async determineOwnKeyUsability(sendFlags, fromKeyId, isExternalGnuPG) {
    EnigmailLog.DEBUG(
      "encryption.jsm: determineOwnKeyUsability: sendFlags=" +
        sendFlags +
        ", sender=" +
        fromKeyId +
        "\n"
    );

    let foundKey = null;
    let ret = {
      errorMsg: null,
    };

    if (!fromKeyId) {
      return ret;
    }

    let sign = !!(sendFlags & EnigmailConstants.SEND_SIGNED);
    let encrypt = !!(sendFlags & EnigmailConstants.SEND_ENCRYPTED);

    if (/^(0x)?[0-9a-f]+$/i.test(fromKeyId)) {
      // key ID specified
      foundKey = EnigmailKeyRing.getKeyById(fromKeyId);
    }

    // even for isExternalGnuPG we require that the public key is available
    if (!foundKey) {
      ret.errorMsg = this.determineInvSignReason(fromKeyId);
      return ret;
    }

    if (!isExternalGnuPG && foundKey.secretAvailable) {
      let isPersonal = await PgpSqliteDb2.isAcceptedAsPersonalKey(foundKey.fpr);
      if (!isPersonal) {
        ret.errorMsg = l10n.formatValueSync(
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
    } else if (sign) {
      if (foundKey && foundKey.getSigningValidity().keyValid) {
        canSign = true;
      }
    }

    if (encrypt) {
      if (foundKey && foundKey.getEncryptionValidity(true).keyValid) {
        canEncrypt = true;
      }
    }

    if (sign && !canSign) {
      ret.errorMsg = this.determineInvSignReason(fromKeyId);
    } else if (encrypt && !canEncrypt) {
      ret.errorMsg = this.determineInvRcptReason(fromKeyId);
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
    EnigmailLog.DEBUG(
      "encryption.jsm: encryptMessageStart: uiFlags=" +
        uiFlags +
        ", from " +
        fromMailAddr +
        " to " +
        toMailAddr +
        ", hashAlgorithm=" +
        hashAlgorithm +
        " (" +
        EnigmailData.bytesToHex(EnigmailData.pack(sendFlags, 4)) +
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
      EnigmailLog.DEBUG(
        "encryption.jsm: encryptMessageStart: NO ENCRYPTION!\n"
      );
      errorMsgObj.value = l10n.formatValueSync("not-required");
      return 0;
    }

    if (!EnigmailCore.getService(win)) {
      throw new Error(
        "encryption.jsm: encryptMessageStart: not yet initialized"
      );
    }

    let logFileObj = {};

    let encryptArgs = EnigmailEncryption.getCryptParams(
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

    let resultStatus = {};
    const cApi = EnigmailCryptoAPI();
    let encrypted = cApi.sync(
      cApi.encryptAndOrSign(
        listener.getInputForCrypto(),
        encryptArgs,
        resultStatus
      )
    );

    if (resultStatus.exitCode) {
      if (resultStatus.errorMsg.length) {
        EnigmailDialog.alert(win, resultStatus.errorMsg);
      }
    } else if (encrypted) {
      listener.addCryptoOutput(encrypted);
    }

    console.debug(
      "sendFlags=" + EnigmailData.bytesToHex(EnigmailData.pack(sendFlags, 4))
    );

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
    EnigmailLog.DEBUG(
      "enigmail.js: Enigmail.encryptMessage: " +
        plainText.length +
        " bytes from " +
        fromMailAddr +
        " to " +
        toMailAddr +
        " (" +
        sendFlags +
        ")\n"
    );
    throw new Error("Not implemented");

    /*
    exitCodeObj.value = -1;
    statusFlagsObj.value = 0;
    errorMsgObj.value = "";

    if (!plainText) {
      EnigmailLog.DEBUG("enigmail.js: Enigmail.encryptMessage: NO ENCRYPTION!\n");
      exitCodeObj.value = 0;
      EnigmailLog.DEBUG("  <=== encryptMessage()\n");
      return plainText;
    }

    var defaultSend = sendFlags & EnigmailConstants.SEND_DEFAULT;
    var signMsg = sendFlags & EnigmailConstants.SEND_SIGNED;
    var encryptMsg = sendFlags & EnigmailConstants.SEND_ENCRYPTED;

    if (encryptMsg) {
      // First convert all linebreaks to newlines
      plainText = plainText.replace(/\r\n/g, "\n");
      plainText = plainText.replace(/\r/g, "\n");

      // we need all data in CRLF according to RFC 4880
      plainText = plainText.replace(/\n/g, "\r\n");
    }

    var listener = EnigmailExecution.newSimpleListener(
      function _stdin(pipe) {
        pipe.write(plainText);
        pipe.close();
      },
      function _done(exitCode) {});


    var proc = EnigmailEncryption.encryptMessageStart(parent, uiFlags,
      fromMailAddr, toMailAddr, bccMailAddr,
      null, sendFlags,
      listener, statusFlagsObj, errorMsgObj);
    if (!proc) {
      exitCodeObj.value = -1;
      EnigmailLog.DEBUG("  <=== encryptMessage()\n");
      return "";
    }

    // Wait for child pipes to close
    proc.wait();

    var retStatusObj = {};
    exitCodeObj.value = EnigmailEncryption.encryptMessageEnd(fromMailAddr, EnigmailData.getUnicodeData(listener.stderrData), listener.exitCode,
      uiFlags, sendFlags,
      listener.stdoutData.length,
      retStatusObj);

    statusFlagsObj.value = retStatusObj.statusFlags;
    statusFlagsObj.statusMsg = retStatusObj.statusMsg;
    errorMsgObj.value = retStatusObj.errorMsg;


    if ((exitCodeObj.value === 0) && listener.stdoutData.length === 0)
      exitCodeObj.value = -1;

    if (exitCodeObj.value === 0) {
      // Normal return
      EnigmailLog.DEBUG("  <=== encryptMessage()\n");
      return EnigmailData.getUnicodeData(listener.stdoutData);
    }

    // Error processing
    EnigmailLog.DEBUG("enigmail.js: Enigmail.encryptMessage: command execution exit code: " + exitCodeObj.value + "\n");
    return "";
  */
  },
};
