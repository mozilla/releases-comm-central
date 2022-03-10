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
  docURL: "chrome://messenger/content/messenger.xhtml",
  isLoaded: false,
  isHidden: false,
  /**
   * The DOM element panel collecting all customization options.
   */
  customizePanel: null,
  /**
   * The object storing all saved customization options:
   * - background: The toolbar background color.
   * - color: The default icon color of the buttons.
   * - accentColor: The background color of an active/current button.
   * - accentBackground: The icon color of an active/current button.
   */
  customizeData: {},

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
   * @property {?XULMenuItem} menuitem - The menuitem for this space, if
   *   available.
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
  /**
   * The number of buttons created by add-ons.
   *
   * @returns {integer}
   */
  get addonButtonCount() {
    return document.querySelectorAll(".spaces-addon-button").length;
  },
  /**
   * The number of pixel spacing to add to the add-ons button height calculation
   * based on the current UI density.
   *
   * @type {integer}
   */
  densitySpacing: 0,

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

  /**
   * Convert an rgb() string to an hexadecimal color string.
   *
   * @param {string} color - The RGBA color string that needs conversion.
   * @returns {string} - The converted hexadecimal color.
   */
  _rgbToHex(color) {
    let rgb = color
      .split("(")[1]
      .split(")")[0]
      .split(",");

    // For each array element convert ot a base16 string and add zero if we get
    // only one character.
    let hash = rgb.map(x =>
      parseInt(x)
        .toString(16)
        .padStart(2, "0")
    );

    return `#${hash.join("")}`;
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
        menuitem: document.getElementById("spacesPopupButtonMail"),
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
        menuitem: document.getElementById("spacesPopupButtonAddressBook"),
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
        menuitem: document.getElementById("spacesPopupButtonCalendar"),
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
        menuitem: document.getElementById("spacesPopupButtonTasks"),
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
        menuitem: document.getElementById("spacesPopupButtonChat"),
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
      Services.xulStore.getValue(this.docURL, "spacesToolbar", "hidden") ==
        "true"
    );

    // The tab monitor will inform us when a different tab is selected.
    tabmail.registerTabMonitor(this.tabMonitor);

    this.customizePanel = document.getElementById(
      "spacesToolbarCustomizationPanel"
    );
    this.loadCustomization();

    this.isLoaded = true;
    // Update the window UI after the spaces toolbar has been loaded.
    this.updateUI(
      document.documentElement.getAttribute("tabsintitlebar") == "true"
    );
  },

  setupEventListeners() {
    document
      .getElementById("spacesToolbar")
      .addEventListener("contextmenu", event => this._showContextMenu(event));

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
        this._setSpaceOpenAction(tabmail, space);
      });
      space.menuitem?.addEventListener("click", () => {
        this._setSpaceOpenAction(tabmail, space);
      });
      if (space.name == "settings") {
        space.button.addEventListener("contextmenu", event => {
          event.stopPropagation();
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
        event.stopPropagation();
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

    document
      .getElementById("spacesPopupButtonReveal")
      .addEventListener("click", () => {
        this.toggleToolbar(false);
      });
    document
      .getElementById("spacesToolbarAddonsOverflowButton")
      .addEventListener("click", event => {
        this.openSpacesToolbarAddonsPopup(event);
      });
  },

  /**
   * Define the action to open a new tab or switch to an existing tab.
   *
   * @param {XULElement} tabmail - The tabmail element.
   * @param {SpaceInfo[]} space - The main spaces in this toolbar.
   */
  _setSpaceOpenAction(tabmail, space) {
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
  },

  /**
   * Open a popup context menu at the location of the right on the toolbar.
   *
   * @param {DOMEvent} event - The click event.
   */
  _showContextMenu(event) {
    document
      .getElementById("spacesToolbarContextMenu")
      .openPopupAtScreen(event.screenX, event.screenY, true);
  },

  /**
   * Load the saved customization from the xulStore, if we have any.
   */
  async loadCustomization() {
    let xulStore = Services.xulStore;
    if (xulStore.hasValue(this.docURL, "spacesToolbar", "colors")) {
      this.customizeData = JSON.parse(
        xulStore.getValue(this.docURL, "spacesToolbar", "colors")
      );
      this.updateCustomization();
    }
  },

  /**
   * Reset the colors shown on the button colors to the default state to remove
   * any previously applied custom color.
   */
  _resetColorInputs() {
    // Update colors with the current values. If we don't have any customization
    // data, we fetch the current colors from the DOM elements.
    // IMPORTANT! Always clear the onchange method before setting a new value
    // since this method might be called after the popup is already opened.
    let bgButton = document.getElementById("spacesBackgroundColor");
    bgButton.onchange = null;
    bgButton.value =
      this.customizeData.background ||
      this._rgbToHex(
        getComputedStyle(document.getElementById("spacesToolbar"))
          .backgroundColor
      );
    bgButton.onchange = event => {
      this.customizeData.background = event.target.value;
      this.updateCustomization();
    };

    let iconButton = document.getElementById("spacesIconsColor");
    iconButton.onchange = null;
    iconButton.value =
      this.customizeData.color ||
      this._rgbToHex(
        getComputedStyle(
          document.querySelector(".spaces-toolbar-button:not(.current)")
        ).color
      );
    iconButton.onchange = event => {
      this.customizeData.color = event.target.value;
      this.updateCustomization();
    };

    let accentStyle = getComputedStyle(
      document.getElementById("spacesAccentPlaceholder")
    );
    let accentBgButton = document.getElementById("spacesAccentBgColor");
    accentBgButton.onchange = null;
    accentBgButton.value =
      this.customizeData.accentBackground ||
      this._rgbToHex(accentStyle.backgroundColor);
    accentBgButton.onchange = event => {
      this.customizeData.accentBackground = event.target.value;
      this.updateCustomization();
    };

    let accentFgButton = document.getElementById("spacesAccentTextColor");
    accentFgButton.onchange = null;
    accentFgButton.value =
      this.customizeData.accentColor || this._rgbToHex(accentStyle.color);
    accentFgButton.onchange = event => {
      this.customizeData.accentColor = event.target.value;
      this.updateCustomization();
    };
  },

  /**
   * Update the color buttons to reflect the current state of the toolbar UI,
   * then open the customization panel.
   */
  showCustomize() {
    // Reset the color inputs to be sure we're showing the correct colors.
    this._resetColorInputs();

    // Since we're forcing the panel to stay open with noautohide, we need to
    // listen for the Escape keypress to maintain that usability exit point.
    window.addEventListener("keypress", this.onWindowKeypress);
    this.customizePanel.openPopup(
      document.getElementById("collapseButton"),
      "end_after",
      6,
      0,
      false
    );
  },

  /**
   * Listen for the keypress event on the window after the customize panel was
   * opened to enable the closing on Escape.
   *
   * @param {Event} event - The DOM Event.
   */
  onWindowKeypress(event) {
    if (event.key == "Escape") {
      gSpacesToolbar.customizePanel.hidePopup();
    }
  },

  /**
   * Close the customization panel.
   */
  closeCustomize() {
    this.customizePanel.hidePopup();
  },

  /**
   * Reset all event listeners and store the custom colors.
   */
  onCustomizePopupHidden() {
    // Always remove the keypress event listener set on opening.
    window.removeEventListener("keypress", this.onWindowKeypress);

    // Save the custom colors, or delete it if we don't have any.
    if (!Object.keys(this.customizeData).length) {
      Services.xulStore.removeValue(this.docURL, "spacesToolbar", "colors");
      return;
    }

    Services.xulStore.setValue(
      this.docURL,
      "spacesToolbar",
      "colors",
      JSON.stringify(this.customizeData)
    );
  },

  /**
   * Apply the customization to the CSS file.
   */
  updateCustomization() {
    let data = this.customizeData;
    let style = document.documentElement.style;

    // Toolbar background color.
    style.setProperty("--spaces-bg-color", data.background ?? null);
    // Icons color.
    style.setProperty("--spaces-button-text-color", data.color ?? null);
    // Icons color for current/active buttons.
    style.setProperty(
      "--spaces-button-active-text-color",
      data.accentColor ?? null
    );
    // Background color for current/active buttons.
    style.setProperty(
      "--spaces-button-active-bg-color",
      data.accentBackground ?? null
    );
  },

  /**
   * Reset all color customizations to show the user the default UI.
   */
  resetColorCustomization() {
    if (!matchMedia("(prefers-reduced-motion)").matches) {
      // We set an event listener for the transition of any element inside the
      // toolbar so we can reset the color for the buttons only after the
      // toolbar and its elements reverted to their original colors.
      document.getElementById("spacesToolbar").addEventListener(
        "transitionend",
        () => {
          this._resetColorInputs();
        },
        {
          once: true,
        }
      );
    }

    this.customizeData = {};
    this.updateCustomization();

    // If the user required reduced motion, the transitionend listener will not
    // work.
    if (matchMedia("(prefers-reduced-motion)").matches) {
      this._resetColorInputs();
    }
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
    document.getElementById("spacesPinnedButton").collapsed = !state;
    // Update the window UI after the visibility state of the spaces toolbar
    // has changed.
    this.updateUI(
      document.documentElement.getAttribute("tabsintitlebar") == "true"
    );
  },

  /**
   * Toggle the spaces toolbar from a menuitem.
   */
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

    let density = Services.prefs.getIntPref("mail.uidensity", 1);
    switch (density) {
      case 0:
        this.densitySpacing = 10;
        break;
      case 1:
        this.densitySpacing = 15;
        break;
      case 2:
        this.densitySpacing = 20;
        break;
    }

    // Toggle the window attribute for those CSS selectors that need it.
    if (this.isHidden) {
      document.documentElement.removeAttribute("spacestoolbar");
    } else {
      document.documentElement.setAttribute("spacestoolbar", "true");
      this.updateAddonButtonsUI();
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

  /**
   * Reset the inline style of the various titlebars and toolbars that interact
   * with the spaces toolbar.
   */
  resetInlineStyle() {
    document.getElementById("titlebar").removeAttribute("style");
    document.getElementById("toolbar-menubar").removeAttribute("style");
    document.getElementById("navigation-toolbox").removeAttribute("style");
    document.getElementById("tabmail-tabs").removeAttribute("style");
  },

  /**
   * Update the UI based on the window sizing.
   */
  onWindowResize() {
    if (!this.isLoaded) {
      return;
    }

    this.updateUImacOS();
    this.updateAddonButtonsUI();
  },

  /**
   * Update the location of buttons added by addons based on the space available
   * in the toolbar. If the number of buttons is greater than the height of the
   * visible container, move those buttons inside an overflow popup.
   */
  updateAddonButtonsUI() {
    if (this.isHidden) {
      return;
    }

    let overflowButton = document.getElementById(
      "spacesToolbarAddonsOverflowButton"
    );
    let separator = document.getElementById("spacesPopupAddonsSeparator");
    let popup = document.getElementById("spacesToolbarAddonsPopup");
    // Bail out if we don't have any add-ons button.
    if (!this.addonButtonCount) {
      overflowButton.hidden = true;
      separator.collapsed = true;
      popup.hidePopup();
      return;
    }

    separator.collapsed = false;
    // Use the first available button's height as reference, and include the gap
    // defined by the UIDensity pref.
    let buttonHeight =
      document.querySelector(".spaces-toolbar-button").getBoundingClientRect()
        .height + this.densitySpacing;

    let containerHeight = document
      .getElementById("spacesToolbarAddonsContainer")
      .getBoundingClientRect().height;

    // Calculate the visible threshold of add-on buttons by:
    // - Multiplying the space occupied by one button for the number of the
    //   add-on buttons currently present.
    // - Subtracting the height of the add-ons container from the height
    //   occupied by all add-on buttons.
    // - Dividing the returned value by the height of a single button.
    // Doing so we will get an integer representing how many buttons might or
    // might not fit in the available area.
    let threshold = Math.ceil(
      (buttonHeight * this.addonButtonCount - containerHeight) / buttonHeight
    );

    // Always reset the visibility of all buttons to avoid unnecessary
    // calculations when needing to reveal hidden buttons.
    for (let btn of document.querySelectorAll(".spaces-addon-button[hidden]")) {
      btn.hidden = false;
    }

    // If we get a negative threshold, it means we have plenty of empty space
    // so we don't need to do anything.
    if (threshold <= 0) {
      overflowButton.hidden = true;
      popup.hidePopup();
      return;
    }

    overflowButton.hidden = false;
    // Hide as many buttons as needed based on the threshold value.
    for (let i = 0; i <= threshold; i++) {
      let btn = document.querySelector(
        `.spaces-addon-button:nth-last-child(${i})`
      );
      if (btn) {
        btn.hidden = true;
      }
    }
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
   * Helper function for extensions in order to add buttons to the spaces
   * toolbar.
   *
   * @param {string} id - The ID of the newly created button.
   * @param {string} title - The text of the button tooltip and menuitem value.
   * @param {string} url - The URL of the content tab to open.
   * @param {?string} src - The option location of the image used in the button.
   *
   * @returns {Promise} - A Promise that resolves when the button is created.
   */
  async createToolbarButton(id, title, url, src) {
    return new Promise((resolve, reject) => {
      if (!this.isLoaded) {
        return reject("Unable to add spaces toolbar button! Toolbar not ready");
      }
      if (!id || !title || !url) {
        return reject(
          "Unable to add spaces toolbar button! Missing ID, Title, or space URL"
        );
      }

      // Create the button.
      let button = document.createElement("button");
      button.classList.add("spaces-toolbar-button", "spaces-addon-button");
      button.id = id;
      button.title = title;
      let icon =
        src || "chrome://mozapps/skin/extensions/category-extensions.svg";
      let img = document.createElement("img");
      img.setAttribute("src", icon);
      img.setAttribute("alt", "");
      button.appendChild(img);
      document
        .getElementById("spacesToolbarAddonsContainer")
        .appendChild(button);

      // Create the menuitem.
      let menuitem = document.createXULElement("menuitem");
      menuitem.classList.add(
        "subviewbutton",
        "menuitem-iconic",
        "spaces-popup-menuitem"
      );
      menuitem.id = `${id}-menuitem`;
      menuitem.label = title;
      menuitem.setAttribute("style", `list-style-image: url("${icon}")`);
      document
        .getElementById("spacesButtonMenuPopup")
        .insertBefore(
          menuitem,
          document.getElementById("spacesPopupRevealSeparator")
        );

      // Use global event handlers instead of event listener because these
      // elements can be updated and we don't want to allow stacking a bunch of
      // event listeners on top of each other.
      button.onclick = () => openTab("contentTab", { url });
      // TODO: We will need to handle the keypress event of the menuitem once
      // we make this keyboard accessible.
      menuitem.onclick = () => openTab("contentTab", { url });

      this.updateAddonButtonsUI();
      return resolve();
    });
  },

  /**
   * Helper function for extensions in order to update buttons previously added
   * to the spaces toolbar.
   *
   * @param {string} id - The ID of the button that needs to be updated.
   * @param {string} title - The text of the button tooltip and menuitem value.
   * @param {?string} url - The URL of the content tab to open.
   * @param {?string} src - The optional icon image url.
   *
   * @returns {Promise} - A promise that resolves when the button is updated.
   */
  async updateToolbarButton(id, title, url, src) {
    return new Promise((resolve, reject) => {
      if (!id || !title) {
        return reject(
          "Unable to updated spaces toolbar button! Missing ID or Title"
        );
      }

      let button = document.getElementById(`${id}`);
      let menuitem = document.getElementById(`${id}-menuitem`);
      if (!button || !menuitem) {
        return reject(
          "Unable to update spaces toolbar button! Button or menuitem don't exist"
        );
      }

      button.title = title;
      button
        .querySelector("img")
        .setAttribute(
          "src",
          src || "chrome://mozapps/skin/extensions/category-extensions.svg"
        );
      menuitem.label = title;

      if (url) {
        button.onclick = () => openTab("contentTab", { url });
        menuitem.onclick = () => openTab("contentTab", { url });
      }

      return resolve();
    });
  },

  /**
   * Helper function for extensions allowing the removal of previously created
   * buttons.
   *
   * @param {string} id - The ID of the button that needs to be removed.
   * @returns {Promise} - A promise that resolves when the button is removed.
   */
  async removeToolbarButton(id) {
    return new Promise((resolve, reject) => {
      if (!this.isLoaded) {
        return reject(
          "Unable to remove spaces toolbar button! Toolbar not ready"
        );
      }
      if (!id) {
        return reject("Unable to remove spaces toolbar button! Missing ID");
      }

      document.getElementById(`${id}`)?.remove();
      document.getElementById(`${id}-menuitem`)?.remove();
      this.updateAddonButtonsUI();

      return resolve();
    });
  },

  /**
   * Populate the overflow container with a copy of all the currently hidden
   * buttons generated by add-ons.
   *
   * @param {DOMEvent} event - The DOM click event.
   */
  openSpacesToolbarAddonsPopup(event) {
    let popup = document.getElementById("spacesToolbarAddonsPopup");

    for (let button of document.querySelectorAll(
      ".spaces-addon-button[hidden]"
    )) {
      let menuitem = document.createXULElement("menuitem");
      menuitem.classList.add(
        "subviewbutton",
        "menuitem-iconic",
        "spaces-popup-menuitem"
      );
      menuitem.label = button.title;
      let img = button.querySelector("img");
      menuitem.setAttribute("style", `list-style-image: url("${img.src}")`);
      menuitem.addEventListener("command", () => button.click());
      popup.appendChild(menuitem);
    }

    popup.openPopup(event.target, "after_start", 0, 0);
  },

  /**
   * Empty the overflow container.
   */
  spacesToolbarAddonsPopupClosed() {
    document.getElementById("spacesToolbarAddonsPopup").replaceChildren();
  },

  /**
   * Save the preferred state when the app is closed.
   */
  onUnload() {
    Services.xulStore.setValue(
      this.docURL,
      "spacesToolbar",
      "hidden",
      this.isHidden
    );
  },
};
