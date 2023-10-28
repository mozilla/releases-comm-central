/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { UnifiedToolbarButton } from "./unified-toolbar-button.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ExtensionParent: "resource://gre/modules/ExtensionParent.sys.mjs",
});
const browserActionFor = extensionId => {
  const extension =
    lazy.ExtensionParent.GlobalManager.getExtension(extensionId);
  if (!extension) {
    return null;
  }
  return lazy.ExtensionParent.apiManager.global.browserActionFor(extension);
};

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
      if (this.#action?.extension?.hasPermission("menus")) {
        document.addEventListener("popupshowing", this.#action);
      }
      return;
    }
    super.connectedCallback();
    this.#action = browserActionFor(this.getAttribute("extension"));
    if (!this.#action) {
      return;
    }
    const contextData = this.#action.getContextData(
      this.#action.getTargetFromWindow(window)
    );
    this.applyTabData(contextData);
    if (this.#action.extension.hasPermission("menus")) {
      document.addEventListener("popupshowing", this.#action);
      if (this.#action.defaults.type == "menu") {
        const menupopup = document.createXULElement("menupopup");
        menupopup.dataset.actionMenu = this.#action.manifestName;
        menupopup.dataset.extensionId = this.#action.extension.id;
        menupopup.addEventListener("popuphiding", event => {
          if (event.target.state === "open") {
            return;
          }
          this.removeAttribute("aria-pressed");
        });
        this.appendChild(menupopup);
      }
    }
  }

  disconnectedCallback() {
    if (this.#action?.extension?.hasPermission("menus")) {
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
   *   ExtensionToolbarButtons.sys.mjs for more details.
   */
  applyTabData(tabData) {
    if (!this.#action) {
      this.#action = browserActionFor(this.getAttribute("extension"));
    }
    this.title = tabData.title || this.#action.extension.name;
    this.setAttribute("label", tabData.label || this.title);
    this.classList.toggle("prefer-icon-only", tabData.label == "");
    this.badge = tabData.badgeText;
    this.disabled = !tabData.enabled;
    const { style } = this.#action.iconData.get(tabData.icon);
    for (const [propName, value] of style) {
      this.style.setProperty(propName, value);
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
    this.toggleAttribute("popup", tabData.popup || tabData.type == "menu");
    if (!tabData.popup) {
      this.removeAttribute("aria-pressed");
    }
  }

  handleClick = event => {
    // If there is a menupopup associated with this button, open it, instead of
    // executing the click action.
    const menupopup = this.querySelector("menupopup");
    if (menupopup) {
      event.preventDefault();
      event.stopPropagation();
      menupopup.openPopup(this, {
        position: "after_start",
        triggerEvent: event,
      });
      this.setAttribute("aria-pressed", "true");
      return;
    }
    this.#action?.handleEvent(event);
  };

  handlePopupShowing(event) {
    this.#action.handleEvent(event);
  }
}
customElements.define("extension-action-button", ExtensionActionButton, {
  extends: "button",
});
