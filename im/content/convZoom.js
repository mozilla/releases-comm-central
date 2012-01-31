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
 * The Original Code is Content Preferences (cpref).
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Myk Melez <myk@mozilla.org>
 *   Dão Gottwald <dao@mozilla.com>
 *   Ehsan Akhgari <ehsan.akhgari@gmail.com>
 *   Romain Bezut <romain@bezut.info>
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
 * ***** END LICENSE BLOCK *****/

// This code was mostly copied from mozilla:
// mozilla-central/source/browser/base/content/browser-textZoom.js
var FullZoom = {
  prefName: "conversation.zoomLevel",

  init: function FullZoom_init() {
    window.addEventListener("DOMMouseScroll", FullZoom.handleMouseScrolled);
    window.addEventListener("unload", FullZoom.destroy);
    let conversations = document.getElementById("conversations");
    if (conversations) {
      conversations.tabContainer
                   .addEventListener("select", FullZoom.applyPrefValue);
    }

    Services.prefs.addObserver(FullZoom.prefName, FullZoom, false);
    FullZoom.applyPrefValue();
  },

  destroy: function FullZoom_destroy() {
    Services.prefs.removeObserver(FullZoom.prefName, FullZoom);
    window.removeEventListener("DOMMouseScroll", FullZoom.handleMouseScrolled, false);
  },

  // Events Handlers / Observe
  handleMouseScrolled: function FullZoom_handleMouseScrolled(event) {
    if (!event.ctrlKey || event.altKey || event.shiftKey || !event.detail)
      return;

    if (event.detail < 0 )
      ZoomManager.enlarge();
    else
      ZoomManager.reduce();

    FullZoom.saveCurrentZoomToPref();
  },

  // nsIObserver
  observe: function (aSubject, aTopic, aData) {
    if (aTopic != "nsPref:changed")
      return;

    switch(aData) {
      case this.prefName:
        this.applyPrefValue();
        break;
    }
  },

  enlarge: function FullZoom_zoomEnlarge() {
    ZoomManager.enlarge();
    this.saveCurrentZoomToPref();
  },
  reduce: function FullZoom_zoomReduce() {
    ZoomManager.reduce();
    this.saveCurrentZoomToPref();
  },
  reset: function FullZoom_ZoomReset() {
    ZoomManager.reset();
    try {
      // Can throw an exception when the preference does not exist or is
      // already at its default value.
      Services.prefs.clearUserPref(this.prefName);
    }
    catch (ex) {}
  },

  // Settings and Prefs
  saveCurrentZoomToPref: function FullZoom_saveCurrentZoomToPref() {
    Services.prefs.setCharPref(this.prefName, ZoomManager.zoom);
  },
  /**
   * Set the zoom level for the current browser.
   *
   * Per nsPresContext::setFullZoom, we can set the zoom to its current value
   * without significant impact on performance, as the setting is only applied
   * if it differs from the current setting.  In fact getting the zoom and then
   * checking ourselves if it differs costs more.
   **/
  applyPrefValue: function FullZoom_applyPrefValue() {
    let value = parseFloat(Services.prefs.getCharPref(FullZoom.prefName));
    if (isNaN(value))
      value = 1;
    else if (value < ZoomManager.MIN)
      value = ZoomManager.MIN;
    else if (value > ZoomManager.MAX)
      value = ZoomManager.MAX;
    ZoomManager.zoom = value;
  }
};

this.addEventListener("load", FullZoom.init);
