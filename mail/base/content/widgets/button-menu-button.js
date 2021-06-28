/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * The MozButtonMenuButton widget is a button with type="menu-button"
   * Unlike a button with type="menu", this type requires the user to press the
   * dropmarker arrow to open the menu, but a different command may be invoked
   * when the main part of the button is pressed.
   * Place a menupopup element inside the button to create the menu popup.
   *
   * @extends MozButton
   */
  class MozButtonMenuButton extends customElements.get("button") {
    static get inheritedAttributes() {
      return {
        ...super.inheritedAttributes,
        ".button-menubutton-button": "disabled",
        ".button-menubutton-dropmarker": "open,disabled",
      };
    }

    static get menubuttonFragment() {
      let frag = document.importNode(
        MozXULElement.parseXULToFragment(`
          <hbox class="box-inherit button-box" align="center" pack="center" flex="1">
            <button class="box-inherit button-menubutton-button" allowevents="true" flex="1"></button>
            <dropmarker class="button-menubutton-dropmarker"></dropmarker>
          </hbox>`),
        true
      );
      Object.defineProperty(this, "menubuttonFragment", { value: frag });
      return frag;
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this._hasConnected) {
        return;
      }
      this.setAttribute("is", "button-menu-button");
      this.setAttribute("type", "menu-button"); // Ensure type is set.

      let fragment = this.constructor.menubuttonFragment;
      this.appendChild(fragment.cloneNode(true));

      let button = this.querySelector("button");
      button.addEventListener("command", event => {
        // Retarget the command on the main object.
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent("command", { bubbles: true }));
      });
      button.addEventListener("keydown", event => {
        if (event.key != "Enter" && event.key != " ") {
          return;
        }
        // Prevent button keyboard action from also causing both the default
        // action and opening of the menupopup.
        event.stopPropagation();
      });

      this.addEventListener("keydown", event => {
        if (event.key != "Enter" && event.key != " ") {
          return;
        }

        this.open = true;
        // Prevent page from scrolling on the space key.
        if (event.key == " ") {
          event.preventDefault();
        }
      });
      this.initializeAttributeInheritance();
    }
  }
  customElements.define("button-menu-button", MozButtonMenuButton, {
    extends: "button",
  });
}
