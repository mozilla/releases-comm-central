/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../base/content/spacesToolbar.js */

import { getDefaultItemIdsForSpace } from "resource:///modules/CustomizableItems.mjs";
import { getState } from "resource:///modules/CustomizationState.mjs";
import {
  BUTTON_STYLE_MAP,
  BUTTON_STYLE_PREF,
} from "resource:///modules/ButtonStyle.mjs";
import "./customizable-element.mjs"; // eslint-disable-line import/no-unassigned-import

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

/**
 * Unified toolbar container custom element. Used to contain the state
 * management and interaction logic. Template: #unifiedToolbarTemplate.
 * Requires unifiedToolbarPopups.inc.xhtml to be in a popupset of the same
 * document.
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
    if (gSpacesToolbar.isLoaded) {
      this.initialize();
    } else {
      window.addEventListener("spaces-toolbar-ready", () => this.initialize(), {
        once: true,
      });
    }

    this.append(template);

    document
      .getElementById("unifiedToolbarCustomize")
      .addEventListener("command", this.#handleCustomizeCommand);

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
    event.preventDefault();
    event.stopPropagation();
    document
      .getElementById("unifiedToolbarMenu")
      .openPopupAtScreen(event.screenX, event.screenY, true);
  };

  #handleCustomizeCommand = () => {
    this.#ensureCustomizationInserted().then(() =>
      document.querySelector("unified-toolbar-customization").toggle(true)
    );
  };

  #handleSpaceChange = event => {
    // Switch to the current space or show a generic default state toolbar.
    this.#showToolbarForSpace(event.detail?.name ?? "default");
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
    if (!this.#state[space]) {
      this.#state[space] = getDefaultItemIdsForSpace(space);
    }
    const itemIds = this.#state[space];
    // Handling elements which might occur more than once requires us to keep
    // track which existing elements we've already used.
    const elementTypeOffset = {};
    const wantedElements = itemIds.map(itemId => {
      // We want to re-use existing elements to reduce flicker when switching
      // spaces and to preserve widget specific state, like a search string.
      const existingElements = this.#toolbarContent.querySelectorAll(
        `.${itemId}`
      );
      const nthChild = elementTypeOffset[itemId] ?? 0;
      if (existingElements.length > nthChild) {
        const existingElement = existingElements[nthChild];
        elementTypeOffset[itemId] = nthChild + 1;
        existingElement.hidden = false;
        return existingElement;
      }
      const element = document.createElement("li", {
        is: "customizable-element",
      });
      element.setAttribute("item-id", itemId);
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
    // Remove unused items from the toolbar.
    const currentElements = this.#toolbarContent.children;
    if (currentElements.length) {
      const filledOutState = Object.fromEntries(
        (gSpacesToolbar.spaces ?? Object.keys(this.#state)).map(space => [
          space.name,
          this.#state[space.name] || getDefaultItemIdsForSpace(space.name),
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
    this.#showToolbarForSpace(gSpacesToolbar.currentSpace?.name ?? "mail");
  }
}
customElements.define("unified-toolbar", UnifiedToolbar);
