/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  storeState: "resource:///modules/CustomizationState.mjs",
  getState: "resource:///modules/CustomizationState.mjs",
  registerExtension: "resource:///modules/CustomizableItems.sys.mjs",
  unregisterExtension: "resource:///modules/CustomizableItems.sys.mjs",
  EXTENSION_PREFIX: "resource:///modules/CustomizableItems.sys.mjs",
  ToolbarButtonAPI: "resource:///modules/ExtensionToolbarButtons.sys.mjs",
  getCachedAllowedSpaces: "resource:///modules/ExtensionToolbarButtons.sys.mjs",
  setCachedAllowedSpaces: "resource:///modules/ExtensionToolbarButtons.sys.mjs",
});

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);

var { makeWidgetId } = ExtensionCommon;

const browserActionMap = new WeakMap();

this.browserAction = class extends ToolbarButtonAPI {
  static for(extension) {
    return browserActionMap.get(extension);
  }

  /**
   * A browser_action can be placed in the unified toolbar of the main window and
   * in the XUL toolbar of the message window. We conditionally bypass XUL toolbar
   * behavior by using the following custom method implementations.
   */

  paint(window) {
    // Ignore XUL toolbar paint requests for the main window.
    if (window.location.href != MAIN_WINDOW_URI) {
      super.paint(window);
    }
  }

  unpaint(window) {
    // Ignore XUL toolbar unpaint requests for the main window.
    if (window.location.href != MAIN_WINDOW_URI) {
      super.unpaint(window);
    }
  }

  /**
   * Return the toolbar button if it is currently visible in the given window.
   *
   * @param window
   * @returns {DOMElement} the toolbar button element, or null
   */
  getToolbarButton(window) {
    // Return the visible button from the unified toolbar, if this is the main window.
    if (window.location.href == MAIN_WINDOW_URI) {
      const buttonItem = window.document.querySelector(
        `#unifiedToolbarContent [item-id="ext-${this.extension.id}"]`
      );
      return (
        buttonItem &&
        !buttonItem.hidden &&
        window.document.querySelector(
          `#unifiedToolbarContent [extension="${this.extension.id}"]`
        )
      );
    }
    return super.getToolbarButton(window);
  }

  updateButton(button, tabData) {
    if (button.applyTabData) {
      // This is an extension-action-button customElement and therefore a button
      // in the unified toolbar and needs special handling.
      button.applyTabData(tabData);
    } else {
      super.updateButton(button, tabData);
    }
  }

  async onManifestEntry(entryName) {
    await super.onManifestEntry(entryName);
    browserActionMap.set(this.extension, this);

    // Check if a browser_action was added to the unified toolbar.
    if (this.windowURLs.includes(MAIN_WINDOW_URI)) {
      await registerExtension(this.extension.id, this.allowedSpaces);
      const currentToolbarState = getState();
      const unifiedToolbarButtonId = `${EXTENSION_PREFIX}${this.extension.id}`;

      // Load the cached allowed spaces. Make sure there are no awaited promises
      // before storing the updated allowed spaces, as it could have been changed
      // elsewhere.
      const cachedAllowedSpaces = getCachedAllowedSpaces();
      const priorAllowedSpaces = cachedAllowedSpaces.get(this.extension.id);

      // If the extension has set allowedSpaces to an empty array, the button needs
      // to be added to all available spaces.
      const allowedSpaces =
        this.allowedSpaces.length == 0
          ? [
              "mail",
              "addressbook",
              "calendar",
              "tasks",
              "chat",
              "settings",
              "default",
            ]
          : this.allowedSpaces;

      // Manually add the button to all customized spaces, where it has not been
      // allowed in the prior version of this add-on (if any). This automatically
      // covers the install and the update case, including staged updates.
      // Spaces which have not been customized will receive the button from
      // getDefaultItemIdsForSpace() in CustomizableItems.sys.mjs.
      const missingSpacesInState = allowedSpaces.filter(
        space =>
          (!priorAllowedSpaces || !priorAllowedSpaces.includes(space)) &&
          space !== "default" &&
          currentToolbarState.hasOwnProperty(space) &&
          !currentToolbarState[space].includes(unifiedToolbarButtonId)
      );
      for (const space of missingSpacesInState) {
        currentToolbarState[space].push(unifiedToolbarButtonId);
      }

      // Manually remove button from all customized spaces, if it is no longer
      // allowed. This will remove its stored customized positioning information.
      // If a space becomes allowed again later, the button will be added to the
      // end of the space and not at its former customized location.
      let invalidSpacesInState = [];
      if (priorAllowedSpaces) {
        invalidSpacesInState = priorAllowedSpaces.filter(
          space =>
            space !== "default" &&
            !allowedSpaces.includes(space) &&
            currentToolbarState.hasOwnProperty(space) &&
            currentToolbarState[space].includes(unifiedToolbarButtonId)
        );
        for (const space of invalidSpacesInState) {
          currentToolbarState[space] = currentToolbarState[space].filter(
            id => id != unifiedToolbarButtonId
          );
        }
      }

      // Update the cached values for the allowed spaces.
      cachedAllowedSpaces.set(this.extension.id, allowedSpaces);
      setCachedAllowedSpaces(cachedAllowedSpaces);

      if (missingSpacesInState.length || invalidSpacesInState.length) {
        storeState(currentToolbarState);
      } else {
        Services.obs.notifyObservers(null, "unified-toolbar-state-change");
      }
    }
  }

  close() {
    super.close();
    browserActionMap.delete(this.extension);
    windowTracker.removeListener("TabSelect", this);
    // Unregister the extension from the unified toolbar.
    if (this.windowURLs.includes(MAIN_WINDOW_URI)) {
      unregisterExtension(this.extension.id);
      Services.obs.notifyObservers(null, "unified-toolbar-state-change");
    }
  }

  constructor(extension) {
    super(extension, global);
    this.manifest_name =
      extension.manifestVersion < 3 ? "browser_action" : "action";
    this.manifestName =
      extension.manifestVersion < 3 ? "browserAction" : "action";
    this.manifest = extension.manifest[this.manifest_name];
    // browserAction was renamed to action in MV3, but its module name is
    // still "browserAction" because that is the name used in ext-mail.json,
    // independently from the manifest version.
    this.moduleName = "browserAction";

    this.windowURLs = [];
    if (this.manifest.default_windows.includes("normal")) {
      this.windowURLs.push(MAIN_WINDOW_URI);
    }
    if (this.manifest.default_windows.includes("messageDisplay")) {
      this.windowURLs.push(MESSAGE_WINDOW_URI);
    }

    this.toolboxId = "mail-toolbox";
    this.toolbarId = "mail-bar3";

    this.allowedSpaces =
      this.extension.manifest[this.manifest_name].allowed_spaces;

    windowTracker.addListener("TabSelect", this);
  }

  static onUpdate(extensionId, manifest) {
    // These manifest entries can exist and be null.
    if (!manifest.browser_action && !manifest.action) {
      this.#removeFromUnifiedToolbar(extensionId);
    }
  }

  static onUninstall(extensionId) {
    const widgetId = makeWidgetId(extensionId);
    const id = `${widgetId}-browserAction-toolbarbutton`;

    // Check all possible XUL toolbars and remove the toolbarbutton if found.
    // Sadly we have to hardcode these values here, as the add-on is already
    // shutdown when onUninstall is called.
    const toolbars = ["mail-bar3", "toolbar-menubar"];
    for (const toolbar of toolbars) {
      for (const setName of ["currentset", "extensionset"]) {
        const set = Services.xulStore
          .getValue(MESSAGE_WINDOW_URI, toolbar, setName)
          .split(",");
        const newSet = set.filter(e => e != id);
        if (newSet.length < set.length) {
          Services.xulStore.setValue(
            MESSAGE_WINDOW_URI,
            toolbar,
            setName,
            newSet.join(",")
          );
        }
      }
    }

    this.#removeFromUnifiedToolbar(extensionId);
  }

  static #removeFromUnifiedToolbar(extensionId) {
    const currentToolbarState = getState();
    const unifiedToolbarButtonId = `${EXTENSION_PREFIX}${extensionId}`;
    let modifiedState = false;
    for (const space of Object.keys(currentToolbarState)) {
      if (currentToolbarState[space].includes(unifiedToolbarButtonId)) {
        currentToolbarState[space].splice(
          currentToolbarState[space].indexOf(unifiedToolbarButtonId),
          1
        );
        modifiedState = true;
      }
    }
    if (modifiedState) {
      storeState(currentToolbarState);
    }

    // Update cachedAllowedSpaces for the unified toolbar.
    const cachedAllowedSpaces = getCachedAllowedSpaces();
    if (cachedAllowedSpaces.has(extensionId)) {
      cachedAllowedSpaces.delete(extensionId);
      setCachedAllowedSpaces(cachedAllowedSpaces);
    }
  }

  handleEvent(event) {
    super.handleEvent(event);
    const window = event.target.ownerGlobal;

    switch (event.type) {
      case "popupshowing":
        const menu = event.target;
        // Exit early, if this is not a menupopup (for example a tooltip).
        if (menu.tagName != "menupopup") {
          return;
        }

        // This needs to work in normal window and message window.
        const tab = tabTracker.activeTab;
        const browser = tab.linkedBrowser || tab.getBrowser?.();

        const trigger = menu.triggerNode;
        const node =
          window.document.getElementById(this.id) ||
          (this.windowURLs.includes(MAIN_WINDOW_URI) &&
            window.document.querySelector(
              `#unifiedToolbarContent [item-id="${EXTENSION_PREFIX}${this.extension.id}"]`
            ));
        const contexts = [
          "toolbar-context-menu",
          "customizationPanelItemContextMenu",
          "unifiedToolbarMenu",
        ];
        if (contexts.includes(menu.id) && node && node.contains(trigger)) {
          const action =
            this.extension.manifestVersion < 3 ? "onBrowserAction" : "onAction";
          global.actionContextMenu({
            tab,
            pageUrl: browser?.currentURI?.spec,
            extension: this.extension,
            [action]: true,
            menu,
          });
        }

        if (
          menu.dataset.actionMenu == this.manifestName &&
          this.extension.id == menu.dataset.extensionId
        ) {
          const action =
            this.extension.manifestVersion < 3
              ? "inBrowserActionMenu"
              : "inActionMenu";
          global.actionContextMenu({
            tab,
            pageUrl: browser?.currentURI?.spec,
            extension: this.extension,
            [action]: true,
            menu,
          });
        }
        break;
    }
  }
};

global.browserActionFor = this.browserAction.for;
