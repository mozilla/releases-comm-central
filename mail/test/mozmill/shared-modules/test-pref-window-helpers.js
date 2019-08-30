/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Helpers to deal with the preferences window.
 */

"use strict";

var MODULE_NAME = "pref-window-helpers";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "content-tab-helpers"];

var utils = ChromeUtils.import("chrome://mozmill/content/modules/utils.jsm");

var fdh;
var cth;

function setupModule() {
  fdh = collector.getModule("folder-display-helpers");
  cth = collector.getModule("content-tab-helpers");
}

function installInto(module) {
  setupModule();

  // Now copy helper functions
  module.open_pref_tab = open_pref_tab;
  module.close_pref_tab = close_pref_tab;
}

/**
 * Open the preferences tab with the given pane displayed. The pane needs to
 * be one of the prefpane ids in mail/components/preferences/aboutPreferences.xul.
 *
 * @param aPaneID The ID of the pref pane to display (see
 *     mail/components/preferences/aboutPreferences.xul for valid IDs.)
 */
function open_pref_tab(aPaneID) {
  let tab = cth.open_content_tab_with_click(
    function() {
      fdh.mc.window.openOptionsDialog(aPaneID);
    },
    "about:preferences",
    fdh.mc,
    "preferencesTab"
  );
  utils.waitFor(
    () => tab.browser.contentWindow.getCurrentPaneID() == aPaneID,
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
