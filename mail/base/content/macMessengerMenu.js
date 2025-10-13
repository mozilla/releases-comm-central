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
 * Show the Dock Options sub-dialog hanging from the Preferences window.
 * If Preference window was already opened, this will select General pane before
 * opening Dock Options sub-dialog.
 */
async function openDockOptions() {
  const win = await openOptionsDialog("paneGeneral");
  win.gSubDialog.open(
    "chrome://messenger/content/preferences/dockoptions.xhtml"
  );
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
