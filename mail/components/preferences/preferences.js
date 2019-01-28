/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var {ExtensionSupport} = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");

var paneDeck = document.getElementById("paneDeck");
var prefPanes = [...document.getElementsByTagName("prefpane")];
var selector = document.getElementById("selector");

(function() {
  for (let pane of prefPanes) {
    if (pane.id == "paneChat" && !Services.prefs.getBoolPref("mail.chat.enabled")) {
      continue;
    }
    if (pane.id == "paneLightning" &&
        !ExtensionSupport.loadedLegacyExtensions.has("{e2fda1a4-762b-4020-b5ad-a41df1933103}")) {
      continue;
    }

    var radio = document.createElement("radio");
    radio.setAttribute("pane", pane.id);
    radio.setAttribute("value", pane.id);
    radio.setAttribute("label", pane.label);
    radio.setAttribute("oncommand", `showPane("${pane.id}");`);
    // Expose preference group choice to accessibility APIs as an unchecked list item
    // The parent group is exposed to accessibility APIs as a list
    if (pane.image) {
      radio.setAttribute("src", pane.image);
    }
    radio.style.listStyleImage = pane.style.listStyleImage;
    selector.appendChild(radio);

    pane.dispatchEvent(new CustomEvent("paneload"));
    new Function(pane.getAttribute("onpaneload")).call(pane);
  }

  if (prefPanes.length == 1) {
    selector.setAttribute("collapsed", "true");
  }

  window.addEventListener("DOMContentLoaded", function() {
    if (document.documentElement.hasAttribute("lastSelected")) {
      showPane(document.documentElement.getAttribute("lastSelected"));
    } else {
      showPane(prefPanes[0].id);
    }
  });

  document.documentElement.addEventListener("keydown", function(event) {
    if (event.keyCode == KeyEvent.DOM_VK_TAB ||
        event.keyCode == KeyEvent.DOM_VK_UP ||
        event.keyCode == KeyEvent.DOM_VK_DOWN ||
        event.keyCode == KeyEvent.DOM_VK_LEFT ||
        event.keyCode == KeyEvent.DOM_VK_RIGHT) {
      selector.setAttribute("keyboard-navigation", "true");
    }
  });
  selector.addEventListener("mousedown", function() {
    this.removeAttribute("keyboard-navigation");
  });
})();

/**
 * Actually switches to the specified pane, fires events, and remembers the pane.
 *
 * @param paneID ID of the prefpane to select
 */
function showPane(paneID) {
  if (!paneID) {
    return;
  }

  let pane = document.getElementById(paneID);
  if (!pane) {
    return;
  }

  selector.value = paneID;
  paneDeck.selectedPanel = pane;
  pane.dispatchEvent(new CustomEvent("paneSelected", { bubbles: true }));

  document.documentElement.setAttribute("lastSelected", paneID);
  Services.xulStore.persist(document.documentElement, "lastSelected");
}

/**
 * Selects the specified preferences pane
 *
 * @param prefWindow          the prefwindow element to operate on
 * @param paneID              ID of prefpane to select
 * @param tabID               ID of tab to select on the prefpane
 * @param otherArgs.subdialog ID of button to activate, opening a subdialog
 */
function selectPaneAndTab(prefWindow, paneID, tabID, otherArgs) {
  if (paneID) {
    let prefPane = document.getElementById(paneID);
    let tabOnEvent = false;
    // The prefwindow element selects the pane specified in window.arguments[0]
    // automatically. But let's check it and if the prefs window was already
    // open, the current prefpane may not be the wanted one.
    if (getCurrentPaneID() != prefPane.id) {
      if (tabID && !prefPane.loaded) {
        prefPane.addEventListener("paneload", function() {
          showTab(prefPane, tabID);
        }, {once: true});
        tabOnEvent = true;
      }
      showPane(prefPane.id);
    }
    if (tabID && !tabOnEvent) {
      showTab(prefPane, tabID, otherArgs ? otherArgs.subdialog : undefined);
    }
  }
}

/**
 * Select the specified tab
 *
 * @param pane         prefpane to operate on
 * @param tabID        ID of tab to select on the prefpane
 * @param subdialogID  ID of button to activate, opening a subdialog
 */
function showTab(pane, tabID, subdialogID) {
  pane.querySelector("tabbox").selectedTab = document.getElementById(tabID);
  if (subdialogID) {
    setTimeout(function() {
      document.getElementById(subdialogID).click();
    });
  }
}

/**
 * Get the ID of the current pane.
 */
function getCurrentPaneID() {
  return paneDeck.selectedPanel.id;
}
