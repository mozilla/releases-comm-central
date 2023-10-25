/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../base/content/spacesToolbar.js */
/* import-globals-from ../../../base/content/utilityOverlay.js */

import {
  storeState,
  getState,
} from "resource:///modules/CustomizationState.mjs";
import "./unified-toolbar-tab.mjs"; // eslint-disable-line import/no-unassigned-import
import "./unified-toolbar-customization-pane.mjs"; // eslint-disable-line import/no-unassigned-import
import {
  BUTTON_STYLE_MAP,
  BUTTON_STYLE_PREF,
} from "resource:///modules/ButtonStyle.mjs";

/**
 * Set of names of the built in spaces.
 *
 * @type {Set<string>}
 */
const BUILTIN_SPACES = new Set([
  "mail",
  "addressbook",
  "calendar",
  "tasks",
  "chat",
  "settings",
]);

/**
 * Customization palette container for the unified toolbar. Contained in a
 * custom element for state management. When visible, the document should have
 * the customizingUnifiedToolbar class.
 * Template: #unifiedToolbarCustomizationTemplate.
 */
class UnifiedToolbarCustomization extends HTMLElement {
  /**
   * Reference to the container where the space tabs go in. The tab panels will
   * be placed after this element.
   *
   * @type {?HTMLDivElement}
   */
  #tabList = null;

