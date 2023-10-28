/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["OpenPGPMasterpass"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  RNP: "chrome://openpgp/content/modules/RNP.jsm",
});

var OpenPGPMasterpass = {
  _initDone: false,
  _sdr: null,

  getSDR() {
    if (!this._sdr) {
      try {
        this._sdr = Cc["@mozilla.org/security/sdr;1"].getService(
          Ci.nsISecretDecoderRing
        );
      } catch (ex) {
        lazy.EnigmailLog.writeException("masterpass.jsm", ex);
      }
    }
    return this._sdr;
  },

  filename: "encrypted-openpgp-passphrase.txt",
  secringFilename: "secring.gpg",

  getPassPath() {
    const path = Services.dirsvc.get("ProfD", Ci.nsIFile);
    path.append(this.filename);
    return path;
  },

  getSecretKeyRingFile() {
    const path = Services.dirsvc.get("ProfD", Ci.nsIFile);
    path.append(this.secringFilename);
    return path;
  },

  getOpenPGPSecretRingAlreadyExists() {
    return this.getSecretKeyRingFile().exists();
  },

  async _repairOrWarn() {
    const [prot, unprot] = lazy.RNP.getProtectedKeysCount();
    const haveAtLeastOneSecretKey = prot || unprot;

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

      const secFileName = this.getSecretKeyRingFile().path;
      const title = "OpenPGP corruption detected";

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
        const info =
          "Your Thunderbird Profile contains inconsistent or corrupted OpenPGP data. You have secret keys, " +
          "but file encrypted-openpgp-passphrase.txt is missing. " +
          "If you have recently used Enigmail version 2.2 to migrate your old keys, an incomplete migration is probably the cause of the corruption. " +
          "An automatic repair can be attempted. " +
          "The OpenPGP functionality will be disabled until repaired. " +
          "Before repairing, you should make a backup of file " +
          secFileName +
          " that contains your secret keys. " +
          "After repairing, you may run the Enigmail migration again, or use OpenPGP Key Manager to accept your keys as personal keys.";

        const button =
          "I confirm I created a backup. Perform automatic repair.";

        const promptFlags =
          Services.prompt.BUTTON_POS_0 *
            Services.prompt.BUTTON_TITLE_IS_STRING +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL +
          Services.prompt.BUTTON_POS_1_DEFAULT;

        const confirm = Services.prompt.confirmEx(
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
        await lazy.RNP.protectUnprotectedKeys();
        await lazy.RNP.saveKeyRings();
      }
    }
  },

  async _ensurePasswordCreatedAndCached() {
    if (this.cachedPassword) {
      return;
    }

    const sdr = this.getSDR();
    if (!sdr) {
      throw new Error("Failed to obtain the SDR service.");
    }

    if (await IOUtils.exists(this.getPassPath().path)) {
      let encryptedPass = await IOUtils.readUTF8(this.getPassPath().path);
      encryptedPass = encryptedPass.trim();
      if (!encryptedPass) {
        throw new Error(
          "Failed to obtain encrypted password data from file " +
            this.getPassPath().path
        );
      }

      try {
        this.cachedPassword = sdr.decryptString(encryptedPass);
        // This is the success scenario, in which we return early.
        return;
      } catch (e) {
        // This code handles the corruption described in bug 1790610.

        // Failure to decrypt should be the only scenario that
        // reaches this code path.

        // Is a primary password set?
        const tokenDB = Cc["@mozilla.org/security/pk11tokendb;1"].getService(
          Ci.nsIPK11TokenDB
        );
        const token = tokenDB.getInternalKeyToken();
        if (token.hasPassword && !token.isLoggedIn()) {
          // Yes, primary password is set, but user is not logged in.
          // Let's throw now, a future action will result in trying again.
          throw e;
        }

        // No. We have profile corruption: key4.db doesn't contain the
        // key to decrypt file encrypted-openpgp-passphrase.txt
        // Move to backup file and create a fresh file to fix the situation.

        const backup = await IOUtils.createUniqueFile(
          Services.dirsvc.get("ProfD", Ci.nsIFile).path,
          this.filename + ".corrupt"
        );

        try {
          await IOUtils.move(this.getPassPath().path, backup);
          console.warn(
            `${this.filename} corruption fixed. Corrupted file moved to ${backup}`
          );
        } catch (e2) {
          console.warn(
            `Cannot move corrupted file ${this.filename} to backup name ${backup}`
          );
          // We cannot repair, so restarting doesn't help, keep running,
          // and hope the user notices this error in console.
          throw e2;
        }

        // If we arrive here, we have successfully repaired, and
        // can proceed with the code below to create a fresh passphrase file.
      }
    }

    if (await IOUtils.exists(this.getPassPath().path)) {
      // This check is an additional precaution, to prevent against
      // logic errors, or unexpected filesystem behavior.
      // If this file already exists, we MUST NOT create it again.
      // The code below is executed if the file does not exist yet,
      // or if the file was deleted or moved, after automatic repairing.
      throw new Error("File " + this.getPassPath().path + " already exists");
    }

    // Make sure we don't use the new password unless we're successful
    // in encrypting and storing it to disk.
    // (This may fail if the user has a primary password set,
    // but refuses to enter it.)
    const newPass = this.generatePassword();
    const encryptedPass = sdr.encryptString(newPass);
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
    lazy.EnigmailLog.DEBUG("masterpass.jsm: retrieveMasterPassword()\n");

    await this.ensurePasswordIsCached();
    return this.cachedPassword;
  },
};
