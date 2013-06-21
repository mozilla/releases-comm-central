/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
    // If there's no browser (non-conversation tabs), don't do anything.
    if (!getBrowser())
      return;
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
