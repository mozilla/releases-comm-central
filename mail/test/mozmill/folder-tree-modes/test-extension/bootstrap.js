/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Services.jsm");

function install() {}

function uninstall() {}

function startup(data, reason) {
  // Wait for any new windows to open.
  Services.wm.addListener(WindowListener);

  // Get the list of windows already open.
  let windows = Services.wm.getEnumerator(null);
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);

    if (domWindow.document.location.href === "about:blank") {
      // A window is available, but it's not yet fully loaded.
      // Add an event listener to fire when the window is completely loaded.
      domWindow.addEventListener("load", function() {
        setupAddon(domWindow);
      }, { once: true });
    }
    else {
      setupAddon(domWindow);
    }
  }
}

function shutdown(data, reason) {
  // Just ignore shutdowns.
}

function setupAddon(domWindow) {
  function setupTestMode(aWin) {
    let testFolderTreeMode = {
      __proto__: aWin.IFolderTreeMode,
      generateMap: function(aFTV) {
        ChromeUtils.import("resource:///modules/mailServices.js");
        // Pick the tinderbox@foo.invalid inbox and use it as the only folder
        let server = MailServices.accounts.FindServer("tinderbox", "tinderbox123", "pop3");
        let item = new aWin.ftvItem(server.rootFolder.getChildNamed("Inbox"));
        item.__defineGetter__("children", () => []);
        return [item];
      },
    };

    aWin.gFolderTreeView.registerFolderTreeMode("testmode", testFolderTreeMode,
                                                "Test Mode");
  }

  if (domWindow.document.location.href == "chrome://messenger/content/messenger.xul") {
    setupTestMode(domWindow);
  }
}

var WindowListener = {
  tearDownUI: function(window) {},

  // nsIWindowMediatorListener functions
  onOpenWindow: function(xulWindow) {
    // A new window has opened.
    let domWindow = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);
    // Wait for it to finish loading.
    domWindow.addEventListener("load", function listener() {
      setupAddon(domWindow);
    }, { once: true });
  },

  onCloseWindow: function(xulWindow) {},

  onWindowTitleChange: function(xulWindow, newTitle) {}
}
