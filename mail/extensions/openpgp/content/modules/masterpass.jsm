/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["OpenPGPMasterpass"];

Cu.importGlobalProperties(["crypto"]);

var { EnigmailApp } = ChromeUtils.import(
  "chrome://openpgp/content/modules/app.jsm"
);
const { EnigmailFiles } = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
);
const { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);

const DEFAULT_FILE_PERMS = 0o600;

var OpenPGPMasterpass = {
  getSDR() {
    if (!this.sdr) {
      try {
        this.sdr = Cc["@mozilla.org/security/sdr;1"].getService(
          Ci.nsISecretDecoderRing
        );
      } catch (ex) {
        EnigmailLog.writeException("masterpass.jsm", ex);
      }
    }
    return this.sdr;
  },

  getPassPath() {
    let path = EnigmailApp.getProfileDirectory();
    path.append("encrypted-openpgp-passphrase.txt");
    return path;
  },

  getSecretKeyRingFile() {
    let path = EnigmailApp.getProfileDirectory();
    path.append("secring.gpg");
    return path;
  },

  getOpenPGPSecretRingAlreadyExists() {
    return this.getSecretKeyRingFile().exists();
  },

  haveMasterPassword() {
    let password = this.retrieveOpenPGPPassword();
    return password != null;
  },

  ensureMasterPassword() {
    if (this.haveMasterPassword()) {
      return;
    }

    EnigmailLog.DEBUG("masterpass.jsm: ensureMasterPassword()\n");
    try {
      let pass = this.generatePassword();
      let sdr = this.getSDR();
      let encryptedPass = sdr.encryptString(pass);

      EnigmailFiles.writeFileContents(
        this.getPassPath(),
        encryptedPass,
        DEFAULT_FILE_PERMS
      );
    } catch (ex) {
      EnigmailLog.writeException("masterpass.jsm", ex);
      throw ex;
    }
    EnigmailLog.DEBUG("masterpass.jsm: ensureMasterPassword(): ok\n");
  },

  generatePassword() {
    // TODO: Patrick suggested to replace with
    //       EnigmailRNG.getRandomString(numChars)
    const random_bytes = new Uint8Array(32);
    crypto.getRandomValues(random_bytes);
    let result = "";
    for (let i = 0; i < 32; i++) {
      result += (random_bytes[i] % 16).toString(16);
    }
    return result;
  },

  retrieveOpenPGPPassword() {
    EnigmailLog.DEBUG("masterpass.jsm: retrieveMasterPassword()\n");

    let path = this.getPassPath();
    if (!path.exists()) {
      return null;
    }

    try {
      var encryptedPass = EnigmailFiles.readFile(path).trim();
      if (!encryptedPass) {
        return null;
      }
      let sdr = this.getSDR();
      let pass = sdr.decryptString(encryptedPass);
      //console.debug("your secring.gpg is protected with the following passphrase: " + pass);
      return pass;
    } catch (ex) {
      EnigmailLog.writeException("masterpass.jsm", ex);
    }
    EnigmailLog.DEBUG("masterpass.jsm: retrieveMasterPassword(): not found!\n");
    return null;
  },
};
