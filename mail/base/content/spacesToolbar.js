/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/* import-globals-from msgMail3PaneWindow.js */
/* import-globals-from mailCore.js */

/**
 * Special vertical toolbar to organize all the buttons opening a tab.
 */
var gSpacesToolbar = {
  isLoaded: false,
  isHidden: false,
  prefFile: "spacesToolbar.json",

  tabMonitor: {
    monitorName: "spacesToolbarMonitor",

    onTabTitleChanged() {},
    onTabOpened() {},
    onTabPersist() {},
    onTabRestored() {},
    onTabClosing() {},

    onTabSwitched(newTab, oldTab) {
      // Bail out if for whatever reason something went wrong.
      if (!newTab) {
        Cu.reportError(
          "Spaces Toolbar: Missing new tab on monitored tab switching"
        );
        return;
      }

      for (let button of document.querySelectorAll(".spaces-toolbar-button")) {
        button.classList.remove("current");
      }

      let buttonID;
      switch (newTab.mode.name) {
        case "folder":
          buttonID = "mailButton";
          break;
        case "chat":
          buttonID = "chatButton";
          break;
        case "calendar":
          buttonID = "calendarButton";
          break;
        case "tasks":
          buttonID = "tasksButton";
          break;
        case "contentTab":
          buttonID = null;
          // Find which tab is actually open.
          document.getElementById("tabmail");
          let tab = document
            .getElementById("tabmail")
            .getTabForBrowser(newTab.browser);

          if (tab?.urlbar?.value == "about:addressbook") {
            buttonID = "addressBookButton";
          }
          break;
        case "preferencesTab":
          buttonID = "settingsButton";
          break;

        default:
          buttonID = null;
          break;
      }

      if (buttonID) {
        document.getElementById(buttonID).classList.add("current");
      }
    },
  },

  onLoad() {
    if (this.isLoaded) {
      return;
    }

    this.setupEventListeners();
    this.toggleToolbar(
      Services.xulStore.getValue(
        "chrome://messenger/content/messenger.xhtml",
        "spacesToolbar",
        "hidden"
      ) == "true"
    );

    // The tab monitor will inform us when a different tab is selected.
    document.getElementById("tabmail").registerTabMonitor(this.tabMonitor);

    this.isLoaded = true;
    // Update the window UI after the spaces toolbar has been loaded.
    this.updateUI(
      document.documentElement.getAttribute("tabsintitlebar") == "true"
    );
  },

  setupEventListeners() {
    // Prevent buttons from stealing the focus on click since the focus is
    // handled when a specific tab is opened of switched to.
    for (let button of document.querySelectorAll(".spaces-toolbar-button")) {
      button.onmousedown = event => event.preventDefault();
    }

    document.getElementById("mailButton").addEventListener("click", () => {
      switchToMailTab();
    });

    document
      .getElementById("addressBookButton")
      .addEventListener("click", () => {
        toAddressBook();
      });

    document.getElementById("calendarButton").addEventListener("click", () => {
      switchToCalendarTab();
    });

    document.getElementById("tasksButton").addEventListener("click", () => {
      switchToTasksTab();
    });

    document.getElementById("chatButton").addEventListener("click", () => {
      showChatTab();
    });

    document.getElementById("settingsButton").addEventListener("click", () => {
      openOptionsDialog();
    });

    document.getElementById("collapseButton").addEventListener("click", () => {
      this.toggleToolbar(true);
    });
  },

  /**
   * Toggle the spaces toolbar and toolbar buttons visibility.
   *
   * @param {boolean} state - The visibility state to update the elements.
   */
  toggleToolbar(state) {
    this.isHidden = state;
    document.getElementById("spacesToolbar").hidden = state;
    // Update the window UI after the visibility state of the spaces toolbar
    // has changed.
    this.updateUI(
      document.documentElement.getAttribute("tabsintitlebar") == "true"
    );
  },

  toggleToolbarFromMenu() {
    this.toggleToolbar(!this.isHidden);
  },

  /**
   * Update the main navigation toolbox alignment to guarantee proper window UI
   * styling on Linux distros that support CSD.
   *
   * @param {boolean} tabsInTitlebar - If the UI currently has tabs in titlebar.
   */
  updateUI(tabsInTitlebar) {
    // Interrupt if the spaces toolbar isn't loaded yet.
    if (!this.isLoaded) {
      return;
    }

    // Toggle the window attribute for those CSS selectors that need it.
    if (this.isHidden) {
      document.documentElement.removeAttribute("spacestoolbar");
    } else {
      document.documentElement.setAttribute("spacestoolbar", "true");
    }

    // Reset the style whenever something changes.
    this.resetInlineStyle();

    // Don't do anything else if the toolbar is hidden or we're on macOS.
    if (this.isHidden || AppConstants.platform == "macosx") {
      return;
    }

    // Add inline margin to the tabmail-tabs or the navigation-toolbox to
    // account for the spaces toolbar.
    let size = document.getElementById("spacesToolbar").getBoundingClientRect()
      .width;
    let style = `margin-inline-start: ${size}px;`;
    let menubar = document.getElementById("toolbar-menubar");
    let elementId =
      tabsInTitlebar &&
      menubar.getAttribute("autohide") &&
      menubar.getAttribute("inactive")
        ? "navigation-toolbox"
        : "tabmail-tabs";
    document.getElementById(elementId).setAttribute("style", style);
  },

  resetInlineStyle() {
    document.getElementById("tabmail-tabs").removeAttribute("style");
    document.getElementById("navigation-toolbox").removeAttribute("style");
  },

  /**
   * Update the spacesToolbar UI and adjacent tabs exclusively for macOS. This
   * is necessary mostly to tackle the changes when switching fullscreen mode.
   */
  updateUImacOS() {
    // No need to to anything if we're not on macOS.
    if (AppConstants.platform != "macosx") {
      return;
    }

    // Add inline styling to the tabmail tabs only if we're on macOS and the
    // app is in full screen mode.
    if (window.fullScreen) {
      let size = document
        .getElementById("spacesToolbar")
        .getBoundingClientRect().width;
      let style = `margin-inline-start: ${size}px;`;
      document.getElementById("tabmail-tabs").setAttribute("style", style);
      return;
    }

    // Reset the style if we exited full screen mode.
    this.resetInlineStyle();
  },

  /**
   * Save the preferred state when the app is closed.
   */
  onUnload() {
    Services.xulStore.setValue(
      "chrome://messenger/content/messenger.xhtml",
      "spacesToolbar",
      "hidden",
      this.isHidden
    );
  },
};
