/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailErrorHandling"];

const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
const EnigmailSystem = ChromeUtils.import("chrome://openpgp/content/modules/system.jsm").EnigmailSystem;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;
const EnigmailLazy = ChromeUtils.import("chrome://openpgp/content/modules/lazy.jsm").EnigmailLazy;

const getEnigmailKeyRing = EnigmailLazy.loader("enigmail/keyRing.jsm", "EnigmailKeyRing");
const getEnigmailGpg = EnigmailLazy.loader("enigmail/gpg.jsm", "EnigmailGpg");
const getEnigmailFiles = EnigmailLazy.loader("enigmail/files.jsm", "EnigmailFiles");
const getEnigmailRNG = EnigmailLazy.loader("enigmail/rng.jsm", "EnigmailRNG");


const gStatusFlags = {
  GOODSIG: EnigmailConstants.GOOD_SIGNATURE,
  BADSIG: EnigmailConstants.BAD_SIGNATURE,
  ERRSIG: EnigmailConstants.UNVERIFIED_SIGNATURE,
  EXPSIG: EnigmailConstants.EXPIRED_SIGNATURE,
  REVKEYSIG: EnigmailConstants.GOOD_SIGNATURE,
  EXPKEYSIG: EnigmailConstants.EXPIRED_KEY_SIGNATURE,
  KEYEXPIRED: EnigmailConstants.EXPIRED_KEY,
  KEYREVOKED: EnigmailConstants.REVOKED_KEY,
  NO_PUBKEY: EnigmailConstants.NO_PUBKEY,
  NO_SECKEY: EnigmailConstants.NO_SECKEY,
  IMPORTED: EnigmailConstants.IMPORTED_KEY,
  INV_RECP: EnigmailConstants.INVALID_RECIPIENT,
  MISSING_PASSPHRASE: EnigmailConstants.MISSING_PASSPHRASE,
  BAD_PASSPHRASE: EnigmailConstants.BAD_PASSPHRASE,
  BADARMOR: EnigmailConstants.BAD_ARMOR,
  NODATA: EnigmailConstants.NODATA,
  ERROR: EnigmailConstants.BAD_SIGNATURE | EnigmailConstants.DECRYPTION_FAILED,
  DECRYPTION_FAILED: EnigmailConstants.DECRYPTION_FAILED,
  DECRYPTION_OKAY: EnigmailConstants.DECRYPTION_OKAY,
  CARDCTRL: EnigmailConstants.CARDCTRL,
  SC_OP_FAILURE: EnigmailConstants.SC_OP_FAILURE,
  UNKNOWN_ALGO: EnigmailConstants.UNKNOWN_ALGO,
  SIG_CREATED: EnigmailConstants.SIG_CREATED,
  END_ENCRYPTION: EnigmailConstants.END_ENCRYPTION,
  INV_SGNR: 0x100000000,
  IMPORT_OK: 0x200000000,
  FAILURE: 0x400000000,
  DECRYPTION_INFO: 0x800000000
};

// taken from libgpg-error: gpg-error.h
const GPG_SOURCE_SYSTEM = {
  GPG_ERR_SOURCE_UNKNOWN: 0,
  GPG_ERR_SOURCE_GCRYPT: 1,
  GPG_ERR_SOURCE_GPG: 2,
  GPG_ERR_SOURCE_GPGSM: 3,
  GPG_ERR_SOURCE_GPGAGENT: 4,
  GPG_ERR_SOURCE_PINENTRY: 5,
  GPG_ERR_SOURCE_SCD: 6,
  GPG_ERR_SOURCE_GPGME: 7,
  GPG_ERR_SOURCE_KEYBOX: 8,
  GPG_ERR_SOURCE_KSBA: 9,
  GPG_ERR_SOURCE_DIRMNGR: 10,
  GPG_ERR_SOURCE_GSTI: 11,
  GPG_ERR_SOURCE_GPA: 12,
  GPG_ERR_SOURCE_KLEO: 13,
  GPG_ERR_SOURCE_G13: 14,
  GPG_ERR_SOURCE_ASSUAN: 15,
  GPG_ERR_SOURCE_TLS: 17,
  GPG_ERR_SOURCE_ANY: 31
};

/**
 * Handling of specific error codes from GnuPG
 *
 * @param c           Object - the retStatusObj
 * @param errorNumber String - the error number as printed by GnuPG
 */
