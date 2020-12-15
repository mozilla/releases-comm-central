/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SmtpServer"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * This class represents a single SMTP server.
 *
 * @implements {nsISmtpServer}
 */
function SmtpServer() {
  this._key = "";
  this._loadPrefs();
}

SmtpServer.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsISmtpServer"]),
  classID: Components.ID("{3a75f5ea-651e-4696-9813-848c03da8bbd}"),

  get key() {
    return this._key;
  },

  set key(key) {
    this._key = key;
    this._loadPrefs();
  },

  get description() {
    return this._prefs.getCharPref("description", "");
  },

  set description(value) {
    this._setCharPref("description", value);
  },

  get hostname() {
    return this._prefs.getCharPref("hostname", "");
  },

  set hostname(value) {
    if (value.toLowerCase() != this.hostname.toLowerCase()) {
      // Reset password so that users are prompted for new password for the new
      // host.
      this.forgetPassword();
    }
    this._setCharPref("hostname", value);
  },

  get port() {
    return this._prefs.getIntPref("port", 0);
  },

  set port(value) {
    if (value) {
      this._prefs.setIntPref("port", value);
    } else {
      this._prefs.clearUserPref("port");
    }
  },

  get displayname() {
    return `${this.hostname}` + (this.port ? `:${this.port}` : "");
  },

  get username() {
    return this._prefs.getCharPref("username", "");
  },

  set username(value) {
    if (value != this.username) {
      // Reset password so that users are prompted for new password for the new
      // username.
      this.forgetPassword();
    }
    this._setCharPref("username", value);
  },

  get clientid() {
    return this._getCharPrefWithDefault("clientid");
  },

  set clientid(value) {
    this._setCharPref("clientid", value);
  },

  get clientidEnabled() {
    try {
      return this._prefs.getBoolPref("clientidEnabled");
    } catch (e) {
      return this._defaultPrefs.getBoolPref("clientidEnabled", false);
    }
  },

  set clientidEnabled(value) {
    this._prefs.setBoolPref("clientidEnabled", value);
  },

  get authMethod() {
    return this._getIntPrefWithDefault("authMethod", 3);
  },

  set authMethod(value) {
    this._prefs.setIntPref("authMethod", value);
  },

  get socketType() {
    return this._getIntPrefWithDefault("try_ssl", 0);
  },

  set socketType(value) {
    this._prefs.setIntPref("try_ssl", value);
  },

  get helloArgument() {
    return this._getCharPrefWithDefault("hello_argument");
  },

  get serverURI() {
    return (
      "smtp://" + (this.username ? `${this.username}@` : "") + this.displayname
    );
  },

  forgetPassword() {},

  /**
   * Get the associated pref branch and the default SMTP server branch.
   */
  _loadPrefs() {
    this._prefs = Services.prefs.getBranch(`mail.smtpserver.${this._key}.`);
    this._defaultPrefs = Services.prefs.getBranch("mail.smtpserver.default");
  },

  /**
   * Set or clear a string preference.
   * @param {string} name - The preference name.
   * @param {string} value - The preference value.
   */
  _setCharPref(name, value) {
    if (value) {
      this._prefs.setCharPref(name, value);
    } else {
      this._prefs.clearUserPref(name);
    }
  },

  /**
   * Get the value of a string preference from this or default SMTP server.
   * @param {string} name - The preference name.
   * @param {number} [defaultValue=""] - The default value to return.
   * @returns {string}
   */
  _getCharPrefWithDefault(name, defaultValue = "") {
    try {
      return this._prefs.getCharPref(name);
    } catch (e) {
      return this._defaultPrefs.getCharPref(name, defaultValue);
    }
  },

  /**
   * Get the value of an integer preference from this or default SMTP server.
   * @param {string} name - The preference name.
   * @param {number} defaultValue - The default value to return.
   * @returns {number}
   */
  _getIntPrefWithDefault(name, defaultValue) {
    try {
      return this._prefs.getIntPref(name);
    } catch (e) {
      return this._defaultPrefs.getIntPref(name, defaultValue);
    }
  },
};
