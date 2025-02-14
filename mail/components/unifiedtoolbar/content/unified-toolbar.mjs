/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gSpacesToolbar, ToolbarContextMenu */

import { getState } from "resource:///modules/CustomizationState.mjs";
import {
  BUTTON_STYLE_MAP,
  BUTTON_STYLE_PREF,
} from "resource:///modules/ButtonStyle.mjs";
import "./customizable-element.mjs"; // eslint-disable-line import/no-unassigned-import

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  getDefaultItemIdsForSpace: "resource:///modules/CustomizableItems.sys.mjs",
  getAvailableItemIdsForSpace: "resource:///modules/CustomizableItems.sys.mjs",
  SKIP_FOCUS_ITEM_IDS: "resource:///modules/CustomizableItems.sys.mjs",
});

/**
 * Unified toolbar container custom element. Used to contain the state
 * management and interaction logic. Template: #unifiedToolbarTemplate.
 * Requires unifiedToolbarPopups.inc.xhtml to be in a popupset of the same
 * document.
 * Template ID: #unifiedToolbarTemplate
 *
 * @tagname unified-toolbar
 */
class UnifiedToolbar extends HTMLElement {
  constructor() {
    super();
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "buttonStyle",
      BUTTON_STYLE_PREF,
      0,
      (preference, prevVal, newVal) => {
        if (preference !== BUTTON_STYLE_PREF) {
          return;
        }
        this.classList.remove(prevVal);
        this.classList.add(newVal);
      },
      value => BUTTON_STYLE_MAP[value]
    );
  }

  /**
   * List containing the customizable content of the unified toolbar.
   *
   * @type {?HTMLUListElement}
   */
  #toolbarContent = null;

  /**
   * The current customization state of the unified toolbar.
   *
   * @type {?UnifiedToolbarCustomizationState}
   */
  #state = null;

  /**
   * Arrays of item IDs available in a given space.
   *
   * @type {object}
   */
  #itemsAvailableInSpace = {};

  /**
   * Observer triggered when the state for the unified toolbar is changed.
   *
   * @type {nsIObserver}
   */
  #stateObserver = {
    observe: (subject, topic) => {
      if (topic === "unified-toolbar-state-change") {
        this.initialize();
      }
    },
    QueryInterface: ChromeUtils.generateQI([
      "nsIObserver",
      "nsISupportsWeakReference",
    ]),
  };

  /**
   * A MozTabmail tab monitor to listen for tab switch and close events. Calls
   * onTabSwitched on currently visible toolbar content and onTabClosing on
   * all toolbar content.
   *
   * @type {object}
   */
  #tabMonitor = {
    monitorName: "UnifiedToolbar",
    onTabTitleChanged() {},
    onTabSwitched: (tab, oldTab) => {
      for (const element of this.#toolbarContent.children) {
        if (!element.hidden) {
          element.onTabSwitched(tab, oldTab);
        }
      }
    },
    onTabOpened() {},
    onTabClosing: tab => {
      for (const element of this.#toolbarContent.children) {
        element.onTabClosing(tab);
      }
    },
    onTabPersist() {},
    onTabRestored() {},
  };

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    // No shadow root so other stylesheets can style the contents of the
    // toolbar, like the window controls.
    this.hasConnected = true;
    this.classList.add(this.buttonStyle);
    const template = document
      .getElementById("unifiedToolbarTemplate")
      .content.cloneNode(true);

    // TODO Don't show context menu when there is a native one, like for example
    // in a search field.
    template
      .querySelector("#unifiedToolbarContainer")
      .addEventListener("contextmenu", this.#handleContextMenu);
    this.#toolbarContent = template.querySelector("#unifiedToolbarContent");

    this.#toolbarContent.addEventListener("keydown", this.#handleKey, {
      capture: true,
    });
    this.#toolbarContent.addEventListener(
      "buttondisabled",
      this.#handleButtonDisabled,
      { capture: true }
    );
    this.#toolbarContent.addEventListener(
      "buttonenabled",
      this.#handleButtonEnabled,
      { capture: true }
    );

    if (gSpacesToolbar.isLoaded) {
      this.initialize();
    } else {
      window.addEventListener("spaces-toolbar-ready", () => this.initialize(), {
        once: true,
      });
      document
        .getElementById("cmd_CustomizeMailToolbar")
        .setAttribute("disabled", true);
    }

    this.append(template);

    document
      .getElementById("unifiedToolbarCustomize")
      .addEventListener("command", this.#handleCustomizeCommand);

    document
      .getElementById("menuBarToggleVisible")
      .addEventListener("command", this.#handleMenuBarCommand);

    document
      .getElementById("spacesToolbar")
      .addEventListener("spacechange", this.#handleSpaceChange);

    Services.obs.addObserver(
      this.#stateObserver,
      "unified-toolbar-state-change",
      true
    );

    if (document.readyState === "complete") {
      document.getElementById("tabmail").registerTabMonitor(this.#tabMonitor);
      return;
    }
    window.addEventListener(
      "load",
      () => {
        document.getElementById("tabmail").registerTabMonitor(this.#tabMonitor);
      },
      { once: true }
    );
  }

  disconnectedCallback() {
    Services.obs.removeObserver(
      this.#stateObserver,
      "unified-toolbar-state-change"
    );

    document
      .getElementById("unifiedToolbarCustomize")
      .removeEventListener("command", this.#handleCustomizeCommand);

    document
      .getElementById("spacesToolbar")
      .removeEventListener("spacechange", this.#handleSpaceChange);

    document.getElementById("tabmail").unregisterTabMonitor(this.#tabMonitor);
  }

  #handleContextMenu = event => {
    if (!event.target.closest("#unifiedToolbarContent")) {
      return;
    }
    const customizableElement = event.target.closest(
      '[is="customizable-element"]'
    );
    if (customizableElement?.hasContextMenu) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const popup = document.getElementById("unifiedToolbarMenu");

    // If not Mac OS, set checked attribute for menu item, otherwise remove item.
    const menuBarMenuItem = document.getElementById("menuBarToggleVisible");
    if (AppConstants.platform != "macosx") {
      const menubarToolbar = document.getElementById("toolbar-menubar");
      menuBarMenuItem.setAttribute(
        "checked",
        menubarToolbar.getAttribute("autohide") != "true"
      );
    } else if (menuBarMenuItem) {
      menuBarMenuItem.remove();
      // Remove the menubar separator as well.
      const menuBarSeparator = document.getElementById(
        "menuBarToggleMenuSeparator"
      );
      menuBarSeparator.remove();
    }

    popup.openPopupAtScreen(event.screenX, event.screenY, true, event);
    if (gSpacesToolbar.isLoaded) {
      document
        .getElementById("unifiedToolbarCustomize")
        .removeAttribute("disabled");
    } else {
      document
        .getElementById("unifiedToolbarCustomize")
        .setAttribute("disabled", true);
    }
    ToolbarContextMenu.updateExtension(popup);
  };

  #handleCustomizeCommand = () => {
    this.showCustomization();
  };

  #handleMenuBarCommand = () => {
    const menubarToolbar = document.getElementById("toolbar-menubar");
    const menuItem = document.getElementById("menuBarToggleVisible");

    if (menubarToolbar.getAttribute("autohide") != "true") {
      menubarToolbar.setAttribute("autohide", "true");
      menuItem.removeAttribute("checked");
    } else {
      menuItem.setAttribute("checked", true);
      menubarToolbar.setAttribute("autohide", "false");
    }
    Services.xulStore.persist(menubarToolbar, "autohide");
  };

  #handleSpaceChange = event => {
    // Switch to the current space or show a generic default state toolbar.
    this.#showToolbarForSpace(event.detail?.name ?? "default");
  };

  #handleKey = event => {
    // Don't handle any key events within menupopups that are children of the
    // toolbar contents.
    if (
      event.target.closest("menupopup") ||
      event.target.closest(".search-bar")
    ) {
      return;
    }
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        event.preventDefault();
        event.stopPropagation();
        const rightIsForward = document.dir !== "rtl";
        //TODO groups split by search bar.
        const focusableChildren = Array.from(
          this.querySelectorAll(
            `li[is="customizable-element"]:not([disabled], .skip-focus)`
          )
        ).filter(
          element => !element.querySelector(".live-content button[disabled]")
        );
        if (!focusableChildren.length) {
          return;
        }
        const activeItem = document.activeElement.closest(
          'li[is="customizable-element"]'
        );
        const activeIndex = focusableChildren.indexOf(activeItem);
        if (activeIndex === -1) {
          return;
        }
        if (!activeItem) {
          focusableChildren[0].focus();
          return;
        }
        const isForward = rightIsForward === (event.key === "ArrowRight");
        const delta = isForward ? 1 : -1;
        const focusableSibling = focusableChildren.at(activeIndex + delta);
        if (focusableSibling) {
          focusableSibling.tabIndex = 0;
          focusableSibling.focus();
        } else if (isForward) {
          focusableChildren[0].tabIndex = 0;
          focusableChildren[0].focus();
        } else {
          focusableChildren.at(-1).tabIndex = 0;
          focusableChildren.at(-1).focus();
        }
        activeItem.tabIndex = -1;
      }
    }
  };

  #handleButtonDisabled = () => {
    if (
      this.#toolbarContent.querySelector(
        'li[is="customizable-element"]:not(.skip-focus) .live-content button[tabindex="0"]'
      )
    ) {
      return;
    }
    const newItem = this.#toolbarContent
      .querySelector(
        'li[is="customizable-element"]:not([disabled], .skip-focus) .live-content button:not([disabled])'
      )
      ?.closest('li[is="customizable-element"]');
    if (newItem) {
      newItem.tabIndex = 0;
    }
  };

  #handleButtonEnabled = event => {
    if (
      this.#toolbarContent.querySelector(
        'li[is="customizable-element"]:not(.skip-focus) .live-content button[tabindex="0"]'
      )
    ) {
      return;
    }
    // If there is currently no focusable button, make the button triggering the
    // event available.
    const newItem = event.target.closest('li[is="customizable-element"]');
    if (newItem) {
      newItem.tabIndex = 0;
    }
  };

  /**
   * Make sure the customization for unified toolbar is injected into the
   * document.
   *
   * @returns {Promise<void>}
   */
  async #ensureCustomizationInserted() {
    if (document.querySelector("unified-toolbar-customization")) {
      return;
    }
    await import("./unified-toolbar-customization.mjs");
    const customization = document.createElement(
      "unified-toolbar-customization"
    );
    document.body.appendChild(customization);
  }

  /**
   * Get the items currently visible in a given space. Filters out items that
   * are part of the state but not visible.
   *
   * @param {string} space - Name of the space to get the active items for. May
   *   be "default" to indicate a generic default item set should be produced.
   * @returns {string[]} Array of item IDs visible in the given space.
   */
  #getItemsForSpace(space) {
    if (!this.#state[space]) {
      this.#state[space] = lazy.getDefaultItemIdsForSpace(space);
    }
    if (!this.#itemsAvailableInSpace[space]) {
      this.#itemsAvailableInSpace[space] = new Set(
        lazy.getAvailableItemIdsForSpace(space, true)
      );
    }
    return this.#state[space].filter(itemId =>
      this.#itemsAvailableInSpace[space].has(itemId)
    );
  }

  /**
   * Show the items for the specified space in the toolbar. Only creates
   * missing elements when not already created for another space.
   *
   * @param {string} space - Name of the space to make visible. May be "default"
   *   to indicate that a generic default state should be shown instead.
   */
  #showToolbarForSpace(space) {
    if (!this.#state) {
      return;
    }
    const itemIds = this.#getItemsForSpace(space);
    // Handling elements which might occur more than once requires us to keep
    // track which existing elements we've already used.
    const elementTypeOffset = {};
    let focusableElementSet = false;
    const wantedElements = itemIds.map(itemId => {
      // We want to re-use existing elements to reduce flicker when switching
      // spaces and to preserve widget specific state, like a search string.
      const existingElements = this.#toolbarContent.querySelectorAll(
        `[item-id="${CSS.escape(itemId)}"]`
      );
      const nthChild = elementTypeOffset[itemId] ?? 0;
      if (existingElements.length > nthChild) {
        const existingElement = existingElements[nthChild];
        elementTypeOffset[itemId] = nthChild + 1;
        existingElement.hidden = false;
        if (
          !(
            existingElement.details?.skipFocus ||
            lazy.SKIP_FOCUS_ITEM_IDS.has(itemId)
          ) &&
          existingElement.querySelector(".live-content button:not([disabled])")
        ) {
          if (focusableElementSet) {
            existingElement.tabIndex = -1;
          } else {
            existingElement.tabIndex = 0;
            focusableElementSet = true;
          }
        }
        return existingElement;
      }
      const element = document.createElement("li", {
        is: "customizable-element",
      });
      element.setAttribute("item-id", itemId);
      if (!lazy.SKIP_FOCUS_ITEM_IDS.has(itemId)) {
        if (focusableElementSet) {
          element.tabIndex = -1;
        } else {
          element.tabIndex = 0;
          focusableElementSet = true;
        }
      }
      return element;
    });
    for (const element of this.#toolbarContent.children) {
      if (!wantedElements.includes(element)) {
        element.hidden = true;
      }
    }
    this.#toolbarContent.append(...wantedElements);
  }

  /**
   * Initialize the unified toolbar contents.
   */
  initialize() {
    this.#state = getState();
    this.#itemsAvailableInSpace = {};
    // Remove unused items from the toolbar.
    const currentElements = this.#toolbarContent.children;
    if (currentElements.length) {
      const filledOutState = Object.fromEntries(
        (gSpacesToolbar.spaces ?? Object.keys(this.#state)).map(space => [
          space.name,
          this.#getItemsForSpace(space.name),
        ])
      );
      const allItems = new Set(Object.values(filledOutState).flat());
      const spaceCounts = Object.keys(filledOutState).map(space =>
        filledOutState[space].reduce((counts, itemId) => {
          if (counts[itemId]) {
            ++counts[itemId];
          } else {
            counts[itemId] = 1;
          }
          return counts;
        }, {})
      );
      const elementCounts = Object.fromEntries(
        Array.from(allItems, itemId => [
          itemId,
          Math.max(...spaceCounts.map(spaceCount => spaceCount[itemId])),
        ])
      );
      const encounteredElements = {};
      for (const element of currentElements) {
        const itemId = element.getAttribute("item-id");
        if (
          allItems.has(itemId) &&
          (!encounteredElements[itemId] ||
            encounteredElements[itemId] < elementCounts[itemId])
        ) {
          encounteredElements[itemId] = encounteredElements[itemId]
            ? encounteredElements[itemId] + 1
            : 1;
          continue;
        }
        // We don't need that many of this item.
        element.remove();
      }
    }
    this.#showToolbarForSpace(gSpacesToolbar.currentSpace?.name ?? "default");
    document
      .getElementById("cmd_CustomizeMailToolbar")
      .removeAttribute("disabled");
  }

  /**
   * Opens the customization UI for the unified toolbar.
   */
  async showCustomization() {
    if (!gSpacesToolbar.isLoaded) {
      return;
    }
    await this.#ensureCustomizationInserted();
    document.querySelector("unified-toolbar-customization").toggle(true);
  }

  focus() {
    this.firstElementChild.focus();
  }
}
customElements.define("unified-toolbar", UnifiedToolbar);
