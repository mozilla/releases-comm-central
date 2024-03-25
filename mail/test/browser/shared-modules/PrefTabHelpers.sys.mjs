/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Helpers to deal with the preferences tab.
 */

import { mc } from "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs";

import { open_content_tab_with_click } from "resource://testing-common/mail/ContentTabHelpers.sys.mjs";

import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

/**
 * Open the preferences tab with the given pane displayed. The pane needs to
 * be one of the prefpane ids in mail/components/preferences/preferences.xhtml.
 *
 * @param aPaneID The ID of the pref pane to display (see
 *     mail/components/preferences/preferences.xhtml for valid IDs.)
 */
export async function open_pref_tab(aPaneID, aScrollTo) {
  const tab = await open_content_tab_with_click(
    function () {
      mc.openOptionsDialog(aPaneID, aScrollTo);
    },
    "about:preferences",
    "preferencesTab"
  );
  await TestUtils.waitForCondition(
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
export function close_pref_tab(aTab) {
  mc.document.getElementById("tabmail").closeTab(aTab);
}
