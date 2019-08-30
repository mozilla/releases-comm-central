/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var AutoHideMenubar = {
  get _node() {
    delete this._node;
    return (this._node =
      document.getElementById("mail-toolbar-menubar2") ||
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

      let contextMenuId = AutoHideMenubar._node.getAttribute("context");
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
    for (let event of this._events) {
      this._node.addEventListener(event, this);
    }
  },

  _disable() {
    this._setActive();
    for (let event of this._events) {
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
