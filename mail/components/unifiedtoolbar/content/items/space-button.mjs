/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { UnifiedToolbarButton } from "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs";

/* import-globals-from ../../../../base/content/spacesToolbar.js */

/**
 * Unified toolbar button that opens a specific space.
 * Attributes:
 * - space: Space to open when the button is activated
 */
class SpaceButton extends UnifiedToolbarButton {
  connectedCallback() {
    super.connectedCallback();
    const spaceId = this.getAttribute("space");
    const space = gSpacesToolbar.spaces.find(
      spaceDetails => spaceDetails.name == spaceId
    );
    if (space.button.classList.contains("has-badge")) {
      const badgeContainer = space.button.querySelector(
        ".spaces-badge-container"
      );
      this.badge = badgeContainer.textContent;
    }
  }

  handleClick = event => {
    const spaceId = this.getAttribute("space");
    const space = gSpacesToolbar.spaces.find(
      spaceDetails => spaceDetails.name == spaceId
    );
    gSpacesToolbar.openSpace(document.getElementById("tabmail"), space);
    event.preventDefault();
    event.stopPropagation();
  };
}
customElements.define("space-button", SpaceButton, {
  extends: "button",
});
