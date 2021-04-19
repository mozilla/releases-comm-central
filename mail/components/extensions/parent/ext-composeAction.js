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

    let format =
      extension.manifest.compose_action.default_area == "formattoolbar";
    this.toolboxId = format ? "FormatToolbox" : "compose-toolbox";
    this.toolbarId = format ? "FormatToolbar" : "composeToolbar2";

    if (format) {
      this.paint = this.paintFormatToolbar;
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

        if (menu.getAttribute("data-action-menu") == "composeAction") {
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

  static onUninstall(extensionId) {
    let widgetId = makeWidgetId(extensionId);
    let id = `${widgetId}-composeAction-toolbarbutton`;

    let windowURL =
      "chrome://messenger/content/messengercompose/messengercompose.xhtml";
    let currentSet = Services.xulStore.getValue(
      windowURL,
      "composeToolbar2",
      "currentset"
    );
    currentSet = currentSet.split(",");
    let index = currentSet.indexOf(id);
    if (index >= 0) {
      currentSet.splice(index, 1);
      Services.xulStore.setValue(
        windowURL,
        "composeToolbar2",
        "currentset",
        currentSet.join(",")
      );
    }
  }
};

global.composeActionFor = this.composeAction.for;
