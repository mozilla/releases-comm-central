/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helper functions for use by entensions that should ease them plug
 * into the application.
 */

this.EXPORTED_SYMBOLS = [ "extensionDefaults", "ExtensionSupport" ];

ChromeUtils.import("resource://gre/modules/Services.jsm");
// ChromeUtils.import("resource://gre/modules/Deprecated.jsm") - needed for warning.
ChromeUtils.import("resource://gre/modules/NetUtil.jsm");

ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
ChromeUtils.import("resource:///modules/IOUtils.js");

var extensionHooks = new Map();
var openWindowList;

/**
 * Reads preferences from addon provided locations (defaults/preferences/*.js)
 * and stores them in the default preferences branch.
 */
function extensionDefaults() {
  // Fetch enabled non-bootstrapped add-ons.
  let enabledAddons = Services.dirsvc.get("XREExtDL", Ci.nsISimpleEnumerator);
  for (let addonFile of fixIterator(enabledAddons, Ci.nsIFile)) {
    loadAddonPrefs(addonFile);
  }
}

var ExtensionSupport = {
  loadAddonPrefs(addonFile) {
    function setPref(preferDefault, name, value) {
      let branch = Services.prefs.getBranch("");
      if (preferDefault) {
        let defaultBranch = Services.prefs.getDefaultBranch("");
        if (defaultBranch.getPrefType(name) == Ci.nsIPrefBranch.PREF_INVALID) {
          // Only use the default branch if it doesn't already have the pref set.
          // If there is already a pref with this value on the default branch, the
          // extension wants to override a built-in value.
          branch = defaultBranch;
        } else if (defaultBranch.prefHasUserValue(name)) {
          // If a pref already has a user-set value it proper type
          // will be returned (not PREF_INVALID). In that case keep the user's
          // value and overwrite the default.
          branch = defaultBranch;
        }
      }

      if (typeof value == "boolean") {
        branch.setBoolPref(name, value);
      } else if (typeof value == "string") {
        if (value.startsWith("chrome://") && value.endsWith(".properties")) {
          let valueLocal = Cc["@mozilla.org/pref-localizedstring;1"]
                           .createInstance(Ci.nsIPrefLocalizedString);
          valueLocal.data = value;
          branch.setComplexValue(name, Ci.nsIPrefLocalizedString, valueLocal);
        } else {
          branch.setStringPref(name, value);
        }
      } else if (typeof value == "number" && Number.isInteger(value)) {
        branch.setIntPref(name, value);
      } else if (typeof value == "number" && Number.isFloat(value)) {
        // Floats are set as char prefs, then retrieved using getFloatPref
        branch.setCharPref(name, value);
      }
    }

    function walkExtensionPrefs(extensionRoot) {
      let prefFile = extensionRoot.clone();
      let foundPrefStrings = [];
      if (!prefFile.exists())
        return [];

      if (prefFile.isDirectory()) {
        prefFile.append("defaults");
        prefFile.append("preferences");
        if (!prefFile.exists() || !prefFile.isDirectory())
          return [];

        for (let file of fixIterator(prefFile.directoryEntries, Ci.nsIFile)) {
          if (file.isFile() && file.leafName.toLowerCase().endsWith(".js")) {
            foundPrefStrings.push(IOUtils.loadFileToString(file));
          }
        }
      } else if (prefFile.isFile() && prefFile.leafName.endsWith("xpi")) {
        let zipReader = Cc["@mozilla.org/libjar/zip-reader;1"]
                          .createInstance(Ci.nsIZipReader);
        zipReader.open(prefFile);
        let entries = zipReader.findEntries("defaults/preferences/*.js");

        while (entries.hasMore()) {
          let entryName = entries.getNext();
          let stream = zipReader.getInputStream(entryName);
          let entrySize = zipReader.getEntry(entryName).realSize;
          if (entrySize > 0) {
            let content = NetUtil.readInputStreamToString(stream, entrySize, { charset: "utf-8", replacement: "?" });
            foundPrefStrings.push(content);
          }
        }
      }

      return foundPrefStrings;
    }

    let sandbox = new Cu.Sandbox(null);
    sandbox.pref = setPref.bind(undefined, true);
    sandbox.user_pref = setPref.bind(undefined, false);

    let prefDataStrings = walkExtensionPrefs(addonFile);
    for (let prefDataString of prefDataStrings) {
      try {
        Cu.evalInSandbox(prefDataString, sandbox);
      } catch (e) {
        Cu.reportError("Error reading default prefs of addon " + addonFile.leafName + ": " + e);
      }
    }

    /*
    TODO: decide whether we need to warn the user/make addon authors to migrate away from these pref files.
    if (prefDataStrings.length > 0) {
      Deprecated.warning(addon.defaultLocale.name + " uses defaults/preferences/*.js files to load prefs",
                         "https://bugzilla.mozilla.org/show_bug.cgi?id=1414398");
    }
    */
  },

  /**
   * Register listening for windows getting opened that will run the specified callback function
   * when a matching window is loaded.
   *
   * @param aID {String}  Some identification of the caller, usually the extension ID.
   * @param aExtensionHook {Object}  The object describing the hook the caller wants to register.
   *        Members of the object can be (all optional, but one callback must be supplied):
   *        chromeURLs {Array}         An array of strings of document URLs on which
   *                                   the given callback should run. If not specified,
   *                                   run on all windows.
   *        onLoadWindow {function}    The callback function to run when window loads
   *                                   the matching document.
   *        onUnloadWindow {function}  The callback function to run when window
   *                                   unloads the matching document.
   *        Both callbacks receive the matching window object as argument.
   *
   * @return {boolean}  True if the passed arguments were valid and the caller could be registered.
   *                    False otherwise.
   */
  registerWindowListener(aID, aExtensionHook) {
    if (!aID) {
      Cu.reportError("No extension ID provided for the window listener");
      return false;
    }

    if (extensionHooks.has(aID)) {
      Cu.reportError("Window listener for extension + '" + aID + "' already registered");
      return false;
    }

    if (!("onLoadWindow" in aExtensionHook) && !("onUnloadWindow" in aExtensionHook)) {
      Cu.reportError("The extension + '" + aID + "' does not provide any callbacks");
      return false;
    }

    extensionHooks.set(aID, aExtensionHook);

    // Add our global listener if there isn't one already
    // (only when we have first caller).
    if (extensionHooks.size == 1) {
      Services.wm.addListener(this._windowListener);
    }

    if (openWindowList) {
      // We already have a list of open windows, notify the caller about them.
      openWindowList.forEach(domWindow =>
        ExtensionSupport._checkAndRunMatchingExtensions(domWindow, "load", aID));
    } else {
      openWindowList = new Set();
      // Get the list of windows already open.
      let windows = Services.wm.getEnumerator(null);
      while (windows.hasMoreElements()) {
        let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
        if (domWindow.document.location.href === "about:blank") {
          ExtensionSupport._waitForLoad(domWindow, aID);
        } else {
          ExtensionSupport._addToListAndNotify(domWindow, aID);
        }
      }
    }

    return true;
  },

  /**
   * Unregister listening for windows for the given caller.
   *
   * @param aID {String}  Some identification of the caller, usually the extension ID.
   *
   * @return {boolean}  True if the passed arguments were valid and the caller could be unregistered.
   *                    False otherwise.
   */
  unregisterWindowListener(aID) {
    if (!aID) {
      Cu.reportError("No extension ID provided for the window listener");
      return false;
    }

    let windowListener = extensionHooks.get(aID);
    if (!windowListener) {
      Cu.reportError("Couldn't remove window listener for extension + '" + aID + "'");
      return false;
    }

    extensionHooks.delete(aID);
    // Remove our global listener if there are no callers registered anymore.
    if (extensionHooks.size == 0) {
      Services.wm.removeListener(this._windowListener);
      openWindowList.clear();
      openWindowList = undefined;
    }

    return true;
  },

  _windowListener: {
    // nsIWindowMediatorListener functions
    onOpenWindow(xulWindow) {
      // A new window has opened.
      let domWindow = xulWindow.docShell.domWindow;

      // Here we pass no caller ID, so all registered callers get notified.
      ExtensionSupport._waitForLoad(domWindow);
    },

    onCloseWindow(xulWindow) {
      // One of the windows has closed.
      let domWindow = xulWindow.docShell.domWindow;
      openWindowList.delete(domWindow);
    }
  },

  /**
   * Set up listeners to run the callbacks on the given window.
   *
   * @param aWindow {nsIDOMWindow}  The window to set up.
   * @param aID {String} Optional.  ID of the new caller that has registered right now.
   */
  _waitForLoad(aWindow, aID) {
    // Wait for the load event of the window. At that point
    // aWindow.document.location.href will not be "about:blank" any more.
    aWindow.addEventListener("load", function() {
      ExtensionSupport._addToListAndNotify(aWindow, aID);
    }, { once: true });
  },

  /**
   * Once the window is fully loaded with the href referring to the XUL document,
   * add it to our list, attach the "unload" listener to it and notify interested
   * callers.
   *
   * @param aWindow {nsIDOMWindow}  The window to process.
   * @param aID {String} Optional.  ID of the new caller that has registered right now.
   */
  _addToListAndNotify(aWindow, aID) {
    openWindowList.add(aWindow);
    aWindow.addEventListener("unload", function() {
      ExtensionSupport._checkAndRunMatchingExtensions(aWindow, "unload");
    }, { once: true });
    ExtensionSupport._checkAndRunMatchingExtensions(aWindow, "load", aID);
  },

  /**
   * Check if the caller matches the given window and run its callback function.
   *
   * @param aWindow {nsIDOMWindow}  The window to run the callbacks on.
   * @param aEventType {String}     Which callback to run if caller matches (load/unload).
   * @param aID {String}            Optional ID of the caller whose callback is to be run.
   *                                If not given, all registered callers are notified.
   */
  _checkAndRunMatchingExtensions(aWindow, aEventType, aID) {
    if (aID) {
      checkAndRunExtensionCode(extensionHooks.get(aID));
    } else {
      for (let extensionHook of extensionHooks.values()) {
        checkAndRunExtensionCode(extensionHook);
      }
    }

    /**
     * Check if the single given caller matches the given window
     * and run its callback function.
     *
     * @param aExtensionHook {Object}  The object describing the hook the caller
     *                                 has registered.
     */
    function checkAndRunExtensionCode(aExtensionHook) {
      let windowChromeURL = aWindow.document.location.href;
      // Check if extension applies to this document URL.
      if (("chromeURLs" in aExtensionHook) &&
          (!aExtensionHook.chromeURLs.some(url => url == windowChromeURL)))
        return;

      // Run the relevant callback.
      switch (aEventType) {
        case "load":
          if ("onLoadWindow" in aExtensionHook)
            aExtensionHook.onLoadWindow(aWindow);
          break;
        case "unload":
          if ("onUnloadWindow" in aExtensionHook)
            aExtensionHook.onUnloadWindow(aWindow);
          break;
      }
    }
  },

  get registeredWindowListenerCount() {
    return extensionHooks.size;
  }
};
