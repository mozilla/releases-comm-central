/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from mailWindow.js */

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

var ToolbarIconColor = {
  init() {
    this._initialized = true;

    window.addEventListener("activate", this);
    window.addEventListener("deactivate", this);
    Services.obs.addObserver(this, "lightweight-theme-styling-update");

    // If the window isn't active now, we assume that it has never been active
    // before and will soon become active such that inferFromText will be
    // called from the initial activate event.
    if (Services.focus.activeWindow == window) {
      this.inferFromText();
    }
  },

  uninit() {
    this._initialized = false;

    window.removeEventListener("activate", this);
    window.removeEventListener("deactivate", this);
    Services.obs.removeObserver(this, "lightweight-theme-styling-update");
  },

  handleEvent(event) {
    switch (event.type) {
      case "activate":
      case "deactivate":
        this.inferFromText();
        break;
    }
  },

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "lightweight-theme-styling-update":
        // inferFromText needs to run after LightweightThemeConsumer.jsm's
        // lightweight-theme-styling-update observer.
        setTimeout(() => {
          this.inferFromText();
        }, 0);
        break;
    }
  },

  inferFromText() {
    if (!this._initialized) {
      return;
    }

    function parseRGB(aColorString) {
      let rgb = aColorString.match(/^rgba?\((\d+), (\d+), (\d+)/);
      rgb.shift();
      return rgb.map(x => parseInt(x));
    }

    let toolbarSelector = "toolbox > toolbar:not([collapsed=true])";
    if (AppConstants.platform == "macosx") {
      toolbarSelector += ":not([type=menubar])";
    }
    toolbarSelector += ", .toolbar";

    for (let toolbar of document.querySelectorAll(toolbarSelector)) {
      let [r, g, b] = parseRGB(getComputedStyle(toolbar).color);
      let luminance = 0.2125 * r + 0.7154 * g + 0.0721 * b;
      if (luminance <= 110) {
        toolbar.removeAttribute("brighttext");
      } else {
        toolbar.setAttribute("brighttext", "true");
      }
    }
  },
};
