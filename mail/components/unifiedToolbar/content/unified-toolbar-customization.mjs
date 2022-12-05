/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../base/content/spacesToolbar.js */

import "./unified-toolbar-tab.mjs"; // eslint-disable-line import/no-unassigned-import
import "./unified-toolbar-customization-pane.mjs"; // eslint-disable-line import/no-unassigned-import

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
        this.toggle(false);
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
    this.addEventListener("itemchange", this.#updateResetToDefault, {
      capture: true,
    });
    this.#tabList = template.querySelector("#customizationTabs");
    this.initialize();
    this.append(template);
    this.#updateResetToDefault();
  }

  #updateResetToDefault = () => {
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    const isDefault = tabPanes.every(pane => pane.matchesDefaultState);
    this.querySelector('button[type="reset"]').disabled = isDefault;
  };

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
    //TODO names of extension spaces won't work like this.
    document.l10n.setAttributes(tab, `customize-space-${space.name}`);
    const tabPane = document.createElement(
      "unified-toolbar-customization-pane"
    );
    tabPane.id = paneId;
    tabPane.setAttribute("space", space.name);
    tabPane.setAttribute("aria-labelledby", tabId);
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
   * Initialize the contents of this from the current state. Specifically makes
   * sure all the spaces have a tab, and all tabs still have a space.
   *
   * @param {boolean} [deep = false] - If true calls initialize on all tab
   *   panes.
   */
  initialize(deep = false) {
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
        return [tab, tab.pane];
      }
      const { tab, tabPane } = this.#makeSpaceTab(space);
      return [tab, tabPane];
    });
    this.#tabList.replaceChildren(...newTabs.map(([tab]) => tab));
    let previousNode = this.#tabList;
    for (const [, tabPane] of newTabs) {
      previousNode.after(tabPane);
      previousNode = tabPane;
      if (deep) {
        tabPane.initialize(deep);
      }
    }
    // Update state of reset to default button only when updating tab panes too.
    if (deep) {
      this.#updateResetToDefault();
    }
  }

  /**
   * Toggle unified toolbar customization.
   *
   * @param {boolean} [visible] - If passed, defines if customization should
   *   be active.
   */
  toggle(visible) {
    if (visible && gSpacesToolbar.currentSpace) {
      this.initialize(true);
      document
        .getElementById(
          `unified-toolbar-customization-tab-${gSpacesToolbar.currentSpace.name}`
        )
        ?.select();
    }

    document.documentElement.classList.toggle(
      "customizingUnifiedToolbar",
      visible
    );
  }
}
customElements.define(
  "unified-toolbar-customization",
  UnifiedToolbarCustomization
);
