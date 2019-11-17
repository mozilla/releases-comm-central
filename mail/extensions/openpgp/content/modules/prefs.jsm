/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailPrefs"];





const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const {
  Services
} = ChromeUtils.import("resource://gre/modules/Services.jsm");

const ENIGMAIL_PREFS_ROOT = "temp.openpgp.";

const p = {
  service: null,
  branch: null,
  root: null,
  defaultBranch: null
};

function initPrefService() {
  try {
    p.service = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);

    p.root = p.service.getBranch(null);
    p.branch = p.service.getBranch(ENIGMAIL_PREFS_ROOT);
    p.defaultBranch = p.service.getDefaultBranch(null);

    try {
      if (p.branch.getCharPref("logDirectory")) {
        EnigmailLog.setLogLevel(5);
      }
    }
    catch (ex) {} // don't log anythign if accessing logDirectory fails
  }
  catch (ex) {
    EnigmailLog.ERROR("prefs.jsm: Error in instantiating PrefService\n");
    EnigmailLog.ERROR(ex.toString());
  }
}


var gPrefs = {};

/**
 * Load a preference default value
 * This function is called while loading defaultPrefs.js
 */
function pref(key, val) {
  gPrefs[key] = val;
}

/**
 * Load default preferences for bootstrapped addon
 */
/* no longer necessary
function setDefaultPrefs() {
  EnigmailLog.DEBUG("prefs.jsm: setDefaultPrefs()\n");

  Services.scriptloader.loadSubScript("chrome://openpgp/content/prefs/openpgp-prefs.js", {}, "UTF-8");

  let branch = p.defaultBranch;
  for (let key in gPrefs) {
    try {
      let val = gPrefs[key];
      switch (typeof val) {
        case "boolean":
          branch.setBoolPref(key, val);
          break;
        case "number":
          branch.setIntPref(key, val);
          break;
        case "string":
          branch.setCharPref(key, val);
          break;
      }
    }
    catch(ex) {
      EnigmailLog.ERROR(`prefs.jsm: setDefaultPrefs(${key}: ERROR ${ex.toString()}\n`);
    }
  }
}
*/


