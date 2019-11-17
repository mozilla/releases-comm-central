/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailDecryption"];

const EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailPrefs = ChromeUtils.import("chrome://openpgp/content/modules/prefs.jsm").EnigmailPrefs;
const EnigmailArmor = ChromeUtils.import("chrome://openpgp/content/modules/armor.jsm").EnigmailArmor;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const EnigmailDialog = ChromeUtils.import("chrome://openpgp/content/modules/dialog.jsm").EnigmailDialog;
const EnigmailHttpProxy = ChromeUtils.import("chrome://openpgp/content/modules/httpProxy.jsm").EnigmailHttpProxy;
const EnigmailGpgAgent = ChromeUtils.import("chrome://openpgp/content/modules/gpgAgent.jsm").EnigmailGpgAgent;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const EnigmailGpg = ChromeUtils.import("chrome://openpgp/content/modules/gpg.jsm").EnigmailGpg;
const EnigmailErrorHandling = ChromeUtils.import("chrome://openpgp/content/modules/errorHandling.jsm").EnigmailErrorHandling;
const EnigmailKeyRing = ChromeUtils.import("chrome://openpgp/content/modules/keyRing.jsm").EnigmailKeyRing;
const EnigmailKey = ChromeUtils.import("chrome://openpgp/content/modules/key.jsm").EnigmailKey;
const EnigmailPassword = ChromeUtils.import("chrome://openpgp/content/modules/passwords.jsm").EnigmailPassword;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;
const EnigmailFuncs = ChromeUtils.import("chrome://openpgp/content/modules/funcs.jsm").EnigmailFuncs;
const EnigmailCryptoAPI = ChromeUtils.import("chrome://openpgp/content/modules/cryptoAPI.jsm").EnigmailCryptoAPI;

const STATUS_ERROR = EnigmailConstants.BAD_SIGNATURE | EnigmailConstants.DECRYPTION_FAILED;
const STATUS_DECRYPTION_OK = EnigmailConstants.DECRYPTION_OKAY;
const STATUS_GOODSIG = EnigmailConstants.GOOD_SIGNATURE;

const NS_WRONLY = 0x02;

function statusObjectFrom(signatureObj, exitCodeObj, statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj, errorMsgObj, blockSeparationObj, encToDetailsObj) {
  return {
    signature: signatureObj,
    exitCode: exitCodeObj,
    statusFlags: statusFlagsObj,
    keyId: keyIdObj,
    userId: userIdObj,
    sigDetails: sigDetailsObj,
    message: errorMsgObj,
    blockSeparation: blockSeparationObj,
    encToDetails: encToDetailsObj
  };
}

function newStatusObject() {
  return statusObjectFrom({
    value: ""
  }, {}, {}, {}, {}, {}, {}, {}, {});
}

