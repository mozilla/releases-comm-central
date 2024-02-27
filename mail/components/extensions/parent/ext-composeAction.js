/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  ToolbarButtonAPI: "resource:///modules/ExtensionToolbarButtons.sys.mjs",
});

const composeActionMap = new WeakMap();

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { makeWidgetId } = ExtensionCommon;

this.composeAction = class extends ToolbarButtonAPI {
  static for(extension) {
    return composeActionMap.get(extension);
  }

  async onManifestEntry(entryName) {
    await super.onManifestEntry(entryName);
    composeActionMap.set(this.extension, this);
  }

  close() {
    super.close();
    composeActionMap.delete(this.extension);
  }

  constructor(extension) {
    super(extension, global);
    this.manifest_name = "compose_action";
    this.manifestName = "composeAction";
    this.manifest = extension.manifest[this.manifest_name];
    this.moduleName = this.manifestName;

    this.windowURLs = [
      "chrome://messenger/content/messengercompose/messengercompose.xhtml",
    ];
    const isFormatToolbar =
      extension.manifest.compose_action.default_area == "formattoolbar";
    this.toolboxId = isFormatToolbar ? "FormatToolbox" : "compose-toolbox";
    this.toolbarId = isFormatToolbar ? "FormatToolbar" : "composeToolbar2";
  }

  static onUninstall(extensionId) {
    const widgetId = makeWidgetId(extensionId);
    const id = `${widgetId}-composeAction-toolbarbutton`;
    const windowURL =
      "chrome://messenger/content/messengercompose/messengercompose.xhtml";

    // Check all possible toolbars and remove the toolbarbutton if found.
    // Sadly we have to hardcode these values here, as the add-on is already
    // shutdown when onUninstall is called.
    const toolbars = ["composeToolbar2", "FormatToolbar"];
    for (const toolbar of toolbars) {
      for (const setName of ["currentset", "extensionset"]) {
        const set = Services.xulStore
          .getValue(windowURL, toolbar, setName)
          .split(",");
        const newSet = set.filter(e => e != id);
        if (newSet.length < set.length) {
          Services.xulStore.setValue(
            windowURL,
            toolbar,
            setName,
            newSet.join(",")
          );
        }
      }
    }
  }

  handleEvent(event) {
    super.handleEvent(event);
    const window = event.target.ownerGlobal;

    switch (event.type) {
      case "popupshowing": {
        const menu = event.target;
        // Exit early, if this is not a menupopup (for example a tooltip).
        if (menu.tagName != "menupopup") {
          return;
        }

        const trigger = menu.triggerNode;
        const node = window.document.getElementById(this.id);
        const contexts = [
          "format-toolbar-context-menu",
          "toolbar-context-menu",
          "customizationPanelItemContextMenu",
        ];
        if (contexts.includes(menu.id) && node && node.contains(trigger)) {
          global.actionContextMenu({
            tab: window,
            pageUrl: window.browser.currentURI.spec,
            extension: this.extension,
            onComposeAction: true,
            menu,
          });
        }

        if (
          menu.dataset.actionMenu == "composeAction" &&
          this.extension.id == menu.dataset.extensionId
        ) {
          global.actionContextMenu({
            tab: window,
            pageUrl: window.browser.currentURI.spec,
            extension: this.extension,
            inComposeActionMenu: true,
            menu,
          });
        }
        break;
      }
    }
  }

  makeButton(window) {
    const button = super.makeButton(window);
    if (this.toolbarId == "FormatToolbar") {
      button.classList.add("formatting-button");
      // The format toolbar has no associated context menu. Add one directly to
      // this button.
      button.setAttribute("context", "format-toolbar-context-menu");
    }
    return button;
  }

  /**
   * Returns an element in the toolbar, which is to be used as default insertion
   * point for new toolbar buttons in non-customizable toolbars.
   *
   * May return null to append new buttons to the end of the toolbar.
   *
   * @param {DOMElement} toolbar - a toolbar node
   * @returns {DOMElement} a node which is to be used as insertion point, or null
   */
  getNonCustomizableToolbarInsertionPoint(toolbar) {
    let before = toolbar.lastElementChild;
    while (before.localName == "spacer") {
      before = before.previousElementSibling;
    }
    return before.nextElementSibling;
  }
};

global.composeActionFor = this.composeAction.for;