function handleErrorCode(c, errorNumber) {
  if (errorNumber && errorNumber.search(/^[0-9]+$/) === 0) {
    let errNum = Number(errorNumber);
    let sourceSystem = errNum >> 24;
    let errorCode = errNum & 0xFFFFFF;

    switch (errorCode) {
      case 32870: // error no tty
        if (sourceSystem === GPG_SOURCE_SYSTEM.GPG_ERR_SOURCE_PINENTRY) {
          c.statusFlags |= EnigmailConstants.DISPLAY_MESSAGE;
          c.retStatusObj.extendedStatus += "disp:get_passphrase ";
          c.retStatusObj.statusMsg = EnigmailLocale.getString("errorHandling.pinentryCursesError") + "\n\n" + EnigmailLocale.getString("errorHandling.readFaq");
          c.isError = true;
        }
        break;
      case 11: // bad Passphrase
      case 87: // bad PIN
        badPassphrase(c);
        break;
      case 177: // no passphrase
      case 178: // no PIN
        missingPassphrase(c);
        break;
      case 99: // operation canceled
        if (sourceSystem === GPG_SOURCE_SYSTEM.GPG_ERR_SOURCE_PINENTRY) {
          missingPassphrase(c);
        }
        break;
      case 77: // no agent
      case 78: // agent error
      case 80: // assuan server fault
      case 81: // assuan error
        c.statusFlags |= EnigmailConstants.DISPLAY_MESSAGE;
        c.retStatusObj.extendedStatus += "disp:get_passphrase ";
        c.retStatusObj.statusMsg = EnigmailLocale.getString("errorHandling.gpgAgentError") + "\n\n" + EnigmailLocale.getString("errorHandling.readFaq");
        c.isError = true;
        break;
      case 85: // no pinentry
      case 86: // pinentry error
        c.statusFlags |= EnigmailConstants.DISPLAY_MESSAGE;
        c.retStatusObj.extendedStatus += "disp:get_passphrase ";
        c.retStatusObj.statusMsg = EnigmailLocale.getString("errorHandling.pinentryError") + "\n\n" + EnigmailLocale.getString("errorHandling.readFaq");
        c.isError = true;
        break;
      case 92: // no dirmngr
      case 93: // dirmngr error
        c.statusFlags |= EnigmailConstants.DISPLAY_MESSAGE;
        c.retStatusObj.extendedStatus += "disp:get_passphrase ";
        c.retStatusObj.statusMsg = EnigmailLocale.getString("errorHandling.dirmngrError") + "\n\n" + EnigmailLocale.getString("errorHandling.readFaq");
        c.isError = true;
        break;
      case 2:
      case 3:
      case 149:
      case 188:
        c.statusFlags |= EnigmailConstants.UNKNOWN_ALGO;
        break;
      case 15:
        c.statusFlags |= EnigmailConstants.BAD_ARMOR;
        break;
      case 58:
        c.statusFlags |= EnigmailConstants.NODATA;
        break;
    }
  }
}

/**
 * Special treatment for some ERROR messages from GnuPG
 *
 * extendedStatus are preceeded by "disp:" if an error message is set in statusMsg
 *
 * isError is set to true if this is a hard error that makes further processing of
 * the status codes useless
 */
function handleError(c) {
  /*
    check_hijacking: gpg-agent was hijacked by some other process (like gnome-keyring)
    proc_pkt.plaintext: multiple plaintexts seen
    pkdecrypt_failed: public key decryption failed
    keyedit.passwd: error changing the passphrase
    card_key_generate: key generation failed (card)
    key_generate: key generation failed
    keyserver_send: keyserver send failed
    get_passphrase: gpg-agent cannot query the passphrase from pinentry (GnuPG 2.0.x)
  */

  var lineSplit = c.statusLine.split(/ +/);
  if (lineSplit.length > 0) {

    if (lineSplit.length >= 3) {
      // first check if the error code is a specifically treated hard failure
      handleErrorCode(c, lineSplit[2]);
      if (c.isError) return true;
    }

    switch (lineSplit[1]) {
      case "check_hijacking":
        c.statusFlags |= EnigmailConstants.DISPLAY_MESSAGE;
        c.retStatusObj.extendedStatus += "disp:invalid_gpg_agent ";
        c.retStatusObj.statusMsg = EnigmailLocale.getString("errorHandling.gpgAgentInvalid") + "\n\n" + EnigmailLocale.getString("errorHandling.readFaq");
        c.isError = true;
        break;
      case "get_passphrase":
        c.statusFlags |= EnigmailConstants.DISPLAY_MESSAGE;
        c.retStatusObj.extendedStatus += "disp:get_passphrase ";
        c.retStatusObj.statusMsg = EnigmailLocale.getString("errorHandling.pinentryError") + "\n\n" + EnigmailLocale.getString("errorHandling.readFaq");
        c.isError = true;
        break;
      case "proc_pkt.plaintext":
        c.retStatusObj.extendedStatus += "multiple_plaintexts ";
        c.isError = true;
        break;
      case "pkdecrypt_failed":
        c.retStatusObj.extendedStatus += "pubkey_decrypt ";
        handleErrorCode(c, lineSplit[2]);
        break;
      case "keyedit.passwd":
        c.retStatusObj.extendedStatus += "passwd_change_failed ";
        break;
      case "card_key_generate":
      case "key_generate":
        c.retStatusObj.extendedStatus += "key_generate_failure ";
        break;
      case "keyserver_send":
        c.retStatusObj.extendedStatus += "keyserver_send_failed ";
        c.isError = true;
        break;
      default:
        return false;
    }
    return true;
  } else {
    return false;
  }
}

