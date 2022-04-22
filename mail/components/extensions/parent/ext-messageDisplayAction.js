/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.defineModuleGetter(
  this,
  "ToolbarButtonAPI",
  "resource:///modules/ExtensionToolbarButtons.jsm"
);

var { ExtensionCommon } = ChromeUtils.import(
  "resource://gre/modules/ExtensionCommon.jsm"
);
var { makeWidgetId } = ExtensionCommon;

const messageDisplayActionMap = new WeakMap();

this.messageDisplayAction = class extends ToolbarButtonAPI {
  static for(extension) {
    return messageDisplayActionMap.get(extension);
  }

  async onManifestEntry(entryName) {
    await super.onManifestEntry(entryName);
    messageDisplayActionMap.set(this.extension, this);
  }

  close() {
    super.close();
    messageDisplayActionMap.delete(this.extension);
    windowTracker.removeListener("TabSelect", this);
  }

  constructor(extension) {
    super(extension, global);
    this.manifest_name = "message_display_action";
    this.manifestName = "messageDisplayAction";
    this.windowURLs = [
      "chrome://messenger/content/messenger.xhtml",
      "chrome://messenger/content/messageWindow.xhtml",
    ];
    this.toolboxId = "header-view-toolbox";
    this.toolbarId = "header-view-toolbar";

    windowTracker.addListener("TabSelect", this);
  }

  static onUninstall(extensionId) {
    let widgetId = makeWidgetId(extensionId);
    let id = `${widgetId}-messageDisplayAction-toolbarbutton`;
    let toolbar = "header-view-toolbar";

    // Check all possible windows and remove the toolbarbutton if found.
    // Sadly we have to hardcode these values here, as the add-on is already
    // shutdown when onUninstall is called.
    let windowURLs = [
      "chrome://messenger/content/messenger.xhtml",
      "chrome://messenger/content/messageWindow.xhtml",
    ];
    for (let windowURL of windowURLs) {
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
    let { windowManager } = this.extension;
    let window = event.target.ownerGlobal;

    switch (event.type) {
      case "popupshowing":
        const menu = event.target;
        const trigger = menu.triggerNode;
        const node = window.document.getElementById(this.id);
        const contexts = ["header-toolbar-context-menu"];

        if (contexts.includes(menu.id) && node && node.contains(trigger)) {
          // This needs to work in message tab and message window.
          let tab = windowManager.wrapWindow(window).activeTab.nativeTab;
          let browser = tab.linkedBrowser || tab.getBrowser();

          global.actionContextMenu({
            tab,
            pageUrl: browser.currentURI.spec,
            extension: this.extension,
            onMessageDisplayAction: true,
            menu,
          });
        }
        break;
    }
  }

  /**
   * Returns an element in the toolbar, which is to be used as default insertion
   * point for new toolbar buttons in non-customizable toolbars.
   *
   * May return null to append new buttons to the end of the toolbar.
   *
   * @param {DOMElement} toolbar - a toolbar node
   * @return {DOMElement} a node which is to be used as insertion point, or null
   */
  getNonCustomizableToolbarInsertionPoint(toolbar) {
    return toolbar.querySelector("#otherActionsButton");
  }

  makeButton(window) {
    let button = super.makeButton(window);
    button.classList.add("message-header-view-button");
    // The header toolbar has no associated context menu. Add one directly to
    // this button.
    button.setAttribute("context", "header-toolbar-context-menu");
    return button;
  }
};

global.messageDisplayActionFor = this.messageDisplayAction.for;
