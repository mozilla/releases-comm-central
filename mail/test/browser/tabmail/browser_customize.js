/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests customization features of the tabs toolbar.
 */

"use strict";

const { close_popup, wait_for_popup_to_open } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

const { click_through_appmenu } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

const { promise_element_visible, promise_element_invisible } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/DOMHelpers.sys.mjs"
  );

add_setup(function () {
  Services.prefs.setBoolPref("mail.tabs.autoHide", false);
});

registerCleanupFunction(function () {
  // Let's reset any and all of our changes to the toolbar
  Services.prefs.clearUserPref("mail.tabs.autoHide");
});

/**
 * Test that we can access the unified toolbar by clicking
 * customize on the toolbar context menu
 */
add_task(async function test_open_unified_by_context() {
  // First, ensure that the context menu is closed.
  const contextPopup = document.getElementById("toolbar-context-menu");
  Assert.notEqual(
    contextPopup.state,
    "open",
    "Context menu is currently open!"
  );

  // Right click on the tab bar.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("tabmail-tabs"),
    { type: "contextmenu" },
    window
  );

  // Ensure that the popup opened.
  await wait_for_popup_to_open(contextPopup);
  Assert.equal(contextPopup.state, "open", "Context menu was not opened!");

  const customizeButton = document.getElementById("CustomizeMailToolbar");
  // Click customize.
  contextPopup.activateItem(customizeButton);

  // Wait for hidden css attribute on unified toolbar
  // customization to be removed.
  await promise_element_visible(window, "unifiedToolbarCustomizationContainer");

  // Ensure messengerWindow (HTML element) has customizingUnifiedToolbar class,
  // which means unified toolbar customization should be open.
  Assert.ok(
    document
      .getElementById("messengerWindow")
      .classList.contains("customizingUnifiedToolbar"),
    "customizingUnifiedToolbar class not found on messengerWindow element"
  );

  // Click cancel.
  const cancelButton = document.getElementById(
    "unifiedToolbarCustomizationCancel"
  );
  cancelButton.click();

  // Wait for hidden css attribute on Unified Toolbar
  // customization to be added.
  await promise_element_invisible(
    window,
    "unifiedToolbarCustomizationContainer"
  );

  await close_popup(window, contextPopup);
});

/**
 * Test that we can access the unified toolbar customization by clicking
 * the toolbar layout menu option
 */
add_task(async function test_open_unified_by_menu() {
  // First, ensure that the menu is closed.
  const appMenu = document.getElementById("appMenu-popup");
  Assert.notEqual(
    appMenu.getAttribute("panelopen"),
    "true",
    "appMenu-popup is currently open!"
  );

  // Click through app menu to view unified toolbar.
  await click_through_appmenu(
    [{ id: "appmenu_View" }, { id: "appmenu_Toolbars" }],
    { id: "appmenu_toolbarLayout" },
    window
  );

  // Wait for hidden css attribute on unified toolbar
  // customization to be removed.
  await promise_element_visible(window, "unifiedToolbarCustomizationContainer");

  // Ensure messengerWindow (HTML element) has customizingUnifiedToolbar class,
  // which means unified toolbar customization should be open.
  Assert.ok(
    document
      .getElementById("messengerWindow")
      .classList.contains("customizingUnifiedToolbar"),
    "customizingUnifiedToolbar class not found on messengerWindow element"
  );

  // Click cancel.
  const cancelButton = document.getElementById(
    "unifiedToolbarCustomizationCancel"
  );
  cancelButton.click();

  // Wait for hidden css attribute on unified toolbar
  // customization to be added.
  await promise_element_invisible(
    window,
    "unifiedToolbarCustomizationContainer"
  );

  await close_popup(window, appMenu);
});
