/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["OpenPGPMasterpass"];

Cu.importGlobalProperties(["crypto"]);

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  RNP: "chrome://openpgp/content/modules/RNP.jsm",
});

var OpenPGPMasterpass = {
  _initDone: false,

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

  filename: "encrypted-openpgp-passphrase.txt",

  getPassPath() {
    let path = Services.dirsvc.get("ProfD", Ci.nsIFile);
    path.append(this.filename);
    return path;
  },

  getSecretKeyRingFile() {
    let path = Services.dirsvc.get("ProfD", Ci.nsIFile);
    path.append("secring.gpg");
    return path;
  },

  getOpenPGPSecretRingAlreadyExists() {
    return this.getSecretKeyRingFile().exists();
  },

  async _repairOrWarn() {
    let [prot, unprot] = RNP.getProtectedKeysCount();
    let haveAtLeastOneSecretKey = prot || unprot;

    if (
      !(await IOUtils.exists(this.getPassPath().path)) &&
      haveAtLeastOneSecretKey
    ) {
      // We couldn't read the OpenPGP password from file.
      // This could either mean the file doesn't exist, which indicates
      // either a corruption, or the condition after a failed migration
      // from early Enigmail migrator versions (bug 1656287).
      // Or it could mean the user has a primary password set,
      // but the user failed to enter it correctly,
      // or we are facing the consequences of multiple password prompts.

      let secFileName = this.getSecretKeyRingFile().path;
      let title = "OpenPGP corruption detected";

      if (prot) {
        let info;
        if (!unprot) {
          info =
            "Your Thunderbird Profile contains inconsistent or corrupted OpenPGP data. You have secret keys that were previously protected with an automatic passphrase, " +
            "but file encrypted-openpgp-passphrase.txt is missing. File " +
            secFileName +
            " that contains your secret keys cannot be accessed. " +
            "You must manually repair this corruption by moving the file to a different folder. Then restart, then import your secret keys from a backup. " +
            "The OpenPGP functionality will be disabled until repaired. ";
        } else {
          info =
            "Your Thunderbird Profile contains inconsistent or corrupted OpenPGP data. You have secret keys that were previously protected with an automatic passphrase, " +
            "but file encrypted-openpgp-passphrase.txt is missing. File " +
            secFileName +
            " contains secret keys cannot be accessed. However, it also contains unprotected keys, which you may continue to access. " +
            "You must manually repair this corruption by moving the file to a different folder. Then restart, then import your secret keys from a backup. You may also try to import the corrupted file, to import the unprotected keys. " +
            "The OpenPGP functionality will be disabled until repaired. ";
        }
        Services.prompt.alert(null, title, info);
        throw new Error(
          "Error, secring.gpg exists, but cannot obtain password from encrypted-openpgp-passphrase.txt"
        );
      } else {
        // only unprotected keys
        // maybe https://bugzilla.mozilla.org/show_bug.cgi?id=1656287
        let info =
          "Your Thunderbird Profile contains inconsistent or corrupted OpenPGP data. You have secret keys, " +
          "but file encrypted-openpgp-passphrase.txt is missing. " +
          "If you have recently used Enigmail version 2.2 to migrate your old keys, an incomplete migration is probably the cause of the corruption. " +
          "An automatic repair can be attempted. " +
          "The OpenPGP functionality will be disabled until repaired. " +
          "Before repairing, you should make a backup of file " +
          secFileName +
          " that contains your secret keys. " +
          "After repairing, you may run the Enigmail migration again, or use OpenPGP Key Manager to accept your keys as personal keys.";

        let button = "I confirm I created a backup. Perform automatic repair.";

        let promptFlags =
          Services.prompt.BUTTON_POS_0 *
            Services.prompt.BUTTON_TITLE_IS_STRING +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL +
          Services.prompt.BUTTON_POS_1_DEFAULT;

        let confirm = Services.prompt.confirmEx(
          null, // window
          title,
          info,
          promptFlags,
          button,
          null,
          null,
          null,
          {}
        );

        if (confirm != 0) {
          throw new Error(
            "Error, secring.gpg exists, but cannot obtain password from encrypted-openpgp-passphrase.txt"
          );
        }

        await this._ensurePasswordCreatedAndCached();
        await RNP.protectUnprotectedKeys();
        await RNP.saveKeyRings();
      }
    }
  },

  // returns password
  async _ensurePasswordCreatedAndCached() {
    if (this.cachedPassword) {
      return;
    }

    if (await IOUtils.exists(this.getPassPath().path)) {
      this.cachedPassword = await this._readPasswordFromFile();
      return;
    }

    // Make sure we don't use the new password unless we're successful
    // in encrypting and storing it to disk.
    // (This may fail if the user has a primary password set,
    // but refuses to enter it.)
    let newPass = this.generatePassword();
    let sdr = this.getSDR();
    let encryptedPass = sdr.encryptString(newPass);
    if (!encryptedPass) {
      throw new Error("cannot create OpenPGP password");
    }
    await IOUtils.writeUTF8(this.getPassPath().path, encryptedPass);

    this.cachedPassword = newPass;
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

  cachedPassword: null,

  // This function requires the password to already exist and be cached.
  retrieveCachedPassword() {
    if (!this.cachedPassword) {
      // Obviously some functionality requires the password, but we
      // don't have it yet.
      // The best we can do is spawn reading and caching asynchronously,
      // this will cause the password to be available once the user
      // retries the current operation.
      this.ensurePasswordIsCached();
      throw new Error("no cached password");
    }
    return this.cachedPassword;
  },

  async ensurePasswordIsCached() {
    if (this.cachedPassword) {
      return;
    }

    if (!this._initDone) {
      // set flag immediately, to avoid any potential recursion
      // causing us to repair twice in parallel.
      this._initDone = true;
      await this._repairOrWarn();
    }

    if (this.cachedPassword) {
      return;
    }

    await this._ensurePasswordCreatedAndCached();
  },

  // This function may trigger password creation, if necessary
  async retrieveOpenPGPPassword() {
    EnigmailLog.DEBUG("masterpass.jsm: retrieveMasterPassword()\n");

    await this.ensurePasswordIsCached();
    return this.cachedPassword;
  },

  async _readPasswordFromFile() {
    let encryptedPass = await IOUtils.readUTF8(this.getPassPath().path);
    let sdr = this.getSDR();
    return sdr.decryptString(encryptedPass.trim());
  },
};
