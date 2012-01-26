/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is MiniTrayR extension
 *
 * The Initial Developer of the Original Code is
 * Nils Maier.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *   Florian Queze <florian@instantbird.org>
 *   Patrick Cloke <clokep@instantbird.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

Components.utils.import("resource:///modules/imServices.jsm");

var gMinTrayR = {
  trayService: null,
  _prefs: null,
  get menu() document.getElementById("MinTrayR_context"),

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

    this.trayService =
      Components.classes['@tn123.ath.cx/trayservice;1']
                .getService(Ci.trayITrayService);
    this.trayService.watchMinimize(window);

    this._prefs = Services.prefs.getBranch("extensions.mintrayr.")
                                .QueryInterface(Ci.nsIPrefBranch2);
    this._prefs.addObserver("alwaysShowTrayIcon", this, false);

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
    window.focus();
  },
  toggle: function MinTrayR_toggle() {
    if (!this._icon) {
      // When the tray icon isn't always visible.
      this.restore();
      return;
    }

    if (this._icon.isMinimized)
      this._icon.restore();
    else
      this._icon.minimize();
  },

  setStatus: function MinTrayR_setStatus(aStatusParam) {
    let us = Services.core.globalUserStatus;
    us.setStatus(Status.toFlag(aStatusParam), us.statusText);
  }
};

window.addEventListener("load", gMinTrayR.load, true);
