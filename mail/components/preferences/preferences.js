/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
ChromeUtils.import("resource:///modules/MailServices.jsm");
ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");

window.addEventListener("load", function() {
  let prefWindow = document.getElementById("MailPreferences");
  if (!Services.prefs.getBoolPref("mail.chat.enabled")) {
    let radio =
      document.getAnonymousElementByAttribute(prefWindow, "pane", "paneChat");
    if (radio.selected)
      prefWindow.showPane(document.getElementById("paneGeneral"));
    radio.hidden = true;
  }
  if (!ExtensionSupport.loadedLegacyExtensions.has("{e2fda1a4-762b-4020-b5ad-a41df1933103}")) {
    let radio =
      document.getAnonymousElementByAttribute(prefWindow, "pane", "paneLightning");
    if (radio.selected)
      prefWindow.showPane(document.getElementById("paneGeneral"));
    radio.hidden = true;
  }

  let categories = prefWindow._selector;
  document.documentElement.addEventListener("keydown", function(event) {
    if (event.keyCode == KeyEvent.DOM_VK_TAB ||
        event.keyCode == KeyEvent.DOM_VK_UP ||
        event.keyCode == KeyEvent.DOM_VK_DOWN ||
        event.keyCode == KeyEvent.DOM_VK_LEFT ||
        event.keyCode == KeyEvent.DOM_VK_RIGHT) {
      categories.setAttribute("keyboard-navigation", "true");
    }
  });
  categories.addEventListener("mousedown", function() {
    this.removeAttribute("keyboard-navigation");
  });
});

/**
 * Selects the specified preferences pane
 *
 * @param prefWindow    the prefwindow element to operate on
 * @param aPaneID       ID of prefpane to select
 * @param aTabID        ID of tab to select on the prefpane
 * @param aSubdialogID  ID of button to activate, opening a subdialog
 */
function selectPaneAndTab(prefWindow, aPaneID, aTabID, aSubdialogID) {
  if (aPaneID) {
    let prefPane = document.getElementById(aPaneID);
    let tabOnEvent = false;
    // The prefwindow element selects the pane specified in window.arguments[0]
    // automatically. But let's check it and if the prefs window was already
    // open, the current prefpane may not be the wanted one.
    if (prefWindow.currentPane.id != prefPane.id) {
      if (aTabID && !prefPane.loaded) {
        prefPane.addEventListener("paneload", function() {
          showTab(prefPane, aTabID);
        }, {once: true});
        tabOnEvent = true;
      }
      prefWindow.showPane(prefPane);
    }
    if (aTabID && !tabOnEvent)
      showTab(prefPane, aTabID, aSubdialogID);
  }
}

/**
 * Select the specified tab
 *
 * @param aPane         prefpane to operate on
 * @param aTabID        ID of tab to select on the prefpane
 * @param aSubdialogID  ID of button to activate, opening a subdialog
 */
function showTab(aPane, aTabID, aSubdialogID) {
  aPane.querySelector("tabbox").selectedTab = document.getElementById(aTabID);
  if (aSubdialogID)
    setTimeout(function() { document.getElementById(aSubdialogID).click(); }, 0);
}

/**
 * Get the ID of the current pane.
 */
function getCurrentPaneID() {
  let prefWindow = document.getElementById("MailPreferences");
  return prefWindow.currentPane ? prefWindow.currentPane.id : null;
}
