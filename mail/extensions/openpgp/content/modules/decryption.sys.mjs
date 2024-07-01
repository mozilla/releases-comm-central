/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* eslint-disable complexity */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailArmor: "chrome://openpgp/content/modules/armor.sys.mjs",
  EnigmailConstants: "chrome://openpgp/content/modules/constants.sys.mjs",
  EnigmailCore: "chrome://openpgp/content/modules/core.sys.mjs",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailKey: "chrome://openpgp/content/modules/key.sys.mjs",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.sys.mjs",
  MailStringUtils: "resource:///modules/MailStringUtils.sys.mjs",
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
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

function statusObjectFrom(
  signatureObj,
  exitCodeObj,
  statusFlagsObj,
  keyIdObj,
  userIdObj,
  sigDetailsObj,
  errorMsgObj,
  blockSeparationObj,
  extraDetailsObj
) {
  return {
    signature: signatureObj,
    exitCode: exitCodeObj,
    statusFlags: statusFlagsObj,
    keyId: keyIdObj,
    userId: userIdObj,
    sigDetails: sigDetailsObj,
    message: errorMsgObj,
    blockSeparation: blockSeparationObj,
    extraDetails: extraDetailsObj,
  };
}

function newStatusObject() {
  return statusObjectFrom(
    {
      value: "",
    },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {}
  );
}

