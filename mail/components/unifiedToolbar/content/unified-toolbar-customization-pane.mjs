/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./search-bar.mjs"; // eslint-disable-line import/no-unassigned-import
import "./customization-palette.mjs"; // eslint-disable-line import/no-unassigned-import
import "./customization-target.mjs"; // eslint-disable-line import/no-unassigned-import
import "./customizable-element.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Template ID: unifiedToolbarCustomizationPaneTemplate
 * Attributes:
 * - space: Identifier of the space this pane is for. Changes are not observed.
 */
class UnifiedToolbarCustomizationPane extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }
    this.setAttribute("role", "tabpanel");
    const shadowRoot = this.attachShadow({ mode: "open" });
    document.l10n.connectRoot(shadowRoot);

    const space = this.getAttribute("space");

    const template = document
      .getElementById("unifiedToolbarCustomizationPaneTemplate")
      .content.cloneNode(true);
    const styles = document.createElement("link");
    styles.setAttribute("rel", "stylesheet");
    styles.setAttribute(
      "href",
      "chrome://messenger/skin/shared/unifiedToolbarCustomizationPane.css"
    );
    const spaceSpecificTitle = template.querySelector(".space-specific-title");
    document.l10n.setAttributes(
      spaceSpecificTitle,
      `customize-palette-${space}-specific-title`
    );
    spaceSpecificTitle.id = `${space}PaletteTitle`;
    const spaceSpecificPalette = template.querySelector(
      ".space-specific-palette"
    );
    spaceSpecificPalette.id = `${space}Palette`;
    spaceSpecificPalette.setAttribute("aria-labelledby", spaceSpecificTitle.id);
    const genericTitle = template.querySelector(".generic-palette-title");
    genericTitle.id = `${space}GenericPaletteTitle`;
    const genericPalette = template.querySelector(".generic-palette");
    genericPalette.id = `${space}GenericPalette`;
    genericPalette.setAttribute("aria-labelledby", genericTitle.id);

    shadowRoot.append(styles, template);

    // Temporary example items added to palettes.
    customElements.whenDefined("customizable-element").then(() => {
      const item1 = document.createElement("li", {
        is: "customizable-element",
      });
      item1.textContent = "lorem ipsum";
      item1.setAttribute("palette", spaceSpecificPalette.id);
      spaceSpecificPalette.append(item1);

      const item2 = document.createElement("li", {
        is: "customizable-element",
      });
      item2.textContent = "foo bar";
      item2.setAttribute("palette", genericPalette.id);
      const item3 = document.createElement("li", {
        is: "customizable-element",
      });
      item3.textContent = "example item";
      item3.setAttribute("palette", genericPalette.id);
      genericPalette.append(item2, item3);
    });
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }
}
customElements.define(
  "unified-toolbar-customization-pane",
  UnifiedToolbarCustomizationPane
);
