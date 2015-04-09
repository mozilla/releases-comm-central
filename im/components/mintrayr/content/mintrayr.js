/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource:///modules/imServices.jsm");

var gMinTrayR = {
  trayService: null,
  _prefs: null,
  get menu() { return document.getElementById("MinTrayR_context"); },

  load: function() {
    window.removeEventListener("load", gMinTrayR.load, true);
    gMinTrayR.init();
  },
  init: function() {
    window.addEventListener("unload", this.uninit);

    let node = document.getElementById("menu_FileQuitItem").cloneNode(true);
    node.setAttribute('id', 'MinTrayR_' + node.id);
    this.menu.appendChild(node);

    window.addEventListener("TrayDblClick", this, true);
    window.addEventListener("TrayClick", this, true);

#ifdef XP_UNIX
#ifndef XP_MACOSX
    // Workaround for Linux, where mozilla ignores persisted window position.
    // Need to capture window move and close events.
    window.addEventListener("deactivate", this, true);
    // Restore window position after restart.
    let docElt = window.document.documentElement;
    if (docElt.hasAttribute("storeScreenX"))
      window.moveTo(docElt.getAttribute("storeScreenX"),
                    docElt.getAttribute("storeScreenY"));
#endif
#endif

    this.trayService =
      Components.classes['@tn123.ath.cx/trayservice;1']
                .getService(Ci.trayITrayService);
    this.trayService.watchMinimize(window);

    this._prefs = Services.prefs.getBranch("extensions.mintrayr.")
                                .QueryInterface(Ci.nsIPrefBranch2);
    this._prefs.addObserver("alwaysShowTrayIcon", this, false);

    // Add a listener to minimize the window on startup once it has been
    // fully created if the corresponding pref is set.
    if (this._prefs.getBoolPref("startMinimized")) {
      this._onfocus = function() {
        if (this._prefs.getIntPref("minimizeon"))
          this.minimize();
        else
          window.minimize();
        window.removeEventListener("focus", this._onfocus);
      }.bind(this);
      window.addEventListener("focus", this._onfocus);
    }

    this.reinitWindow();
  },

  uninit: function() {
    window.removeEventListener("unload", gMinTrayR.uninit, false);
    gMinTrayR._prefs.removeObserver("alwaysShowTrayIcon", gMinTrayR);
  },

  observe: function(aSubject, aTopic, aData) {
    this.reinitWindow();
  },

  reinitWindow: function() {
    if (this._prefs.getBoolPref("alwaysShowTrayIcon") && !this._icon)
      this._icon = this.trayService.createIcon(window);
    else if (this._icon) {
      this._icon.close();
      delete this._icon;
    }

    if (!this.trayService.isWatchedWindow(window))
      this.trayService.watchMinimize(window);
  },

  handleEvent: function(aEvent) {
    if (aEvent.type == "TrayClick" && aEvent.button == 2) {
      // Show the context menu, this occurs on a single right click.
      this.menu.showPopup(document.documentElement,
                          aEvent.screenX, aEvent.screenY,
                          "context", "", "bottomleft");
    }
#ifdef XP_UNIX
#ifndef XP_MACOSX
    else if (aEvent.type == "deactivate") {
      let docElt = window.document.documentElement;
      docElt.setAttribute("storeScreenX", window.screenX);
      docElt.setAttribute("storeScreenY", window.screenY);
    }
#endif
#endif
    else if (aEvent.button == 0 &&
             (aEvent.type == "TrayDblClick" ||
              this._prefs.getBoolPref("singleClickRestore"))) {
      // Restore the buddy list, this is a single or a double left click.
      this.toggle();
    }
  },

  minimize: function MinTrayR_minimize() {
    // This will also work with alwaysShow.
    this.trayService.minimize(window, true);
  },
  restore: function MinTrayR_restore() {
    // This will also work with alwaysShow.
    this.trayService.restore(window);
#ifdef XP_UNIX
#ifndef XP_MACOSX
    let docElt = window.document.documentElement;
    window.moveTo(docElt.getAttribute("storeScreenX"),
                  docElt.getAttribute("storeScreenY"));
#endif
#endif
    window.focus();
  },
  toggle: function MinTrayR_toggle() {
    if (window.windowState == STATE_MINIMIZED) {
      window.restore();
      window.focus();
    }
    else if (!this._icon || this._icon.isMinimized) {
      // this._icon is not set if the tray icon isn't always visible.
      this.restore();
    }
    else
      this.minimize();
  },

  setStatus: function MinTrayR_setStatus(aStatusParam) {
    let us = Services.core.globalUserStatus;
    us.setStatus(Status.toFlag(aStatusParam), us.statusText);
  }
};

window.addEventListener("load", gMinTrayR.load, true);
