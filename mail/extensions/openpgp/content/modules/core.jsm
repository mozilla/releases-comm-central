/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.jsm",
  EnigmailMimeEncrypt: "chrome://openpgp/content/modules/mimeEncrypt.jsm",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.jsm",
});

var EXPORTED_SYMBOLS = ["EnigmailCore"];

var EnigmailCore = {
  _initialized: false,

  /**
   * Initialize the main parts of Enigmail
   */
  async init() {
    if (this._initialized) {
      return;
    }

    initializeLogDirectory();

    lazy.EnigmailLog.DEBUG("core.jsm: startup()\n");

    await lazy.PgpSqliteDb2.checkDatabaseStructure();

    this.factories = [];

    lazy.EnigmailVerify.registerPGPMimeHandler();
    //EnigmailFiltersWrapper.onStartup();

    lazy.EnigmailMimeEncrypt.init();
    //EnigmailOverlays.startup();
    this.factories.push(new Factory(lazy.EnigmailMimeEncrypt.Handler));

    this._initialized = true;
  },
};

///////////////////////////////////////////////////////////////////////////////
// Enigmail encryption/decryption service
///////////////////////////////////////////////////////////////////////////////

function initializeLogDirectory() {
  const dir = Services.prefs.getCharPref("temp.openpgp.logDirectory", "");
  if (!dir) {
    return;
  }

  lazy.EnigmailLog.setLogLevel(5);
  lazy.EnigmailLog.setLogDirectory(dir);
  lazy.EnigmailLog.DEBUG(
    "core.jsm: Logging debug output to " + dir + "/enigdbug.txt\n"
  );
}

class Factory {
  constructor(component) {
    this.component = component;
    this.register();
    Object.freeze(this);
  }

  createInstance(iid) {
    return new this.component();
  }

  register() {
    Components.manager
      .QueryInterface(Ci.nsIComponentRegistrar)
      .registerFactory(
        this.component.prototype.classID,
        this.component.prototype.classDescription,
        this.component.prototype.contractID,
        this
      );
  }

  unregister() {
    Components.manager
      .QueryInterface(Ci.nsIComponentRegistrar)
      .unregisterFactory(this.component.prototype.classID, this);
  }
}
