/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from mailCore.js */
/* import-globals-from utilityOverlay.js */

/**
 * Special vertical toolbar to organize all the buttons opening a tab.
 */
var gSpacesToolbar = {
  SUPPORTED_BADGE_STYLES: ["--spaces-button-badge-bg-color"],
  SUPPORTED_ICON_STYLES: [
    "--webextension-toolbar-image",
    "--webextension-toolbar-image-dark",
    "--webextension-toolbar-image-light",
  ],
  docURL: "chrome://messenger/content/messenger.xhtml",
  /**
   * The spaces toolbar DOM element.
   *
   * @type {?HTMLElement}
   */
  element: null,
  /**
   * If the spaces toolbar has already been loaded.
   *
   * @type {boolean}
   */
  isLoaded: false,
  /**
   * If the spaces toolbar is hidden or visible.
   *
   * @type {boolean}
   */
  isHidden: false,
  /**
   * If the spaces toolbar is currently being customized.
   *
   * @type {boolean}
   */
  isCustomizing: false,
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
   * @param {object} tabInfo - The tabInfo object (a member of tabmail.tabInfo)
   *   for the tab.
   * @returns {0|1|2} - The relation between the tab and the space. 0 means it
   *   does not belong to the space. 1 means it is a primary tab of the space.
   *   2 means it is a secondary tab of the space.
   */
  /**
   * @callback OpenSpace
   * @param {"tab"|"window"} where - Where to open the space: in a new tab or in
   *   a new window.
   * @returns {?object | Window} - The tabInfo for the newly opened tab, or the
   *   newly opened messenger window, or null if neither was created.
   */
  /**
   * Data and methods for a space.
   *
   * @typedef {object} SpaceInfo
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
  /**
   * The button that can receive focus. Used for managing focus with a roving
   * tabindex.
   *
   * @type {?HTMLElement}
   */
  focusButton: null,

  tabMonitor: {
    monitorName: "spacesToolbarMonitor",

    onTabTitleChanged() {},
    onTabOpened() {},
    onTabPersist() {},
    onTabRestored() {},
    onTabClosing() {},

    onTabSwitched(newTabInfo) {
      // Bail out if for whatever reason something went wrong.
      if (!newTabInfo) {
        console.error(
          "Spaces Toolbar: Missing new tab on monitored tab switching"
        );
        return;
      }

      const tabSpace = gSpacesToolbar.spaces.find(space =>
        space.tabInSpace(newTabInfo)
      );
      if (gSpacesToolbar.currentSpace != tabSpace) {
        gSpacesToolbar.currentSpace?.button.classList.remove("current");
        gSpacesToolbar.currentSpace?.menuitem?.classList.remove("current");
        gSpacesToolbar.currentSpace = tabSpace;
        if (gSpacesToolbar.currentSpace) {
          gSpacesToolbar.currentSpace.button.classList.add("current");
          gSpacesToolbar.currentSpace.menuitem?.classList.add("current");
          gSpacesToolbar.setFocusButton(gSpacesToolbar.currentSpace.button);
        }

        const spaceChangeEvent = new CustomEvent("spacechange", {
          detail: tabSpace,
        });
        gSpacesToolbar.element.dispatchEvent(spaceChangeEvent);
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
    const rgb = color.split("(")[1].split(")")[0].split(",");

    // For each array element convert ot a base16 string and add zero if we get
    // only one character.
    const hash = rgb.map(x => parseInt(x).toString(16).padStart(2, "0"));

    return `#${hash.join("")}`;
  },

  onLoad() {
    if (this.isLoaded) {
      return;
    }

    this.element = document.getElementById("spacesToolbar");
    this.focusButton = document.getElementById("mailButton");
    const tabmail = document.getElementById("tabmail");

    this.spaces = [
      {
        name: "mail",
        button: document.getElementById("mailButton"),
        menuitem: document.getElementById("spacesPopupButtonMail"),
        tabInSpace(tabInfo) {
          switch (tabInfo.mode.name) {
            case "folder":
            case "mail3PaneTab":
            case "mailMessageTab":
              return 1;
            default:
              return 0;
          }
        },
        open(where) {
          // Prefer the current tab, else the earliest tab.
          const existingTab = [tabmail.currentTabInfo, ...tabmail.tabInfo].find(
            tabInfo => this.tabInSpace(tabInfo) == 1
          );
          let folderURI = null;
          switch (existingTab?.mode.name) {
            case "folder":
              folderURI =
                existingTab.folderDisplay.displayedFolder?.URI || null;
              break;
            case "mail3PaneTab":
              folderURI = existingTab.folder.URI || null;
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
          return openTab("mail3PaneTab", { folderURI }, "tab");
        },
        allowMultipleTabs: true,
      },
      {
        name: "addressbook",
        button: document.getElementById("addressBookButton"),
        menuitem: document.getElementById("spacesPopupButtonAddressBook"),
        tabInSpace(tabInfo) {
          if (tabInfo.mode.name == "addressBookTab") {
            return 1;
          }
          return 0;
        },
        open(where) {
          return openTab("addressBookTab", {}, where);
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
        menuitem: document.getElementById("spacesPopupButtonSettings"),
        tabInSpace(tabInfo) {
          switch (tabInfo.mode.name) {
            case "preferencesTab":
              // A primary tab that the open method creates.
              return 1;
            case "contentTab": {
              const url = tabInfo.urlbar?.value;
              if (url == "about:accountsettings" || url == "about:addons") {
                // A secondary tab, that is related to this space.
                return 2;
              }
            }
          }
          return 0;
        },
        open(where) {
          return openTab("preferencesTab", {}, where);
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
    window.dispatchEvent(new CustomEvent("spaces-toolbar-ready"));
    // Update the window UI after the spaces toolbar has been loaded.
    this.updateUI();
  },

  setupEventListeners() {
    this.element.addEventListener("contextmenu", event =>
      this._showContextMenu(event)
    );
    this.element.addEventListener("keydown", event => {
      this._onSpacesToolbarKeyDown(event);
    });

    // Prevent buttons from stealing the focus on click since the focus is
    // handled when a specific tab is opened or switched to.
    for (const button of document.querySelectorAll(".spaces-toolbar-button")) {
      button.onmousedown = event => event.preventDefault();
    }

    const tabmail = document.getElementById("tabmail");
    const contextMenu = document.getElementById("spacesContextMenu");
    const newTabItem = document.getElementById("spacesContextNewTabItem");
    const newWindowItem = document.getElementById("spacesContextNewWindowItem");
    const separator = document.getElementById("spacesContextMenuSeparator");

    // The space that we (last) opened the context menu for, which we share
    // between methods.
    let contextSpace;
    newTabItem.addEventListener("command", () => contextSpace.open("tab"));
    newWindowItem.addEventListener("command", () =>
      contextSpace.open("window")
    );

    const settingsContextMenu = document.getElementById("settingsContextMenu");
    document
      .getElementById("settingsContextOpenSettingsItem")
      .addEventListener("command", () => openTab("preferencesTab", {}));
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
    document
      .getElementById("settingsContextOpenCustomizeItem")
      .addEventListener("command", () => this.showCustomize());

    for (const space of this.spaces) {
      this._addButtonClickListener(space.button, () => {
        this.openSpace(tabmail, space);
      });
      space.menuitem?.addEventListener("command", () => {
        this.openSpace(tabmail, space);
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
        for (const menuitem of contextMenu.querySelectorAll(".switch-to-tab")) {
          menuitem.remove();
        }

        const existingTabs = tabmail.tabInfo.filter(space.tabInSpace);
        // Show opening in new tab if no existing tabs or can open multiple.
        // NOTE: We always show at least one item: either the switch to tab
        // items, or the new tab item.
        newTabItem.hidden = !!existingTabs.length && !space.allowMultipleTabs;
        newWindowItem.hidden = !space.allowMultipleTabs;

        for (const tabInfo of existingTabs) {
          const menuitem = document.createXULElement("menuitem");
          document.l10n.setAttributes(
            menuitem,
            "spaces-context-switch-tab-item",
            { tabName: tabInfo.title }
          );
          menuitem.classList.add("switch-to-tab", "menuitem-iconic");
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

    this._addButtonClickListener(
      document.getElementById("collapseButton"),
      () => this.toggleToolbar(true)
    );

    document
      .getElementById("spacesPopupButtonReveal")
      .addEventListener("command", () => {
        this.toggleToolbar(false);
      });
    this._addButtonClickListener(
      document.getElementById("spacesToolbarAddonsOverflowButton"),
      event => this.openSpacesToolbarAddonsPopup(event)
    );

    // Allow opening the pinned menu with Space or Enter keypress.
    document
      .getElementById("spacesPinnedButton")
      .addEventListener("keypress", event => {
        // Don't show the panel if the window is in customization mode.
        if (
          document.getElementById("toolbar-menubar").hasAttribute("customizing")
        ) {
          return;
        }

        if (event.key == " " || event.key == "Enter") {
          const panel = document.getElementById("spacesButtonMenuPopup");
          if (panel.state == "open") {
            panel.hidePopup();
          } else if (panel.state == "closed") {
            panel.openPopup(event.target, "after_start");
          }
        }
      });
  },

  /**
   * Handle the keypress event on the spaces toolbar.
   *
   * @param {Event} event - The keypress DOMEvent.
   */
  _onSpacesToolbarKeyDown(event) {
    if (
      !["ArrowUp", "ArrowDown", "Home", "End", " ", "Enter"].includes(event.key)
    ) {
      return;
    }

    // NOTE: Normally a button click handler would cover Enter and Space key
    // events, however we need to prevent the default behavior and explicitly
    // trigger the button click because in some tabs XUL keys or Window event
    // listeners are attached to this keys triggering specific actions.
    // TODO: Remove once we have a properly mapped global shortcut object not
    // relying on XUL keys.
    if (event.key == " " || event.key == "Enter") {
      event.preventDefault();
      event.target.click();
      return;
    }

    // Collect all currently visible buttons of the spaces toolbar.
    const buttons = [
      ...document.querySelectorAll(".spaces-toolbar-button:not([hidden])"),
    ];
    let elementIndex = buttons.indexOf(this.focusButton);

    // Find the adjacent focusable element based on the pressed key.
    switch (event.key) {
      case "ArrowUp":
        elementIndex--;
        if (elementIndex == -1) {
          elementIndex = buttons.length - 1;
        }
        break;

      case "ArrowDown":
        elementIndex++;
        if (elementIndex > buttons.length - 1) {
          elementIndex = 0;
        }
        break;

      case "Home":
        elementIndex = 0;
        break;

      case "End":
        elementIndex = buttons.length - 1;
        break;
    }

    this.setFocusButton(buttons[elementIndex], true);
  },

  /**
   * Move the focus to a new toolbar button and update the tabindex attribute.
   *
   * @param {HTMLElement} buttonToFocus - The new button to receive focus.
   * @param {boolean} [forceFocus=false] - Whether to force the focus to move
   *   onto the new button, otherwise focus will only move if the previous
   *   focusButton had focus.
   */
  setFocusButton(buttonToFocus, forceFocus = false) {
    let prevHadFocus = false;
    if (buttonToFocus != this.focusButton) {
      prevHadFocus = document.activeElement == this.focusButton;
      this.focusButton.tabIndex = -1;
      this.focusButton = buttonToFocus;
      buttonToFocus.tabIndex = 0;
    }
    // Only move the focus if the currently focused button was the active
    // element.
    if (forceFocus || prevHadFocus) {
      buttonToFocus.focus();
    }
  },

  /**
   * Add a click event listener to a spaces toolbar button.
   *
   * This method will insert focus controls for when the button is clicked.
   *
   * @param {HTMLButtonElement} button - A button that belongs to the spaces
   *   toolbar.
   * @param {Function} listener - An event listener to call when the button's
   *   click event is fired.
   */
  _addButtonClickListener(button, listener) {
    button.addEventListener("click", event => {
      // Since the button may have tabIndex = -1, we must manually move the
      // focus into the button and set it as the focusButton.
      // NOTE: We do *not* force the focus to move onto the button if it is not
      // currently already within the spaces toolbar. This is mainly to avoid
      // changing the document.activeElement before the tab's lastActiveElement
      // is set in tabmail.js.
      // NOTE: We do this before activating the button, which may move the focus
      // elsewhere, such as into a space.
      this.setFocusButton(button);
      listener(event);
    });
  },

  /**
   * Open a space by creating a new tab or switching to an existing tab.
   *
   * @param {XULElement} tabmail - The tabmail element.
   * @param {SpaceInfo} space - The space to open.
   */
  openSpace(tabmail, space) {
    // Find the earliest primary tab that belongs to this space.
    const existing = tabmail.tabInfo.find(
      tabInfo => space.tabInSpace(tabInfo) == 1
    );
    if (!existing) {
      return space.open("tab");
    } else if (this.currentSpace != space) {
      // Only switch to the tab if it is in a different space to the
      // current one. In particular, if we are in a later tab we won't
      // switch to the earliest tab.
      tabmail.switchToTab(existing);
      return existing;
    }
    return tabmail.currentTabInfo;
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
    const xulStore = Services.xulStore;
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
    const bgButton = document.getElementById("spacesBackgroundColor");
    bgButton.onchange = null;
    bgButton.value =
      this.customizeData.background ||
      this._rgbToHex(getComputedStyle(this.element).backgroundColor);
    bgButton.onchange = event => {
      this.customizeData.background = event.target.value;
      this.updateCustomization();
    };

    const iconButton = document.getElementById("spacesIconsColor");
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

    const accentStyle = getComputedStyle(
      document.getElementById("spacesAccentPlaceholder")
    );
    const accentBgButton = document.getElementById("spacesAccentBgColor");
    accentBgButton.onchange = null;
    accentBgButton.value =
      this.customizeData.accentBackground ||
      this._rgbToHex(accentStyle.backgroundColor);
    accentBgButton.onchange = event => {
      this.customizeData.accentBackground = event.target.value;
      this.updateCustomization();
    };

    const accentFgButton = document.getElementById("spacesAccentTextColor");
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
    this.isCustomizing = true;
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
    this.isCustomizing = false;
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
    const data = this.customizeData;
    const style = document.documentElement.style;

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
      this.element.addEventListener(
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
    // Prevent the visibility change state of the spaces toolbar if we're
    // currently customizing it, in order to avoid weird positioning outcomes
    // with the customize popup panel.
    if (this.isCustomizing) {
      return;
    }

    this.isHidden = state;

    // The focused element, prior to toggling.
    const activeElement = document.activeElement;

    const pinnedButton = document.getElementById("spacesPinnedButton");
    pinnedButton.hidden = !state;
    const revealButton = document.getElementById("spacesToolbarReveal");
    revealButton.hidden = !state;
    this.element.hidden = state;

    if (state && this.element.contains(activeElement)) {
      // If the toolbar is being hidden and one of its child element was
      // focused, move the focus to the pinned button without changing the
      // focusButton attribute of this object.
      pinnedButton.focus();
    } else if (
      !state &&
      (activeElement == pinnedButton || activeElement == revealButton)
    ) {
      // If the the toolbar is being shown and the focus is on the pinned or
      // reveal button, move the focus to the previously focused button.
      this.focusButton?.focus();
    }

    // Update the window UI after the visibility state of the spaces toolbar
    // has changed.
    this.updateUI();
  },

  /**
   * Toggle the spaces toolbar from a menuitem.
   */
  toggleToolbarFromMenu() {
    this.toggleToolbar(!this.isHidden);
  },

  /**
   * Update the addons buttons and propagate toolbar visibility to a global
   * attribute.
   */
  updateUI() {
    // Interrupt if the spaces toolbar isn't loaded yet.
    if (!this.isLoaded) {
      return;
    }

    const density = Services.prefs.getIntPref("mail.uidensity", 1);
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
  },

  /**
   * Reset the inline style of the various titlebars and toolbars that interact
   * with the spaces toolbar.
   */
  resetInlineStyle() {
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

    const overflowButton = document.getElementById(
      "spacesToolbarAddonsOverflowButton"
    );
    const separator = document.getElementById("spacesPopupAddonsSeparator");
    const popup = document.getElementById("spacesToolbarAddonsPopup");
    // Bail out if we don't have any add-ons button.
    if (!this.addonButtonCount) {
      if (this.focusButton == overflowButton) {
        this.setFocusButton(
          this.element.querySelector(".spaces-toolbar-button:not([hidden])")
        );
      }
      overflowButton.hidden = true;
      separator.collapsed = true;
      popup.hidePopup();
      return;
    }

    separator.collapsed = false;
    // Use the first available button's height as reference, and include the gap
    // defined by the UIDensity pref.
    const buttonHeight =
      document.querySelector(".spaces-toolbar-button").getBoundingClientRect()
        .height + this.densitySpacing;

    const containerHeight = document
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
    const threshold = Math.ceil(
      (buttonHeight * this.addonButtonCount - containerHeight) / buttonHeight
    );

    // Always reset the visibility of all buttons to avoid unnecessary
    // calculations when needing to reveal hidden buttons.
    for (const btn of document.querySelectorAll(
      ".spaces-addon-button[hidden]"
    )) {
      btn.hidden = false;
    }

    // If we get a negative threshold, it means we have plenty of empty space
    // so we don't need to do anything.
    if (threshold <= 0) {
      // If the overflow button was the currently focused button, move the focus
      // to an arbitrary first available button.
      if (this.focusButton == overflowButton) {
        this.setFocusButton(
          this.element.querySelector(".spaces-toolbar-button:not([hidden])")
        );
      }
      overflowButton.hidden = true;
      popup.hidePopup();
      return;
    }

    overflowButton.hidden = false;
    // Hide as many buttons as needed based on the threshold value.
    for (let i = 0; i <= threshold; i++) {
      const btn = document.querySelector(
        `.spaces-addon-button:nth-last-child(${i})`
      );
      if (btn) {
        // If one of the hidden add-on buttons was the focused one, move the
        // focus to the overflow button.
        if (btn == this.focusButton) {
          this.setFocusButton(overflowButton);
        }
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
      const size = this.element.getBoundingClientRect().width;
      const style = `margin-inline-start: ${size}px;`;
      document.getElementById("tabmail-tabs").setAttribute("style", style);
      return;
    }

    // Reset the style if we exited full screen mode.
    this.resetInlineStyle();
  },

  /**
   * @typedef NativeButtonProperties
   * @property {string} title - The text of the button tooltip and menuitem value.
   * @property {string} url - The URL of the content tab to open.
   * @property {Map} iconStyles - The icon styles Map.
   * @property {?string} badgeText - The optional badge text.
   * @property {?Map} badgeStyles - The optional badge styles Map.
   */

  /**
   * Helper function for extensions in order to add buttons to the spaces
   * toolbar.
   *
   * @param {string} id - The ID of the newly created button.
   * @param {NativeButtonProperties} properties - The properties of the new button.
   *
   * @returns {Promise} - A Promise that resolves when the button is created.
   */
  async createToolbarButton(id, properties = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isLoaded) {
        return reject("Unable to add spaces toolbar button! Toolbar not ready");
      }
      if (
        !id ||
        !properties.title ||
        !properties.url ||
        !properties.iconStyles
      ) {
        return reject(
          "Unable to add spaces toolbar button! Missing ID, Title, IconStyles, or space URL"
        );
      }

      // Create the button.
      const button = document.createElement("button");
      button.classList.add("spaces-toolbar-button", "spaces-addon-button");
      button.id = id;
      button.title = properties.title;
      button.tabIndex = -1;

      const badge = document.createElement("span");
      badge.classList.add("spaces-badge-container");
      button.appendChild(badge);

      const img = document.createElement("img");
      img.setAttribute("alt", "");
      button.appendChild(img);
      document
        .getElementById("spacesToolbarAddonsContainer")
        .appendChild(button);

      // Create the menuitem.
      const menuitem = document.createXULElement("menuitem");
      menuitem.classList.add(
        "spaces-addon-menuitem",
        "menuitem-iconic",
        "spaces-popup-menuitem"
      );
      menuitem.id = `${id}-menuitem`;
      menuitem.label = properties.title;
      document
        .getElementById("spacesButtonMenuPopup")
        .insertBefore(
          menuitem,
          document.getElementById("spacesPopupRevealSeparator")
        );

      // Set icons. The unified toolbar customization also relies on the CSS
      // variables of the img.
      for (const style of this.SUPPORTED_ICON_STYLES) {
        if (properties.iconStyles.has(style)) {
          img.style.setProperty(style, properties.iconStyles.get(style));
          menuitem.style.setProperty(style, properties.iconStyles.get(style));
        }
      }

      // Add space.
      gSpacesToolbar.spaces.push({
        name: id,
        button,
        menuitem,
        url: properties.url,
        isExtensionSpace: true,
        tabInSpace(tabInfo) {
          // TODO: Store the spaceButtonId in the XULStore (or somewhere), so the
          // space is recognized after a restart. Or force closing of all spaces
          // on shutdown.
          return tabInfo.spaceButtonId == this.name ? 1 : 0;
        },
        open(where) {
          // The check if we should switch to an existing tab in this space was
          // done in openSpace() and this function here should always open a new
          // tab and not switch to a tab which might have loaded the same url,
          // but belongs to a different space.
          const tab = openTab(
            "contentTab",
            { url: this.url, duplicate: true },
            where
          );
          tab.spaceButtonId = this.name;
          // TODO: Make sure the spaceButtonId is set during load, and not here,
          // where it might be too late.
          gSpacesToolbar.currentSpace = this;
          button.classList.add("current");
          return tab;
        },
      });

      // Set click actions.
      const tabmail = document.getElementById("tabmail");
      this._addButtonClickListener(button, () => {
        const space = gSpacesToolbar.spaces.find(space => space.name == id);
        this.openSpace(tabmail, space);
      });
      menuitem.addEventListener("command", () => {
        const space = gSpacesToolbar.spaces.find(space => space.name == id);
        this.openSpace(tabmail, space);
      });

      // Set badge.
      if (properties.badgeText) {
        button.classList.add("has-badge");
        badge.textContent = properties.badgeText;
      }

      if (properties.badgeStyles) {
        for (const style of this.SUPPORTED_BADGE_STYLES) {
          if (properties.badgeStyles.has(style)) {
            badge.style.setProperty(style, properties.badgeStyles.get(style));
          }
        }
      }

      this.updateAddonButtonsUI();
      return resolve();
    });
  },

  /**
   * Helper function for extensions in order to update buttons previously added
   * to the spaces toolbar.
   *
   * @param {string} id - The ID of the button that needs to be updated.
   * @param {NativeButtonProperties} properties - The new properties of the button.
   *   Not specifying the optional badgeText or badgeStyles will remove them.
   *
   * @returns {Promise} - A promise that resolves when the button is updated.
   */
  async updateToolbarButton(id, properties = {}) {
    return new Promise((resolve, reject) => {
      if (
        !id ||
        !properties.title ||
        !properties.url ||
        !properties.iconStyles
      ) {
        return reject(
          "Unable to update spaces toolbar button! Missing ID, Title, IconsStyles, or space URL"
        );
      }

      const button = document.getElementById(`${id}`);
      const menuitem = document.getElementById(`${id}-menuitem`);
      if (!button || !menuitem) {
        return reject(
          "Unable to update spaces toolbar button! Button or menuitem don't exist"
        );
      }

      button.title = properties.title;
      menuitem.label = properties.title;

      // Update icons.
      const img = button.querySelector("img");
      for (const style of this.SUPPORTED_ICON_STYLES) {
        const value = properties.iconStyles.get(style);
        img.style.setProperty(style, value ?? null);
        menuitem.style.setProperty(style, value ?? null);
      }

      // Update url.
      const space = gSpacesToolbar.spaces.find(space => space.name == id);
      if (space.url != properties.url) {
        // TODO: Reload the space, when the url is changed (or close and re-open
        // the tab).
        space.url = properties.url;
      }

      // Update badge.
      const badge = button.querySelector(".spaces-badge-container");
      if (properties.badgeText) {
        button.classList.add("has-badge");
        badge.textContent = properties.badgeText;
      } else {
        button.classList.remove("has-badge");
        badge.textContent = "";
      }

      for (const style of this.SUPPORTED_BADGE_STYLES) {
        badge.style.setProperty(
          style,
          properties.badgeStyles?.get(style) ?? null
        );
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

      const button = document.getElementById(`${id}`);
      // If the button being removed is the currently focused one, move the
      // focus on an arbitrary first available spaces button.
      if (this.focusButton == button) {
        this.setFocusButton(
          this.element.querySelector(".spaces-toolbar-button:not([hidden])")
        );
      }

      button?.remove();
      document.getElementById(`${id}-menuitem`)?.remove();

      const space = gSpacesToolbar.spaces.find(space => space.name == id);
      const tabmail = document.getElementById("tabmail");
      const existing = tabmail.tabInfo.find(
        tabInfo => space.tabInSpace(tabInfo) == 1
      );
      if (existing) {
        tabmail.closeTab(existing);
      }

      gSpacesToolbar.spaces = gSpacesToolbar.spaces.filter(e => e.name != id);
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
    const popup = document.getElementById("spacesToolbarAddonsPopup");

    for (const button of document.querySelectorAll(
      ".spaces-addon-button[hidden]"
    )) {
      const menuitem = document.createXULElement("menuitem");
      menuitem.classList.add("menuitem-iconic", "spaces-popup-menuitem");
      menuitem.label = button.title;

      const img = button.querySelector("img");
      for (const style of this.SUPPORTED_ICON_STYLES) {
        menuitem.style.setProperty(
          style,
          img.style.getPropertyValue(style) ?? null
        );
      }

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
   * Copy the badges from the contained menu items to the pinned button.
   * Should be called whenever one of the menu item's badge state changes.
   */
  updatePinnedBadgeState() {
    const hasBadge = Boolean(
      document.querySelector("#spacesButtonMenuPopup .has-badge")
    );
    const spacesPinnedButton = document.getElementById("spacesPinnedButton");
    spacesPinnedButton.classList.toggle("has-badge", hasBadge);
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
