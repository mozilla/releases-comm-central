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

  /**
   * @callback TabInSpace
   * @param {Object} tabInfo - The tabInfo object (a member of tabmail.tabInfo)
   *   for the tab.
   * @return {0|1|2} - The relation between the tab and the space. 0 means it
   *   does not belong to the space. 1 means it is a primary tab of the space.
   *   2 means it is a secondary tab of the space.
   */
  /**
   * @callback OpenSpace
   * @param {"tab"|"window"} where - Where to open the space: in a new tab or in
   *   a new window.
   * @return {?Object|Window} - The tabInfo for the newly opened tab, or the
   *   newly opened messenger window, or null if neither was created.
   */
  /**
   * Data and methods for a space.
   *
   * @typedef {Object} SpaceInfo
   * @property {string} name - The name for this space.
   * @property {boolean} allowMultipleTabs - Whether to allow the user to open
   *   multiple tabs in this space.
   * @property {HTMLButtonElement} button - The toolbar button for this space.
   * @property {TabInSpace} tabInSpace - A callback that determines whether an
   *   existing tab is considered outside this space, a primary tab of this
   *   space (a tab that is similar to the tab created by the open method) or
   *   a secondary tab of this space (a related tab that still belongs to this
   *   space).
   * @property {OpenSpace} open - A callback to open this space.
   */
  /**
   * The main spaces in this toolbar. This will be constructed on load.
   *
   * @type {?SpaceInfo[]}
   */
  spaces: null,
  /**
   * The current space the window is in, or undefined if it is not in any of the
   * known spaces.
   *
   * @type {SpaceInfo|undefined}
   */
  currentSpace: undefined,

  tabMonitor: {
    monitorName: "spacesToolbarMonitor",

    onTabTitleChanged() {},
    onTabOpened() {},
    onTabPersist() {},
    onTabRestored() {},
    onTabClosing() {},

    onTabSwitched(newTabInfo, oldTabInfo) {
      // Bail out if for whatever reason something went wrong.
      if (!newTabInfo) {
        Cu.reportError(
          "Spaces Toolbar: Missing new tab on monitored tab switching"
        );
        return;
      }

      let tabSpace = gSpacesToolbar.spaces.find(space =>
        space.tabInSpace(newTabInfo)
      );
      if (gSpacesToolbar.currentSpace != tabSpace) {
        gSpacesToolbar.currentSpace?.button.classList.remove("current");
        gSpacesToolbar.currentSpace = tabSpace;
        gSpacesToolbar.currentSpace?.button.classList.add("current");
      }
    },
  },

  onLoad() {
    if (this.isLoaded) {
      return;
    }

    let tabmail = document.getElementById("tabmail");

    this.spaces = [
      {
        name: "mail",
        button: document.getElementById("mailButton"),
        tabInSpace(tabInfo) {
          switch (tabInfo.mode.name) {
            case "folder":
            case "mail3PaneTab":
              return 1;
            default:
              return 0;
          }
        },
        open(where) {
          // Prefer the current tab, else the earliest tab.
          let existingTab = [tabmail.currentTabInfo, ...tabmail.tabInfo].find(
            tabInfo => this.tabInSpace(tabInfo) == 1
          );
          let folderURI = null;
          switch (existingTab?.mode.name) {
            case "folder":
              folderURI =
                existingTab.folderDisplay.displayedFolder?.URI || null;
              break;
            case "mail3PaneTab":
              folderURI = existingTab.folderURI || null;
              break;
          }
          if (where == "window") {
            return window.openDialog(
              "chrome://messenger/content/messenger.xhtml",
              "_blank",
              "chrome,dialog=no,all",
              folderURI,
              -1
            );
          }
          if (Services.prefs.getBoolPref("mail.useNewMailTabs")) {
            return openTab("mail3PaneTab", { folderURI }, "tab");
          }
          return openTab(
            "folder",
            {
              folder: folderURI ? MailUtils.getExistingFolder(folderURI) : null,
            },
            "tab"
          );
        },
        allowMultipleTabs: true,
      },
      {
        name: "addressbook",
        button: document.getElementById("addressBookButton"),
        // If "mail.addr_book.useNewAddressBook" is not true, then the
        // addressbook will never belong to a tab, so we only need to test for
        // the new addressbook.
        tabInSpace(tabInfo) {
          if (
            tabInfo.mode.name == "contentTab" &&
            tabInfo.urlbar?.value == "about:addressbook"
          ) {
            return 1;
          }
          return 0;
        },
        open(where) {
          if (Services.prefs.getBoolPref("mail.addr_book.useNewAddressBook")) {
            return openContentTab("about:addressbook", where);
          }
          // Else, ignore the "where" argument since we can only open a dialog.
          toOpenWindowByType(
            "mail:addressbook",
            "chrome://messenger/content/addressbook/addressbook.xhtml"
          );
          // Didn't open either a tab or a messenger window.
          return null;
        },
      },
      {
        name: "calendar",
        button: document.getElementById("calendarButton"),
        tabInSpace(tabInfo) {
          return tabInfo.mode.name == "calendar" ? 1 : 0;
        },
        open(where) {
          return openTab("calendar", {}, where);
        },
      },
      {
        name: "tasks",
        button: document.getElementById("tasksButton"),
        tabInSpace(tabInfo) {
          return tabInfo.mode.name == "tasks" ? 1 : 0;
        },
        open(where) {
          return openTab("tasks", {}, where);
        },
      },
      {
        name: "chat",
        button: document.getElementById("chatButton"),
        tabInSpace(tabInfo) {
          return tabInfo.mode.name == "chat" ? 1 : 0;
        },
        open(where) {
          return openTab("chat", {}, where);
        },
      },
      {
        name: "settings",
        button: document.getElementById("settingsButton"),
        tabInSpace(tabInfo) {
          switch (tabInfo.mode.name) {
            case "preferencesTab":
              // A primary tab that the open method creates.
              return 1;
            case "contentTab":
              let url = tabInfo.urlbar?.value;
              if (url == "about:accountsettings" || url == "about:addons") {
                // A secondary tab, that is related to this space.
                return 2;
              }
          }
          return 0;
        },
        open(where) {
          return openTab("preferencesTab", { url: "about:preferences" }, where);
        },
      },
    ];

    this.setupEventListeners();
    this.toggleToolbar(
      Services.xulStore.getValue(
        "chrome://messenger/content/messenger.xhtml",
        "spacesToolbar",
        "hidden"
      ) == "true"
    );

    // The tab monitor will inform us when a different tab is selected.
    tabmail.registerTabMonitor(this.tabMonitor);

    this.isLoaded = true;
    // Update the window UI after the spaces toolbar has been loaded.
    this.updateUI(
      document.documentElement.getAttribute("tabsintitlebar") == "true"
    );
  },

  setupEventListeners() {
    // Prevent buttons from stealing the focus on click since the focus is
    // handled when a specific tab is opened or switched to.
    for (let button of document.querySelectorAll(".spaces-toolbar-button")) {
      button.onmousedown = event => event.preventDefault();
    }

    let tabmail = document.getElementById("tabmail");
    let contextMenu = document.getElementById("spacesContextMenu");
    let newTabItem = document.getElementById("spacesContextNewTabItem");
    let newWindowItem = document.getElementById("spacesContextNewWindowItem");
    let separator = document.getElementById("spacesContextMenuSeparator");

    // The space that we (last) opened the context menu for, which we share
    // between methods.
    let contextSpace;
    newTabItem.addEventListener("command", () => contextSpace.open("tab"));
    newWindowItem.addEventListener("command", () =>
      contextSpace.open("window")
    );

    let settingsContextMenu = document.getElementById("settingsContextMenu");
    document
      .getElementById("settingsContextOpenSettingsItem")
      .addEventListener("command", () =>
        openTab("preferencesTab", { url: "about:preferences" })
      );
    document
      .getElementById("settingsContextOpenAccountSettingsItem")
      .addEventListener("command", () =>
        openTab("contentTab", { url: "about:accountsettings" })
      );
    document
      .getElementById("settingsContextOpenAddonsItem")
      .addEventListener("command", () =>
        openTab("contentTab", { url: "about:addons" })
      );

    for (let space of this.spaces) {
      space.button.addEventListener("click", () => {
        // Find the earliest primary tab that belongs to this space.
        let existing = tabmail.tabInfo.find(
          tabInfo => space.tabInSpace(tabInfo) == 1
        );
        if (!existing) {
          space.open("tab");
        } else if (this.currentSpace != space) {
          // Only switch to the tab if it is in a different space to the
          // current one. In particular, if we are in a later tab we won't
          // switch to the earliest tab.
          tabmail.switchToTab(existing);
        }
      });
      if (space.name == "settings") {
        space.button.addEventListener("contextmenu", event => {
          settingsContextMenu.openPopupAtScreen(
            event.screenX,
            event.screenY,
            true,
            event
          );
        });
        continue;
      }
      space.button.addEventListener("contextmenu", event => {
        contextSpace = space;
        // Clean up old items.
        for (let menuitem of contextMenu.querySelectorAll(".switch-to-tab")) {
          menuitem.remove();
        }

        let existingTabs = tabmail.tabInfo.filter(space.tabInSpace);
        // Show opening in new tab if no existing tabs or can open multiple.
        // NOTE: We always show at least one item: either the switch to tab
        // items, or the new tab item.
        newTabItem.hidden = !!existingTabs.length && !space.allowMultipleTabs;
        newWindowItem.hidden = !space.allowMultipleTabs;

        for (let tabInfo of existingTabs) {
          let menuitem = document.createXULElement("menuitem");
          document.l10n.setAttributes(
            menuitem,
            "spaces-context-switch-tab-item",
            { tabName: tabInfo.title }
          );
          menuitem.classList.add(
            "switch-to-tab",
            "subviewbutton",
            "menuitem-iconic"
          );
          menuitem.addEventListener("command", () =>
            tabmail.switchToTab(tabInfo)
          );
          contextMenu.appendChild(menuitem);
        }
        // The separator splits the "Open in new tab" and "Open in new window"
        // items from the switch-to-tab items. Only show separator if there
        // are non-hidden items on both sides.
        separator.hidden = !existingTabs.length || !space.allowMultipleTabs;

        contextMenu.openPopupAtScreen(
          event.screenX,
          event.screenY,
          true,
          event
        );
      });
    }

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
    document.getElementById("spacesToolbarReveal").hidden = !state;
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

    // Add inline margin to the titlebar or the navigation-toolbox to
    // account for the spaces toolbar.
    let size = document.getElementById("spacesToolbar").getBoundingClientRect()
      .width;
    let style = `margin-inline-start: ${size}px;`;
    let menubar = document.getElementById("toolbar-menubar");

    if (
      tabsInTitlebar &&
      menubar.getAttribute("autohide") &&
      menubar.getAttribute("inactive")
    ) {
      // If we have tabs in titlebar, we only need to push the navigation
      // toolbox to account for the spaces toolbar.
      document
        .getElementById("navigation-toolbox")
        .setAttribute("style", style);
    } else {
      // Otherwise, we push the entire titlebar so the spaces toolbar doesn't
      // interfere with it, but we pull back the menubar to properly align it.
      document.getElementById("titlebar").setAttribute("style", style);
      document
        .getElementById("toolbar-menubar")
        .setAttribute("style", `margin-inline-start: -${size}px;`);
    }
  },

  resetInlineStyle() {
    document.getElementById("titlebar").removeAttribute("style");
    document.getElementById("toolbar-menubar").removeAttribute("style");
    document.getElementById("navigation-toolbox").removeAttribute("style");
    document.getElementById("tabmail-tabs").removeAttribute("style");
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
