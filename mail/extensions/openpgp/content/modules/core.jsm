/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const { manager: Cm } = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailConsole: "chrome://openpgp/content/modules/pipeConsole.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailLocale: "chrome://openpgp/content/modules/locale.jsm",
  EnigmailCommandLine: "chrome://openpgp/content/modules/commandLine.jsm",
  EnigmailPrefs: "chrome://openpgp/content/modules/prefs.jsm",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.jsm",
  EnigmailMimeEncrypt: "chrome://openpgp/content/modules/mimeEncrypt.jsm",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
  EnigmailConfigure: "chrome://openpgp/content/modules/configure.jsm",
  EnigmailApp: "chrome://openpgp/content/modules/app.jsm",
  EnigmailPgpmimeHander: "chrome://openpgp/content/modules/pgpmimeHandler.jsm",
  EnigmailProtocolHandler:
    "chrome://openpgp/content/modules/protocolHandler.jsm",
  EnigmailSqliteDb: "chrome://openpgp/content/modules/sqliteDb.jsm",
  // EnigmailFiltersWrapper: "chrome://openpgp/content/modules/filtersWrapper.jsm",
  // EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  // EnigmailWksMimeHandler: "chrome://openpgp/content/modules/wksMimeHandler.jsm",
  // EnigmailOverlays: "chrome://openpgp/content/modules/enigmailOverlays.jsm",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.jsm",
});

var EXPORTED_SYMBOLS = ["EnigmailCore"];

// Interfaces
const nsIEnvironment = Ci.nsIEnvironment;

var gOverwriteEnvVar = [];
var gEnigmailService = null; // Global Enigmail Service

var gEnvList = null; // currently filled from enigmail.js

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
    let self = this;

    let env = getEnvironment();
    initializeLogDirectory();
    initializeLogging(env);

    EnigmailLog.DEBUG("core.jsm: startup()\n");

    await EnigmailSqliteDb.checkDatabaseStructure();
    await PgpSqliteDb2.checkDatabaseStructure();
    EnigmailPrefs.startup(reason);

    this.factories = [];

    EnigmailVerify.registerContentTypeHandler();
    //EnigmailWksMimeHandler.registerContentTypeHandler();
    //EnigmailFiltersWrapper.onStartup();

    EnigmailMimeEncrypt.startup(reason);
    //EnigmailOverlays.startup();
    self.factories.push(new Factory(EnigmailProtocolHandler));
    self.factories.push(new Factory(EnigmailMimeEncrypt.Handler));
  },

  shutdown(reason) {
    EnigmailLog.DEBUG("core.jsm: shutdown():\n");

    let cLineReg = EnigmailCommandLine.categoryRegistry;
    Services.catMan.deleteCategoryEntry(
      cLineReg.category,
      cLineReg.entry,
      false
    );

    if (this.factories) {
      for (let fct of this.factories) {
        fct.unregister();
      }
    }

    //EnigmailFiltersWrapper.onShutdown();
    EnigmailVerify.unregisterContentTypeHandler();

    EnigmailLocale.shutdown();
    EnigmailLog.onShutdown();

    EnigmailLog.setLogLevel(3);
    gEnigmailService = null;
  },

  version: "",

  init(enigmailVersion) {
    this.version = enigmailVersion;
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

  getEnigmailService() {
    return gEnigmailService;
  },

  setEnigmailService(v) {
    gEnigmailService = v;
  },

  /**
   * obtain a list of all environment variables
   *
   * @return: Array of Strings with the following structrue
   *          variable_name=variable_content
   */
  getEnvList() {
    return gEnvList;
  },

  addToEnvList(str) {
    gEnvList.push(str);
  },

  setEnvVariable(varname, value) {
    for (let i = 0; i < gEnvList.length; i++) {
      if (gEnvList[i].startsWith(varname + "=")) {
        gEnvList[i] = varname + "=" + value;
        break;
      }
    }
  },
};

///////////////////////////////////////////////////////////////////////////////
// Enigmail encryption/decryption service
///////////////////////////////////////////////////////////////////////////////

function getLogDirectoryPrefix() {
  try {
    return EnigmailPrefs.getPrefBranch().getCharPref("logDirectory") || "";
  } catch (ex) {
    return "";
  }
}

function initializeLogDirectory() {
  const prefix = getLogDirectoryPrefix();
  if (prefix) {
    EnigmailLog.setLogLevel(5);
    EnigmailLog.setLogDirectory(prefix);
    EnigmailLog.DEBUG(
      "core.jsm: Logging debug output to " + prefix + "/enigdbug.txt\n"
    );
  }
}

function initializeLogging(env) {
  const nspr_log_modules = env.get("NSPR_LOG_MODULES");
  const matches = nspr_log_modules.match(/enigmail.js:(\d+)/);

  if (matches && matches.length > 1) {
    EnigmailLog.setLogLevel(Number(matches[1]));
    EnigmailLog.WARNING("core.jsm: Enigmail: LogLevel=" + matches[1] + "\n");
  }
}

function failureOn(ex, status) {
  EnigmailLog.ERROR("core.jsm: Enigmail.initialize: Error\n");
  EnigmailLog.DEBUG(
    "core.jsm: Enigmail.initialize: exception=" + ex.toString() + "\n"
  );
  throw Components.Exception("", Cr.NS_ERROR_FAILURE);
}

function getEnvironment(status) {
  try {
    return Cc["@mozilla.org/process/environment;1"].getService(nsIEnvironment);
  } catch (ex) {
    failureOn(ex, status);
  }
  return null;
}

