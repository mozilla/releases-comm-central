// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals getBrowser */

/** Document Zoom Management Code
 *
 * Forked from M-C since we don't provide a global gBrowser variable.
 *
 * TODO: Move to dedicated js module - see bug 1841768.
 */

var ZoomManager = {
  get MIN() {
    delete this.MIN;
    return (this.MIN = Services.prefs.getIntPref("zoom.minPercent") / 100);
  },

  get MAX() {
    delete this.MAX;
    return (this.MAX = Services.prefs.getIntPref("zoom.maxPercent") / 100);
  },

  get useFullZoom() {
    return Services.prefs.getBoolPref("browser.zoom.full");
  },

  set useFullZoom(aVal) {
    Services.prefs.setBoolPref("browser.zoom.full", aVal);
  },

  get zoom() {
    return this.getZoomForBrowser(getBrowser());
  },

  useFullZoomForBrowser(aBrowser) {
    return this.useFullZoom || aBrowser.isSyntheticDocument;
  },

  getFullZoomForBrowser(aBrowser) {
    if (!this.useFullZoomForBrowser(aBrowser)) {
      return 1.0;
    }
    return this.getZoomForBrowser(aBrowser);
  },

  getZoomForBrowser(aBrowser) {
    const zoom = this.useFullZoomForBrowser(aBrowser)
      ? aBrowser.fullZoom
      : aBrowser.textZoom;
    // Round to remove any floating-point error.
    return Number(zoom ? zoom.toFixed(2) : 1);
  },

  set zoom(aVal) {
    this.setZoomForBrowser(getBrowser(), aVal);
  },

  setZoomForBrowser(browser, val) {
    if (val < this.MIN || val > this.MAX) {
      throw Components.Exception(
        `invalid zoom value: ${val}`,
        Cr.NS_ERROR_INVALID_ARG
      );
    }

    const fullZoom = this.useFullZoomForBrowser(browser);
    browser.textZoom = fullZoom ? 1 : val;
    browser.fullZoom = fullZoom ? val : 1;
  },

  get zoomValues() {
    var zoomValues = Services.prefs
      .getCharPref("toolkit.zoomManager.zoomValues")
      .split(",")
      .map(parseFloat);
    zoomValues.sort((a, b) => a - b);

    while (zoomValues[0] < this.MIN) {
      zoomValues.shift();
    }

    while (zoomValues[zoomValues.length - 1] > this.MAX) {
      zoomValues.pop();
    }

    delete this.zoomValues;
    return (this.zoomValues = zoomValues);
  },

  enlarge(browser = getBrowser()) {
    const i =
      this.zoomValues.indexOf(this.snap(this.getZoomForBrowser(browser))) + 1;
    if (i < this.zoomValues.length) {
      this.setZoomForBrowser(browser, this.zoomValues[i]);
    }
  },

  reduce(browser = getBrowser()) {
    const i =
      this.zoomValues.indexOf(this.snap(this.getZoomForBrowser(browser))) - 1;
    if (i >= 0) {
      this.setZoomForBrowser(browser, this.zoomValues[i]);
    }
  },

  reset(browser = getBrowser()) {
    this.setZoomForBrowser(browser, 1);
  },

  toggleZoom(browser = getBrowser()) {
    const zoomLevel = this.getZoomForBrowser();

    this.useFullZoom = !this.useFullZoom;
    this.setZoomForBrowser(browser, zoomLevel);
  },

  snap(aVal) {
    var values = this.zoomValues;
    for (var i = 0; i < values.length; i++) {
      if (values[i] >= aVal) {
        if (i > 0 && aVal - values[i - 1] < values[i] - aVal) {
          i--;
        }
        return values[i];
      }
    }
    return values[i - 1];
  },

  scrollZoomEnlarge(messagePaneBrowser) {
    let zoom = messagePaneBrowser.fullZoom;
    zoom += 0.1;
    const zoomMax = Services.prefs.getIntPref("zoom.maxPercent") / 100;
    if (zoom > zoomMax) {
      zoom = zoomMax;
    }
    messagePaneBrowser.fullZoom = zoom;
  },

  scrollReduceEnlarge(messagePaneBrowser) {
    let zoom = messagePaneBrowser.fullZoom;
    zoom -= 0.1;
    const zoomMin = Services.prefs.getIntPref("zoom.minPercent") / 100;
    if (zoom < zoomMin) {
      zoom = zoomMin;
    }
    messagePaneBrowser.fullZoom = zoom;
  },
};
