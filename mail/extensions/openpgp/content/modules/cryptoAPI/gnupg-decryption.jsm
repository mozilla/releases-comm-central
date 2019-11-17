/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["GnuPGDecryption"];

const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
const EnigmailDialog = ChromeUtils.import("chrome://openpgp/content/modules/dialog.jsm").EnigmailDialog;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const EnigmailPrefs = ChromeUtils.import("chrome://openpgp/content/modules/prefs.jsm").EnigmailPrefs;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;
const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;
const EnigmailErrorHandling = ChromeUtils.import("chrome://openpgp/content/modules/errorHandling.jsm").EnigmailErrorHandling;
const EnigmailKey = ChromeUtils.import("chrome://openpgp/content/modules/key.jsm").EnigmailKey;
const EnigmailKeyRing = ChromeUtils.import("chrome://openpgp/content/modules/keyRing.jsm").EnigmailKeyRing;
const EnigmailGpg = ChromeUtils.import("chrome://openpgp/content/modules/gpg.jsm").EnigmailGpg;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;

const STATUS_ERROR = EnigmailConstants.BAD_SIGNATURE | EnigmailConstants.DECRYPTION_FAILED;
const STATUS_DECRYPTION_OK = EnigmailConstants.DECRYPTION_OKAY;
const STATUS_GOODSIG = EnigmailConstants.GOOD_SIGNATURE;

