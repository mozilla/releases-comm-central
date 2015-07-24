# -*- indent-tabs-mode: nil; js-indent-level: 4 -*-
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Load DownloadUtils module for convertByteUnits
Components.utils.import("resource://gre/modules/DownloadUtils.jsm");
Components.utils.import("resource://gre/modules/ctypes.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/LoadContextInfo.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/BrowserUtils.jsm");

var gAdvancedPane = {
  _inited: false,

  /**
   * Brings the appropriate tab to the front and initializes various bits of UI.
   */
  init: function ()
  {
    this._inited = true;
    var advancedPrefs = document.getElementById("advancedPrefs");

    var extraArgs = ("arguments" in window) && window.arguments[1];
    if (extraArgs && extraArgs["advancedTab"]){
      advancedPrefs.selectedTab = document.getElementById(extraArgs["advancedTab"]);
    } else {
      var preference = document.getElementById("browser.preferences.advanced.selectedTabIndex");
      if (preference.value !== null)
        advancedPrefs.selectedIndex = preference.value;
    }

    this.updateConnectionGroupbox();
#ifdef MOZ_UPDATER
    let onUnload = function () {
      window.removeEventListener("unload", onUnload, false);
      Services.prefs.removeObserver("app.update.", this);
    }.bind(this);
    window.addEventListener("unload", onUnload, false);
    Services.prefs.addObserver("app.update.", this, false);
    this.updateReadPrefs();
#endif

    let bundlePrefs = document.getElementById("bundlePreferences");

    // Notify observers that the UI is now ready
    Services.obs.notifyObservers(window, "advanced-pane-loaded", null);
  },

  /**
   * Stores the identity of the current tab in preferences so that the selected
   * tab can be persisted between openings of the preferences window.
   */
  tabSelectionChanged: function ()
  {
    if (!this._inited)
      return;
    var advancedPrefs = document.getElementById("advancedPrefs");
    var preference = document.getElementById("browser.preferences.advanced.selectedTabIndex");
    preference.valueFromPreferences = advancedPrefs.selectedIndex;
  },

  // GENERAL TAB

  /*
   * Preferences:
   *
   * accessibility.browsewithcaret
   * - true enables keyboard navigation and selection within web pages using a
   *   visible caret, false uses normal keyboard navigation with no caret
   * accessibility.typeaheadfind
   * - when set to true, typing outside text areas and input boxes will
   *   automatically start searching for what's typed within the current
   *   document; when set to false, no search action happens
   * general.autoScroll
   * - when set to true, clicking the scroll wheel on the mouse activates a
   *   mouse mode where moving the mouse down scrolls the document downward with
   *   speed correlated with the distance of the cursor from the original
   *   position at which the click occurred (and likewise with movement upward);
   *   if false, this behavior is disabled
   * general.smoothScroll
   * - set to true to enable finer page scrolling than line-by-line on page-up,
   *   page-down, and other such page movements
   * layout.spellcheckDefault
   * - an integer:
   *     0  disables spellchecking
   *     1  enables spellchecking, but only for multiline text fields
   *     2  enables spellchecking for all text fields
   */

  /**
   * Stores the original value of the spellchecking preference to enable proper
   * restoration if unchanged (since we're mapping a tristate onto a checkbox).
   */
  _storedSpellCheck: 0,

  /**
   * Returns true if any spellchecking is enabled and false otherwise, caching
   * the current value to enable proper pref restoration if the checkbox is
   * never changed.
   */
  readCheckSpelling: function ()
  {
    var pref = document.getElementById("layout.spellcheckDefault");
    this._storedSpellCheck = pref.value;

    return (pref.value != 0);
  },

  /**
   * Returns the value of the spellchecking preference represented by UI,
   * preserving the preference's "hidden" value if the preference is
   * unchanged and represents a value not strictly allowed in UI.
   */
  writeCheckSpelling: function ()
  {
    var checkbox = document.getElementById("checkSpelling");
    return checkbox.checked ? (this._storedSpellCheck == 2 ? 2 : 1) : 0;
  },

  showSearchEngineManager: function()
  {
    var window = Services.wm.getMostRecentWindow("Browser:SearchManager");
    if (window)
      window.focus();
    else {
      openDialog("chrome://instantbird/content/engineManager.xul",
                 "_blank", "chrome,dialog,modal,centerscreen");
    }
  },

  showConfigEdit: function()
  {
    document.documentElement.openWindow("Preferences:ConfigManager",
                                        "chrome://global/content/config.xul",
                                        "", null);
  },

  /**
   * security.OCSP.enabled is an integer value for legacy reasons.
   * A value of 1 means OCSP is enabled. Any other value means it is disabled.
   */
  readEnableOCSP: function ()
  {
    var preference = document.getElementById("security.OCSP.enabled");
    // This is the case if the preference is the default value.
    if (preference.value === undefined) {
      return true;
    }
    return preference.value == 1;
  },

  /**
   * See documentation for readEnableOCSP.
   */
  writeEnableOCSP: function ()
  {
    var checkbox = document.getElementById("enableOCSP");
    return checkbox.checked ? 1 : 0;
  },

  /**
   * When the user toggles the layers.acceleration.disabled pref,
   * sync its new value to the gfx.direct2d.disabled pref too.
   */
  updateHardwareAcceleration: function()
  {
#ifdef XP_WIN
    var fromPref = document.getElementById("layers.acceleration.disabled");
    var toPref = document.getElementById("gfx.direct2d.disabled");
    toPref.value = fromPref.value;
#endif
  },

  // NETWORK TAB

  /*
   * Preferences:
   *
   * browser.cache.disk.capacity
   * - the size of the browser cache in KB
   * - Only used if browser.cache.disk.smart_size.enabled is disabled
   */

  /**
   * Displays a dialog in which proxy settings may be changed.
   */
  showConnections: function ()
  {
    document.documentElement.openSubDialog("chrome://instantbird/content/preferences/connection.xul",
                                           "", null);
  },

  /**
   * Displays a dialog in which purple proxy settings may be changed.
   */
  showProxies: function ()
  {
    document.documentElement.openSubDialog("chrome://instantbird/content/proxies.xul",
                                           "", null);
  },

  /**
   * Adapt the content of the connection groupbox depending on libpurple being
   * there or not.
   */
  updateConnectionGroupbox: function ()
  {
    let hasLibpurple = "@instantbird.org/libpurple/core;1" in Components.classes;
    // Hide explanatory header and libpurple section.
    document.getElementById("connectionGroupHeader").hidden = !hasLibpurple;
    document.getElementById("connectionGroupSeparator").hidden = !hasLibpurple;
    document.getElementById("purpleConnectionBox").hidden = !hasLibpurple;
    // Choose appropriate label for the Mozilla proxy options.
    document.getElementById("mozConnLabelWithoutLibpurple").hidden = hasLibpurple;
    document.getElementById("mozConnLabelWithLibpurple").hidden = !hasLibpurple;
  },

  // UPDATE TAB

  /*
   * Preferences:
   *
   * app.update.enabled
   * - true if updates to the application are enabled, false otherwise
   * extensions.update.enabled
   * - true if updates to extensions and themes are enabled, false otherwise
   * browser.search.update
   * - true if updates to search engines are enabled, false otherwise
   * app.update.auto
   * - true if updates should be automatically downloaded and installed,
   *   possibly with a warning if incompatible extensions are installed (see
   *   app.update.mode); false if the user should be asked what he wants to do
   *   when an update is available
   * app.update.mode
   * - an integer:
   *     0    do not warn if an update will disable extensions or themes
   *     1    warn if an update will disable extensions or themes
   *     2    warn if an update will disable extensions or themes *or* if the
   *          update is a major update
   */

#ifdef MOZ_UPDATER
  /**
   * Selects the item of the radiogroup, and sets the warnIncompatible checkbox
   * based on the pref values and locked states.
   *
   * UI state matrix for update preference conditions
   *
   * UI Components:                              Preferences
   * Radiogroup                                  i   = app.update.enabled
   * Warn before disabling extensions checkbox   ii  = app.update.auto
   *                                             iii = app.update.mode
   *
   * Disabled states:
   * Element           pref  value  locked  disabled
   * radiogroup        i     t/f    f       false
   *                   i     t/f    *t*     *true*
   *                   ii    t/f    f       false
   *                   ii    t/f    *t*     *true*
   *                   iii   0/1/2  t/f     false
   * warnIncompatible  i     t      f       false
   *                   i     t      *t*     *true*
   *                   i     *f*    t/f     *true*
   *                   ii    t      f       false
   *                   ii    t      *t*     *true*
   *                   ii    *f*    t/f     *true*
   *                   iii   0/1/2  f       false
   *                   iii   0/1/2  *t*     *true*
   */
  updateReadPrefs: function ()
  {
    var enabledPref = document.getElementById("app.update.enabled");
    var autoPref = document.getElementById("app.update.auto");
    var radiogroup = document.getElementById("updateRadioGroup");

    if (!enabledPref.value)   // Don't care for autoPref.value in this case.
      radiogroup.value="manual";    // 3. Never check for updates.
    else if (autoPref.value)  // enabledPref.value && autoPref.value
      radiogroup.value="auto";      // 1. Automatically install updates for Desktop only
    else                      // enabledPref.value && !autoPref.value
      radiogroup.value="checkOnly"; // 2. Check, but let me choose

    var canCheck = Components.classes["@mozilla.org/updates/update-service;1"].
                     getService(Components.interfaces.nsIApplicationUpdateService).
                     canCheckForUpdates;
    // canCheck is false if the enabledPref is false and locked,
    // or the binary platform or OS version is not known.
    // A locked pref is sufficient to disable the radiogroup.
    radiogroup.disabled = !canCheck || enabledPref.locked || autoPref.locked;

    var modePref = document.getElementById("app.update.mode");
    var warnIncompatible = document.getElementById("warnIncompatible");
    // the warnIncompatible checkbox value is set by readAddonWarn
    warnIncompatible.disabled = radiogroup.disabled || modePref.locked ||
                                !enabledPref.value || !autoPref.value;

#ifdef MOZ_MAINTENANCE_SERVICE
    // Check to see if the maintenance service is installed.
    // If it is don't show the preference at all.
    var installed;
    try {
      var wrk = Components.classes["@mozilla.org/windows-registry-key;1"]
                .createInstance(Components.interfaces.nsIWindowsRegKey);
      wrk.open(wrk.ROOT_KEY_LOCAL_MACHINE,
               "SOFTWARE\\Mozilla\\MaintenanceService",
               wrk.ACCESS_READ | wrk.WOW64_64);
      installed = wrk.readIntValue("Installed");
      wrk.close();
    } catch(e) {
    }
    if (installed != 1) {
      document.getElementById("useService").hidden = true;
    }
    try {
      const DRIVE_FIXED = 3;
      const LPCWSTR = ctypes.char16_t.ptr;
      const UINT = ctypes.uint32_t;
      let kernel32 = ctypes.open("kernel32");
      let GetDriveType = kernel32.declare("GetDriveTypeW", ctypes.default_abi, UINT, LPCWSTR);
      var UpdatesDir = Components.classes["@mozilla.org/updates/update-service;1"].
                       getService(Components.interfaces.nsIApplicationUpdateService);
      let rootPath = UpdatesDir.getUpdatesDirectory();
      while (rootPath.parent != null) {
        rootPath = rootPath.parent;
      }
      if (GetDriveType(rootPath.path) != DRIVE_FIXED) {
        document.getElementById("useService").hidden = true;
      }
      kernel32.close();
    } catch(e) {
    }
#endif
  },

  /**
   * Sets the pref values based on the selected item of the radiogroup,
   * and sets the disabled state of the warnIncompatible checkbox accordingly.
   */
  updateWritePrefs: function ()
  {
    var enabledPref = document.getElementById("app.update.enabled");
    var autoPref = document.getElementById("app.update.auto");
    var modePref = document.getElementById("app.update.mode");
    var radiogroup = document.getElementById("updateRadioGroup");
    switch (radiogroup.value) {
      case "auto":      // 1. Automatically install updates for Desktop only
        enabledPref.value = true;
        autoPref.value = true;
        break;
      case "checkOnly": // 2. Check, but let me choose
        enabledPref.value = true;
        autoPref.value = false;
        break;
      case "manual":    // 3. Never check for updates.
        enabledPref.value = false;
        autoPref.value = false;
    }

    var warnIncompatible = document.getElementById("warnIncompatible");
    warnIncompatible.disabled = enabledPref.locked || !enabledPref.value ||
                                autoPref.locked || !autoPref.value ||
                                modePref.locked;
  },

  /**
   * Stores the value of the app.update.mode preference, which is a tristate
   * integer preference.  We store the value here so that we can properly
   * restore the preference value if the UI reflecting the preference value
   * is in a state which can represent either of two integer values (as
   * opposed to only one possible value in the other UI state).
   */
  _modePreference: -1,

  /**
   * Reads the app.update.mode preference and converts its value into a
   * true/false value for use in determining whether the "Warn me if this will
   * disable extensions or themes" checkbox is checked.  We also save the value
   * of the preference so that the preference value can be properly restored if
   * the user's preferences cannot adequately be expressed by a single checkbox.
   *
   * app.update.mode          Checkbox State    Meaning
   * 0                        Unchecked         Do not warn
   * 1                        Checked           Warn if there are incompatibilities
   * 2                        Checked           Warn if there are incompatibilities,
   *                                            or the update is major.
   */
  readAddonWarn: function ()
  {
    var preference = document.getElementById("app.update.mode");
    var warn = preference.value != 0;
    gAdvancedPane._modePreference = warn ? preference.value : 1;
    return warn;
  },

  /**
   * Converts the state of the "Warn me if this will disable extensions or
   * themes" checkbox into the integer preference which represents it,
   * returning that value.
   */
  writeAddonWarn: function ()
  {
    var warnIncompatible = document.getElementById("warnIncompatible");
    return !warnIncompatible.checked ? 0 : gAdvancedPane._modePreference;
  },

  /**
   * Displays the history of installed updates.
   */
  showUpdates: function ()
  {
    var prompter = Components.classes["@mozilla.org/updates/update-prompt;1"]
                             .createInstance(Components.interfaces.nsIUpdatePrompt);
    prompter.showUpdateHistory(window);
  },
#endif

  // ENCRYPTION TAB

  /*
   * Preferences:
   *
   * security.default_personal_cert
   * - a string:
   *     "Select Automatically"   select a certificate automatically when a site
   *                              requests one
   *     "Ask Every Time"         present a dialog to the user so he can select
   *                              the certificate to use on a site which
   *                              requests one
   */

  /**
   * Displays the user's certificates and associated options.
   */
  showCertificates: function ()
  {
    document.documentElement.openWindow("mozilla:certmanager",
                                        "chrome://pippki/content/certManager.xul",
                                        "", null);
  },

  /**
   * Displays a dialog from which the user can manage his security devices.
   */
  showSecurityDevices: function ()
  {
    document.documentElement.openWindow("mozilla:devicemanager",
                                        "chrome://pippki/content/device_manager.xul",
                                        "", null);
  },

#ifdef MOZ_UPDATER
  observe: function (aSubject, aTopic, aData) {
    switch(aTopic) {
      case "nsPref:changed":
        this.updateReadPrefs();
        break;
    }
  },
#endif
};