  #buttonStyle = null;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document
      .getElementById("unifiedToolbarCustomizationTemplate")
      .content.cloneNode(true);
    const form = template.querySelector("form");
    form.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        this.#save();
      },
      {
        passive: false,
      }
    );
    form.addEventListener("reset", event => {
      this.#reset();
    });
    template
      .querySelector("#unifiedToolbarCustomizationCancel")
      .addEventListener("click", () => {
        this.toggle(false);
      });
    this.#buttonStyle = template.querySelector("#buttonStyle");
    this.#buttonStyle.addEventListener("change", this.#handleButtonStyleChange);
    this.addEventListener("itemchange", this.#handleItemChange, {
      capture: true,
    });
    this.addEventListener("additem", this.#handleAddItem, {
      capture: true,
    });
    this.addEventListener("removeitem", this.#handleRemoveItem, {
      capture: true,
    });
    this.#tabList = template.querySelector("#customizationTabs");
    this.#tabList.addEventListener("tabswitch", this.#handleTabSwitch, {
      capture: true,
    });
    template
      .querySelector("#customizationToSettingsButton")
      .addEventListener("click", this.#handleSettingsButton);
    this.initialize();
    this.append(template);
    this.#updateResetToDefault();
    this.addEventListener("keyup", this);
    this.addEventListener("keypress", this);
    this.addEventListener("keydown", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "keyup":
        this.#handleKeyboard(event);
        this.#closeByKeyboard(event);
        break;
      case "keypress":
      case "keydown":
        this.#handleKeyboard(event);
        break;
    }
  }

  #handleItemChange = event => {
    event.stopPropagation();
    this.#updateResetToDefault();
    this.#updateUnsavedChangesState();
  };

  #handleTabSwitch = event => {
    event.stopPropagation();
    this.#updateUnsavedChangesState();
  };

  #handleButtonStyleChange = event => {
    for (const pane of this.querySelectorAll(
      "unified-toolbar-customization-pane"
    )) {
      pane.updateButtonStyle(event.target.value);
    }
    this.#updateUnsavedChangesState();
  };

  #handleSettingsButton = event => {
    event.preventDefault();
    openPreferencesTab("paneGeneral", "layoutGroup");
    this.toggle(false);
  };

  #handleAddItem = event => {
    event.stopPropagation();
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    for (const pane of tabPanes) {
      pane.addItem(event.detail.itemId);
    }
  };

  #handleRemoveItem = event => {
    event.stopPropagation();
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    for (const pane of tabPanes) {
      pane.removeItem(event.detail.itemId);
    }
  };

  /**
   * Close the customisation pane when Escape is released
   *
   * @param {KeyboardEvent} event - The keyboard event
   */
  #closeByKeyboard = event => {
    if (event.key == "Escape") {
      event.preventDefault();
      this.toggle(false);
    }
  };

  /**
   * Ensure keyboard events are not propagated outside the customization dialog.
   *
   * @param {KeyboardEvent} event - The keyboard event.
   */
  #handleKeyboard = event => {
    event.stopPropagation();
  };

  /**
   * Update state of reset to default button.
   */
  #updateResetToDefault() {
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    const isDefault = tabPanes.every(pane => pane.matchesDefaultState);
    this.querySelector('button[type="reset"]').disabled = isDefault;
  }

  #updateUnsavedChangesState() {
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    const unsavedChanges =
      tabPanes.some(tabPane => tabPane.hasChanges) ||
      this.#buttonStyle.value !=
        BUTTON_STYLE_MAP[Services.prefs.getIntPref(BUTTON_STYLE_PREF, 0)];
    const otherSpacesHaveUnsavedChanges =
      unsavedChanges &&
      tabPanes.some(tabPane => tabPane.hidden && tabPane.hasChanges);
    this.querySelector('button[type="submit"]').disabled = !unsavedChanges;
    document.getElementById(
      "unifiedToolbarCustomizationUnsavedChanges"
    ).hidden = !otherSpacesHaveUnsavedChanges;
  }

  /**
   * Generate a tab and tab pane that are linked together for the given space.
   * If the space is the current space, the tab is marked as active.
   *
   * @param {SpaceInfo} space
   * @returns {{tab: UnifiedToolbarTab, tabPane: UnifiedToolbarCustomizationPane}}
   */
  #makeSpaceTab(space) {
    const activeSpace = space === gSpacesToolbar.currentSpace;
    const tabId = `unified-toolbar-customization-tab-${space.name}`;
    const paneId = `unified-toolbar-customization-pane-${space.name}`;
    const tab = document.createElement("unified-toolbar-tab");
    tab.id = tabId;
    tab.setAttribute("aria-controls", paneId);
    if (activeSpace) {
      tab.setAttribute("selected", true);
    }
    const isBuiltinSpace = BUILTIN_SPACES.has(space.name);
    if (isBuiltinSpace) {
      document.l10n.setAttributes(tab, `customize-space-tab-${space.name}`);
    } else {
      const title = space.button.title;
      tab.textContent = title;
      tab.title = title;
      tab.style = space.button.querySelector("img").style.cssText;
    }
    const tabPane = document.createElement(
      "unified-toolbar-customization-pane"
    );
    tabPane.id = paneId;
    tabPane.setAttribute("space", space.name);
    tabPane.setAttribute("aria-labelledby", tabId);
    tabPane.toggleAttribute("builtin-space", isBuiltinSpace);
    tabPane.hidden = !activeSpace;
    return { tab, tabPane };
  }

  /**
   * Reset all the spaces to their default customization state.
   */
  #reset() {
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    for (const pane of tabPanes) {
      pane.reset();
    }
  }

  /**
   * Save the current state of the toolbar and hide the customization.
   */
  #save() {
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    const state = Object.fromEntries(
      tabPanes
        .filter(pane => !pane.matchesDefaultState)
        .map(pane => [pane.getAttribute("space"), pane.itemIds])
    );
    Services.prefs.setIntPref(
      BUTTON_STYLE_PREF,
      BUTTON_STYLE_MAP.indexOf(this.#buttonStyle.value)
    );
    // Toggle happens before saving, so the newly restored buttons don't have to
    // be updated when the globalOverlay flag on tabmail goes away.
    this.toggle(false);
    storeState(state);
  }

  /**
   * Initialize the contents of this from the current state. Specifically makes
   * sure all the spaces have a tab, and all tabs still have a space.
   *
   * @param {boolean} [deep = false] - If true calls initialize on all tab
   *   panes.
   */
  initialize(deep = false) {
    const state = getState();
    const existingTabs = Array.from(this.#tabList.children);
    const tabSpaces = existingTabs.map(tab => tab.id.split("-").pop());
    const spaceNames = new Set(gSpacesToolbar.spaces.map(space => space.name));
    const removedTabs = existingTabs.filter(
      (tab, index) => !spaceNames.has(tabSpaces[index])
    );
    for (const tab of removedTabs) {
      tab.pane.remove();
      tab.remove();
    }
    const newTabs = gSpacesToolbar.spaces.map(space => {
      if (tabSpaces.includes(space.name)) {
        const tab = existingTabs[tabSpaces.indexOf(space.name)];
        if (!BUILTIN_SPACES.has(space.name)) {
          const title = space.button.title;
          tab.textContent = title;
          tab.title = title;
          tab.style = space.button.querySelector("img").style.cssText;
        }
        return [tab, tab.pane];
      }
      const { tab, tabPane } = this.#makeSpaceTab(space);
      return [tab, tabPane];
    });
    this.#tabList.replaceChildren(...newTabs.map(([tab]) => tab));
    let previousNode = this.#tabList;
    for (const [, tabPane] of newTabs) {
      previousNode.after(tabPane);
      const space = tabPane.getAttribute("space");
      if (state.hasOwnProperty(space)) {
        tabPane.setAttribute("current-items", state[space].join(","));
      } else {
        tabPane.removeAttribute("current-items");
      }
      previousNode = tabPane;
      if (deep) {
        tabPane.initialize(deep);
      }
    }
    this.#buttonStyle.value =
      BUTTON_STYLE_MAP[Services.prefs.getIntPref(BUTTON_STYLE_PREF, 0)];
    // Update state of reset to default button only when updating tab panes too.
    if (deep) {
      this.#updateResetToDefault();
      this.#updateUnsavedChangesState();
    }
  }

  /**
   * Toggle unified toolbar customization.
   *
   * @param {boolean} [visible] - If passed, defines if customization should
   *   be active.
   */
  toggle(visible) {
    if (visible) {
      this.initialize(true);
      let tabToSelect;
      if (gSpacesToolbar.currentSpace) {
        tabToSelect = document.getElementById(
          `unified-toolbar-customization-tab-${gSpacesToolbar.currentSpace.name}`
        );
      }
      if (
        !tabToSelect &&
        !this.querySelector(`unified-toolbar-tab[selected="true"]`)
      ) {
        tabToSelect = this.querySelector("unified-toolbar-tab");
      }
      if (tabToSelect) {
        tabToSelect.select();
      }
    }

    document.getElementById("tabmail").globalOverlay = visible;
    document.documentElement.classList.toggle(
      "customizingUnifiedToolbar",
      visible
    );

    // Make sure focus is where it belongs.
    if (visible) {
      if (
        document.activeElement !== this &&
        !this.contains(document.activeElement)
      ) {
        Services.focus.moveFocus(
          window,
          this,
          Services.focus.MOVEFOCUS_FIRST,
          0
        );
      }
    } else {
      Services.focus.moveFocus(
        window,
        document.body,
        Services.focus.MOVEFOCUS_ROOT,
        0
      );
    }
  }

  /**
   * Check if an item is active in all spaces.
   *
   * @param {string} itemId - Item ID of the item to check for.
   * @returns {boolean} If the given item is found active in all spaces.
   */
  activeInAllSpaces(itemId) {
    return Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane"),
      pane => pane.hasItem(itemId)
    ).every(hasItem => hasItem);
  }

  /**
   * Check if an item is active in two or more spaces.
   *
   * @param {string} itemId - Item ID of the item to check for.
   * @returns {boolean} If the given item is active in at least two spaces.
   */
  activeInMultipleSpaces(itemId) {
    return (
      Array.from(
        this.querySelectorAll("unified-toolbar-customization-pane"),
        pane => pane.hasItem(itemId)
      ).filter(Boolean).length > 1
    );
  }
}
customElements.define(
  "unified-toolbar-customization",
  UnifiedToolbarCustomization
);
