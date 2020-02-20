/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/*global Components: false */

"use strict";

var EXPORTED_SYMBOLS = ["OpenPGPMasterpass"];

Cu.importGlobalProperties(["crypto"]);

const Services = ChromeUtils.import("resource://gre/modules/Services.jsm")
  .Services;

const EnigmailLog = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
).EnigmailLog;

const PASS_URI = "chrome://openpgp-secret-key-password";
const PASS_REALM = "DO NOT DELETE";
const PASS_USER = "openpgp";

var OpenPGPMasterpass = {
  getLoginManager() {
    if (!this.loginManager) {
      try {
        this.loginManager = Services.logins;
      } catch (ex) {
        EnigmailLog.writeException("masterpass.jsm", ex);
      }
    }
    return this.loginManager;
  },

  ensureMasterPassword() {
    let password = this.retrieveOpenPGPPassword();
    if (password) {
      return;
    }

    try {
      let pass = this.generatePassword();

      EnigmailLog.DEBUG("masterpass.jsm: ensureMasterPassword()\n");
      let nsLoginInfo = new Components.Constructor(
        "@mozilla.org/login-manager/loginInfo;1",
        Ci.nsILoginInfo,
        "init"
      );
      // parameters: aHostname, aFormSubmitURL, aHttpRealm, aUsername, aPassword, aUsernameField, aPasswordField
      let loginInfo = new nsLoginInfo(
        PASS_URI,
        null,
        PASS_REALM,
        PASS_USER,
        pass,
        "",
        ""
      );

      this.getLoginManager().addLogin(loginInfo);
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
    try {
      var logins = this.getLoginManager().findLogins(
        PASS_URI,
        null,
        PASS_REALM
      );

      for (let i = 0; i < logins.length; i++) {
        if (logins[i].username == PASS_USER) {
          EnigmailLog.DEBUG("masterpass.jsm: retrieveOpenPGPPassword(): ok\n");
          return logins[i].password;
        }
      }
    } catch (ex) {
      EnigmailLog.writeException("masterpass.jsm", ex);
    }
    EnigmailLog.DEBUG("masterpass.jsm: retrieveMasterPassword(): not found!\n");
    return null;
  },
};