// handle GnuPG FAILURE message (GnuPG 2.1.10 and newer)
function failureMessage(c) {
  let lineSplit = c.statusLine.split(/ +/);
  if (lineSplit.length >= 3) {
    handleErrorCode(c, lineSplit[2]);
  }
}

function missingPassphrase(c) {
  c.statusFlags |= EnigmailConstants.MISSING_PASSPHRASE;
  if (c.retStatusObj.statusMsg.indexOf(EnigmailLocale.getString("missingPassphrase")) < 0) {
    c.statusFlags |= EnigmailConstants.DISPLAY_MESSAGE;
    c.flag = 0;
    EnigmailLog.DEBUG("errorHandling.jsm: missingPassphrase: missing passphrase\n");
    c.retStatusObj.statusMsg += EnigmailLocale.getString("missingPassphrase") + "\n";
  }
}

function badPassphrase(c) {
  c.statusFlags |= EnigmailConstants.MISSING_PASSPHRASE;
  if (!(c.statusFlags & EnigmailConstants.BAD_PASSPHRASE)) {
    c.statusFlags |= EnigmailConstants.BAD_PASSPHRASE;
    c.flag = 0;
    EnigmailLog.DEBUG("errorHandling.jsm: badPassphrase: bad passphrase\n");
    c.retStatusObj.statusMsg += EnigmailLocale.getString("badPhrase") + "\n";
  }
}


function invalidSignature(c) {
  if (c.isError) return;
  var lineSplit = c.statusLine.split(/ +/);
  c.statusFlags |= EnigmailConstants.DISPLAY_MESSAGE;
  c.flag = 0;

  let keySpec = lineSplit[2];

  if (keySpec) {
    EnigmailLog.DEBUG("errorHandling.jsm: invalidRecipient: detected invalid sender " + keySpec + " / code: " + lineSplit[1] + "\n");
    c.retStatusObj.errorMsg += EnigmailErrorHandling.determineInvSignReason(keySpec);
  }
}

function invalidRecipient(c) {
  if (c.isError) return;
  var lineSplit = c.statusLine.split(/ +/);
  c.statusFlags |= EnigmailConstants.DISPLAY_MESSAGE;
  c.flag = 0;

  let keySpec = lineSplit[2];

  if (keySpec) {
    EnigmailLog.DEBUG("errorHandling.jsm: invalidRecipient: detected invalid recipient " + keySpec + " / code: " + lineSplit[1] + "\n");
    c.retStatusObj.errorMsg += EnigmailErrorHandling.determineInvRcptReason(keySpec);
  }
}

function importOk(c) {
  var lineSplit = c.statusLine.split(/ +/);
  if (lineSplit.length > 1) {
    EnigmailLog.DEBUG("errorHandling.jsm: importOk: key imported: " + lineSplit[2] + "\n");
  } else {
    EnigmailLog.DEBUG("errorHandling.jsm: importOk: key without FPR imported\n");
  }
}

function unverifiedSignature(c) {
  var lineSplit = c.statusLine.split(/ +/);
  if (lineSplit.length > 7 && lineSplit[7] == "4") {
    c.flag = EnigmailConstants.UNKNOWN_ALGO;
  }
}

function noData(c) {
  // Recognize only "NODATA 1"
  if (c.statusLine.search(/NODATA 1\b/) < 0) {
    c.flag = 0;
  }
}

