/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./search-bar.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Template ID: unifiedToolbarCustomizationPaneTemplate
 */
class UnifiedToolbarCustomizationPane extends HTMLElement {
  static get REQUIRED_CUSTOM_ELEMENTS() {
    return {
      "search-bar": "chrome://messenger/content/unifiedtoolbar/search-bar.js",
    };
  }

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }
    this.setAttribute("role", "tabpanel");
    const shadowRoot = this.attachShadow({ mode: "open" });
    document.l10n.connectRoot(shadowRoot);
    const template = document
      .getElementById("unifiedToolbarCustomizationPaneTemplate")
      .content.cloneNode(true);
    const styles = document.createElement("link");
    styles.setAttribute("rel", "stylesheet");
    styles.setAttribute(
      "href",
      "chrome://messenger/skin/shared/unifiedToolbarCustomizationPane.css"
    );
    shadowRoot.append(styles, template);
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }
}
customElements.define(
  "unified-toolbar-customization-pane",
  UnifiedToolbarCustomizationPane
);