export var EnigmailDecryption = {
  getFromAddr(win) {
    var fromAddr;
    if (win?.gMessage) {
      fromAddr = win.gMessage.author;
    }
    if (fromAddr) {
      try {
        fromAddr = lazy.EnigmailFuncs.stripEmail(fromAddr);
        if (fromAddr.search(/[a-zA-Z0-9]@.*[\(\)]/) >= 0) {
          fromAddr = false;
        }
      } catch (ex) {
        fromAddr = false;
      }
    }

    return fromAddr;
  },

  getMsgDate(win) {
    // Sometimes the "dateInSeconds" attribute is missing.
    // "date" appears to be available more reliably, and it appears
    // to be in microseconds (1/1000000 second). Convert
    // to milliseconds (1/1000 of a second) for conversion to Date.
    if (win?.gMessage) {
      return new Date(win.gMessage.date / 1000);
    }
    return null;
  },

  /**
   * Decrypts a OpenPGP ciphertext and returns the the plaintext.
   * NOTE: Used also to verify message signature of signed-only messages.
   *
   * @param {?window} parent - A window object.
   * @param {integer} uiFlags - See flag options in EnigmailConstants,
   *   UI_INTERACTIVE, UI_ALLOW_KEY_IMPORT.
   * @param {string} cipherText - A string containing a PGP block.
   * @param {Date} msgDate - Message date.
   * @param {object} signatureObj
   * @param {object} exitCodeObj - Contains the exit code.
   * @param {object} statusFlagsObj - Status flags in nslEnigmail.idl,
   *   GOOD_SIGNATURE, BAD_SIGNATURE.
   * @param {object} keyIdObj - Holds the key id.
   * @param {object} userIdObj - Holds the user id.
   * @param {object} sigDetailsObj - Holds the signature details.
   * @param {object} errorMsgObj - Error string.
   * @param {object} blockSeparationObj
   * @param {object} extraDetailsObj
   * @param {JSON} extraDetailsObj.value - JSON string with
   *   with (optional) additional data: encryptedTo, packetDump.
   * @returns {string} the plaintext. Returns "" if error, or if this was
   *   called just to verify a signed message.)
   */
  decryptMessage(
    parent,
    uiFlags,
    cipherText,
    msgDate,
    signatureObj,
    exitCodeObj,
    statusFlagsObj,
    keyIdObj,
    userIdObj,
    sigDetailsObj,
    errorMsgObj,
    blockSeparationObj,
    extraDetailsObj
  ) {
    lazy.log.debug(`Decrypting message: ${cipherText}`);

    if (!cipherText) {
      return "";
    }

    var allowImport = false;
    var unverifiedEncryptedOK =
      uiFlags & lazy.EnigmailConstants.UI_UNVERIFIED_ENC_OK;
    var oldSignature = signatureObj.value;

    signatureObj.value = "";
    exitCodeObj.value = -1;
    statusFlagsObj.value = 0;
    statusFlagsObj.ext = 0;
    keyIdObj.value = "";
    userIdObj.value = "";
    errorMsgObj.value = "";

    var beginIndexObj = {};
    var endIndexObj = {};
    var indentStrObj = {};
    var blockType = lazy.EnigmailArmor.locateArmoredBlock(
      cipherText,
      0,
      "",
      beginIndexObj,
      endIndexObj,
      indentStrObj
    );

    if (!blockType || blockType == "SIGNATURE") {
      // return without displaying a message
      lazy.log.debug("Nothing to decrypt/verify.");
      return "";
    }

    const verifyOnly = blockType == "SIGNED MESSAGE";
    const isEncrypted = blockType == "MESSAGE";
    const publicKey = blockType == "PUBLIC KEY BLOCK";

    if (verifyOnly) {
      lazy.log.debug("Signed message; will only verify.");
      statusFlagsObj.value |= lazy.EnigmailConstants.PGP_MIME_SIGNED;
    } else if (isEncrypted) {
      lazy.log.debug("Encrypted message; will decrypt.");
      statusFlagsObj.value |= lazy.EnigmailConstants.PGP_MIME_ENCRYPTED;
    }

    var pgpBlock = cipherText.substr(
      beginIndexObj.value,
      endIndexObj.value - beginIndexObj.value + 1
    );

    if (indentStrObj.value) {
      // Escape regex chars.
      indentStrObj.value = indentStrObj.value.replace(
        /[.*+\-?^${}()|[\]\\]/g,
        "\\$&"
      );
      var indentRegexp = new RegExp("^" + indentStrObj.value, "gm");
      pgpBlock = pgpBlock.replace(indentRegexp, "");
      if (indentStrObj.value.substr(-1) == " ") {
        var indentRegexpStr = "^" + indentStrObj.value.replace(/ $/m, "$");
        indentRegexp = new RegExp(indentRegexpStr, "gm");
        pgpBlock = pgpBlock.replace(indentRegexp, "");
      }
    }

    // HACK to better support messages from Outlook: if there are empty lines, drop them
    if (pgpBlock.search(/MESSAGE-----\r?\n\r?\nVersion/) >= 0) {
      lazy.log.debug("Applying Outlook empty line workaround.");
      pgpBlock = pgpBlock.replace(/\r?\n\r?\n/g, "\n");
    }

    var tail = cipherText.substr(
      endIndexObj.value + 1,
      cipherText.length - endIndexObj.value - 1
    );

    if (publicKey) {
      // TODO: import key into our scratch area for new, unknown keys
      if (!allowImport) {
        lazy.log.debug("Not allowed to automatically import public key.");
        errorMsgObj.value = lazy.l10n.formatValueSync("key-in-message-body");
        statusFlagsObj.value |= lazy.EnigmailConstants.DISPLAY_MESSAGE;
        statusFlagsObj.value |= lazy.EnigmailConstants.INLINE_KEY;
        return "";
      }
      lazy.log.debug("Public key; will import.");

      // Import public key
      const importedKeysObj = {};
      exitCodeObj.value = lazy.EnigmailKeyRing.importKey(
        parent,
        true,
        pgpBlock,
        false,
        "",
        errorMsgObj,
        importedKeysObj,
        false,
        []
      );
      if (exitCodeObj.value === 0) {
        lazy.log.debug(`Imported keys: ${importedKeysObj.value}`);
        statusFlagsObj.value |= lazy.EnigmailConstants.IMPORTED_KEY;
      }
      return "";
    }

    var newSignature = "";

    if (verifyOnly) {
      newSignature = lazy.EnigmailArmor.extractSignaturePart(
        pgpBlock,
        lazy.EnigmailConstants.SIGNATURE_ARMOR
      );
      if (oldSignature && newSignature != oldSignature) {
        lazy.log.debug(
          `Verify signature FAILED: ${newSignature} != ${oldSignature}`
        );
        errorMsgObj.value = lazy.l10n.formatValueSync("sig-mismatch");
        statusFlagsObj.value |= lazy.EnigmailConstants.DISPLAY_MESSAGE;
        return "";
      }
    }

    lazy.EnigmailCore.init();

    // limit output to 100 times message size to avoid DoS attack
    const maxOutput = pgpBlock.length * 100;
    const options = {
      fromAddr: EnigmailDecryption.getFromAddr(parent),
      verifyOnly,
      noOutput: false,
      maxOutputLength: maxOutput,
      uiFlags,
      msgDate,
    };
    const result = lazy.EnigmailFuncs.sync(lazy.RNP.decrypt(pgpBlock, options));
    if (!result) {
      lazy.log.warn("Decryption message finished with no result.");
      return "";
    }
    if (result.exitCode !== 0) {
      const status = [
        "BAD_SIGNATURE",
        "UNCERTAIN_SIGNATURE",
        "EXPIRED_SIGNATURE",
        "EXPIRED_KEY_SIGNATURE",
        "EXPIRED_KEY",
        "REVOKED_KEY",
        "NO_PUBKEY",
        "NO_SECKEY",
        "MISSING_PASSPHRASE",
        "BAD_PASSPHRASE",
        "BAD_ARMOR",
        "NODATA",
        "DECRYPTION_INCOMPLETE",
        "DECRYPTION_FAILED",
        "MISSING_MDC",
        "OVERFLOWED",
        "SC_OP_FAILURE",
        "UNKNOWN_ALGO",
      ]
        .map(c => (result.statusFlags & lazy.EnigmailConstants[c] ? c : null))
        .filter(Boolean)
        .join(", ");
      lazy.log.debug(`Decryption FAILED; status=${status}`);
    }

    let plainText = this.getPlaintextFromDecryptResult(result);
    lazy.log.debug(`Decrypted; key=${result.keyId}, plainText=${plainText}`);

    exitCodeObj.value = result.exitCode;
    statusFlagsObj.value = result.statusFlags;
    errorMsgObj.value = result.errorMsg;

    userIdObj.value = result.userId;
    keyIdObj.value = result.keyId;
    sigDetailsObj.value = result.sigDetails;

    if (extraDetailsObj) {
      extraDetailsObj.value = JSON.stringify({
        encryptedTo: result.encToDetails,
        packetDump: "packetDump" in result ? result.packetDump : "",
      });
      lazy.log.debug(`Extra decryption details: ${extraDetailsObj.value}`);
    }
    blockSeparationObj.value = result.blockSeparation;

    if (tail.search(/\S/) >= 0) {
      statusFlagsObj.value |= lazy.EnigmailConstants.PARTIALLY_PGP;
    }

    if (exitCodeObj.value === 0) {
      if (
        Services.prefs.getBoolPref("temp.openpgp.doubleDashSeparator", false) &&
        plainText.search(/(\r|\n)-- +(\r|\n)/) < 0
      ) {
        // Workaround for MsgCompose stripping trailing spaces from sig separator
        plainText = plainText.replace(/(\r|\n)--(\r|\n)/, "$1-- $2");
      }

      statusFlagsObj.value |= lazy.EnigmailConstants.DISPLAY_MESSAGE;

      if (verifyOnly && indentStrObj.value) {
        plainText = plainText.replace(/^/gm, indentStrObj.value);
      }

      return EnigmailDecryption.inlineInnerVerification(
        parent,
        uiFlags,
        plainText,
        statusObjectFrom(
          signatureObj,
          exitCodeObj,
          statusFlagsObj,
          keyIdObj,
          userIdObj,
          sigDetailsObj,
          errorMsgObj,
          blockSeparationObj,
          extraDetailsObj
        )
      );
    }

    const pubKeyId = keyIdObj.value;

    if (statusFlagsObj.value & lazy.EnigmailConstants.BAD_SIGNATURE) {
      if (verifyOnly && indentStrObj.value) {
        // Probably replied message that could not be verified
        errorMsgObj.value =
          lazy.l10n.formatValueSync("unverified-reply") +
          "\n\n" +
          errorMsgObj.value;
        return "";
      }

      // Return bad signature (for checking later)
      signatureObj.value = newSignature;
    } else if (
      pubKeyId &&
      statusFlagsObj.value & lazy.EnigmailConstants.UNCERTAIN_SIGNATURE
    ) {
      // TODO: import into scratch area
      /*
      var innerKeyBlock;
      if (verifyOnly) {
        // Search for indented public key block in signed message
        var innerBlockType = EnigmailArmor.locateArmoredBlock(
          pgpBlock,
          0,
          "- ",
          beginIndexObj,
          endIndexObj,
          indentStrObj
        );
        if (innerBlockType == "PUBLIC KEY BLOCK") {
          innerKeyBlock = pgpBlock.substr(
            beginIndexObj.value,
            endIndexObj.value - beginIndexObj.value + 1
          );

          innerKeyBlock = innerKeyBlock.replace(/- -----/g, "-----");

          statusFlagsObj.value |= EnigmailConstants.INLINE_KEY;
          lazy.log.debug(`Found inner key block: ${innerKeyBlock}`);
        }
      }

      var importedKey = false;

      if (innerKeyBlock) {
        var importErrorMsgObj = {};
        var exitStatus = EnigmailKeyRing.importKey(
          parent,
          true,
          innerKeyBlock,
          false,
          pubKeyId,
          importErrorMsgObj
        );

        importedKey = exitStatus === 0;

        if (exitStatus > 0) {
          l10n.formatValue("cant-import").then(value => {
            Services.prompt.alert(
              parent,
              null,
              value + "\n" + importErrorMsgObj.value
            );
          });
        }
      }

      if (importedKey) {
        // Recursive call; note that EnigmailConstants.UI_ALLOW_KEY_IMPORT is unset
        // to break the recursion
        var uiFlagsDeep = interactive ? EnigmailConstants.UI_INTERACTIVE : 0;
        signatureObj.value = "";
        return EnigmailDecryption.decryptMessage(
          parent,
          uiFlagsDeep,
          pgpBlock,
          null, // date
          signatureObj,
          exitCodeObj,
          statusFlagsObj,
          keyIdObj,
          userIdObj,
          sigDetailsObj,
          errorMsgObj
        );
      }
      */

      if (plainText && !unverifiedEncryptedOK) {
        // Append original PGP block to unverified message
        plainText =
          "-----BEGIN PGP UNVERIFIED MESSAGE-----\r\n" +
          plainText +
          "-----END PGP UNVERIFIED MESSAGE-----\r\n\r\n" +
          pgpBlock;
      }
    }

    return verifyOnly ? "" : plainText;
  },

  /**
   * @param {?window} parent - A window object.
   * @param {integer} uiFlags - See flag options in EnigmailConstants,
   *   UI_INTERACTIVE, UI_ALLOW_KEY_IMPORT.
   * @param {string} text - A string containing a PGP block.
   * @param {object} statusObject - An object containing status details.
   */
  inlineInnerVerification(parent, uiFlags, text, statusObject) {
    if (!text?.startsWith("-----BEGIN PGP SIGNED MESSAGE-----")) {
      return text;
    }
    lazy.log.debug(`Doing inline verification; text=${text}`);
    const status = newStatusObject();
    const newText = EnigmailDecryption.decryptMessage(
      parent,
      uiFlags,
      text,
      null, // date
      status.signature,
      status.exitCode,
      status.statusFlags,
      status.keyId,
      status.userId,
      status.sigDetails,
      status.message,
      status.blockSeparation,
      status.encToDetails
    );
    if (status.exitCode.value === 0) {
      text = newText;
      lazy.log.debug(`Inline verify succeeded; text=${text}`);
      // merge status into status object:
      statusObject.statusFlags.value =
        statusObject.statusFlags.value | status.statusFlags.value;
      statusObject.keyId.value = status.keyId.value;
      statusObject.userId.value = status.userId.value;
      statusObject.sigDetails.value = status.sigDetails.value;
      statusObject.message.value = status.message.value;
      // we don't merge encToDetails
    } else {
      lazy.log.debug(`Verify inline FAILED.`);
    }
    return text;
  },

  /**
   * @param {object} result - Result object.
   */
  isDecryptFailureResult(result) {
    if (result.statusFlags & lazy.EnigmailConstants.MISSING_MDC) {
      lazy.log.debug("Bad message: missing MDC.");
    } else if (result.statusFlags & lazy.EnigmailConstants.DECRYPTION_FAILED) {
      lazy.log.debug("Cannot decrypt message.");
    } else if (result.decryptedData) {
      return false;
    }
    return true;
  },

  /**
   * @param {object} result - Result object.
   */
  getPlaintextFromDecryptResult(result) {
    if (this.isDecryptFailureResult(result)) {
      return "";
    }
    return result.decryptedData;
  },

  async decryptAttachment(
    parent,
    outFile,
    displayName,
    byteData,
    exitCodeObj,
    statusFlagsObj,
    errorMsgObj
  ) {
    const attachmentHead = byteData.substr(0, 200);
    if (attachmentHead.match(/-----BEGIN PGP \w{5,10} KEY BLOCK-----/)) {
      lazy.log("The attachment appears to be a PGP key file.");
      if (
        !Services.prompt.confirmEx(
          parent,
          null,
          lazy.l10n.formatValueSync("attachment-pgp-key", {
            name: displayName,
          }),
          Services.prompt.STD_OK_CANCEL_BUTTONS,
          lazy.l10n.formatValueSync("key-man-button-import"),
          lazy.l10n.formatValueSync("dlg-button-view"),
          null,
          null,
          {}
        )
      ) {
        const preview = await lazy.EnigmailKey.getKeyListFromKeyBlock(
          byteData,
          errorMsgObj,
          true,
          true,
          false
        );
        exitCodeObj.keyList = preview;
        if (preview && errorMsgObj.value === "") {
          lazy.log.debug(`Found ${preview.length} keys to import.`);
          if (preview.length > 0) {
            let confirmImport = false;
            const outParam = {};
            confirmImport = lazy.EnigmailDialog.confirmPubkeyImport(
              parent,
              preview,
              outParam
            );
            if (confirmImport) {
              exitCodeObj.value = lazy.EnigmailKeyRing.importKey(
                parent,
                false,
                byteData,
                false,
                "",
                errorMsgObj,
                null,
                false,
                [],
                outParam.acceptance
              );
              statusFlagsObj.value = lazy.EnigmailConstants.IMPORTED_KEY;
            } else {
              exitCodeObj.value = 0;
              statusFlagsObj.value = lazy.EnigmailConstants.DISPLAY_MESSAGE;
            }
          }
        } else {
          lazy.log.debug(
            `Getting key list from key block FAILED; ${errorMsgObj.value}`
          );
        }
      } else {
        exitCodeObj.value = 0;
        statusFlagsObj.value = lazy.EnigmailConstants.DISPLAY_MESSAGE;
      }
      statusFlagsObj.ext = 0;
      return true;
    }

    lazy.log.debug(`Decrypting attachment to ${outFile.path}`);

    const options = { fromAddr: "", msgDate: null };
    const result = await lazy.RNP.decrypt(byteData, options);
    if (!result) {
      lazy.log.warn("Decrypt attachment finished with no result.");
      return false;
    }

    exitCodeObj.value = result.exitCode;
    statusFlagsObj.value = result.statusFlags;
    errorMsgObj.value = result.errorMsg;

    if (!this.isDecryptFailureResult(result)) {
      await IOUtils.write(
        outFile.path,
        lazy.MailStringUtils.byteStringToUint8Array(result.decryptedData)
      );
      return true;
    }
    return false;
  },
};
