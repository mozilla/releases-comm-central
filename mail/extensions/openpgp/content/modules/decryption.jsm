/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* eslint-disable complexity */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailDecryption"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailArmor: "chrome://openpgp/content/modules/armor.jsm",
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.jsm",
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailKey: "chrome://openpgp/content/modules/key.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  MailStringUtils: "resource:///modules/MailStringUtils.jsm",
});

XPCOMUtils.defineLazyGetter(lazy, "l10n", () => {
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
  encToDetailsObj
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
    encToDetails: encToDetailsObj,
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

var EnigmailDecryption = {
  isReady() {
    // this used to return false while generating a key. still necessary?
    return lazy.EnigmailCore.getService();
  },

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
   *  Decrypts a PGP ciphertext and returns the the plaintext
   *
   *in  @parent a window object
   *in  @uiFlags see flag options in EnigmailConstants, UI_INTERACTIVE, UI_ALLOW_KEY_IMPORT
   *in  @cipherText a string containing a PGP Block
   *out @signatureObj
   *out @exitCodeObj contains the exit code
   *out @statusFlagsObj see status flags in nslEnigmail.idl, GOOD_SIGNATURE, BAD_SIGNATURE
   *out @keyIdObj holds the key id
   *out @userIdObj holds the user id
   *out @sigDetailsObj
   *out @errorMsgObj  error string
   *out @blockSeparationObj
   *out @encToDetailsObj  returns in details, which keys the message was encrypted for (ENC_TO entries)
   *
   * @returns string plaintext ("" if error)
   *
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
    encToDetailsObj
  ) {
    lazy.EnigmailLog.DEBUG(
      "decryption.jsm: decryptMessage(" +
        cipherText.length +
        " bytes, " +
        uiFlags +
        ")\n"
    );

    if (!cipherText) {
      return "";
    }

    //var interactive = uiFlags & EnigmailConstants.UI_INTERACTIVE;
    var allowImport = false; // uiFlags & EnigmailConstants.UI_ALLOW_KEY_IMPORT;
    var unverifiedEncryptedOK =
      uiFlags & lazy.EnigmailConstants.UI_UNVERIFIED_ENC_OK;
    var oldSignature = signatureObj.value;

    lazy.EnigmailLog.DEBUG(
      "decryption.jsm: decryptMessage: oldSignature=" + oldSignature + "\n"
    );

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
      return "";
    }

    var publicKey = blockType == "PUBLIC KEY BLOCK";

    var verifyOnly = blockType == "SIGNED MESSAGE";
    var isEncrypted = blockType == "MESSAGE";

    if (verifyOnly) {
      statusFlagsObj.value |= lazy.EnigmailConstants.PGP_MIME_SIGNED;
    }
    if (isEncrypted) {
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
      lazy.EnigmailLog.DEBUG(
        "decryption.jsm: decryptMessage: apply Outlook empty line workaround\n"
      );
      pgpBlock = pgpBlock.replace(/\r?\n\r?\n/g, "\n");
    }

    var tail = cipherText.substr(
      endIndexObj.value + 1,
      cipherText.length - endIndexObj.value - 1
    );

    if (publicKey) {
      // TODO: import key into our scratch area for new, unknown keys
      if (!allowImport) {
        errorMsgObj.value = lazy.l10n.formatValueSync("key-in-message-body");
        statusFlagsObj.value |= lazy.EnigmailConstants.DISPLAY_MESSAGE;
        statusFlagsObj.value |= lazy.EnigmailConstants.INLINE_KEY;

        return "";
      }

      // Import public key
      exitCodeObj.value = lazy.EnigmailKeyRing.importKey(
        parent,
        true,
        pgpBlock,
        false,
        "",
        errorMsgObj,
        {}, // importedKeysObj
        false,
        [],
        false // don't use prompt for permissive
      );
      if (exitCodeObj.value === 0) {
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
        lazy.EnigmailLog.ERROR(
          "enigmail.js: Enigmail.decryptMessage: Error - signature mismatch " +
            newSignature +
            "\n"
        );
        errorMsgObj.value = lazy.l10n.formatValueSync("sig-mismatch");
        statusFlagsObj.value |= lazy.EnigmailConstants.DISPLAY_MESSAGE;

        return "";
      }
    }

    if (!lazy.EnigmailCore.getService()) {
      statusFlagsObj.value |= lazy.EnigmailConstants.DISPLAY_MESSAGE;
      throw new Error("decryption.jsm: decryptMessage: not yet initialized");
      //return "";
    }

    /*
    if (EnigmailKeyRing.isGeneratingKey()) {
      errorMsgObj.value = "Error - key generation not yet completed";
      statusFlagsObj.value |= EnigmailConstants.DISPLAY_MESSAGE;
      return "";
    }
    */

    // limit output to 100 times message size to avoid DoS attack
    var maxOutput = pgpBlock.length * 100;
    const options = {
      fromAddr: EnigmailDecryption.getFromAddr(parent),
      verifyOnly,
      noOutput: false,
      maxOutputLength: maxOutput,
      uiFlags,
      msgDate,
    };
    const cApi = lazy.EnigmailCryptoAPI();
    const result = cApi.sync(cApi.decrypt(pgpBlock, options));
    lazy.EnigmailLog.DEBUG(
      "decryption.jsm: decryptMessage: decryption finished\n"
    );
    if (!result) {
      console.debug("EnigmailCryptoAPI.decrypt() failed with empty result");
      return "";
    }

    let plainText = this.getPlaintextFromDecryptResult(result);
    exitCodeObj.value = result.exitCode;
    statusFlagsObj.value = result.statusFlags;
    errorMsgObj.value = result.errorMsg;

    userIdObj.value = result.userId;
    keyIdObj.value = result.keyId;
    sigDetailsObj.value = result.sigDetails;
    if (encToDetailsObj) {
      encToDetailsObj.value = result.encToDetails;
    }
    blockSeparationObj.value = result.blockSeparation;

    if (tail.search(/\S/) >= 0) {
      statusFlagsObj.value |= lazy.EnigmailConstants.PARTIALLY_PGP;
    }

    if (exitCodeObj.value === 0) {
      // Normal return

      const doubleDashSeparator = Services.prefs.getBoolPref(
        "doubleDashSeparator",
        false
      );

      if (doubleDashSeparator && plainText.search(/(\r|\n)-- +(\r|\n)/) < 0) {
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
          encToDetailsObj
        )
      );
    }

    var pubKeyId = keyIdObj.value;

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
          EnigmailLog.DEBUG(
            "decryption.jsm: decryptMessage: innerKeyBlock found\n"
          );
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
            EnigmailDialog.alert(
              parent,
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

  inlineInnerVerification(parent, uiFlags, text, statusObject) {
    lazy.EnigmailLog.DEBUG("decryption.jsm: inlineInnerVerification()\n");

    if (text && text.indexOf("-----BEGIN PGP SIGNED MESSAGE-----") === 0) {
      var status = newStatusObject();
      var newText = EnigmailDecryption.decryptMessage(
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
        // merge status into status object:
        statusObject.statusFlags.value =
          statusObject.statusFlags.value | status.statusFlags.value;
        statusObject.keyId.value = status.keyId.value;
        statusObject.userId.value = status.userId.value;
        statusObject.sigDetails.value = status.sigDetails.value;
        statusObject.message.value = status.message.value;
        // we don't merge encToDetails
      }
    }

    return text;
  },

  isDecryptFailureResult(result) {
    if (result.statusFlags & lazy.EnigmailConstants.MISSING_MDC) {
      console.log("bad message, missing MDC");
    } else if (result.statusFlags & lazy.EnigmailConstants.DECRYPTION_FAILED) {
      console.log("cannot decrypt message");
    } else if (result.decryptedData) {
      return false;
    }
    return true;
  },

  getPlaintextFromDecryptResult(result) {
    if (this.isDecryptFailureResult(result)) {
      return "";
    }
    return lazy.EnigmailData.getUnicodeData(result.decryptedData);
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
    lazy.EnigmailLog.DEBUG(
      "decryption.jsm: decryptAttachment(parent=" +
        parent +
        ", outFileName=" +
        outFile.path +
        ")\n"
    );

    const attachmentHead = byteData.substr(0, 200);
    if (attachmentHead.match(/-----BEGIN PGP \w{5,10} KEY BLOCK-----/)) {
      // attachment appears to be a PGP key file

      if (
        lazy.EnigmailDialog.confirmDlg(
          parent,
          lazy.l10n.formatValueSync("attachment-pgp-key", {
            name: displayName,
          }),
          lazy.l10n.formatValueSync("key-man-button-import"),
          lazy.l10n.formatValueSync("dlg-button-view")
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
                false, // don't use prompt for permissive
                outParam.acceptance
              );
              statusFlagsObj.value = lazy.EnigmailConstants.IMPORTED_KEY;
            } else {
              exitCodeObj.value = 0;
              statusFlagsObj.value = lazy.EnigmailConstants.DISPLAY_MESSAGE;
            }
          }
        } else {
          console.debug(
            "Failed to obtain key list from key block in decrypted attachment. " +
              errorMsgObj.value
          );
        }
      } else {
        exitCodeObj.value = 0;
        statusFlagsObj.value = lazy.EnigmailConstants.DISPLAY_MESSAGE;
      }
      statusFlagsObj.ext = 0;
      return true;
    }

    const cApi = lazy.EnigmailCryptoAPI();
    const result = await cApi.decryptAttachment(byteData);
    if (!result) {
      console.debug(
        "EnigmailCryptoAPI.decryptAttachment() failed with empty result"
      );
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
