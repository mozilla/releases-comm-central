/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  ToolbarButtonAPI: "resource:///modules/ExtensionToolbarButtons.sys.mjs",
});

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
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
    this.manifest = extension.manifest[this.manifest_name];
    this.moduleName = this.manifestName;

    this.windowURLs = [
      "chrome://messenger/content/messenger.xhtml",
      "chrome://messenger/content/messageWindow.xhtml",
    ];
    this.toolboxId = "header-view-toolbox";
    this.toolbarId = "header-view-toolbar";

    windowTracker.addListener("TabSelect", this);
  }

  static onUninstall(extensionId) {
    const widgetId = makeWidgetId(extensionId);
    const id = `${widgetId}-messageDisplayAction-toolbarbutton`;
    const toolbar = "header-view-toolbar";

    // Check all possible windows and remove the toolbarbutton if found.
    // Sadly we have to hardcode these values here, as the add-on is already
    // shutdown when onUninstall is called.
    const windowURLs = [
      "chrome://messenger/content/messenger.xhtml",
      "chrome://messenger/content/messageWindow.xhtml",
    ];
    for (const windowURL of windowURLs) {
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

  /**
   * Overrides the super class to update every about:message in this window.
   */
  paint(window) {
    window.addEventListener("aboutMessageLoaded", this);
    for (const bc of window.browsingContext.getAllBrowsingContextsInSubtree()) {
      if (bc.currentURI.spec == "about:message") {
        super.paint(bc.window);
      }
    }
  }

  /**
   * Overrides the super class to update every about:message in this window.
   */
  unpaint(window) {
    window.removeEventListener("aboutMessageLoaded", this);
    for (const bc of window.browsingContext.getAllBrowsingContextsInSubtree()) {
      if (bc.currentURI.spec == "about:message") {
        super.unpaint(bc.window);
      }
    }
  }

  /**
   * Overrides the super class to update every about:message in this window.
   */
  async updateWindow(window) {
    for (const bc of window.browsingContext.getAllBrowsingContextsInSubtree()) {
      if (bc.currentURI.spec == "about:message") {
        super.updateWindow(bc.window);
      }
    }
  }

  /**
   * Overrides the super class where `target` is a tab, to update
   * about:message instead of the window.
   */
  async updateOnChange(target) {
    if (!target) {
      await super.updateOnChange(target);
      return;
    }

    const window = Cu.getGlobalForObject(target);
    if (window == target) {
      await super.updateOnChange(target);
      return;
    }

    const tabmail = window.top.document.getElementById("tabmail");
    if (!tabmail || target != tabmail.selectedTab) {
      return;
    }

    switch (target.mode.name) {
      case "mail3PaneTab":
        await this.updateWindow(
          target.chromeBrowser.contentWindow.messageBrowser.contentWindow
        );
        break;
      case "mailMessageTab":
        await this.updateWindow(target.chromeBrowser.contentWindow);
        break;
    }
  }

  handleEvent(event) {
    super.handleEvent(event);
    const window = event.target.ownerGlobal;

    switch (event.type) {
      case "aboutMessageLoaded":
        // Add the toolbar button to any about:message that comes along.
        super.paint(event.target);
        break;
      case "popupshowing":
        const menu = event.target;
        // Exit early, if this is not a menupopup (for example a tooltip).
        if (menu.tagName != "menupopup") {
          return;
        }

        const trigger = menu.triggerNode;
        const node = window.document.getElementById(this.id);
        const contexts = ["header-toolbar-context-menu"];
        if (contexts.includes(menu.id) && node && node.contains(trigger)) {
          global.actionContextMenu({
            tab: window.tabOrWindow,
            pageUrl: window.getMessagePaneBrowser().currentURI.spec,
            extension: this.extension,
            onMessageDisplayAction: true,
            menu,
          });
        }

        if (
          menu.dataset.actionMenu == "messageDisplayAction" &&
          this.extension.id == menu.dataset.extensionId
        ) {
          global.actionContextMenu({
            tab: window.tabOrWindow,
            pageUrl: window.getMessagePaneBrowser().currentURI.spec,
            extension: this.extension,
            inMessageDisplayActionMenu: true,
            menu,
          });
        }
        break;
    }
  }

  /**
   * Overrides the super class to trigger the action in the current about:message.
   */
  async triggerAction(window, options) {
    // Supported message browsers:
    // - in mail tab (browser could be hidden)
    // - in message tab
    // - in message window

    // The passed in window could be the window of one of the supported message
    // browsers already. To know if the browser is hidden, always re-search the
    // message window and start at the top.
    const tabmail = window.top.document.getElementById("tabmail");
    if (tabmail) {
      // A mail tab or a message tab.
      const isHidden =
        tabmail.currentAbout3Pane &&
        tabmail.currentAbout3Pane.messageBrowser.hidden;

      if (tabmail.currentAboutMessage && !isHidden) {
        return super.triggerAction(tabmail.currentAboutMessage, options);
      }
    } else if (window.top.messageBrowser) {
      // A message window.
      return super.triggerAction(
        window.top.messageBrowser.contentWindow,
        options
      );
    }

    return false;
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
    return toolbar.querySelector("#otherActionsButton");
  }

  makeButton(window) {
    const button = super.makeButton(window);
    button.classList.add("message-header-view-button");
    // The header toolbar has no associated context menu. Add one directly to
    // this button.
    button.setAttribute("context", "header-toolbar-context-menu");
    return button;
  }
};

global.messageDisplayActionFor = this.messageDisplayAction.for;
