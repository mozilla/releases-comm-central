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

const browserActionMap = new WeakMap();

this.browserAction = class extends ToolbarButtonAPI {
  static for(extension) {
    return browserActionMap.get(extension);
  }

  async onManifestEntry(entryName) {
    await super.onManifestEntry(entryName);
    browserActionMap.set(this.extension, this);
  }

  close() {
    super.close();
    browserActionMap.delete(this.extension);
    windowTracker.removeListener("TabSelect", this);
  }

  constructor(extension) {
    super(extension, global);
    this.manifest_name = "browser_action";
    this.manifestName = "browserAction";
    this.windowURLs = ["chrome://messenger/content/messenger.xhtml"];

    let isTabsToolbar =
      extension.manifest.browser_action.default_area == "tabstoolbar";
    this.toolboxId = isTabsToolbar ? "navigation-toolbox" : "mail-toolbox";
    this.toolbarId = isTabsToolbar ? "tabbar-toolbar" : "mail-bar3";

    windowTracker.addListener("TabSelect", this);
  }

  static onUninstall(extensionId) {
    let widgetId = makeWidgetId(extensionId);
    let id = `${widgetId}-browserAction-toolbarbutton`;
    let windowURL = "chrome://messenger/content/messenger.xhtml";

    // Check all possible toolbars and remove the toolbarbutton if found.
    // Sadly we have to hardcode these values here, as the add-on is already
    // shutdown when onUninstall is called.
    let toolbars = ["mail-bar3", "tabbar-toolbar", "mail-toolbar-menubar2"];
    for (let toolbar of toolbars) {
      let currentSet = Services.xulStore
        .getValue(windowURL, toolbar, "currentset")
        .split(",");
      let newSet = currentSet.filter(e => e != id);
      if (newSet.length < currentSet.length) {
        Services.xulStore.setValue(
          windowURL,
          toolbar,
          "currentset",
          newSet.join(",")
        );
      }
    }
  }

  handleEvent(event) {
    super.handleEvent(event);
    let window = event.target.ownerGlobal;

    switch (event.type) {
      case "popupshowing":
        const menu = event.target;
        const trigger = menu.triggerNode;
        const node = window.document.getElementById(this.id);
        const contexts = [
          "toolbar-context-menu",
          "customizationPanelItemContextMenu",
        ];

        if (contexts.includes(menu.id) && node && node.contains(trigger)) {
          global.actionContextMenu({
            tab: tabTracker.activeTab,
            pageUrl: tabTracker.activeTab.linkedBrowser.currentURI.spec,
            extension: this.extension,
            onBrowserAction: true,
            menu,
          });
        }
        break;
    }
  }
};

global.browserActionFor = this.browserAction.for;
