/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var kLogLevelPref = "purple.debug.loglevel";

/**
 * Creates an nsIScriptError instance and logs it.
 *
 * @param aModule
 *        string identifying the module within which the error occurred.
 * @param aLevel
 *        the error level as defined in imIDebugMessage.
 * @param aMessage
 *        the error message string.
 * @param aOriginalError
 *        (optional) JS Error object containing the location where the
 *        actual error occurred. Its error message is appended to aMessage.
 */
export function scriptError(aModule, aLevel, aMessage, aOriginalError) {
  // Figure out the log level, based on the module and the prefs set.
  // The module name is split on periods, and if no pref is set the pref with
  // the last section removed is attempted (until no sections are left, using
  // the global default log level).
  let logLevel = -1;
  const logKeys = ["level"].concat(aModule.split("."));
  for (; logKeys.length > 0; logKeys.pop()) {
    const logKey = logKeys.join(".");
    if (logKey in lazy.gLogLevels) {
      logLevel = lazy.gLogLevels[logKey];
      break;
    }
  }

  // Only continue if we will log this message.
  if (logLevel > aLevel && !("imAccount" in this)) {
    return;
  }

  let flag = Ci.nsIScriptError.warningFlag;
  if (aLevel >= Ci.imIDebugMessage.LEVEL_ERROR) {
    flag = Ci.nsIScriptError.errorFlag;
  }

  const errorMessage = Cc["@mozilla.org/scripterror;1"].createInstance(
    Ci.nsIScriptError
  );
  const caller = Components.stack.caller;
  let sourceLine = aModule || caller.sourceLine;
  if (caller.name) {
    if (sourceLine) {
      sourceLine += ": ";
    }
    sourceLine += caller.name;
  }
  let fileName = caller.filename;
  let lineNumber = caller.lineNumber;
  if (aOriginalError) {
    aMessage += "\n" + (aOriginalError.message || aOriginalError);
    if (aOriginalError.fileName) {
      fileName = aOriginalError.fileName;
    }
    if (aOriginalError.lineNumber) {
      lineNumber = aOriginalError.lineNumber;
    }
  }
  errorMessage.init(
    aMessage,
    fileName,
    sourceLine,
    lineNumber,
    null,
    flag,
    "component javascript"
  );

  if (logLevel <= aLevel) {
    dump(aModule + ": " + aMessage + "\n");
    if (aLevel == Ci.imIDebugMessage.LEVEL_LOG && logLevel == aLevel) {
      Services.console.logStringMessage(aMessage);
    } else {
      Services.console.logMessage(errorMessage);
    }
  }
  if ("imAccount" in this) {
    this.imAccount.logDebugMessage(errorMessage, aLevel);
  }
}

export function initLogModule(aModule, aObj = {}) {
  aObj.DEBUG = scriptError.bind(aObj, aModule, Ci.imIDebugMessage.LEVEL_DEBUG);
  aObj.LOG = scriptError.bind(aObj, aModule, Ci.imIDebugMessage.LEVEL_LOG);
  aObj.WARN = scriptError.bind(aObj, aModule, Ci.imIDebugMessage.LEVEL_WARNING);
  aObj.ERROR = scriptError.bind(aObj, aModule, Ci.imIDebugMessage.LEVEL_ERROR);
  return aObj;
}

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "gLogLevels", function () {
  // This object functions both as an obsever as well as a dict keeping the
  // log levels with prefs; the log levels all start with "level" (i.e. "level"
  // for the global level, "level.irc" for the IRC module).  The dual-purpose
  // is necessary to make sure the observe is left alive while being a weak ref
  // to avoid cycles with the pref service.
  const logLevels = {
    observe(aSubject, aTopic, aData) {
      const module = "level" + aData.substr(kLogLevelPref.length);
      if (Services.prefs.getPrefType(aData) == Services.prefs.PREF_INT) {
        lazy.gLogLevels[module] = Services.prefs.getIntPref(aData);
      } else {
        delete lazy.gLogLevels[module];
      }
    },
    QueryInterface: ChromeUtils.generateQI([
      "nsIObserver",
      "nsISupportsWeakReference",
    ]),
  };

  // Add weak pref observer to see log level pref changes.
  Services.prefs.addObserver(kLogLevelPref, logLevels, true /* weak */);

  // Initialize with existing log level prefs.
  for (const pref of Services.prefs.getChildList(kLogLevelPref)) {
    if (Services.prefs.getPrefType(pref) == Services.prefs.PREF_INT) {
      logLevels["level" + pref.substr(kLogLevelPref.length)] =
        Services.prefs.getIntPref(pref);
    }
  }

  // Let environment variables override prefs.
  Services.env
    .get("PRPL_LOG")
    .split(/[;,]/)
    .filter(n => n != "")
    .forEach(function (env) {
      const [, module, level] = env.match(/(?:(.*?)[:=])?(\d+)/);
      logLevels["level" + (module ? "." + module : "")] = parseInt(level, 10);
    });

  return logLevels;
});

export function executeSoon(aFunction) {
  Services.tm.mainThread.dispatch(aFunction, Ci.nsIEventTarget.DISPATCH_NORMAL);
}

/* Common nsIClassInfo and QueryInterface implementation
 * shared by all generic objects implemented in this file. */
export function ClassInfo(aInterfaces, aDescription = "JS Proto Object") {
  if (!(this instanceof ClassInfo)) {
    return new ClassInfo(aInterfaces, aDescription);
  }

  if (!Array.isArray(aInterfaces)) {
    aInterfaces = [aInterfaces];
  }

  for (const i of aInterfaces) {
    if (typeof i == "string" && !(i in Ci)) {
      Services.console.logStringMessage("ClassInfo: unknown interface " + i);
    }
  }

  this._interfaces = aInterfaces.map(i => (typeof i == "string" ? Ci[i] : i));

  this.classDescription = aDescription;
}

ClassInfo.prototype = {
  // eslint-disable-next-line mozilla/use-chromeutils-generateqi
  QueryInterface(iid) {
    if (
      iid.equals(Ci.nsISupports) ||
      iid.equals(Ci.nsIClassInfo) ||
      this._interfaces.some(i => i.equals(iid))
    ) {
      return this;
    }

    throw Components.Exception("", Cr.NS_ERROR_NO_INTERFACE);
  },
  get interfaces() {
    return [Ci.nsIClassInfo, Ci.nsISupports].concat(this._interfaces);
  },
  getScriptableHelper: () => null,
  contractID: null,
  classID: null,
  flags: 0,
};

/**
 * Constructs an nsISimpleEnumerator for the given array of items.
 * Copied from netwerk/test/httpserver/httpd.js
 *
 * @param items : Array
 *   the items, which must all implement nsISupports
 */
export function nsSimpleEnumerator(items) {
  this._items = items;
  this._nextIndex = 0;
}

nsSimpleEnumerator.prototype = {
  hasMoreElements() {
    return this._nextIndex < this._items.length;
  },
  getNext() {
    if (!this.hasMoreElements()) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_AVAILABLE);
    }

    return this._items[this._nextIndex++];
  },
  QueryInterface: ChromeUtils.generateQI(["nsISimpleEnumerator"]),
  [Symbol.iterator]() {
    return this._items.values();
  },
};

export var EmptyEnumerator = {
  hasMoreElements: () => false,
  getNext() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_AVAILABLE);
  },
  QueryInterface: ChromeUtils.generateQI(["nsISimpleEnumerator"]),
  *[Symbol.iterator]() {},
};
