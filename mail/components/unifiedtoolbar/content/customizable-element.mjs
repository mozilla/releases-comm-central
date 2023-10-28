/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import CUSTOMIZABLE_ITEMS from "resource:///modules/CustomizableItemsDetails.mjs";

const { EXTENSION_PREFIX } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItems.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ExtensionParent: "resource://gre/modules/ExtensionParent.sys.mjs",
});
const browserActionFor = extensionId =>
  lazy.ExtensionParent.apiManager.global.browserActionFor?.(
    lazy.ExtensionParent.GlobalManager.getExtension(extensionId)
  );

/**
 * Wrapper element for elements whose position can be customized.
 *
 * Template ID: #unifiedToolbarCustomizableElementTemplate
 * Attributes:
 * - item-id: ID of the customizable item this represents. Not observed.
 * - disabled: Gets passed on to the live content.
 */
export default class CustomizableElement extends HTMLLIElement {
  static get observedAttributes() {
    return ["disabled", "tabindex"];
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.setAttribute("is", "customizable-element");

    const template = document
      .getElementById("unifiedToolbarCustomizableElementTemplate")
      .content.cloneNode(true);

    const itemId = this.getAttribute("item-id");

    if (itemId.startsWith(EXTENSION_PREFIX)) {
      const extensionId = itemId.slice(EXTENSION_PREFIX.length);
      this.append(template);
      this.#initializeForExtension(extensionId);
      return;
    }

    const details = CUSTOMIZABLE_ITEMS.find(item => item.id === itemId);
    if (!details) {
      throw new Error(`Could not find definition for ${itemId}`);
    }
    this.append(template);
    this.#initializeFromDetails(details).catch(console.error);
  }

  attributeChangedCallback(attribute) {
    switch (attribute) {
      case "disabled": {
        const isDisabled = this.disabled;
        for (const child of this.querySelector(".live-content")?.children ??
          []) {
          child.toggleAttribute("disabled", isDisabled);
        }
        break;
      }
      case "tabindex": {
        const tabIndex = this.getAttribute("tabindex");
        if (tabIndex === null) {
          return;
        }
        if (this.details?.skipFocus && tabIndex !== "-1") {
          this.removeAttribute("tabindex");
          // Let the container know that an element that shouldn't be focused is
          // currently marked with a tabindex instruction.
          if (this.hasConnected) {
            this.dispatchEvent(new CustomEvent("buttondisabled"));
          }
          return;
        }
        const tabIndexNumber = parseInt(tabIndex, 10);
        for (const child of this.querySelector(".live-content")?.children ??
          []) {
          child.tabIndex = tabIndexNumber;
        }
        if (tabIndex !== "-1") {
          this.removeAttribute("tabindex");
        }
        break;
      }
    }
  }