var EnigmailPrefs = {
  startup: function(reason) {
    try {
      initPrefService();
      //setDefaultPrefs();
    }
    catch (ex) {
      EnigmailLog.ERROR("prefs.jsm: Error while loading default prefs: " + ex.message + "\n");
    }
  },

  getPrefRoot: function() {
    if (!p.branch) {
      initPrefService();
    }

    return p.root;
  },

  getPrefBranch: function() {
    if (!p.branch) {
      initPrefService();
    }

    return p.branch;
  },

  getPref: function(prefName) {
    if (!p.branch) {
      initPrefService();
    }

    var prefValue = null;
    try {
      var prefType = p.branch.getPrefType(prefName);
      // Get pref value
      switch (prefType) {
        case p.branch.PREF_BOOL:
          prefValue = p.branch.getBoolPref(prefName);
          break;
        case p.branch.PREF_INT:
          prefValue = p.branch.getIntPref(prefName);
          break;
        case p.branch.PREF_STRING:
          prefValue = p.branch.getCharPref(prefName);
          break;
        default:
          prefValue = undefined;
          break;
      }
    }
    catch (ex) {
      // Failed to get pref value
      EnigmailLog.ERROR("prefs.jsm: getPref: unknown prefName:" + prefName + " \n");
    }

    return prefValue;
  },

  /**
   * Store a user preference.
   *
   * @param  String  prefName  An identifier.
   * @param  any     value     The value to be stored. Allowed types: Boolean OR Integer OR String.
   *
   * @return Boolean Was the value stored successfully?
   */
  setPref: function(prefName, value) {
    EnigmailLog.DEBUG("prefs.jsm: setPref: " + prefName + ", " + value + "\n");

    if (!p.branch) {
      initPrefService();
    }

    // Discover the type of the preference, as stored in the user preferences.
    // If the preference identifier doesn't exist yet, it returns 0. In that
    // case the type depends on the argument "value".
    var prefType;
    prefType = p.branch.getPrefType(prefName);
    if (prefType === 0) {
      switch (typeof value) {
        case "boolean":
          prefType = p.branch.PREF_BOOL;
          break;
        case "number":
          prefType = p.branch.PREF_INT;
          break;
        case "string":
          prefType = p.branch.PREF_STRING;
          break;
        default:
          prefType = 0;
          break;
      }
    }
    var retVal = false;

    // Save the preference only and if only the type is bool, int or string.
    switch (prefType) {
      case p.branch.PREF_BOOL:
        p.branch.setBoolPref(prefName, value);
        retVal = true;
        break;

      case p.branch.PREF_INT:
        p.branch.setIntPref(prefName, value);
        retVal = true;
        break;

      case p.branch.PREF_STRING:
        p.branch.setCharPref(prefName, value);
        retVal = true;
        break;

      default:
        break;
    }

    return retVal;
  },

  /**
   * Save the Mozilla preferences file (prefs.js)
   *
   * no return value
   */
  savePrefs: function() {
    EnigmailLog.DEBUG("prefs.jsm: savePrefs\n");
    try {
      p.service.savePrefFile(null);
    }
    catch (ex) {}
  },

  /**
   * Compiles all Enigmail preferences into an object
   */
  getAllPrefs: function() {
    EnigmailLog.DEBUG("prefs.js: getAllPrefs\n");

    var retObj = {
      value: 0
    };
    var branch = this.getPrefBranch();
    var allPrefs = branch.getChildList("", retObj);
    var prefObj = {};
    var nsIPB = Components.interfaces.nsIPrefBranch;

    for (var q in allPrefs) {
      var name = allPrefs[q];

      /*
       * agentPath is system-depend, configuredVersion build-depend and
       * advancedUser must be set in order to save the profile.
       */
      if (name == "agentPath" || name == "configuredVersion") {
        continue;
      }

      switch (branch.getPrefType(name)) {
        case nsIPB.PREF_STRING:
          prefObj[name] = branch.getCharPref(name);
          break;
        case nsIPB.PREF_INT:
          prefObj[name] = branch.getIntPref(name);
          break;
        case nsIPB.PREF_BOOL:
          prefObj[name] = branch.getBoolPref(name);
          break;
        default:
          EnigmailLog.ERROR("Pref '" + name + "' has unknown type\n");
      }
    }

    return prefObj;
  },

  /**
   * register a listener to listen to a change in the Enigmail preferences.
   *
   * @param prefName: String        - name of Enigmail preference
   * @param observerFunc: Function - callback function to be triggered
   *
   * @return Object: observer object (to be used to deregister the observer)
   */
  registerPrefObserver: function(prefName, observerFunc) {
    EnigmailLog.DEBUG("prefs.jsm: registerPrefObserver(" + prefName + ")\n");
    let branch = this.getPrefRoot();

    let observer = {
      observe: function(aSubject, aTopic, aData) {
        try {
          if (String(aData) == ENIGMAIL_PREFS_ROOT + this.prefName) {
            EnigmailLog.DEBUG("prefs.jsm: preference observed: " + aData + "\n");
            observerFunc();
          }
        }
        catch (ex) {}
      },

      prefName: prefName,

      QueryInterface: function(iid) {
        if (iid.equals(Ci.nsIObserver) ||
          iid.equals(Ci.nsISupportsWeakReference) ||
          iid.equals(Ci.nsISupports))
          return this;

        throw Components.results.NS_NOINTERFACE;
      }
    };
    branch.addObserver(ENIGMAIL_PREFS_ROOT, observer, false);
    return observer;
  },

  /**
   * de-register an observer created by registerPrefObserver().
   *
   * @param observer: Object - observer object returned by registerPrefObserver
   */
  unregisterPrefObserver(observer) {
    EnigmailLog.DEBUG("prefs.jsm: unregisterPrefObserver(" + observer.prefName + ")\n");

    let branch = this.getPrefRoot();

    branch.removeObserver(ENIGMAIL_PREFS_ROOT, observer);
  }
};
