/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/preferencesBindings.js */
/* import-globals-from general.js */
/* import-globals-from compose.js */
/* import-globals-from downloads.js */
/* import-globals-from privacy.js */
/* import-globals-from chat.js */
/* import-globals-from subdialogs.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);
var { calendarDeactivator } = ChromeUtils.import(
  "resource:///modules/calendar/calCalendarDeactivator.jsm"
);

var paneDeck = document.getElementById("paneDeck");
var defaultPane = "paneGeneral";

ChromeUtils.defineModuleGetter(
  this,
  "AddonManager",
  "resource://gre/modules/AddonManager.jsm"
);

document.addEventListener("DOMContentLoaded", init, { once: true });

function init() {
  Preferences.forceEnableInstantApply();

  gSubDialog.init();
  gGeneralPane.init();
  gComposePane.init();
  gPrivacyPane.init();
  if (Services.prefs.getBoolPref("mail.chat.enabled")) {
    gChatPane.init();
  } else {
    // Remove the pane from the DOM so it doesn't get incorrectly included in
    // the search results.
    document.getElementById("paneChat").remove();
  }

  // If no calendar is currently enabled remove it from the DOM so it doesn't
  // get incorrectly included in the search results.
  if (!calendarDeactivator.isCalendarActivated) {
    document.getElementById("paneLightning").remove();
    document.getElementById("category-calendar").remove();
  }

  Preferences.addSyncFromPrefListener(
    document.getElementById("saveWhere"),
    () => gDownloadDirSection.onReadUseDownloadDir()
  );

  let categories = document.getElementById("categories");
  categories.addEventListener("select", event => {
    showPane(event.target.value);
  });

  document.documentElement.addEventListener("keydown", event => {
    if (event.keyCode == KeyEvent.DOM_VK_TAB) {
      categories.setAttribute("keyboard-navigation", "true");
    }
  });
  categories.addEventListener("mousedown", function() {
    this.removeAttribute("keyboard-navigation");
  });

  let lastSelected = document.documentElement.getAttribute("lastSelected");
  if (
    lastSelected &&
    lastSelected != defaultPane &&
    document.getElementById(lastSelected)
  ) {
    categories.selectedItem = categories.querySelector(
      ".category[value=" + lastSelected + "]"
    );
  } else {
    showPane(defaultPane);
  }
}

/**
 * Actually switches to the specified pane, fires events, and remembers the pane.
 *
 * @param paneID ID of the prefpane to select
 */
function showPane(paneID) {
  let pane = document.getElementById(paneID);
  if (!pane) {
    return;
  }

  let currentlySelected = paneDeck.querySelector(
    "#paneDeck > prefpane[selected]"
  );

  if (currentlySelected) {
    if (currentlySelected == pane) {
      return;
    }
    currentlySelected.removeAttribute("selected");
  }

  pane.setAttribute("selected", "true");
  pane.dispatchEvent(new CustomEvent("paneSelected", { bubbles: true }));
  document.getElementById("preferencesContainer").scrollTo(0, 0);

  document.documentElement.setAttribute("lastSelected", paneID);
  Services.xulStore.persist(document.documentElement, "lastSelected");
}

/**
 * Selects the specified preferences pane
 *
 * @param paneID              ID of prefpane to select
 * @param scrollPaneTo        ID of the element to scroll into view
 * @param otherArgs.subdialog ID of button to activate, opening a subdialog
 */
function selectPrefPane(paneID, scrollPaneTo, otherArgs) {
  if (paneID) {
    let prefPane = document.getElementById(paneID);
    if (getCurrentPaneID() != paneID) {
      showPane(paneID);
    }
    if (scrollPaneTo) {
      showTab(
        prefPane,
        scrollPaneTo,
        otherArgs ? otherArgs.subdialog : undefined
      );
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
  setTimeout(function() {
    let scrollTarget = document.getElementById(scrollPaneTo);
    if (scrollTarget.closest("groupbox")) {
      scrollTarget = scrollTarget.closest("groupbox");
    }
    scrollTarget.scrollIntoView();
    if (subdialogID) {
      document.getElementById(subdialogID).click();
    }
  });
}

/**
 * Get the ID of the current pane.
 */
function getCurrentPaneID() {
  let currentlySelected = paneDeck.querySelector(
    "#paneDeck > prefpane[selected]"
  );
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
  let { availableLocales, defaultLocale, lastFallbackLocale } = Services.locale;
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
