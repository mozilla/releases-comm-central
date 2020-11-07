/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Helpers to deal with the preferences tab.
 */

"use strict";

const EXPORTED_SYMBOLS = ["close_pref_tab", "open_pref_tab"];

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var fdh = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var cth = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);

/**
 * Open the preferences tab with the given pane displayed. The pane needs to
 * be one of the prefpane ids in mail/components/preferences/preferences.xhtml.
 *
 * @param aPaneID The ID of the pref pane to display (see
 *     mail/components/preferences/preferences.xhtml for valid IDs.)
 */
function open_pref_tab(aPaneID, aScrollTo) {
  let tab = cth.open_content_tab_with_click(
    function() {
      fdh.mc.window.openOptionsDialog(aPaneID, aScrollTo);
    },
    "about:preferences",
    fdh.mc,
    "preferencesTab"
  );
  utils.waitFor(
    () => tab.browser.contentWindow.gLastCategory.category == aPaneID,
    "Timed out waiting for prefpane " + aPaneID + " to load."
  );
  return tab;
}

/**
 * Close the preferences tab.
 *
 * @param aTab  The content tab to close.
 */
function close_pref_tab(aTab) {
  fdh.mc.tabmail.closeTab(aTab);
}
