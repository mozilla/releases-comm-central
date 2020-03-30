/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailEncryption"];

const { EnigmailCore } = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
);
const { EnigmailData } = ChromeUtils.import(
  "chrome://openpgp/content/modules/data.jsm"
);
const { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
const { EnigmailPrefs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/prefs.jsm"
);
const { EnigmailApp } = ChromeUtils.import(
  "chrome://openpgp/content/modules/app.jsm"
);
const { EnigmailLocale } = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
);
const { EnigmailDialog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
);
const { EnigmailGpg } = ChromeUtils.import(
  "chrome://openpgp/content/modules/gpg.jsm"
);
const { EnigmailErrorHandling } = ChromeUtils.import(
  "chrome://openpgp/content/modules/errorHandling.jsm"
);
const { EnigmailFiles } = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
);
const { EnigmailFuncs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
);
const { EnigmailKeyRing } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
);
const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
const { EnigmailCryptoAPI } = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
);

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
const ENC_TYPE_ATTACH_ASCII = 2;

const GPG_COMMENT_OPT =
  "Using GnuPG with %s - https://doesnotexist-openpgp-integration.thunderbird/";

var EnigmailEncryption = {
  getEncryptCommand(
    fromMailAddr,
    toMailAddr,
    bccMailAddr,
    hashAlgorithm,
    sendFlags,
    isAscii,
    errorMsgObj,
    logFileObj
  ) {
    EnigmailLog.DEBUG(
      "encryption.jsm: getEncryptCommand: hashAlgorithm=" + hashAlgorithm + "\n"
    );

    try {
      fromMailAddr = EnigmailFuncs.stripEmail(fromMailAddr);
      toMailAddr = EnigmailFuncs.stripEmail(toMailAddr);
      bccMailAddr = EnigmailFuncs.stripEmail(bccMailAddr);
    } catch (ex) {
      errorMsgObj.value = EnigmailLocale.getString("invalidEmail");
      return null;
    }

    var signMsg = sendFlags & EnigmailConstants.SEND_SIGNED;
    var encryptMsg = sendFlags & EnigmailConstants.SEND_ENCRYPTED;
    var usePgpMime = sendFlags & EnigmailConstants.SEND_PGP_MIME;

    var useDefaultComment = false;
    try {
      useDefaultComment = EnigmailPrefs.getPref("useDefaultComment");
    } catch (ex) {}

    var hushMailSupport = false;
    try {
      hushMailSupport = EnigmailPrefs.getPref("hushMailSupport");
    } catch (ex) {}

    var detachedSig =
      (usePgpMime || sendFlags & EnigmailConstants.SEND_ATTACHMENT) &&
      signMsg &&
      !encryptMsg;

    var toAddrList = toMailAddr.split(/\s*,\s*/);
    var bccAddrList = bccMailAddr.split(/\s*,\s*/);
    var k;

    var encryptArgs = EnigmailGpg.getStandardArgs(true);

    if (!useDefaultComment) {
      encryptArgs = encryptArgs.concat([
        "--comment",
        GPG_COMMENT_OPT.replace(/%s/, EnigmailApp.getName()),
      ]);
    }

    var angledFromMailAddr =
      fromMailAddr.search(/^0x/) === 0 || hushMailSupport
        ? fromMailAddr
        : "<" + fromMailAddr + ">";
    angledFromMailAddr = angledFromMailAddr.replace(/(["'`])/g, "\\$1");

    if (signMsg && hashAlgorithm) {
      encryptArgs = encryptArgs.concat(["--digest-algo", hashAlgorithm]);
    }

    if (logFileObj) {
      logFileObj.value = EnigmailErrorHandling.getTempLogFile();
      encryptArgs.push("--log-file");
      encryptArgs.push(
        EnigmailFiles.getEscapedFilename(
          EnigmailFiles.getFilePath(logFileObj.value)
        )
      );
    }

    if (encryptMsg) {
      switch (isAscii) {
        case ENC_TYPE_MSG:
          encryptArgs.push("-a");
          encryptArgs.push("-t");
          break;
        case ENC_TYPE_ATTACH_ASCII:
          encryptArgs.push("-a");
      }

      encryptArgs.push("--encrypt");

      if (signMsg) {
        encryptArgs.push("--sign");
      }

      if (sendFlags & EnigmailConstants.SEND_ALWAYS_TRUST) {
        encryptArgs.push("--trust-model");
        encryptArgs.push("always");
      }
      if (sendFlags & EnigmailConstants.SEND_ENCRYPT_TO_SELF && fromMailAddr) {
        encryptArgs = encryptArgs.concat(["--encrypt-to", angledFromMailAddr]);
      }

      for (k = 0; k < toAddrList.length; k++) {
        toAddrList[k] = toAddrList[k].replace(/'/g, "\\'");
        if (toAddrList[k].length > 0) {
          encryptArgs.push("-r");
          if (toAddrList[k].search(/^GROUP:/) === 0) {
            // groups from gpg.conf file
            encryptArgs.push(toAddrList[k].substr(6));
          } else {
            encryptArgs.push(
              hushMailSupport || toAddrList[k].search(/^0x/) === 0
                ? toAddrList[k]
                : "<" + toAddrList[k] + ">"
            );
          }
        }
      }

      for (k = 0; k < bccAddrList.length; k++) {
        bccAddrList[k] = bccAddrList[k].replace(/'/g, "\\'");
        if (bccAddrList[k].length > 0) {
          encryptArgs.push("--hidden-recipient");
          encryptArgs.push(
            hushMailSupport || bccAddrList[k].search(/^0x/) === 0
              ? bccAddrList[k]
              : "<" + bccAddrList[k] + ">"
          );
        }
      }
    } else if (detachedSig) {
      encryptArgs = encryptArgs.concat(["-s", "-b"]);

      switch (isAscii) {
        case ENC_TYPE_MSG:
          encryptArgs = encryptArgs.concat(["-a", "-t"]);
          break;
        case ENC_TYPE_ATTACH_ASCII:
          encryptArgs.push("-a");
      }
    } else if (signMsg) {
      encryptArgs = encryptArgs.concat(["-t", "--clearsign"]);
    }

    if (fromMailAddr) {
      encryptArgs = encryptArgs.concat(["-u", angledFromMailAddr]);
    }

    return encryptArgs;
  },

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
      errorMsgObj.value = EnigmailLocale.getString("invalidEmail");
      return null;
    }

    var signMsg = sendFlags & EnigmailConstants.SEND_SIGNED;
    var encryptMsg = sendFlags & EnigmailConstants.SEND_ENCRYPTED;
    var usePgpMime = sendFlags & EnigmailConstants.SEND_PGP_MIME;

    var detachedSig =
      (usePgpMime || sendFlags & EnigmailConstants.SEND_ATTACHMENT) &&
      signMsg &&
      !encryptMsg;

    result.to = toMailAddr.split(/\s*,\s*/);
    result.bcc = bccMailAddr.split(/\s*,\s*/);

    if (result.to.length == 1 && result.to[0].length == 0) {
      result.to.splice(0, 1); // remove the single empty entry
    }

    if (result.bcc.length == 1 && result.bcc[0].length == 0) {
      result.bcc.splice(0, 1); // remove the single empty entry
    }

    console.debug(`getCryptParams, got: to=${result.to}, bcc=${result.bcc}`);

    if (fromMailAddr.search(/^0x/) === 0) {
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

      var k;
      for (k = 0; k < result.to.length; k++) {
        //result.to[k] = result.to[k].replace(/'/g, "\\'");
        if (result.to[k].length > 0 && result.to[k].search(/^0x/) !== 0) {
          result.to[k] = "<" + result.to[k] + ">";
        }
      }

      for (k = 0; k < result.bcc.length; k++) {
        //result.bcc[k] = result.bcc[k].replace(/'/g, "\\'");
        if (result.bcc[k].length > 0 && result.bcc[k].search(/^0x/) !== 0) {
          result.bcc[k] = "<" + result.bcc[k] + ">";
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
   * Determine if the sender key ID or user ID can be used for signing and/or encryption
   *
   * @param sendFlags:    Number  - the send Flags; need to contain SEND_SIGNED and/or SEND_ENCRYPTED
   * @param fromMailAddr: String  - the sender email address or key ID
   *
   * @return Object:
   *         - keyId:    String - the found key ID, or null if fromMailAddr is not valid
   *         - errorMsg: String - the erorr message if key not valid, or null if key is valid
   */
  determineOwnKeyUsability(sendFlags, fromMailAddr) {
    EnigmailLog.DEBUG(
      "encryption.jsm: determineOwnKeyUsability: sendFlags=" +
        sendFlags +
        ", sender=" +
        fromMailAddr +
        "\n"
    );

    let keyList = [];
    let ret = {
      keyId: null,
      errorMsg: null,
    };

    let sign = !!(sendFlags & EnigmailConstants.SEND_SIGNED);
    let encrypt = !!(sendFlags & EnigmailConstants.SEND_ENCRYPTED);

    if (fromMailAddr.search(/^(0x)?[A-Z0-9]+$/) === 0) {
      // key ID specified
      let key = EnigmailKeyRing.getKeyById(fromMailAddr);
      keyList.push(key);
    } else {
      // email address specified
      keyList = EnigmailKeyRing.getKeysByUserId(fromMailAddr);
    }

    if (keyList.length === 0) {
      ret.errorMsg = EnigmailLocale.getString(
        "errorOwnKeyUnusable",
        fromMailAddr
      );
      return ret;
    }

    if (sign) {
      keyList = keyList.reduce(function(p, keyObj) {
        if (keyObj && keyObj.getSigningValidity().keyValid) {
          p.push(keyObj);
        }
        return p;
      }, []);
    }

    if (encrypt) {
      keyList = keyList.reduce(function(p, keyObj) {
        if (keyObj && keyObj.getEncryptionValidity().keyValid) {
          p.push(keyObj);
        }
        return p;
      }, []);
    }

    if (keyList.length === 0) {
      if (sign) {
        ret.errorMsg = EnigmailErrorHandling.determineInvSignReason(
          fromMailAddr
        );
      } else {
        ret.errorMsg = EnigmailErrorHandling.determineInvRcptReason(
          fromMailAddr
        );
      }
    } else {
      ret.keyId = keyList[0].fpr;
    }

    return ret;
  },

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

    let keyUseability = this.determineOwnKeyUsability(sendFlags, fromMailAddr);

    if (!keyUseability.keyId) {
      EnigmailLog.DEBUG(
        "encryption.jsm: encryptMessageStart: own key invalid\n"
      );
      errorMsgObj.value = keyUseability.errorMsg;
      statusFlagsObj.value =
        EnigmailConstants.INVALID_RECIPIENT |
        EnigmailConstants.NO_SECKEY |
        EnigmailConstants.DISPLAY_MESSAGE;

      return null;
    }

    var hashAlgo =
      gMimeHashAlgorithms[EnigmailPrefs.getPref("mimeHashAlgorithm")];

    if (hashAlgorithm) {
      hashAlgo = hashAlgorithm;
    }

    errorMsgObj.value = "";

    if (!sendFlags) {
      EnigmailLog.DEBUG(
        "encryption.jsm: encryptMessageStart: NO ENCRYPTION!\n"
      );
      errorMsgObj.value = EnigmailLocale.getString("notRequired");
      return null;
    }

    if (!EnigmailCore.getService(win)) {
      EnigmailLog.ERROR(
        "encryption.jsm: encryptMessageStart: not yet initialized\n"
      );
      errorMsgObj.value = EnigmailLocale.getString("notInit");
      return null;
    }

    let logFileObj = {};

    // GnuPG
    // let encryptArgs = EnigmailEncryption.getEncryptCommand(fromMailAddr, toMailAddr, bccMailAddr, hashAlgo, sendFlags, ENC_TYPE_MSG, errorMsgObj, logFileObj);
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
      return null;
    }

    if (!listener) {
      listener = {};
    }
    if ("done" in listener) {
      listener.outerDone = listener.done;
    }

    listener.done = function(exitCode) {
      EnigmailErrorHandling.appendLogFileToDebug(logFileObj.value);
      if (this.outerDone) {
        this.outerDone(exitCode);
      }
    };

    let resultStatus = {};
    const cApi = EnigmailCryptoAPI();
    console.debug("listener: %o", listener);
    let encrypted = cApi.sync(
      cApi.encryptAndOrSign(
        listener.getInputForEncryption(),
        encryptArgs,
        resultStatus
      )
    );

    if (resultStatus.exitCode) {
      if (resultStatus.errorMsg.length) {
        EnigmailDialog.alert(win, resultStatus.errorMsg);
      }
    } else if (encrypted) {
      listener.addEncryptedOutput(encrypted);
    }

    listener.done(resultStatus.exitCode);
    return null;
  },

  encryptMessageEnd(
    fromMailAddr,
    stderrStr,
    exitCode,
    uiFlags,
    sendFlags,
    outputLen,
    retStatusObj
  ) {
    EnigmailLog.DEBUG(
      "encryption.jsm: encryptMessageEnd: uiFlags=" +
        uiFlags +
        ", sendFlags=" +
        EnigmailData.bytesToHex(EnigmailData.pack(sendFlags, 4)) +
        ", outputLen=" +
        outputLen +
        "\n"
    );

    var signMsg = sendFlags & EnigmailConstants.SEND_SIGNED;
    var encryptMsg = sendFlags & EnigmailConstants.SEND_ENCRYPTED;

    retStatusObj.statusFlags = 0;
    retStatusObj.errorMsg = "";
    retStatusObj.blockSeparation = "";

    if (!EnigmailCore.getService().initialized) {
      EnigmailLog.ERROR(
        "encryption.jsm: encryptMessageEnd: not yet initialized\n"
      );
      retStatusObj.errorMsg = EnigmailLocale.getString("notInit");
      return -1;
    }

    //EnigmailErrorHandling.parseErrorOutput(stderrStr, retStatusObj);

    //exitCode = EnigmailExecution.fixExitCode(exitCode, retStatusObj);
    if (exitCode === 0 && !outputLen) {
      exitCode = -1;
    }

    if (exitCode !== 0 && (signMsg || encryptMsg)) {
      // GnuPG might return a non-zero exit code, even though the message was correctly
      // signed or encryped -> try to fix the exit code

      var correctedExitCode = 0;
      if (signMsg) {
        if (!(retStatusObj.statusFlags & EnigmailConstants.SIG_CREATED)) {
          correctedExitCode = exitCode;
        }
      }
      if (encryptMsg) {
        if (!(retStatusObj.statusFlags & EnigmailConstants.END_ENCRYPTION)) {
          correctedExitCode = exitCode;
        }
      }
      exitCode = correctedExitCode;
    }

    EnigmailLog.DEBUG(
      "encryption.jsm: encryptMessageEnd: command execution exit code: " +
        exitCode +
        "\n"
    );

    /*
    if (retStatusObj.statusFlags & EnigmailConstants.DISPLAY_MESSAGE) {
      if (retStatusObj.extendedStatus.search(/\bdisp:/) >= 0) {
        retStatusObj.errorMsg = retStatusObj.statusMsg;
      } else {
        if (fromMailAddr.search(/^0x/) === 0) {
          fromMailAddr = fromMailAddr.substr(2);
        }
        if (fromMailAddr.search(/^[A-F0-9]{8,40}$/i) === 0) {
          fromMailAddr = "[A-F0-9]+" + fromMailAddr;
        }

        let s = new RegExp(
          "^(\\[GNUPG:\\] )?INV_(RECP|SGNR) [0-9]+ (\\<|0x)?" +
            fromMailAddr +
            "\\>?",
          "m"
        );
        if (retStatusObj.statusMsg.search(s) >= 0) {
          retStatusObj.errorMsg +=
            "\n\n" + EnigmailLocale.getString("keyError.resolutionAction");
        } else if (retStatusObj.statusMsg.length > 0) {
          retStatusObj.errorMsg = retStatusObj.statusMsg;
        }
      }
    } else if (retStatusObj.statusFlags & EnigmailConstants.INVALID_RECIPIENT) {
      retStatusObj.errorMsg = retStatusObj.statusMsg;
    } else if (exitCode !== 0) {
      retStatusObj.errorMsg = EnigmailLocale.getString("badCommand");
    }
    */

    return exitCode;
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