var GnuPGDecryption = {

  /*
   * options:
   *  - logFile (the actual file)
   *  - keyserver
   *  - keyserverProxy
   *  - fromAddr
   *  - noOutput
   *  - verifyOnly
   *  - mimeSignatureFile
   *  - maxOutputLength
   *
   */
  getDecryptionArgs: function(options) {
    var args = EnigmailGpg.getStandardArgs(true);

    args.push("--log-file");
    args.push(EnigmailFiles.getEscapedFilename(EnigmailFiles.getFilePath(options.logFile)));

    if (options.keyserver && options.keyserver !== "") {
      var keyserver = options.keyserver.trim();
      args.push("--keyserver-options");
      var keySrvArgs = "auto-key-retrieve";
      var srvProxy = options.keyserverProxy;
      if (srvProxy) {
        keySrvArgs += ",http-proxy=" + srvProxy;
      }
      args.push(keySrvArgs);
      args.push("--keyserver");
      args.push(keyserver);
    }

    if (EnigmailGpg.getGpgFeature("supports-sender") && options.fromAddr) {
      args.push("--sender");
      args.push(options.fromAddr.toLowerCase());
    }

    if (options.noOutput) {
      args.push("--verify");
      if (options.mimeSignatureFile) {
        args.push(options.mimeSignatureFile);
        args.push("-");
      }
    }
    else {
      if (options.maxOutputLength) {
        args.push("--max-output");
        args.push(String(options.maxOutputLength));
      }

      args.push("--decrypt");
    }

    return args;
  },
  decryptMessageEnd: function(stderrStr, exitCode, outputLen, verifyOnly, noOutput, uiFlags, retStatusObj) {
    EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: uiFlags=" + uiFlags + ", verifyOnly=" + verifyOnly + ", noOutput=" + noOutput + "\n");

    stderrStr = stderrStr.replace(/\r\n/g, "\n");
    EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: stderrStr=\n" + stderrStr + "\n");


    var interactive = uiFlags & EnigmailConstants.UI_INTERACTIVE;
    var pgpMime = uiFlags & EnigmailConstants.UI_PGP_MIME;
    var allowImport = uiFlags & EnigmailConstants.UI_ALLOW_KEY_IMPORT;
    var unverifiedEncryptedOK = uiFlags & EnigmailConstants.UI_UNVERIFIED_ENC_OK;
    var j;

    retStatusObj.statusFlags = 0;
    retStatusObj.errorMsg = "";
    retStatusObj.blockSeparation = "";

    var errorMsg = EnigmailErrorHandling.parseErrorOutput(stderrStr, retStatusObj);
    if (retStatusObj.statusFlags & STATUS_ERROR) {
      retStatusObj.errorMsg = errorMsg;
    }
    else {
      retStatusObj.errorMsg = "";
    }

    if (pgpMime) {
      retStatusObj.statusFlags |= verifyOnly ? EnigmailConstants.PGP_MIME_SIGNED : EnigmailConstants.PGP_MIME_ENCRYPTED;
    }

    var statusMsg = retStatusObj.statusMsg;
    exitCode = EnigmailExecution.fixExitCode(exitCode, retStatusObj);
    if ((exitCode === 0) && !noOutput && !outputLen &&
      ((retStatusObj.statusFlags & (STATUS_DECRYPTION_OK | STATUS_GOODSIG)) === 0)) {
      exitCode = -1;
    }

    if (retStatusObj.statusFlags & EnigmailConstants.DISPLAY_MESSAGE && retStatusObj.extendedStatus.search(/\bdisp:/) >= 0) {
      EnigmailDialog.alert(null, statusMsg);
      return -1;
    }

    var errLines;
    if (statusMsg) {
      errLines = statusMsg.split(/\r?\n/);
    }
    else {
      // should not really happen ...
      errLines = stderrStr.split(/\r?\n/);
    }

    // possible STATUS Patterns (see GPG dod DETAILS.txt):
    // one of these should be set for a signature:
    var newsigPat = /^NEWSIG ?.*$/i;
    var trustedsigPat = /^TRUST_(FULLY|ULTIMATE) ?.*$/i;
    var goodsigPat = /^GOODSIG (\w{16}) (.*)$/i;
    var badsigPat = /^BADSIG (\w{16}) (.*)$/i;
    var expsigPat = /^EXPSIG (\w{16}) (.*)$/i;
    var expkeysigPat = /^EXPKEYSIG (\w{16}) (.*)$/i;
    var revkeysigPat = /^REVKEYSIG (\w{16}) (.*)$/i;
    var errsigPat = /^ERRSIG (\w{16}) (.*)$/i;
    // additional infos for good signatures:
    var validSigPat = /^VALIDSIG (\w+) (.*) (\d+) (.*)/i;
    // hint for a certain key id:
    var userIdHintPat = /^USERID_HINT (\w{16}) (.*)$/i;
    // to find out for which recipients the email was encrypted:
    var encToPat = /^ENC_TO (\w{16}) (.*)$/i;

    var matches;

    var signed = false;
    var goodOrExpOrRevSignature = false;
    var sigKeyId = ""; // key of sender
    var sigUserId = ""; // user ID of sender
    var sigDetails = "";
    var sigTrusted = false;
    var encToDetails = "";
    var encToArray = []; // collect ENC_TO lines here

    for (j = 0; j < errLines.length; j++) {
      EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: process: " + errLines[j] + "\n");

      // ENC_TO entry
      // - collect them for later processing to print details
      matches = errLines[j].match(encToPat);
      if (matches && (matches.length > 2)) {
        encToArray.push("0x" + matches[1]);
      }

      // USERID_HINT entry
      // - NOTE: NO END of loop
      // ERROR: wrong to set userId because ecom is NOT the sender:
      //matches = errLines[j].match(userIdHintPat);
      //if (matches && (matches.length > 2)) {
      //  sigKeyId = matches[1];
      //  sigUserId = matches[2];
      //}

      // check for one of the possible SIG entries:

      matches = errLines[j].match(newsigPat);
      if (matches) {
        if (signed) {
          EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: multiple SIGN entries - ignoring previous signature\n");
        }
        signed = true;
        goodOrExpOrRevSignature = false;
        sigKeyId = "";
        sigUserId = "";
        sigDetails = "";
        sigTrusted = false;
        continue;
      }

      matches = errLines[j].match(trustedsigPat);
      if (matches) {
        sigTrusted = true;
        continue;
      }

      matches = errLines[j].match(validSigPat);
      if (matches && (matches.length > 4)) {
        if (matches[4].length == 40) {
          // in case of several subkeys refer to the main key ID.
          // Only works with PGP V4 keys (Fingerprint length ==40)
          sigKeyId = matches[4];
        }
        if (matches && (matches.length > 2)) {
          sigDetails = errLines[j].substr(9);
        }
        continue;
      }

      // GOODSIG entry
      matches = errLines[j].match(goodsigPat);
      if (matches && (matches.length > 2)) {
        if (signed) {
          EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: OOPS: multiple SIGN entries\n");
        }
        signed = true;
        goodOrExpOrRevSignature = true;
        sigKeyId = matches[1];
        sigUserId = matches[2];
      }
      else {
        // BADSIG entry => signature found but bad
        matches = errLines[j].match(badsigPat);
        if (matches && (matches.length > 2)) {
          if (signed) {
            EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: OOPS: multiple SIGN entries\n");
          }
          signed = true;
          goodOrExpOrRevSignature = false;
          sigKeyId = matches[1];
          sigUserId = matches[2];
        }
        else {
          // EXPSIG entry => expired signature found
          matches = errLines[j].match(expsigPat);
          if (matches && (matches.length > 2)) {
            if (signed) {
              EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: OOPS: multiple SIGN entries\n");
            }
            signed = true;
            goodOrExpOrRevSignature = true;
            sigKeyId = matches[1];
            sigUserId = matches[2];
          }
          else {
            // EXPKEYSIG entry => signature found but key expired
            matches = errLines[j].match(expkeysigPat);
            if (matches && (matches.length > 2)) {
              if (signed) {
                EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: OOPS: multiple SIGN entries\n");
              }
              signed = true;
              goodOrExpOrRevSignature = true;
              sigKeyId = matches[1];
              sigUserId = matches[2];
            }
            else {
              // REVKEYSIG entry => signature found but key revoked
              matches = errLines[j].match(revkeysigPat);
              if (matches && (matches.length > 2)) {
                if (signed) {
                  EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: OOPS: multiple SIGN entries\n");
                }
                signed = true;
                goodOrExpOrRevSignature = true;
                sigKeyId = matches[1];
                sigUserId = matches[2];
              }
              else {
                // ERRSIG entry => signature found but key not usable or unavailable
                matches = errLines[j].match(errsigPat);
                if (matches && (matches.length > 2)) {
                  if (signed) {
                    EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: OOPS: multiple SIGN entries\n");
                  }
                  signed = true;
                  goodOrExpOrRevSignature = false;
                  sigKeyId = matches[1];
                  // no user id with ecom istatus entry
                }
              }
            }
          }
        }
      }

    } // end loop of processing errLines

    if (sigTrusted) {
      retStatusObj.statusFlags |= EnigmailConstants.TRUSTED_IDENTITY;
    }

    if (sigUserId && sigKeyId && EnigmailPrefs.getPref("displaySecondaryUid")) {
      let keyObj = EnigmailKeyRing.getKeyById(sigKeyId);
      if (keyObj) {
        if (keyObj.photoAvailable) {
          retStatusObj.statusFlags |= EnigmailConstants.PHOTO_AVAILABLE;
        }
        sigUserId = EnigmailKeyRing.getValidUids(sigKeyId).join("\n");
      }
    }
    else if (sigUserId) {
      sigUserId = EnigmailData.convertToUnicode(sigUserId, "UTF-8");
    }

    // add list of keys used for encryption if known (and their user IDs) if known
    // Parsed status messages are something like (here the German version):
    //    [GNUPG:] ENC_TO AAAAAAAAAAAAAAAA 1 0
    //    [GNUPG:] ENC_TO 5B820D2D4553884F 16 0
    //    [GNUPG:] ENC_TO 37904DF2E631552F 1 0
    //    [GNUPG:] ENC_TO BBBBBBBBBBBBBBBB 1 0
    //    gpg: verschlüsselt mit 3072-Bit RSA Schlüssel, ID BBBBBBBB, erzeugt 2009-11-28
    //          "Joe Doo <joe.doo@domain.de>"
    //    [GNUPG:] NO_SECKEY E71712DF47BBCC40
    //    gpg: verschlüsselt mit RSA Schlüssel, ID AAAAAAAA
    //    [GNUPG:] NO_SECKEY AAAAAAAAAAAAAAAA
    if (encToArray.length > 0) {
      // for each key also show an associated user ID if known:
      for (var encIdx = 0; encIdx < encToArray.length; ++encIdx) {
        var localKeyId = encToArray[encIdx];
        // except for ID 00000000, which signals hidden keys
        if (localKeyId != "0x0000000000000000") {
          let localKey = EnigmailKeyRing.getKeyById(localKeyId);
          if (localKey) {
            encToArray[encIdx] += " (" + localKey.userId + ")";
          }
        }
        else {
          encToArray[encIdx] = EnigmailLocale.getString("hiddenKey");
        }
      }
      encToDetails = "\n  " + encToArray.join(",\n  ") + "\n";
    }

    retStatusObj.userId = sigUserId;
    retStatusObj.keyId = sigKeyId;
    retStatusObj.sigDetails = sigDetails;
    retStatusObj.encToDetails = encToDetails;

    if (signed) {
      if (goodOrExpOrRevSignature) {
        retStatusObj.errorMsg = EnigmailLocale.getString("prefGood", [sigUserId]);
        /* + ", " + EnigmailLocale.getString("keyId") + " 0x" + sigKeyId.substring(8,16); */
      }
      else {
        if (sigUserId.length > 0) {
          retStatusObj.errorMsg = EnigmailLocale.getString("prefBad", [sigUserId]);
        }
        if (!exitCode)
          exitCode = 1;
      }
    }

    if (retStatusObj.statusFlags & EnigmailConstants.UNVERIFIED_SIGNATURE) {
      retStatusObj.keyId = EnigmailKey.extractPubkey(statusMsg);

      if (retStatusObj.statusFlags & EnigmailConstants.DECRYPTION_OKAY) {
        exitCode = 0;
      }
    }

    if (exitCode !== 0) {
      // Error processing
      EnigmailLog.DEBUG("gnupg-decryption.jsm: decryptMessageEnd: command execution exit code: " + exitCode + "\n");
    }

    return exitCode;
  }
};