  /**
   * Initialize the template contents from item details. Can't operate on the
   * template directly due to being async.
   *
   * @param {CustomizableItemDetails} itemDetails
   */
  async #initializeFromDetails(itemDetails) {
    if (this.details) {
      return;
    }
    this.details = itemDetails;
    this.classList.add(itemDetails.id);
    if (Array.isArray(itemDetails.requiredModules)) {
      await Promise.all(
        itemDetails.requiredModules.map(module => {
          return import(module); // eslint-disable-line no-unsanitized/method
        })
      );
    }
    if (itemDetails.templateId) {
      const contentTemplate = document.getElementById(itemDetails.templateId);
      this.querySelector(".live-content").append(
        contentTemplate.content.cloneNode(true)
      );
      if (this.disabled) {
        this.attributeChangedCallback("disabled");
      }
    }
    if (itemDetails.skipFocus) {
      this.classList.add("skip-focus");
    }
    if (this.hasAttribute("tabindex")) {
      this.attributeChangedCallback("tabindex");
    }
    // We need to manually re-emit this event, since it might've been emitted
    // after we cloned the template.
    if (this.querySelector(".live-content button[disabled]")) {
      this.dispatchEvent(new CustomEvent("buttondisabled"));
    }
    document.l10n.setAttributes(
      this.querySelector(".preview-label"),
      `${itemDetails.labelId}-label`
    );
  }

  /**
   * Initialize the contents of this customizable element for a button from an
   * extension.
   *
   * @param {string} extensionId - ID of the extension the button is from.
   */
  async #initializeForExtension(extensionId) {
    const extensionAction = browserActionFor(extensionId);
    if (!extensionAction?.extension) {
      return;
    }
    this.details = {
      allowMultiple: false,
      spaces: extensionAction.allowedSpaces ?? ["mail"],
    };
    if (!customElements.get("extension-action-button")) {
      await import("./extension-action-button.mjs");
    }
    const { extension } = extensionAction;
    this.classList.add("extension-action");
    const extensionButton = document.createElement("button", {
      is: "extension-action-button",
    });
    extensionButton.setAttribute("extension", extensionId);
    this.querySelector(".live-content").append(extensionButton);
    if (this.disabled) {
      this.attributeChangedCallback("disabled");
    }
    if (this.hasAttribute("tabindex")) {
      this.attributeChangedCallback("tabindex");
    }
    // We need to manually re-emit this event, since it might've been emitted
    // before the button was attached to the DOM.
    if (this.querySelector(".live-content button[disabled]")) {
      this.dispatchEvent(new CustomEvent("buttondisabled"));
    }
    const previewLabel = this.querySelector(".preview-label");
    const labelText = extension.name || extensionId;
    previewLabel.textContent = labelText;
    previewLabel.title = labelText;
    const { IconDetails } = lazy.ExtensionParent;
    if (extension.manifest.icons) {
      const { icon } = IconDetails.getPreferredIcon(
        extension.manifest.icons,
        extension,
        16
      );
      const { icon: icon2x } = IconDetails.getPreferredIcon(
        extension.manifest.icons,
        extension,
        32
      );
      this.style.setProperty(
        "--webextension-icon",
        `image-set(
          url("${lazy.ExtensionParent.IconDetails.escapeUrl(icon)}"),
          url("${lazy.ExtensionParent.IconDetails.escapeUrl(icon2x)}") 2x
        )`
      );
    }
  }

  /**
   * Holds a reference to the palette this element belongs to.
   *
   * @type {CustomizationPalette}
   */
  get palette() {
    const paletteClass = this.details.spaces?.length
      ? "space-specific-palette"
      : "generic-palette";
    return this.getRootNode().querySelector(`.${paletteClass}`);
  }

  /**
   * If multiple instances of this element are allowed in the same space.
   *
   * @type {boolean}
   */
  get allowMultiple() {
    return Boolean(this.details?.allowMultiple);
  }

  /**
   * Human readable label for the widget.
   *
   * @type {string}
   */
  get label() {
    return this.querySelector(".preview-label").textContent;
  }

  /**
   * Calls onTabSwitched on the first button contained in the live content.
   * No-op if this item is disabled. Called by unified-toolbar's tab monitor.
   *
   * @param {TabInfo} tab - Tab that is now selected.
   * @param {TabInfo} oldTab - Tab that was selected before.
   */
  onTabSwitched(tab, oldTab) {
    if (this.disabled) {
      return;
    }
    this.querySelector(".live-content button")?.onTabSwitched?.(tab, oldTab);
  }

  /**
   * Calls onTabClosing on the first button contained in the live content.
   * No-op if this item is disabled. Called by unified-toolbar's tab monitor.
   *
   * @param {TabInfo} tab - Tab that was closed.
   */
  onTabClosing(tab) {
    if (this.disabled) {
      return;
    }
    this.querySelector(".live-content button")?.onTabClosing?.(tab);
  }

  /**
   * If this item can be added to all spaces.
   *
   * @type {boolean}
   */
  get allSpaces() {
    return !this.details.spaces?.length;
  }

  /**
   * If this item wants to provide its own context menu.
   *
   * @type {boolean}
   */
  get hasContextMenu() {
    return Boolean(this.details?.hasContextMenu);
  }

  /**
   * @type {boolean}
   */
  get disabled() {
    return this.hasAttribute("disabled");
  }

  set disabled(value) {
    this.toggleAttribute("disabled", value);
  }

  focus() {
    this.querySelector(".live-content *:first-child")?.focus();
  }
}
customElements.define("customizable-element", CustomizableElement, {
  extends: "li",
});
