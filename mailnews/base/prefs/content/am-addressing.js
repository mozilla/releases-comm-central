/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from am-prefs.js */
/* import-globals-from amUtils.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

function onLoad() {
  parent.onPanelLoaded("am-addressing.xul");
}

function onInit(aPageId, aServerId) {
  onInitCompositionAndAddressing();
}

function onInitCompositionAndAddressing() {
  LDAPenabling();
  quoteEnabling();
}

function onEditDirectories() {
  window.openDialog(
    "chrome://messenger/content/addressbook/pref-editdirectories.xul",
    "editDirectories",
    "chrome,modal=yes,resizable=no",
    null
  );
}

function onPreInit(account, accountValues) {}

function LDAPenabling() {
  onCheckItem("identity.directoryServer", ["directories"]);
  onCheckItem("editButton", ["directories"]);
}

function quoteEnabling() {
  var placebox = document.getElementById("placeBox");

  if (document.getElementById("identity.replyOnTop").value == "1") {
    placebox.firstChild.removeAttribute("disabled");
    placebox.lastChild.removeAttribute("disabled");
  } else {
    placebox.firstChild.setAttribute("disabled", "true");
    placebox.lastChild.setAttribute("disabled", "true");
  }
}

/**
 * Open the Preferences dialog on the tab with Addressing options.
 */
function showGlobalAddressingPrefs() {
  openPrefsFromAccountManager(
    "paneCompose",
    "compositionAddressingCategory",
    null,
    "addressing_pane"
  );
}

/**
 * Open the Preferences dialog on the tab with Composing options.
 */
function showGlobalComposingPrefs() {
  openPrefsFromAccountManager(
    "paneCompose",
    null,
    null,
    "composing_messages_pane"
  );
}