function decryptionInfo(c) {
  // Recognize "DECRYPTION_INFO 0 1 2"
  if (c.statusLine.search(/DECRYPTION_INFO /) >= 0) {
    let lineSplit = c.statusLine.split(/ +/);

    let mdcMethod = lineSplit[1];
    let aeadAlgo = lineSplit.length > 3 ? lineSplit[3] : "0";

    if (mdcMethod === "0" && aeadAlgo === "0") {
      c.statusFlags |= EnigmailConstants.MISSING_MDC;
      c.statusFlags |= EnigmailConstants.DECRYPTION_FAILED; // be sure to fail
      c.flag = EnigmailConstants.MISSING_MDC;
      EnigmailLog.DEBUG("errorHandling.jsm: missing MDC!\n");
      c.retStatusObj.statusMsg += EnigmailLocale.getString("missingMdcError") + "\n";
    }
  }
}


function decryptionFailed(c) {
  c.inDecryptionFailed = true;
}

function cardControl(c) {
  var lineSplit = c.statusLine.split(/ +/);
  if (lineSplit[1] == "3") {
    c.detectedCard = lineSplit[2];
  } else {
    c.errCode = Number(lineSplit[1]);
    if (c.errCode == 1) c.requestedCard = lineSplit[2];
  }
}

function setupFailureLookup() {
  var result = {};
  result[EnigmailConstants.DECRYPTION_FAILED] = decryptionFailed;
  result[EnigmailConstants.NODATA] = noData;
  result[EnigmailConstants.CARDCTRL] = cardControl;
  result[EnigmailConstants.UNVERIFIED_SIGNATURE] = unverifiedSignature;
  result[EnigmailConstants.MISSING_PASSPHRASE] = missingPassphrase;
  result[EnigmailConstants.BAD_PASSPHRASE] = badPassphrase;
  result[gStatusFlags.INV_RECP] = invalidRecipient;
  result[gStatusFlags.INV_SGNR] = invalidSignature;
  result[gStatusFlags.IMPORT_OK] = importOk;
  result[gStatusFlags.FAILURE] = failureMessage;
  result[gStatusFlags.DECRYPTION_INFO] = decryptionInfo;
  return result;
}

function ignore() {}

const failureLookup = setupFailureLookup();

function handleFailure(c, errorFlag) {
  c.flag = gStatusFlags[errorFlag]; // yields known flag or undefined

  (failureLookup[c.flag] || ignore)(c);

  // if known flag, story it in our status
  if (c.flag) {
    c.statusFlags |= c.flag;
  }
}

function newContext(errOutput, retStatusObj) {
  retStatusObj.statusMsg = "";
  retStatusObj.errorMsg = "";
  retStatusObj.extendedStatus = "";
  retStatusObj.blockSeparation = "";
  retStatusObj.encryptedFileName = null;

  return {
    errOutput: errOutput,
    retStatusObj: retStatusObj,
    errArray: [],
    statusArray: [],
    errCode: 0,
    detectedCard: null,
    requestedCard: null,
    errorMsg: "",
    statusPat: /^\[GNUPG:\] /,
    statusFlags: 0,
    plaintextCount: 0,
    withinCryptoMsg: false,
    cryptoStartPat: /^BEGIN_DECRYPTION/,
    cryptoEndPat: /^END_DECRYPTION/,
    plaintextPat: /^PLAINTEXT /,
    plaintextLengthPat: /^PLAINTEXT_LENGTH /
  };
}

function splitErrorOutput(errOutput) {
  var errLines = errOutput.split(/\r?\n/);

  // Discard last null string, if any
  if ((errLines.length > 1) && !errLines[errLines.length - 1]) {
    errLines.pop();
  }

  return errLines;
}

function parseErrorLine(errLine, c) {
  if (errLine.search(c.statusPat) === 0) {
    // status line
    c.statusLine = errLine.replace(c.statusPat, "");
    c.statusArray.push(c.statusLine);

    // extract first word as flag
    var matches = c.statusLine.match(/^((\w+)\b)/);

    if (matches && (matches.length > 1)) {
      let isError = (matches[1] == "ERROR");
      (isError ? handleError : handleFailure)(c, matches[1]);
    }
  } else {
    // non-status line (details of previous status command)
    if (!getEnigmailGpg().getGpgFeature("decryption-info")) {
      if (errLine == "gpg: WARNING: message was not integrity protected") {
        // workaround for Gpg < 2.0.19 that don't print DECRYPTION_INFO
        c.statusFlags |= EnigmailConstants.DECRYPTION_FAILED;
        c.inDecryptionFailed = true;
      }
    }

    c.errArray.push(errLine);
    // save details of DECRYPTION_FAILED message ass error message
    if (c.inDecryptionFailed) {
      c.errorMsg += errLine;
    }
  }
}

