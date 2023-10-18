/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helper functions for use by extensions that should ease them plug
 * into the application.
 */

var extensionHooks = new Map();
var openWindowList;

export var ExtensionSupport = {
  /**
   * Register listening for windows getting opened that will run the specified callback function
   * when a matching window is loaded.
   *
   * @param aID {String} - Some identification of the caller, usually the extension ID.
   * @param aExtensionHook {Object} - The object describing the hook the caller wants to register.
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
   * @returns {boolean} True if the passed arguments were valid and the caller could be registered.
   *                    False otherwise.
   */
  registerWindowListener(aID, aExtensionHook) {
    if (!aID) {
      console.error("No extension ID provided for the window listener");
      return false;
    }

    if (extensionHooks.has(aID)) {
      console.error(
        "Window listener for extension + '" + aID + "' already registered"
      );
      return false;
    }

    if (
      !("onLoadWindow" in aExtensionHook) &&
      !("onUnloadWindow" in aExtensionHook)
    ) {
      console.error(
        "The extension + '" + aID + "' does not provide any callbacks"
      );
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
        ExtensionSupport._checkAndRunMatchingExtensions(domWindow, "load", aID)
      );
    } else {
      openWindowList = new Set();
      // Get the list of windows already open.
      let windows = Services.wm.getEnumerator(null);
      while (windows.hasMoreElements()) {
        let domWindow = windows.getNext();
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
   * @param aID {String} - Some identification of the caller, usually the extension ID.
   *
   * @returns {boolean} True if the passed arguments were valid and the caller could be unregistered.
   *                    False otherwise.
   */
  unregisterWindowListener(aID) {
    if (!aID) {
      console.error("No extension ID provided for the window listener");
      return false;
    }

    let windowListener = extensionHooks.get(aID);
    if (!windowListener) {
      console.error(
        "Couldn't remove window listener for extension + '" + aID + "'"
      );
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

  get openWindows() {
    if (!openWindowList) {
      return [];
    }
    return openWindowList.values();
  },

  _windowListener: {
    // nsIWindowMediatorListener functions
    onOpenWindow(appWindow) {
      // A new window has opened.
      let domWindow = appWindow.docShell.domWindow;

      // Here we pass no caller ID, so all registered callers get notified.
      ExtensionSupport._waitForLoad(domWindow);
    },

    onCloseWindow(appWindow) {
      // One of the windows has closed.
      let domWindow = appWindow.docShell.domWindow;
      openWindowList.delete(domWindow);
    },
  },

  /**
   * Set up listeners to run the callbacks on the given window.
   *
   * @param aWindow {nsIDOMWindow} - The window to set up.
   * @param aID {String} Optional.  ID of the new caller that has registered right now.
   */
  _waitForLoad(aWindow, aID) {
    // Wait for the load event of the window. At that point
    // aWindow.document.location.href will not be "about:blank" any more.
    aWindow.addEventListener(
      "load",
      function () {
        ExtensionSupport._addToListAndNotify(aWindow, aID);
      },
      { once: true }
    );
  },

  /**
   * Once the window is fully loaded with the href referring to the XUL document,
   * add it to our list, attach the "unload" listener to it and notify interested
   * callers.
   *
   * @param aWindow {nsIDOMWindow} - The window to process.
   * @param aID {String} Optional.  ID of the new caller that has registered right now.
   */
  _addToListAndNotify(aWindow, aID) {
    openWindowList.add(aWindow);
    aWindow.addEventListener(
      "unload",
      function () {
        ExtensionSupport._checkAndRunMatchingExtensions(aWindow, "unload");
      },
      { once: true }
    );
    ExtensionSupport._checkAndRunMatchingExtensions(aWindow, "load", aID);
  },

  /**
   * Check if the caller matches the given window and run its callback function.
   *
   * @param aWindow {nsIDOMWindow} - The window to run the callbacks on.
   * @param aEventType {String} - Which callback to run if caller matches (load/unload).
   * @param aID {String} - Optional ID of the caller whose callback is to be run.
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
     * @param aExtensionHook {Object} - The object describing the hook the caller
     *                                 has registered.
     */
    function checkAndRunExtensionCode(aExtensionHook) {
      try {
        let windowChromeURL = aWindow.document.location.href;
        // Check if extension applies to this document URL.
        if (
          "chromeURLs" in aExtensionHook &&
          !aExtensionHook.chromeURLs.some(url => url == windowChromeURL)
        ) {
          return;
        }

        // Run the relevant callback.
        switch (aEventType) {
          case "load":
            if ("onLoadWindow" in aExtensionHook) {
              aExtensionHook.onLoadWindow(aWindow);
            }
            break;
          case "unload":
            if ("onUnloadWindow" in aExtensionHook) {
              aExtensionHook.onUnloadWindow(aWindow);
            }
            break;
        }
      } catch (ex) {
        console.error(ex);
      }
    }
  },

  get registeredWindowListenerCount() {
    return extensionHooks.size;
  },
};
