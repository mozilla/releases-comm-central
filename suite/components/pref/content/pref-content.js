/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {AppConstants} = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

var minMinValue;
var maxMinValue;

/**
 * When starting up, obtain min and max values for the zoom-range controls
 * from the first and last values of the zoom-levels array.
 */
function Startup()
{
  let minElement  = document.getElementById("minZoom");
  let maxElement  = document.getElementById("maxZoom");
  let minMaxLimit = 200;
  let maxMinLimit = 50;  // allow reasonable amounts of overlap
  let zoomValues  = Services.prefs.getCharPref("toolkit.zoomManager.zoomValues")
                            .split(",").map(parseFloat);
  zoomValues.sort((a, b) => a - b);

  let firstValue  = Math.round(100 * zoomValues[0]);
  let lastValue   = Math.round(100 * zoomValues[zoomValues.length - 1]);

  minMinValue     = firstValue;
  minElement.min  = minMinValue;
  minElement.max  = lastValue  > minMaxLimit ? minMaxLimit : lastValue;

  maxMinValue     = firstValue < maxMinLimit ? maxMinLimit : firstValue;
  maxElement.min  = maxMinValue;
  maxElement.max  = lastValue;

  /*   defaultZoom  stuff   */

  let defaultElement = document.getElementById("defaultZoom");

  defaultElement.min = Services.prefs.getIntPref("zoom.minPercent");
  defaultElement.max = Services.prefs.getIntPref("zoom.maxPercent");

  let cps2 = Cc["@mozilla.org/content-pref/service;1"]
               .getService(Ci.nsIContentPrefService2);

  var zoomValue = cps2.getCachedGlobal("browser.content.full-zoom", null);
  if (zoomValue && zoomValue.value) {
    defaultElement.value = Math.round(zoomValue.value * 100);
    return;
  }

  defaultElement.value = 100;
  cps2.getGlobal("browser.content.full-zoom", null, {
    handleResult(pref) {
      defaultElement.value = Math.round(pref.value * 100);
    },
    handleCompletion(reason) {}
  });
}

/**
 * Suspend "min" value while manually typing in a number.
 */
function DisableMinCheck(element)
{
  element.min = 0;
}

/**
 * Modify the maxZoom setting if minZoom was chosen to be larger than it.
 */
function AdjustMaxZoom()
{
  let minElement  = document.getElementById("minZoom");
  let maxElement  = document.getElementById("maxZoom");
  let maxPref     = document.getElementById("zoom.maxPercent");

  if(minElement.valueNumber > maxElement.valueNumber)
    maxPref.value = minElement.value;

  minElement.min  = minMinValue;

  let defaultElement  = document.getElementById("defaultZoom");
  if (defaultElement.valueNumber < minElement.valueNumber) {
    defaultElement.valueNumber = minElement.valueNumber;
    SetDefaultZoom();
  }
  defaultElement.min = minElement.valueNumber;
}

/**
 * Modify the minZoom setting if maxZoom was chosen to be smaller than it,
 * adjusting maxZoom first if it's below maxMinValue.
 */
function AdjustMinZoom()
{
  let minElement  = document.getElementById("minZoom");
  let maxElement  = document.getElementById("maxZoom");
  let minPref     = document.getElementById("zoom.minPercent");
  let maxValue    = maxElement.valueNumber < maxMinValue ?
                    maxMinValue : maxElement.valueNumber;

  if(maxValue < minElement.valueNumber)
    minPref.value = maxValue;

  maxElement.min  = maxMinValue;

  let defaultElement  = document.getElementById("defaultZoom");
  if (defaultElement.valueNumber > maxElement.valueNumber) {
    defaultElement.valueNumber = maxElement.valueNumber;
    SetDefaultZoom();
  }
  defaultElement.max = maxElement.valueNumber;
}

/**
 * Set default zoom.
 */
function SetDefaultZoom()
{
  let defaultElement  = document.getElementById("defaultZoom");
  let cps2 = Cc["@mozilla.org/content-pref/service;1"]
               .getService(Ci.nsIContentPrefService2);

  if (defaultElement.valueNumber == 100) {
    cps2.removeGlobal("browser.content.full-zoom", null);
    return;
  }

  let new_value = defaultElement.valueNumber / 100.;
  cps2.setGlobal("browser.content.full-zoom", new_value, null);
}

/**
 * When the user toggles the layers.acceleration.disabled pref,
 * sync its new value to the gfx.direct2d.disabled pref too.
 */
function updateHardwareAcceleration(aVal)
{
  if (AppConstants.platform == "win") {
    document.getElementById("gfx.direct2d.disabled").value = aVal;
  }
}
