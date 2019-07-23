/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/preferencesBindings.js */

Preferences.forceEnableInstantApply();

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

    var radio = document.createXULElement("radio");
    radio.setAttribute("pane", pane.id);
    radio.setAttribute("value", pane.id);
    radio.setAttribute("label", pane.getAttribute("label"));
    radio.setAttribute("oncommand", `showPane("${pane.id}");`);
    // Expose preference group choice to accessibility APIs as an unchecked list item
    // The parent group is exposed to accessibility APIs as a list
    if (pane.image) {
      radio.setAttribute("src", pane.image);
    }
    radio.style.listStyleImage = pane.style.listStyleImage;
    selector.appendChild(radio);

    setTimeout(function() { pane.dispatchEvent(new CustomEvent("paneload")); }, 1);
  }

  if (prefPanes.length == 1) {
    selector.setAttribute("collapsed", "true");
  }

  window.addEventListener("DOMContentLoaded", function() {
    let lastSelected = document.documentElement.getAttribute("lastSelected");
    if (lastSelected && document.getElementById(lastSelected)) {
      showPane(lastSelected);
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

  let currentlySelected = paneDeck.querySelector("#paneDeck > prefpane[selected]");
  if (currentlySelected) {
    if (currentlySelected == pane) {
      return;
    }
    currentlySelected.removeAttribute("selected");
  }

  selector.value = paneID;
  pane.setAttribute("selected", "true");
  pane.dispatchEvent(new CustomEvent("paneSelected", { bubbles: true }));
  document.getElementById("preferencesContainer").scrollTo(0, 0);

  document.documentElement.setAttribute("lastSelected", paneID);
  Services.xulStore.persist(document.documentElement, "lastSelected");
}

/**
 * Selects the specified preferences pane
 *
 * @param prefWindow          the prefwindow element to operate on
 * @param paneID              ID of prefpane to select
 * @param scrollPaneTo        ID of the element to scroll into view
 * @param otherArgs.subdialog ID of button to activate, opening a subdialog
 */
function selectPrefPane(prefWindow, paneID, scrollPaneTo, otherArgs) {
  if (paneID) {
    let prefPane = document.getElementById(paneID);
    if (getCurrentPaneID() != paneID) {
      showPane(paneID);
    }
    if (scrollPaneTo) {
      showTab(prefPane, scrollPaneTo, otherArgs ? otherArgs.subdialog : undefined);
    }
  }
}

/**
 * Select the specified tab
 *
 * @param pane         prefpane to operate on
 * @param scrollPaneTo ID of the element to scroll into view
 * @param subdialogID  ID of button to activate, opening a subdialog
 */
function showTab(pane, scrollPaneTo, subdialogID) {
  let scrollTarget = document.getElementById(scrollPaneTo);
  if (scrollTarget.closest("groupbox")) {
    scrollTarget = scrollTarget.closest("groupbox");
  }
  scrollTarget.scrollIntoView();
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
  let currentlySelected = paneDeck.querySelector("#paneDeck > prefpane[selected]");
  if (currentlySelected) {
    return currentlySelected.id;
  }
  return null;
}

/**
 * Filter the lastFallbackLocale from availableLocales if it doesn't have all
 * of the needed strings.
 *
 * When the lastFallbackLocale isn't the defaultLocale, then by default only
 * fluent strings are included. To fully use that locale you need the langpack
 * to be installed, so if it isn't installed remove it from availableLocales.
 */
async function getAvailableLocales() {
  let {availableLocales, defaultLocale, lastFallbackLocale} = Services.locale;
  // If defaultLocale isn't lastFallbackLocale, then we still need the langpack
  // for lastFallbackLocale for it to be useful.
  if (defaultLocale != lastFallbackLocale) {
    let lastFallbackId = `langpack-${lastFallbackLocale}@thunderbird.mozilla.org`;
    let lastFallbackInstalled = await AddonManager.getAddonByID(lastFallbackId);
    if (!lastFallbackInstalled) {
      return availableLocales.filter(locale => locale != lastFallbackLocale);
    }
  }
  return availableLocales;
}
