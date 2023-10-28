/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);

var AutoHideMenubar = {
  get _node() {
    delete this._node;
    return (this._node =
      document.getElementById("toolbar-menubar") ||
      document.getElementById("compose-toolbar-menubar2") ||
      document.getElementById("addrbook-toolbar-menubar2"));
  },

  _contextMenuListener: {
    contextMenu: null,

    get active() {
      return !!this.contextMenu;
    },

    init(event) {
      // Ignore mousedowns in <menupopup>s.
      if (event.target.closest("menupopup")) {
        return;
      }

      const contextMenuId = AutoHideMenubar._node.getAttribute("context");
      this.contextMenu = document.getElementById(contextMenuId);
      this.contextMenu.addEventListener("popupshown", this);
      this.contextMenu.addEventListener("popuphiding", this);
      AutoHideMenubar._node.addEventListener("mousemove", this);
    },

    handleEvent(event) {
      switch (event.type) {
        case "popupshown":
          AutoHideMenubar._node.removeEventListener("mousemove", this);
          break;
        case "popuphiding":
        case "mousemove":
          AutoHideMenubar._setInactiveAsync();
          AutoHideMenubar._node.removeEventListener("mousemove", this);
          this.contextMenu.removeEventListener("popuphiding", this);
          this.contextMenu.removeEventListener("popupshown", this);
          this.contextMenu = null;
          break;
      }
    },
  },

  init() {
    this._node.addEventListener("toolbarvisibilitychange", this);
    this._enable();
  },

  _updateState() {
    if (this._node.getAttribute("autohide") == "true") {
      this._enable();
    } else {
      this._disable();
    }
  },

  _events: [
    "DOMMenuBarInactive",
    "DOMMenuBarActive",
    "popupshowing",
    "mousedown",
  ],
  _enable() {
    this._node.setAttribute("inactive", "true");
    for (const event of this._events) {
      this._node.addEventListener(event, this);
    }
  },

  _disable() {
    this._setActive();
    for (const event of this._events) {
      this._node.removeEventListener(event, this);
    }
  },

  handleEvent(event) {
    switch (event.type) {
      case "toolbarvisibilitychange":
        this._updateState();
        break;
      case "popupshowing":
      // fall through
      case "DOMMenuBarActive":
        this._setActive();
        break;
      case "mousedown":
        if (event.button == 2) {
          this._contextMenuListener.init(event);
        }
        break;
      case "DOMMenuBarInactive":
        if (!this._contextMenuListener.active) {
          this._setInactiveAsync();
        }
        break;
    }
  },

  _setInactiveAsync() {
    this._inactiveTimeout = setTimeout(() => {
      if (this._node.getAttribute("autohide") == "true") {
        this._inactiveTimeout = null;
        this._node.setAttribute("inactive", "true");
      }
    }, 0);
  },

  _setActive() {
    if (this._inactiveTimeout) {
      clearTimeout(this._inactiveTimeout);
      this._inactiveTimeout = null;
    }
    this._node.removeAttribute("inactive");
  },
};

var ToolbarContextMenu = {
  _getExtensionId(popup) {
    const node = popup.triggerNode;
    if (!node) {
      return null;
    }
    if (node.hasAttribute("data-extensionid")) {
      return node.getAttribute("data-extensionid");
    }
    const extensionButton = node.closest('[item-id^="ext-"]');
    return extensionButton?.getAttribute("item-id").slice(4);
  },

  async updateExtension(popup) {
    const removeExtension = popup.querySelector(
      ".customize-context-removeExtension"
    );
    const manageExtension = popup.querySelector(
      ".customize-context-manageExtension"
    );
    const separator = popup.querySelector(
      "#extensionsMailToolbarMenuSeparator"
    );
    const id = this._getExtensionId(popup);
    const addon = id && (await AddonManager.getAddonByID(id));

    for (const element of [removeExtension, manageExtension, separator]) {
      if (!element) {
        continue;
      }

      element.hidden = !addon;
    }

    if (addon) {
      removeExtension.disabled = !(
        addon.permissions & AddonManager.PERM_CAN_UNINSTALL
      );
    }
  },

  async removeExtensionForContextAction(popup) {
    const id = this._getExtensionId(popup);

    // This can be called from a composeAction button, where
    // popup.ownerGlobal.BrowserAddonUI is undefined.
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    await win.BrowserAddonUI.removeAddon(id);
  },

  openAboutAddonsForContextAction(popup) {
    const id = this._getExtensionId(popup);
    if (id) {
      const viewID = "addons://detail/" + encodeURIComponent(id);
      popup.ownerGlobal.openAddonsMgr(viewID);
    }
  },
};