function initializeEnvironment(env) {
  // Initialize global environment variables list
  let passEnv = [
    "GNUPGHOME",
    "GPGDIR",
    "ETC",
    "ALLUSERSPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "BEGINLIBPATH",
    "COMMONPROGRAMFILES",
    "COMSPEC",
    "DBUS_SESSION_BUS_ADDRESS",
    "DISPLAY",
    "ENIGMAIL_PASS_ENV",
    "ENDLIBPATH",
    "GTK_IM_MODULE",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCPATH",
    "LOGNAME",
    "LD_LIBRARY_PATH",
    "MOZILLA_FIVE_HOME",
    "NLSPATH",
    "PATH",
    "PATHEXT",
    "PINENTRY_USER_DATA",
    "PROGRAMFILES",
    "PWD",
    "QT_IM_MODULE",
    "SHELL",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "TZ",
    "TZDIR",
    "UNIXROOT",
    "USER",
    "USERPROFILE",
    "WINDIR",
    "XAUTHORITY",
    "XMODIFIERS",
  ];

  gEnvList = [];

  // if (!EnigmailPrefs.getPref("gpgLocaleEn")) {
  //   passEnv = passEnv.concat([
  //     "LANG", "LANGUAGE", "LC_ALL", "LC_COLLATE", "LC_CTYPE",
  //     "LC_MESSAGES", "LC_MONETARY", "LC_NUMERIC", "LC_TIME"
  //   ]);
  // }
  // else if (getEnigmailOS().getOS() === "WINNT") {
  //   // force output on Windows to EN-US
  //   EnigmailCore.addToEnvList("LC_ALL=en_US");
  //   EnigmailCore.addToEnvList("LANG=en_US");
  // }

  EnigmailCore.addToEnvList("LC_ALL=C");
  EnigmailCore.addToEnvList("LANG=C");

  const passList = env.get("ENIGMAIL_PASS_ENV");
  if (passList) {
    const passNames = passList.split(":");
    for (var k = 0; k < passNames.length; k++) {
      passEnv.push(passNames[k]);
    }
  }

  for (var j = 0; j < passEnv.length; j++) {
    const envName = passEnv[j];
    let envValue;

    if (envName in gOverwriteEnvVar) {
      envValue = gOverwriteEnvVar[envName];
    } else {
      envValue = env.get(envName);
    }
    if (envValue) {
      EnigmailCore.addToEnvList(envName + "=" + envValue);
    }
  }

  EnigmailLog.DEBUG(
    "core.jsm: Enigmail.initialize: Ec.envList = " + gEnvList + "\n"
  );
}

function Enigmail() {
  this.wrappedJSObject = this;
}

Enigmail.prototype = {
  initialized: false,
  initializationAttempted: false,

  initialize(domWindow, version) {
    this.initializationAttempted = true;

    EnigmailLog.DEBUG("core.jsm: Enigmail.initialize: START\n");

    if (this.initialized) {
      return;
    }

    this.environment = getEnvironment(this);

    initializeEnvironment(this.environment);

    try {
      EnigmailConsole.write("Initializing Enigmail service ...\n");
    } catch (ex) {
      failureOn(ex, this);
    }

    //getEnigmailKeyRefreshService().start(getEnigmailKeyServer());

    this.initialized = true;

    EnigmailLog.DEBUG("core.jsm: Enigmail.initialize: END\n");
  },

  reinitialize() {
    EnigmailLog.DEBUG("core.jsm: Enigmail.reinitialize:\n");
    this.initialized = false;
    this.initializationAttempted = true;

    EnigmailConsole.write("Reinitializing Enigmail service ...\n");
    initializeEnvironment(this.environment);
    this.initialized = true;
  },

  overwriteEnvVar(envVar) {
    let envLines = envVar.split(/\n/);

    gOverwriteEnvVar = [];
    for (let i = 0; i < envLines.length; i++) {
      let j = envLines[i].indexOf("=");
      if (j > 0) {
        gOverwriteEnvVar[envLines[i].substr(0, j)] = envLines[i].substr(j + 1);
      }
    }
  },

  async getService(win, startingPreferences) {
    if (!win) {
      win = EnigmailWindows.getBestParentWin();
    }

    EnigmailLog.DEBUG("core.jsm: svc = " + this + "\n");

    if (!this.initialized) {
      // Initialize enigmail
      EnigmailApp.initAddon();
      EnigmailCore.init(EnigmailApp.getVersion());
      this.initialize(win, EnigmailApp.getVersion());

      const configuredVersion = EnigmailPrefs.getPref("configuredVersion");

      if (this.initialized && configuredVersion !== "") {
        EnigmailConfigure.configureEnigmail(win, startingPreferences);
      }
    }
    await EnigmailCore.startup(0);
    EnigmailPgpmimeHander.startup(0);
    return this.initialized ? this : null;
  },
}; // Enigmail.prototype

class Factory {
  constructor(component) {
    this.component = component;
    this.register();
    Object.freeze(this);
  }

  createInstance(outer, iid) {
    if (outer) {
      throw Components.Exception("", Cr.NS_ERROR_NO_AGGREGATION);
    }
    return new this.component();
  }

  register() {
    Cm.registerFactory(
      this.component.prototype.classID,
      this.component.prototype.classDescription,
      this.component.prototype.contractID,
      this
    );
  }

  unregister() {
    Cm.unregisterFactory(this.component.prototype.classID, this);
  }
}
