/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * The MozToolbarButtonMenuButton widget is a toolbarbutton with
   * type="menu". Place a menupopup element inside the button to create
   * the menu popup. When the dropmarker in the toobarbutton is pressed the
   * menupopup will open. When clicking the main area of the button it works
   * like a normal toolbarbutton.
   *
   * @augments MozToolbarbutton
   */
  class MozToolbarButtonMenuButton extends customElements.get("toolbarbutton") {
    static get inheritedAttributes() {
      return {
        ...super.inheritedAttributes,
        ".toolbarbutton-menubutton-button":
          "command,hidden,disabled,align,dir,pack,orient,label,wrap,tooltiptext=buttontooltiptext",
        ".toolbarbutton-menubutton-dropmarker": "open,disabled",
      };
    }
    static get menubuttonFragment() {
      const frag = document.importNode(
        MozXULElement.parseXULToFragment(`
          <toolbarbutton class="box-inherit toolbarbutton-menubutton-button"
                         flex="1"
                         allowevents="true"></toolbarbutton>
          <dropmarker type="menu"
                      class="toolbarbutton-menubutton-dropmarker"></dropmarker>
        `),
        true
      );
      Object.defineProperty(this, "menubuttonFragment", { value: frag });
      return frag;
    }

    /** @override */
    get _hasConnected() {
      return (
        this.querySelector(":scope > toolbarbutton > .toolbarbutton-text") !=
        null
      );
    }

    /** @override */
    render() {
      this.appendChild(this.constructor.menubuttonFragment.cloneNode(true));
      this.initializeAttributeInheritance();
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this._hasConnected) {
        return;
      }

      // Defer creating DOM elements for content inside popups.
      // These will be added in the popupshown handler above.
      const panel = this.closest("panel");
      if (panel && !panel.hasAttribute("hasbeenopened")) {
        return;
      }
      this.setAttribute("is", "toolbarbutton-menu-button");
      this.setAttribute("type", "menu");

      this.render();
    }
  }
  customElements.define(
    "toolbarbutton-menu-button",
    MozToolbarButtonMenuButton,
    { extends: "toolbarbutton" }
  );
}
