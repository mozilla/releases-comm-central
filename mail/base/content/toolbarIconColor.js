/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

var ToolbarIconColor = {
  _windowState: {
    active: false,
    fullscreen: false,
    tabsintitlebar: false,
  },

  init() {
    this._initialized = true;

    window.addEventListener("activate", this);
    window.addEventListener("deactivate", this);
    window.addEventListener("toolbarvisibilitychange", this);
    window.addEventListener("windowlwthemeupdate", this);

    // If the window isn't active now, we assume that it has never been active
    // before and will soon become active such that inferFromText will be
    // called from the initial activate event.
    if (Services.focus.activeWindow == window) {
      this.inferFromText("activate");
    }
  },

  uninit() {
    this._initialized = false;

    window.removeEventListener("activate", this);
    window.removeEventListener("deactivate", this);
    window.removeEventListener("toolbarvisibilitychange", this);
    window.removeEventListener("windowlwthemeupdate", this);
  },

  handleEvent(event) {
    switch (event.type) {
      case "activate":
      case "deactivate":
      case "windowlwthemeupdate":
        this.inferFromText(event.type);
        break;
      case "toolbarvisibilitychange":
        this.inferFromText(event.type, event.visible);
        break;
    }
  },

  // A cache of luminance values for each toolbar to avoid unnecessary calls to
  // getComputedStyle().
  _toolbarLuminanceCache: new Map(),

  // A cache of the current sidebar color to avoid unnecessary conditions and
  // luminance calculations.
  _sidebarColorCache: null,

  inferFromText(reason, reasonValue) {
    if (!this._initialized) {
      return;
    }

    function parseRGB(aColorString) {
      const rgb = aColorString.match(/^rgba?\((\d+), (\d+), (\d+)/);
      rgb.shift();
      return rgb.map(x => parseInt(x));
    }

    switch (reason) {
      case "activate": // falls through.
      case "deactivate":
        this._windowState.active = reason === "activate";
        break;
      case "fullscreen":
        this._windowState.fullscreen = reasonValue;
        break;
      case "windowlwthemeupdate":
        // Theme change, we'll need to recalculate all color values.
        this._toolbarLuminanceCache.clear();
        this._sidebarColorCache = null;
        break;
      case "toolbarvisibilitychange":
        // Toolbar changes dont require reset of the cached color values.
        break;
      case "tabsintitlebar":
        this._windowState.tabsintitlebar = reasonValue;
        break;
    }

    let toolbarSelector = "toolbox > toolbar:not([collapsed=true])";
    if (AppConstants.platform == "macosx") {
      toolbarSelector += ":not([type=menubar])";
    }
    toolbarSelector += ", .toolbar";

    // The getComputedStyle calls and setting the brighttext are separated in
    // two loops to avoid flushing layout and making it dirty repeatedly.
    const cachedLuminances = this._toolbarLuminanceCache;
    const luminances = new Map();
    for (const toolbar of document.querySelectorAll(toolbarSelector)) {
      // Toolbars *should* all have ids, but guard anyway to avoid blowing up.
      const cacheKey =
        toolbar.id && toolbar.id + JSON.stringify(this._windowState);
      // Lookup cached luminance value for this toolbar in this window state.
      let luminance = cacheKey && cachedLuminances.get(cacheKey);
      if (isNaN(luminance)) {
        const [r, g, b] = parseRGB(getComputedStyle(toolbar).color);
        luminance = 0.2125 * r + 0.7154 * g + 0.0721 * b;
        if (cacheKey) {
          cachedLuminances.set(cacheKey, luminance);
        }
      }
      luminances.set(toolbar, luminance);
    }

    const luminanceThreshold = 127; // In between 0 and 255
    for (const [toolbar, luminance] of luminances) {
      if (luminance <= luminanceThreshold) {
        toolbar.removeAttribute("brighttext");
      } else {
        toolbar.setAttribute("brighttext", "true");
      }
    }

    // On Linux, we need to detect if the OS theme caused a text color change in
    // the sidebar icons and properly update the brighttext attribute.
    if (
      reason == "activate" &&
      AppConstants.platform == "linux" &&
      Services.prefs.getCharPref("extensions.activeThemeID", "") ==
        "default-theme@mozilla.org"
    ) {
      const folderTree = document.getElementById("folderTree");
      if (!folderTree) {
        return;
      }

      const sidebarColor = getComputedStyle(folderTree).color;
      // Interrupt if the sidebar color didn't change.
      if (sidebarColor == this._sidebarColorCache) {
        return;
      }

      this._sidebarColorCache = sidebarColor;

      const mainWindow = document.getElementById("messengerWindow");
      if (!mainWindow) {
        return;
      }

      const [r, g, b] = parseRGB(sidebarColor);
      const luminance = 0.2125 * r + 0.7154 * g + 0.0721 * b;

      if (luminance <= 110) {
        mainWindow.removeAttribute("lwt-tree-brighttext");
      } else {
        mainWindow.setAttribute("lwt-tree-brighttext", "true");
      }
    }
  },
};
