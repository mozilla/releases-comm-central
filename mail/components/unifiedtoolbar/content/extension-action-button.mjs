/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { UnifiedToolbarButton } from "./unified-toolbar-button.mjs";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};
ChromeUtils.defineModuleGetter(
  lazy,
  "ExtensionParent",
  "resource://gre/modules/ExtensionParent.jsm"
);
XPCOMUtils.defineLazyGetter(lazy, "browserActionFor", () => {
  return extensionId =>
    lazy.ExtensionParent.apiManager.global.browserActionFor(
      lazy.ExtensionParent.GlobalManager.getExtension(extensionId)
    );
});

const BADGE_BACKGROUND_COLOR = "--toolbar-button-badge-bg-color";

/**
 * Attributes:
 * - extension: ID of the extension this button is for.
 * - open: true if the popup is currently open. Gets redirected to aria-pressed.
 */
class ExtensionActionButton extends UnifiedToolbarButton {
  static get observedAttributes() {
    return super.observedAttributes.concat("open");
  }

  /**
   * ext-browserAction instance for this button.
   *
   * @type {?ToolbarButtonAPI}
   */
  #action = null;

  connectedCallback() {
    if (this.hasConnected) {
      super.connectedCallback();
      if (this.#action?.extension.hasPermission("menus")) {
        document.addEventListener("popupshowing", this.#action);
      }
      return;
    }
    super.connectedCallback();
    this.#action = lazy.browserActionFor(this.getAttribute("extension"));
    if (!this.#action) {
      return;
    }
    const contextData = this.#action.getContextData(
      this.#action.getTargetFromWindow(window)
    );
    this.applyTabData(contextData);
    if (this.#action.extension.hasPermission("menus")) {
      document.addEventListener("popupshowing", this.#action);
    }
  }

  disconnectedCallback() {
    if (this.#action?.extension.hasPermission("menus")) {
      document.removeEventListener("popupshowing", this.#action);
    }
  }

  attributeChangedCallback(attribute) {
    super.attributeChangedCallback(attribute);
    if (attribute === "open") {
      if (this.getAttribute("open") === "true") {
        this.setAttribute("aria-pressed", "true");
      } else {
        this.removeAttribute("aria-pressed");
      }
    }
  }

  /**
   * Apply the data for the current tab to the extension button. Updates title,
   * label, icon, badge, disabled and popup.
   *
   * @param {object} tabData - Properties for the button in the current tab. See
   *   ExtensionToolbarButtons.jsm for more details.
   */
  applyTabData(tabData) {
    if (!this.#action) {
      this.#action = lazy.browserActionFor(this.getAttribute("extension"));
    }
    this.title = tabData.title || this.#action.extension.name;
    this.setAttribute("label", tabData.label || this.title);
    this.classList.toggle("prefer-icon-only", !tabData.label);
    this.badge = tabData.badgeText;
    this.disabled = !tabData.enabled;
    const { style } = this.#action.iconData.get(tabData.icon);
    for (const [name, value] of style) {
      this.style.setProperty(name, value);
    }
    if (tabData.badgeText && tabData.badgeBackgroundColor) {
      const bgColor = tabData.badgeBackgroundColor;
      this.style.setProperty(
        BADGE_BACKGROUND_COLOR,
        `rgba(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]}, ${bgColor[3] / 255})`
      );
    } else {
      this.style.removeProperty(BADGE_BACKGROUND_COLOR);
    }
    this.toggleAttribute("popup", tabData.popup);
    if (!tabData.popup) {
      this.removeAttribute("aria-pressed");
    }
  }

  handleClick = event => {
    this.#action?.handleEvent(event);
  };

  handlePopupShowing(event) {
    this.#action.handleEvent(event);
  }
}
customElements.define("extension-action-button", ExtensionActionButton, {
  extends: "button",
});
