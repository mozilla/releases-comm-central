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
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;
    const template = document
      .getElementById("unifiedToolbarCustomizationTemplate")
      .content.cloneNode(true);
    template.querySelector("form").addEventListener(
      "submit",
      event => {
        event.preventDefault();
        this.toggle(false);
      },
      {
        passive: false,
      }
    );
    template
      .querySelector("#unifiedToolbarCustomizationCancel")
      .addEventListener("click", () => {
        this.toggle(false);
      });
    const tablist = template.querySelector("#customizationTabs");
    const footer = template.querySelector("#customizationFooter");
    // TODO: provide hook for extension API to add and remove spaces from this
    // UI.
    for (const space of gSpacesToolbar.spaces) {
      const { tab, tabPane } = this.#makeSpaceTab(space);
      tablist.appendChild(tab);
      footer.parentNode.insertBefore(tabPane, footer);
    }
    this.append(template);
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
   * Toggle unified toolbar customization.
   *
   * @param {boolean} [visible] - If passed, defines if customization should
   *   be active.
   */
  toggle(visible) {
    if (visible && gSpacesToolbar.currentSpace) {
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