function detectForgedInsets(c) {
  // detect forged message insets
  let hasUnencryptedText = false;
  let hasEncryptedPart = false;
  for (var j = 0; j < c.statusArray.length; j++) {
    if (c.statusArray[j].search(c.cryptoStartPat) === 0) {
      c.withinCryptoMsg = true;
      hasEncryptedPart = true;
    } else if (c.withinCryptoMsg && c.statusArray[j].search(c.cryptoEndPat) === 0) {
      c.withinCryptoMsg = false;
    } else if (c.statusArray[j].search(c.plaintextPat) === 0) {
      if (!c.withinCryptoMsg) hasUnencryptedText = true;

      ++c.plaintextCount;
      if ((c.statusArray.length > j + 1) && (c.statusArray[j + 1].search(c.plaintextLengthPat) === 0)) {
        var matches = c.statusArray[j + 1].match(/(\w+) (\d+)/);
        if (matches.length >= 3) {
          c.retStatusObj.blockSeparation += (c.withinCryptoMsg ? "1" : "0") + ":" + matches[2] + " ";
        }
      } else {
        // strange: we got PLAINTEXT XX, but not PLAINTEXT_LENGTH XX
        c.retStatusObj.blockSeparation += (c.withinCryptoMsg ? "1" : "0") + ":0 ";
      }
    }
  }
  if (c.plaintextCount > 1 || (hasEncryptedPart && hasUnencryptedText)) {
    c.statusFlags |= (EnigmailConstants.DECRYPTION_FAILED | EnigmailConstants.BAD_SIGNATURE);
  }
}

function buildErrorMessageForCardCtrl(c, errCode, detectedCard) {
  var errorMsg = "";
  switch (errCode) {
    case 1:
      if (detectedCard) {
        errorMsg = EnigmailLocale.getString("sc.wrongCardAvailable", [c.detectedCard, c.requestedCard]);
      } else {
        errorMsg = EnigmailLocale.getString("sc.insertCard", [c.requestedCard]);
      }
      break;
    case 2:
      errorMsg = EnigmailLocale.getString("sc.removeCard");
      break;
    case 4:
      errorMsg = EnigmailLocale.getString("sc.noCardAvailable");
      break;
    case 5:
      errorMsg = EnigmailLocale.getString("sc.noReaderAvailable");
      break;
  }
  return errorMsg;
}

function parseErrorOutputWith(c) {
  EnigmailLog.DEBUG("errorHandling.jsm: parseErrorOutputWith: status message: \n" + c.errOutput + "\n");

  c.errLines = splitErrorOutput(c.errOutput);
  c.isError = false; // set to true if a hard error was found

  // parse all error lines
  c.inDecryptionFailed = false; // to save details of encryption failed messages
  for (var j = 0; j < c.errLines.length; j++) {
    var errLine = c.errLines[j];
    parseErrorLine(errLine, c);
    if (c.isError) break;
  }

  detectForgedInsets(c);

  c.retStatusObj.blockSeparation = c.retStatusObj.blockSeparation.replace(/ $/, "");
  c.retStatusObj.statusFlags = c.statusFlags;
  if (c.retStatusObj.statusMsg.length === 0) c.retStatusObj.statusMsg = c.statusArray.join("\n");
  if (c.errorMsg.length === 0) {
    c.errorMsg = c.errArray.map(function f(str, idx) {
      return EnigmailSystem.convertNativeToUnicode(str);
    }, EnigmailSystem).join("\n");
  } else {
    c.errorMsg = EnigmailSystem.convertNativeToUnicode(c.errorMsg);
  }

  if ((c.statusFlags & EnigmailConstants.CARDCTRL) && c.errCode > 0) {
    c.errorMsg = buildErrorMessageForCardCtrl(c, c.errCode, c.detectedCard);
    c.statusFlags |= EnigmailConstants.DISPLAY_MESSAGE;
  }

  let inDecryption = 0;
  let m;
  for (let i in c.statusArray) {
    if (c.statusArray[i].search(/^BEGIN_DECRYPTION( .*)?$/) === 0) {
      inDecryption = 1;
    } else if (c.statusArray[i].search(/^END_DECRYPTION( .*)?$/) === 0) {
      inDecryption = 0;
    } else if (inDecryption >0) {
      m = c.statusArray[i].match(/^(PLAINTEXT [0-9]+ [0-9]+ )(.*)$/);
      if (m && m.length >= 3) c.retStatusObj.encryptedFileName = m[2];        
    }
  }

  EnigmailLog.DEBUG("errorHandling.jsm: parseErrorOutputWith: statusFlags = " + EnigmailData.bytesToHex(EnigmailData.pack(c.statusFlags, 4)) + "\n");
  EnigmailLog.DEBUG("errorHandling.jsm: parseErrorOutputWith: return with c.errorMsg = " + c.errorMsg + "\n");
  return c.errorMsg;
}

