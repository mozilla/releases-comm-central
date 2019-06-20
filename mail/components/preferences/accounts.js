/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../../mailnews/base/prefs/content/AccountManager.js */

var gAccountsPane = {
  paneSelectionChanged(event) {
    if (event.detail.newPane == "paneAccount") {
      if (!document.getElementById("account-tree-children").hasChildNodes()) {
        // Only load the account tree when the pane is first shown.
        onLoad();
      }
    }
    if (event.detail.oldPane == "paneAccount") {
      onAccept(false);
    }
  },

  unload() {
    onAccept(false);
    onUnload();
  },
};

window.addEventListener("paneSelected", gAccountsPane.paneSelectionChanged);
window.addEventListener("unload", () => gAccountsPane.unload());
