/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailApp"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
});

var EnigmailApp = {
  /**
   * Platform application name (e.g. Thunderbird)
   */
  getName() {
    return Services.appinfo.name;
  },

  /**
   * Platform (Gecko) version number (e.g. 42.0)
   * The platform version for SeaMonkey and for Thunderbird are identical
   * (unlike the application version numbers)
   */
  getPlatformVersion() {
    return Services.appinfo.platformVersion;
  },

  /**
   * Return the directory holding the current profile as nsIFile object
   */
  getProfileDirectory() {
    return Services.dirsvc.get("ProfD", Ci.nsIFile);
  },

  /**
   * Get Enigmail version
   */
  getVersion() {
    EnigmailLog.DEBUG("app.jsm: getVersion\n");
    EnigmailLog.DEBUG(
      "app.jsm: installed version: " + EnigmailApp._version + "\n"
    );
    return EnigmailApp._version;
  },

  /**
   * Get Enigmail installation directory
   */
  getInstallLocation() {
    return EnigmailApp._installLocation;
  },

  setVersion(version) {
    EnigmailApp._version = version;
  },

  setInstallLocation(location) {
    EnigmailApp._installLocation = location;
  },

  initAddon() {
    EnigmailApp.setVersion(0);
    EnigmailApp.setInstallLocation(0);
  },
};
