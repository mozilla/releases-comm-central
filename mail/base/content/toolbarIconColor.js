/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from mailWindow.js */

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
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

  inferFromText(reason, reasonValue) {
    if (!this._initialized) {
      return;
    }

    function parseRGB(aColorString) {
      let rgb = aColorString.match(/^rgba?\((\d+), (\d+), (\d+)/);
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
    let cachedLuminances = this._toolbarLuminanceCache;
    let luminances = new Map();
    for (let toolbar of document.querySelectorAll(toolbarSelector)) {
      // Toolbars *should* all have ids, but guard anyway to avoid blowing up.
      let cacheKey =
        toolbar.id && toolbar.id + JSON.stringify(this._windowState);
      // Lookup cached luminance value for this toolbar in this window state.
      let luminance = cacheKey && cachedLuminances.get(cacheKey);
      if (isNaN(luminance)) {
        let [r, g, b] = parseRGB(getComputedStyle(toolbar).color);
        luminance = 0.2125 * r + 0.7154 * g + 0.0721 * b;
        if (cacheKey) {
          cachedLuminances.set(cacheKey, luminance);
        }
      }
      luminances.set(toolbar, luminance);
    }

    for (let [toolbar, luminance] of luminances) {
      if (luminance <= 110) {
        toolbar.removeAttribute("brighttext");
      } else {
        toolbar.setAttribute("brighttext", "true");
      }
    }
  },
};
