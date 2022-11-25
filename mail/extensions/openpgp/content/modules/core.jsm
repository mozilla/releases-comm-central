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
  EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
  EnigmailPgpmimeHander: "chrome://openpgp/content/modules/pgpmimeHandler.jsm",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.jsm",
});

var EXPORTED_SYMBOLS = ["EnigmailCore"];

var gEnigmailService = null; // Global Enigmail Service

var EnigmailCore = {
  /**
   * Create a new instance of Enigmail, or return the already existing one
   */
  createInstance() {
    if (!gEnigmailService) {
      gEnigmailService = new Enigmail();
    }
    return gEnigmailService;
  },

  async startup(reason) {
    initializeLogDirectory();

    lazy.EnigmailLog.DEBUG("core.jsm: startup()\n");

    await lazy.PgpSqliteDb2.checkDatabaseStructure();

    this.factories = [];

    lazy.EnigmailVerify.registerPGPMimeHandler();
    //EnigmailWksMimeHandler.registerContentTypeHandler();
    //EnigmailFiltersWrapper.onStartup();

    lazy.EnigmailMimeEncrypt.startup(reason);
    //EnigmailOverlays.startup();
    this.factories.push(new Factory(lazy.EnigmailMimeEncrypt.Handler));
  },

  shutdown(reason) {
    if (this.factories) {
      for (let fct of this.factories) {
        fct.unregister();
      }
    }

    //EnigmailFiltersWrapper.onShutdown();
    lazy.EnigmailVerify.unregisterPGPMimeHandler();

    lazy.EnigmailLog.onShutdown();

    lazy.EnigmailLog.setLogLevel(3);
    gEnigmailService = null;
  },

  /**
   * get and or initialize the Enigmail service,
   * including the handling for upgrading old preferences to new versions
   *
   * @win:                - nsIWindow: parent window (optional)
   * @startingPreferences - Boolean: true - called while switching to new preferences
   *                        (to avoid re-check for preferences)
   * @returns {Promise<Enigmail|null>}
   */
  async getService(win, startingPreferences) {
    // Lazy initialization of Enigmail JS component (for efficiency)

    if (gEnigmailService) {
      return gEnigmailService.initialized ? gEnigmailService : null;
    }

    try {
      this.createInstance();
      return gEnigmailService.getService(win, startingPreferences);
    } catch (ex) {
      return null;
    }
  },
};

///////////////////////////////////////////////////////////////////////////////
// Enigmail encryption/decryption service
///////////////////////////////////////////////////////////////////////////////

function initializeLogDirectory() {
  let dir = Services.prefs.getCharPref("temp.openpgp.logDirectory", "");
  if (!dir) {
    return;
  }

  lazy.EnigmailLog.setLogLevel(5);
  lazy.EnigmailLog.setLogDirectory(dir);
  lazy.EnigmailLog.DEBUG(
    "core.jsm: Logging debug output to " + dir + "/enigdbug.txt\n"
  );
}

function Enigmail() {
  this.wrappedJSObject = this;
}

Enigmail.prototype = {
  initialized: false,
  initializationAttempted: false,

  initialize(domWindow) {
    this.initializationAttempted = true;

    lazy.EnigmailLog.DEBUG("core.jsm: Enigmail.initialize: START\n");

    if (this.initialized) {
      return;
    }

    this.initialized = true;

    lazy.EnigmailLog.DEBUG("core.jsm: Enigmail.initialize: END\n");
  },

  reinitialize() {
    lazy.EnigmailLog.DEBUG("core.jsm: Enigmail.reinitialize:\n");
    this.initialized = false;
    this.initializationAttempted = true;

    this.initialized = true;
  },

  async getService(win, startingPreferences) {
    if (!win) {
      win = lazy.EnigmailWindows.getBestParentWin();
    }

    lazy.EnigmailLog.DEBUG("core.jsm: svc = " + this + "\n");

    if (!this.initialized) {
      // Initialize enigmail
      this.initialize(win);
    }
    await EnigmailCore.startup(0);
    lazy.EnigmailPgpmimeHander.startup(0);
    return this.initialized ? this : null;
  },
}; // Enigmail.prototype

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
