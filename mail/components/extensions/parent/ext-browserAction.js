/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.defineModuleGetter(
  this,
  "ToolbarButtonAPI",
  "resource:///modules/ExtensionToolbarButtons.jsm"
);
ChromeUtils.defineESModuleGetters(this, {
  storeState: "resource:///modules/CustomizationState.mjs",
  getState: "resource:///modules/CustomizationState.mjs",
  registerExtension: "resource:///modules/CustomizableItems.sys.mjs",
  unregisterExtension: "resource:///modules/CustomizableItems.sys.mjs",
});

var { ExtensionCommon } = ChromeUtils.import(
  "resource://gre/modules/ExtensionCommon.jsm"
);
var { makeWidgetId } = ExtensionCommon;

const browserActionMap = new WeakMap();

this.browserAction = class extends ToolbarButtonAPI {
  static for(extension) {
    return browserActionMap.get(extension);
  }

  async onManifestEntry(entryName) {
    await super.onManifestEntry(entryName);
    browserActionMap.set(this.extension, this);
    if (this.inUnifiedToolbar) {
      await registerExtension(this.extension.id);
      const currentToolbarState = getState();
      const unifiedToolbarButtonId = `ext-${this.extension.id}`;
      if (
        currentToolbarState.mail &&
        !currentToolbarState.mail.includes(unifiedToolbarButtonId)
      ) {
        currentToolbarState.mail.push(unifiedToolbarButtonId);
        storeState(currentToolbarState);
      } else {
        Services.obs.notifyObservers(null, "unified-toolbar-state-change");
      }
    }
  }

  close() {
    super.close();
    browserActionMap.delete(this.extension);
    if (this.inUnifiedToolbar) {
      unregisterExtension(this.extension.id);
      windowTracker.removeListener("TabSelect", this);
      Services.obs.notifyObservers(null, "unified-toolbar-state-change");
    }
  }

  constructor(extension) {
    super(extension, global);
    this.manifest_name =
      extension.manifestVersion < 3 ? "browser_action" : "action";
    this.manifestName =
      extension.manifestVersion < 3 ? "browserAction" : "action";
    let manifest = extension.manifest[this.manifest_name];

    this.windowURLs = [];
    if (manifest.default_windows.includes("normal")) {
      this.inUnifiedToolbar = true;
    }
    if (manifest.default_windows.includes("messageDisplay")) {
      this.windowURLs.push("chrome://messenger/content/messageWindow.xhtml");
    }

    this.toolboxId = "mail-toolbox";
    this.toolbarId = "mail-bar3";

    windowTracker.addListener("TabSelect", this);
  }

  static onUninstall(extensionId) {
    let widgetId = makeWidgetId(extensionId);
    let id = `${widgetId}-browserAction-toolbarbutton`;

    // Check all possible toolbars and remove the toolbarbutton if found.
    // Sadly we have to hardcode these values here, as the add-on is already
    // shutdown when onUninstall is called.
    let toolbars = ["mail-bar3", "toolbar-menubar"];
    for (let toolbar of toolbars) {
      for (let setName of ["currentset", "extensionset"]) {
        let set = Services.xulStore
          .getValue(
            "chrome://messenger/content/messageWindow.xhtml",
            toolbar,
            setName
          )
          .split(",");
        let newSet = set.filter(e => e != id);
        if (newSet.length < set.length) {
          Services.xulStore.setValue(
            "chrome://messenger/content/messageWindow.xhtml",
            toolbar,
            setName,
            newSet.join(",")
          );
        }
      }
    }

    const currentToolbarState = getState();
    const unifiedToolbarButtonId = `ext-${extensionId}`;
    if (currentToolbarState.mail?.includes(unifiedToolbarButtonId)) {
      currentToolbarState.mail.splice(
        currentToolbarState.mail.indexOf(unifiedToolbarButtonId),
        1
      );
      storeState(currentToolbarState);
    }
  }

  handleEvent(event) {
    super.handleEvent(event);
    let window = event.target.ownerGlobal;

    switch (event.type) {
      case "popupshowing":
        const menu = event.target;
        const trigger = menu.triggerNode;
        const node =
          window.document.getElementById(this.id) ||
          (this.inUnifiedToolbar &&
            window.document.querySelector(
              `#unifiedToolbarContent [item-id="ext-${this.extension.id}"]`
            ));
        const contexts = [
          "toolbar-context-menu",
          "customizationPanelItemContextMenu",
          "unifiedToolbarMenu",
        ];

        if (contexts.includes(menu.id) && node && node.contains(trigger)) {
          // This needs to work in normal window and message window.
          let tab = tabTracker.activeTab;
          let browser = tab.linkedBrowser || tab.getBrowser?.();
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
        break;
    }
  }
};

global.browserActionFor = this.browserAction.for;
