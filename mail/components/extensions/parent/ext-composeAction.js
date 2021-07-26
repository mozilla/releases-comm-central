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

const composeActionMap = new WeakMap();

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
    this.windowURLs = [
      "chrome://messenger/content/messengercompose/messengercompose.xhtml",
    ];

    let isFormatToolbar =
      extension.manifest.compose_action.default_area == "formattoolbar";
    this.toolboxId = isFormatToolbar ? "FormatToolbox" : "compose-toolbox";
    this.toolbarId = isFormatToolbar ? "FormatToolbar" : "composeToolbar2";

    if (isFormatToolbar) {
      this.paint = this.paintFormatToolbar;
    }
  }

  static onUninstall(extensionId) {
    let widgetId = makeWidgetId(extensionId);
    let id = `${widgetId}-composeAction-toolbarbutton`;
    let windowURL =
      "chrome://messenger/content/messengercompose/messengercompose.xhtml";

    // Check all possible toolbars and remove the toolbarbutton if found.
    // Sadly we have to hardcode these values here, as the add-on is already
    // shutdown when onUninstall is called.
    let toolbars = ["composeToolbar2", "FormatToolbar"];
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
        break;
    }
  }

  makeButton(window) {
    let button = super.makeButton(window);
    if (this.toolbarId == "FormatToolbar") {
      button.classList.add("formatting-button");
      // The format toolbar has no associated context menu. Add one directly to
      // this button.
      button.setAttribute("context", "format-toolbar-context-menu");
    }
    return button;
  }

  paintFormatToolbar(window) {
    let { document } = window;
    if (document.getElementById(this.id)) {
      return;
    }

    let toolbar = document.getElementById(this.toolbarId);
    let button = this.makeButton(window);
    let before = toolbar.lastElementChild;
    while (before.localName == "spacer") {
      before = before.previousElementSibling;
    }
    toolbar.insertBefore(button, before.nextElementSibling);

    if (this.extension.hasPermission("menus")) {
      document.addEventListener("popupshowing", this);
    }
  }
};

global.composeActionFor = this.composeAction.for;