var EnigmailErrorHandling = {
  parseErrorOutput: function(errOutput, retStatusObj) {
    var context = newContext(errOutput, retStatusObj);
    return parseErrorOutputWith(context);
  },

  /**
   * Determin why a given key or userID cannot be used for signing
   *
   * @param keySpec String - key ID or user ID
   *
   * @return String - the reason(s) as message to display to the user
   *                  "" in case the key is valid
   */
  determineInvSignReason: function(keySpec) {
    EnigmailLog.DEBUG("errorHandling.jsm: determineInvSignReason: keySpec: " + keySpec + "\n");

    let reasonMsg = "";

    if (keySpec.search(/^(0x)?[0-9A-F]+$/) === 0) {
      let key = getEnigmailKeyRing().getKeyById(keySpec);
      if (!key) {
        reasonMsg = EnigmailLocale.getString("keyError.keyIdNotFound", keySpec);
      } else {
        let r = key.getSigningValidity();
        if (!r.keyValid) reasonMsg = r.reason;
      }
    } else {
      let keys = getEnigmailKeyRing().getKeysByUserId(keySpec);
      if (!keys || keys.length === 0) {
        reasonMsg = EnigmailLocale.getString("keyError.keySpecNotFound", keySpec);
      } else {
        for (let i in keys) {
          let r = keys[i].getSigningValidity();
          if (!r.keyValid) reasonMsg += r.reason + "\n";
        }
      }
    }

    return reasonMsg;
  },

  /**
   * Determin why a given key or userID cannot be used for encryption
   *
   * @param keySpec String - key ID or user ID
   *
   * @return String - the reason(s) as message to display to the user
   *                  "" in case the key is valid
   */
  determineInvRcptReason: function(keySpec) {
    EnigmailLog.DEBUG("errorHandling.jsm: determineInvRcptReason: keySpec: " + keySpec + "\n");

    let reasonMsg = "";

    if (keySpec.search(/^(0x)?[0-9A-F]+$/) === 0) {
      let key = getEnigmailKeyRing().getKeyById(keySpec);
      if (!key) {
        reasonMsg = EnigmailLocale.getString("keyError.keyIdNotFound", keySpec);
      } else {
        let r = key.getEncryptionValidity();
        if (!r.keyValid) reasonMsg = r.reason;
      }
    } else {
      let keys = getEnigmailKeyRing().getKeysByUserId(keySpec);
      if (!keys || keys.length === 0) {
        reasonMsg = EnigmailLocale.getString("keyError.keySpecNotFound", keySpec);
      } else {
        for (let i in keys) {
          let r = keys[i].getEncryptionValidity();
          if (!r.keyValid) reasonMsg += r.reason + "\n";
        }
      }
    }

    return reasonMsg;
  },

  /**
   * Get a unique file to use for logging with --log-file
   */
  getTempLogFile: function() {
    let logFile = getEnigmailFiles().getTempDirObj().clone();
    logFile.normalize();
    logFile.append("gpgOutput." + getEnigmailRNG().generateRandomString(6));
    return logFile;
  },


  /**
   * Append the content of a file (such as created via --log-file) to the
   * debug log, and delete the file afterwards
   *
   * @param logFile: nsIFile object
   */
  appendLogFileToDebug: function(logFile) {
    if (logFile && logFile.exists() && logFile.isFile()) {
      let logData = getEnigmailFiles().readFile(logFile);

      EnigmailLog.DEBUG(`errorHandling.jsm: Process terminated. Human-readable output from gpg:\n-----\n${logData}-----\n`);
      try {
        logFile.remove(false);
      } catch (ex) {}
    }
  }
};