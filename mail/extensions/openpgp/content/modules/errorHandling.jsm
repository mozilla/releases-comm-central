/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailErrorHandling"];

const { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
const { EnigmailLocale } = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
);
const { EnigmailLazy } = ChromeUtils.import(
  "chrome://openpgp/content/modules/lazy.jsm"
);

const getEnigmailKeyRing = EnigmailLazy.loader(
  "enigmail/keyRing.jsm",
  "EnigmailKeyRing"
);
const getEnigmailFiles = EnigmailLazy.loader(
  "enigmail/files.jsm",
  "EnigmailFiles"
);
const getEnigmailRNG = EnigmailLazy.loader("enigmail/rng.jsm", "EnigmailRNG");

var EnigmailErrorHandling = {
  /**
   * Determin why a given key or userID cannot be used for signing
   *
   * @param keySpec String - key ID or user ID
   *
   * @return String - the reason(s) as message to display to the user
   *                  "" in case the key is valid
   */
  determineInvSignReason(keySpec) {
    EnigmailLog.DEBUG(
      "errorHandling.jsm: determineInvSignReason: keySpec: " + keySpec + "\n"
    );

    let reasonMsg = "";

    if (keySpec.search(/^(0x)?[0-9A-F]+$/) === 0) {
      let key = getEnigmailKeyRing().getKeyById(keySpec);
      if (!key) {
        reasonMsg = EnigmailLocale.getString("keyError.keyIdNotFound", keySpec);
      } else {
        let r = key.getSigningValidity();
        if (!r.keyValid) {
          reasonMsg = r.reason;
        }
      }
    } else {
      let keys = getEnigmailKeyRing().getKeysByUserId(keySpec);
      if (!keys || keys.length === 0) {
        reasonMsg = EnigmailLocale.getString(
          "keyError.keySpecNotFound",
          keySpec
        );
      } else {
        for (let i in keys) {
          let r = keys[i].getSigningValidity();
          if (!r.keyValid) {
            reasonMsg += r.reason + "\n";
          }
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
  determineInvRcptReason(keySpec) {
    EnigmailLog.DEBUG(
      "errorHandling.jsm: determineInvRcptReason: keySpec: " + keySpec + "\n"
    );

    let reasonMsg = "";

    if (keySpec.search(/^(0x)?[0-9A-F]+$/) === 0) {
      let key = getEnigmailKeyRing().getKeyById(keySpec);
      if (!key) {
        reasonMsg = EnigmailLocale.getString("keyError.keyIdNotFound", keySpec);
      } else {
        let r = key.getEncryptionValidity();
        if (!r.keyValid) {
          reasonMsg = r.reason;
        }
      }
    } else {
      let keys = getEnigmailKeyRing().getKeysByUserId(keySpec);
      if (!keys || keys.length === 0) {
        reasonMsg = EnigmailLocale.getString(
          "keyError.keySpecNotFound",
          keySpec
        );
      } else {
        for (let i in keys) {
          let r = keys[i].getEncryptionValidity();
          if (!r.keyValid) {
            reasonMsg += r.reason + "\n";
          }
        }
      }
    }

    return reasonMsg;
  },

  /**
   * Get a unique file to use for logging with --log-file
   */
  getTempLogFile() {
    let logFile = getEnigmailFiles()
      .getTempDirObj()
      .clone();
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
  appendLogFileToDebug(logFile) {
    if (logFile && logFile.exists() && logFile.isFile()) {
      let logData = getEnigmailFiles().readFile(logFile);

      EnigmailLog.DEBUG(
        `errorHandling.jsm: Process terminated. Human-readable output from gpg:\n-----\n${logData}-----\n`
      );
      try {
        logFile.remove(false);
      } catch (ex) {}
    }
  },
};