var EnigmailDecryption = {
  isReady: function(win) {
    return (EnigmailCore.getService(win)) && (!EnigmailKeyRing.isGeneratingKey());
  },

  getFromAddr: function(win) {
    var fromAddr;
    if (win && win.gFolderDisplay && win.gFolderDisplay.selectedMessage) {
      fromAddr = win.gFolderDisplay.selectedMessage.author;
      try {
        fromAddr = EnigmailFuncs.stripEmail(fromAddr);
        if (fromAddr.search(/[a-zA-Z0-9]@.*[\(\)]/) >= 0) {
          fromAddr = false;
        }
      }
      catch (ex) {
        fromAddr = false;
      }
    }
    return fromAddr;
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
   *out @encToDetailsObj  returns in details, which keys the mesage was encrypted for (ENC_TO entries)
   *
   * @return string plaintext ("" if error)
   *
   */
  decryptMessage: function(parent, uiFlags, cipherText,
    signatureObj, exitCodeObj,
    statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj, errorMsgObj,
    blockSeparationObj, encToDetailsObj) {
    const esvc = EnigmailCore.getEnigmailService();

    EnigmailLog.DEBUG("decryption.jsm: decryptMessage(" + cipherText.length + " bytes, " + uiFlags + ")\n");

    if (!cipherText)
      return "";

    var interactive = uiFlags & EnigmailConstants.UI_INTERACTIVE;
    var allowImport = uiFlags & EnigmailConstants.UI_ALLOW_KEY_IMPORT;
    var unverifiedEncryptedOK = uiFlags & EnigmailConstants.UI_UNVERIFIED_ENC_OK;
    var oldSignature = signatureObj.value;

    EnigmailLog.DEBUG("decryption.jsm: decryptMessage: oldSignature=" + oldSignature + "\n");

    signatureObj.value = "";
    exitCodeObj.value = -1;
    statusFlagsObj.value = 0;
    keyIdObj.value = "";
    userIdObj.value = "";
    errorMsgObj.value = "";

    var beginIndexObj = {};
    var endIndexObj = {};
    var indentStrObj = {};
    var blockType = EnigmailArmor.locateArmoredBlock(cipherText, 0, "", beginIndexObj, endIndexObj, indentStrObj);
    if (!blockType || blockType == "SIGNATURE") {
      // return without displaying a message
      return "";
    }

    var publicKey = (blockType == "PUBLIC KEY BLOCK");

    var verifyOnly = (blockType == "SIGNED MESSAGE");

    var pgpBlock = cipherText.substr(beginIndexObj.value,
      endIndexObj.value - beginIndexObj.value + 1);

    if (indentStrObj.value) {
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
      EnigmailLog.DEBUG("decryption.jsm: decryptMessage: apply Outlook empty line workaround\n");
      pgpBlock = pgpBlock.replace(/\r?\n\r?\n/g, "\n");
    }

    const head = "";
    var tail = cipherText.substr(endIndexObj.value + 1,
      cipherText.length - endIndexObj.value - 1);

    if (publicKey) {
      if (!allowImport) {
        errorMsgObj.value = EnigmailLocale.getString("keyInMessageBody");
        statusFlagsObj.value |= EnigmailConstants.DISPLAY_MESSAGE;
        statusFlagsObj.value |= EnigmailConstants.INLINE_KEY;

        return "";
      }

      // Import public key
      exitCodeObj.value = EnigmailKeyRing.importKey(parent, true, pgpBlock, "",
        errorMsgObj);
      if (exitCodeObj.value === 0) {
        statusFlagsObj.value |= EnigmailConstants.IMPORTED_KEY;
      }
      return "";
    }

    var newSignature = "";

    if (verifyOnly) {
      newSignature = EnigmailArmor.extractSignaturePart(pgpBlock, EnigmailConstants.SIGNATURE_ARMOR);
      if (oldSignature && (newSignature != oldSignature)) {
        EnigmailLog.ERROR("enigmail.js: Enigmail.decryptMessage: Error - signature mismatch " + newSignature + "\n");
        errorMsgObj.value = EnigmailLocale.getString("sigMismatch");
        statusFlagsObj.value |= EnigmailConstants.DISPLAY_MESSAGE;

        return "";
      }
    }

    if (!EnigmailCore.getService(parent)) {
      EnigmailLog.ERROR("decryption.jsm: decryptMessage: not yet initialized\n");
      errorMsgObj.value = EnigmailLocale.getString("notInit");
      statusFlagsObj.value |= EnigmailConstants.DISPLAY_MESSAGE;
      return "";
    }

    if (EnigmailKeyRing.isGeneratingKey()) {
      errorMsgObj.value = EnigmailLocale.getString("notComplete");
      statusFlagsObj.value |= EnigmailConstants.DISPLAY_MESSAGE;
      return "";
    }

    // limit output to 100 times message size to avoid DoS attack
    var maxOutput = pgpBlock.length * 100;
    let keyserver = EnigmailPrefs.getPref("autoKeyRetrieve");
    let options = {
      keyserver: keyserver,
      keyserverProxy: EnigmailHttpProxy.getHttpProxy(keyserver),
      fromAddr: EnigmailDecryption.getFromAddr(parent),
      verifyOnly: verifyOnly,
      noOutput: false,
      maxOutputLength: maxOutput,
      uiFlags: uiFlags
    };
    const cApi = EnigmailCryptoAPI();
    let result = cApi.sync(cApi.decrypt(pgpBlock, options));
    EnigmailLog.DEBUG("decryption.jsm: decryptMessage: decryption finished\n");
    if (! result) {
      return "";
    }

    var plainText = EnigmailData.getUnicodeData(result.decryptedData);
    exitCodeObj.value = result.exitCode;
    statusFlagsObj.value = result.statusFlags;
    errorMsgObj.value = result.errorMsg;

    // do not return anything if gpg signales DECRYPTION_FAILED
    // (which could be possible in case of MDC errors)
    if ((uiFlags & EnigmailConstants.UI_IGNORE_MDC_ERROR) &&
      (result.statusFlags & EnigmailConstants.MISSING_MDC)) {
      EnigmailLog.DEBUG("decryption.jsm: decryptMessage: ignoring MDC error\n");
    }
    else if (result.statusFlags & EnigmailConstants.DECRYPTION_FAILED) {
      plainText = "";
    }

    userIdObj.value = result.userId;
    keyIdObj.value = result.keyId;
    sigDetailsObj.value = result.sigDetails;
    if (encToDetailsObj) {
      encToDetailsObj.value = result.encToDetails;
    }
    blockSeparationObj.value = result.blockSeparation;

    if (tail.search(/\S/) >= 0) {
      statusFlagsObj.value |= EnigmailConstants.PARTIALLY_PGP;
    }


    if (exitCodeObj.value === 0) {
      // Normal return

      var doubleDashSeparator = false;
      try {
        doubleDashSeparator = EnigmailPrefs.getPrefBranch().getBoolPref("doubleDashSeparator");
      }
      catch (ex) {}

      if (doubleDashSeparator && (plainText.search(/(\r|\n)-- +(\r|\n)/) < 0)) {
        // Workaround for MsgCompose stripping trailing spaces from sig separator
        plainText = plainText.replace(/(\r|\n)--(\r|\n)/, "$1-- $2");
      }

      statusFlagsObj.value |= EnigmailConstants.DISPLAY_MESSAGE;

      if (verifyOnly && indentStrObj.value) {
        plainText = plainText.replace(/^/gm, indentStrObj.value);
      }

      return EnigmailDecryption.inlineInnerVerification(parent, uiFlags, plainText,
        statusObjectFrom(signatureObj, exitCodeObj, statusFlagsObj, keyIdObj, userIdObj,
          sigDetailsObj, errorMsgObj, blockSeparationObj, encToDetailsObj));
    }

    var pubKeyId = keyIdObj.value;

    if (statusFlagsObj.value & EnigmailConstants.BAD_SIGNATURE) {
      if (verifyOnly && indentStrObj.value) {
        // Probably replied message that could not be verified
        errorMsgObj.value = EnigmailLocale.getString("unverifiedReply") + "\n\n" + errorMsgObj.value;
        return "";
      }

      // Return bad signature (for checking later)
      signatureObj.value = newSignature;

    }
    else if (pubKeyId &&
      (statusFlagsObj.value & EnigmailConstants.UNVERIFIED_SIGNATURE)) {

      var innerKeyBlock;
      if (verifyOnly) {
        // Search for indented public key block in signed message
        var innerBlockType = EnigmailArmor.locateArmoredBlock(pgpBlock, 0, "- ", beginIndexObj, endIndexObj, indentStrObj);
        if (innerBlockType == "PUBLIC KEY BLOCK") {

          innerKeyBlock = pgpBlock.substr(beginIndexObj.value,
            endIndexObj.value - beginIndexObj.value + 1);

          innerKeyBlock = innerKeyBlock.replace(/- -----/g, "-----");

          statusFlagsObj.value |= EnigmailConstants.INLINE_KEY;
          EnigmailLog.DEBUG("decryption.jsm: decryptMessage: innerKeyBlock found\n");
        }
      }

      if (allowImport) {

        var importedKey = false;

        if (innerKeyBlock) {
          var importErrorMsgObj = {};
          var exitStatus = EnigmailKeyRing.importKey(parent, true, innerKeyBlock,
            pubKeyId, importErrorMsgObj);

          importedKey = (exitStatus === 0);

          if (exitStatus > 0) {
            EnigmailDialog.alert(parent, EnigmailLocale.getString("cantImport") + importErrorMsgObj.value);
          }
        }

        if (importedKey) {
          // Recursive call; note that EnigmailConstants.UI_ALLOW_KEY_IMPORT is unset
          // to break the recursion
          var uiFlagsDeep = interactive ? EnigmailConstants.UI_INTERACTIVE : 0;
          signatureObj.value = "";
          return EnigmailDecryption.decryptMessage(parent, uiFlagsDeep, pgpBlock,
            signatureObj, exitCodeObj, statusFlagsObj,
            keyIdObj, userIdObj, sigDetailsObj, errorMsgObj);
        }

      }

      if (plainText && !unverifiedEncryptedOK) {
        // Append original PGP block to unverified message
        plainText = "-----BEGIN PGP UNVERIFIED MESSAGE-----\r\n" + plainText +
          "-----END PGP UNVERIFIED MESSAGE-----\r\n\r\n" + pgpBlock;
      }

    }

    return verifyOnly ? "" : plainText;
  },

  inlineInnerVerification: function(parent, uiFlags, text, statusObject) {
    EnigmailLog.DEBUG("decryption.jsm: inlineInnerVerification()\n");

    if (text && text.indexOf("-----BEGIN PGP SIGNED MESSAGE-----") === 0) {
      var status = newStatusObject();
      var newText = EnigmailDecryption.decryptMessage(parent, uiFlags, text,
        status.signature, status.exitCode, status.statusFlags, status.keyId, status.userId,
        status.sigDetails, status.message, status.blockSeparation, status.encToDetails);
      if (status.exitCode.value === 0) {
        text = newText;
        // merge status into status object:
        statusObject.statusFlags.value = statusObject.statusFlags.value | status.statusFlags.value;
        statusObject.keyId.value = status.keyId.value;
        statusObject.userId.value = status.userId.value;
        statusObject.sigDetails.value = status.sigDetails.value;
        statusObject.message.value = status.message.value;
        // we don't merge encToDetails
      }
    }

    return text;
  },

  decryptAttachment: function(parent, outFile, displayName, byteData,
    exitCodeObj, statusFlagsObj, errorMsgObj) {
    const esvc = EnigmailCore.getEnigmailService();

    EnigmailLog.DEBUG("decryption.jsm: decryptAttachment(parent=" + parent + ", outFileName=" + outFile.path + ")\n");

    let attachmentHead = byteData.substr(0, 200);
    if (attachmentHead.match(/-----BEGIN PGP \w{5,10} KEY BLOCK-----/)) {
      // attachment appears to be a PGP key file

      if (EnigmailDialog.confirmDlg(parent, EnigmailLocale.getString("attachmentPgpKey", [displayName]),
          EnigmailLocale.getString("keyMan.button.import"), EnigmailLocale.getString("dlg.button.view"))) {

        let preview = EnigmailKey.getKeyListFromKeyBlock(byteData, errorMsgObj);
        exitCodeObj.keyList = preview;
        let exitStatus = 0;

        if (errorMsgObj.value === "") {
          if (preview.length > 0) {
            if (preview.length == 1) {
              exitStatus = EnigmailDialog.confirmDlg(parent, EnigmailLocale.getString("doImportOne", [preview[0].name, preview[0].id]));
            }
            else {
              exitStatus = EnigmailDialog.confirmDlg(parent,
                EnigmailLocale.getString("doImportMultiple", [
                  preview.map(function(a) {
                    return "\t" + a.name + " (" + a.id + ")";
                  }).
                  join("\n")
                ]));
            }

            if (exitStatus) {
              exitCodeObj.value = EnigmailKeyRing.importKey(parent, false, byteData, "", errorMsgObj);
              statusFlagsObj.value = EnigmailConstants.IMPORTED_KEY;
            }
            else {
              exitCodeObj.value = 0;
              statusFlagsObj.value = EnigmailConstants.DISPLAY_MESSAGE;
            }
          }
        }
      }
      else {
        exitCodeObj.value = 0;
        statusFlagsObj.value = EnigmailConstants.DISPLAY_MESSAGE;
      }
      return true;
    }

    //var outFileName = EnigmailFiles.getEscapedFilename(EnigmailFiles.getFilePathReadonly(outFile.QueryInterface(Ci.nsIFile), NS_WRONLY));

    const cApi = EnigmailCryptoAPI();
    let result = cApi.sync(cApi.decryptAttachment(byteData));

    exitCodeObj.value = result.exitCode;
    statusFlagsObj.value = result.statusFlags;
    if (result.stdoutData.length > 0) {
      return EnigmailFiles.writeFileContents(outFile, result.stdoutData);
    }

    return false;
  }
};
