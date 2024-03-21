/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from mailCore.js */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

// Load and add the menu item to the OS X Dock icon menu.
addEventListener(
  "load",
  function () {
    const dockMenuElement = document.getElementById("menu_mac_dockmenu");
    const nativeMenu = Cc[
      "@mozilla.org/widget/standalonenativemenu;1"
    ].createInstance(Ci.nsIStandaloneNativeMenu);

    nativeMenu.init(dockMenuElement);

    const dockSupport = Cc["@mozilla.org/widget/macdocksupport;1"].getService(
      Ci.nsIMacDockSupport
    );
    dockSupport.dockMenu = nativeMenu;
  },
  false
);

/**
 * When the Preferences window is actually loaded, this Listener is called.
 * Not doing this way could make DOM elements not available.
 */
function loadListener(event) {
  setTimeout(function () {
    const prefWin = Services.wm.getMostRecentWindow("Mail:Preferences");
    prefWin.gSubDialog.open(
      "chrome://messenger/content/preferences/dockoptions.xhtml"
    );
  });
}

/**
 * When the Preferences window is opened/closed, this observer will be called.
 * This is done so subdialog opens as a child of it.
 */
function PrefWindowObserver() {
  this.observe = function (aSubject, aTopic, aData) {
    if (aTopic == "domwindowopened") {
      aSubject.addEventListener("load", loadListener, {
        capture: false,
        once: true,
      });
    }
    Services.ww.unregisterNotification(this);
  };
}

/**
 * Show the Dock Options sub-dialog hanging from the Preferences window.
 * If Preference window was already opened, this will select General pane before
 * opening Dock Options sub-dialog.
 */
function openDockOptions() {
  const win = Services.wm.getMostRecentWindow("Mail:Preferences");

  if (win) {
    openOptionsDialog("paneGeneral");
    win.gSubDialog("chrome://messenger/content/preferences/dockoptions.xhtml");
  } else {
    Services.ww.registerNotification(new PrefWindowObserver());
    openOptionsDialog("paneGeneral");
  }
}

/**
 * Open a new window for writing a new message
 */
function writeNewMessageDock() {
  // Default identity will be used as sender for the new message.
  MailServices.compose.OpenComposeWindow(
    null,
    null,
    null,
    Ci.nsIMsgCompType.New,
    Ci.nsIMsgCompFormat.Default,
    null,
    null,
    null
  );
}

/**
 * Open the address book window
 */
function openAddressBookDock() {
  toAddressBook();
}
