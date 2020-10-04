/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailPrefs"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

const ENIGMAIL_PREFS_ROOT = "temp.openpgp.";

const p = {
  service: null,
  branch: null,
  root: null,
  defaultBranch: null,
};

function initPrefService() {
  try {
    p.service = Services.prefs;

    p.root = p.service.getBranch(null);
    p.branch = p.service.getBranch(ENIGMAIL_PREFS_ROOT);
    p.defaultBranch = p.service.getDefaultBranch(null);

    try {
      if (p.branch.getCharPref("logDirectory")) {
        EnigmailLog.setLogLevel(5);
      }
    } catch (ex) {} // don't log anythign if accessing logDirectory fails
  } catch (ex) {
    EnigmailLog.ERROR("prefs.jsm: Error in instantiating PrefService\n");
    EnigmailLog.ERROR(ex.toString());
  }
}

var EnigmailPrefs = {
  startup(reason) {
    try {
      initPrefService();
      //setDefaultPrefs();
    } catch (ex) {
      EnigmailLog.ERROR(
        "prefs.jsm: Error while loading default prefs: " + ex.message + "\n"
      );
    }
  },

  getPrefRoot() {
    if (!p.branch) {
      initPrefService();
    }

    return p.root;
  },

  getPrefBranch() {
    if (!p.branch) {
      initPrefService();
    }

    return p.branch;
  },

  getPref(prefName) {
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
    } catch (ex) {
      // Failed to get pref value
      EnigmailLog.ERROR(
        "prefs.jsm: getPref: unknown prefName:" + prefName + " \n"
      );
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
  setPref(prefName, value) {
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
  savePrefs() {
    EnigmailLog.DEBUG("prefs.jsm: savePrefs\n");
    try {
      p.service.savePrefFile(null);
    } catch (ex) {}
  },

  /**
   * Compiles all Enigmail preferences into an object
   */
  getAllPrefs() {
    EnigmailLog.DEBUG("prefs.js: getAllPrefs\n");

    var retObj = {
      value: 0,
    };
    var branch = this.getPrefBranch();
    var allPrefs = branch.getChildList("", retObj);
    var prefObj = {};
    var nsIPB = Ci.nsIPrefBranch;

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
  registerPrefObserver(prefName, observerFunc) {
    EnigmailLog.DEBUG("prefs.jsm: registerPrefObserver(" + prefName + ")\n");
    let branch = this.getPrefRoot();

    let observer = {
      observe(aSubject, aTopic, aData) {
        try {
          if (String(aData) == ENIGMAIL_PREFS_ROOT + this.prefName) {
            EnigmailLog.DEBUG(
              "prefs.jsm: preference observed: " + aData + "\n"
            );
            observerFunc();
          }
        } catch (ex) {}
      },

      prefName,

      QueryInterface: ChromeUtils.generateQI([
        "nsIObserver",
        "nsISupportsWeakReference",
      ]),
    };
    branch.addObserver(ENIGMAIL_PREFS_ROOT, observer);
    return observer;
  },

  /**
   * de-register an observer created by registerPrefObserver().
   *
   * @param observer: Object - observer object returned by registerPrefObserver
   */
  unregisterPrefObserver(observer) {
    EnigmailLog.DEBUG(
      "prefs.jsm: unregisterPrefObserver(" + observer.prefName + ")\n"
    );

    let branch = this.getPrefRoot();

    branch.removeObserver(ENIGMAIL_PREFS_ROOT, observer);
  },
};
