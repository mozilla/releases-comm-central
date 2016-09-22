/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

Components.utils.import("resource://gre/modules/AppConstants.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

function populateGraphicsSection() {
  function assembleFromGraphicsFailure(i, data)
  {
    // Only cover the cases we have today; for example, we do not have
    // log failures that assert and we assume the log level is 1/error.
    let message = data.failures[i];
    let index = data.indices[i];
    let what = "";
    if (message.search(/\[GFX1-\]: \(LF\)/) == 0) {
      // Non-asserting log failure - the message is substring(14)
      what = "LogFailure";
      message = message.substring(14);
    } else if (message.search(/\[GFX1-\]: /) == 0) {
      // Non-asserting - the message is substring(9)
      what = "Error";
      message = message.substring(9);
    } else if (message.search(/\[GFX1\]: /) == 0) {
      // Asserting - the message is substring(8)
      what = "Assert";
      message = message.substring(8);
    }
    let assembled = {"index" : index,
                    "header" : ("(#" + index + ") " + what),
                    "message" : message};
    return assembled;
  }
  

  function createHeader(name)
  {
    let elem = createElement("th", name);
    elem.className = "column";
    return elem;
  }

  function pushHeaderRow(table, displayName)
  {
    let header = createHeader(displayName);
    header.colSpan = 2;
    table.push(createParentElement("tr", [
      header,
    ]));
  }

  function pushInfoRow(table, name, value, displayName)
  {
    if(value) {
      let string = displayName || bundle.GetStringFromName(name);
      table.push(createParentElement("tr", [
        createHeader(string),
        createElement("td", value),
      ]));
    }
  }

  function pushLiteralInfoRow(table, name, value)
  {
    table.push(createParentElement("tr", [
      createHeader(name),
      createElement("td", value),
    ]));
  }

  function errorMessageForFeature(feature) {
    var errorMessage;
    var status;
    try {
      status = gfxInfo.getFeatureStatus(feature);
    } catch(e) {}
    switch (status) {
      case gfxInfo.FEATURE_BLOCKED_DEVICE:
      case gfxInfo.FEATURE_DISCOURAGED:
        errorMessage = bundle.GetStringFromName("blockedGfxCard");
        break;
      case gfxInfo.FEATURE_BLOCKED_OS_VERSION:
        errorMessage = bundle.GetStringFromName("blockedOSVersion");
        break;
      case gfxInfo.FEATURE_BLOCKED_DRIVER_VERSION:
        var suggestedDriverVersion;
        try {
          suggestedDriverVersion = gfxInfo.getFeatureSuggestedDriverVersion(feature);
        } catch(e) {}
        if (suggestedDriverVersion)
          errorMessage = bundle.formatStringFromName("tryNewerDriver", [suggestedDriverVersion], 1);
        else
          errorMessage = bundle.GetStringFromName("blockedDriver");
        break;
    }
    return errorMessage;
  }

  function pushFeatureInfoRow(table, name, feature, isEnabled, message, displayName) {
    message = message || isEnabled;
    if (!isEnabled) {
      var errorMessage = errorMessageForFeature(feature);
      if (errorMessage)
        message = errorMessage;
    }
    let string = displayName || bundle.GetStringFromName(name);
    table.push(createParentElement("tr", [
      createHeader(string),
      createElement("td", message),
    ]));
  }

  function hexValueToString(value)
  {
    return value
           ? String('0000' + value.toString(16)).slice(-4)
           : null;
  }

  let bundle = Services.strings.createBundle("chrome://global/locale/aboutSupport.properties");
  let graphics_tbody = document.getElementById("graphics-tbody");

  var gfxInfo = null;
  try {
    // nsIGfxInfo is currently only implemented on Windows
    gfxInfo = Cc["@mozilla.org/gfx/info;1"].getService(Ci.nsIGfxInfo);
  } catch(e) {}

  if (gfxInfo) {
    let trGraphics = [];
    pushHeaderRow(trGraphics, "GPU #1");
    pushInfoRow(trGraphics, "gpuDescription", gfxInfo.adapterDescription);
    pushInfoRow(trGraphics, "gpuVendorID", gfxInfo.adapterVendorID);
    pushInfoRow(trGraphics, "gpuDeviceID", gfxInfo.adapterDeviceID);
    pushInfoRow(trGraphics, "gpuRAM", gfxInfo.adapterRAM);
    pushInfoRow(trGraphics, "gpuDrivers", gfxInfo.adapterDriver);
    pushInfoRow(trGraphics, "gpuDriverVersion", gfxInfo.adapterDriverVersion);
    pushInfoRow(trGraphics, "gpuDriverDate", gfxInfo.adapterDriverDate);

    if (AppConstants.platform == "win") {
      if(gfxInfo.adapterDescription2) {
        pushHeaderRow(trGraphics, "GPU #2");
        pushInfoRow(trGraphics, "gpuDescription", gfxInfo.adapterDescription2);
        pushInfoRow(trGraphics, "gpuVendorID", gfxInfo.adapterVendorID2);
        pushInfoRow(trGraphics, "gpuDeviceID", gfxInfo.adapterDeviceID2);
        pushInfoRow(trGraphics, "gpuRAM", gfxInfo.adapterRAM2);
        pushInfoRow(trGraphics, "gpuDrivers", gfxInfo.adapterDriver2);
        pushInfoRow(trGraphics, "gpuDriverVersion", gfxInfo.adapterDriverVersion2);
        pushInfoRow(trGraphics, "gpuDriverDate", gfxInfo.adapterDriverDate2);
        pushInfoRow(trGraphics, "active", gfxInfo.isGPU2Active);
      }
    }

    pushHeaderRow(trGraphics, "Features");

    if (AppConstants.platform == "win") {
      let version = Services.sysinfo.getProperty("version");
      let isWindowsVistaOrHigher = (parseFloat(version) >= 6.0);
      if (isWindowsVistaOrHigher) {
        let d2dEnabled = "false";
        try {
          d2dEnabled = gfxInfo.D2DEnabled;
        } catch(e) {}
        pushFeatureInfoRow(trGraphics, "direct2DEnabled", gfxInfo.FEATURE_DIRECT2D, d2dEnabled, null, "Direct2D");

        let dwEnabled = "false";
        try {
          dwEnabled = gfxInfo.DWriteEnabled + " (" + gfxInfo.DWriteVersion + ")";
        } catch(e) {}
        pushInfoRow(trGraphics, "directWriteEnabled", dwEnabled, "DirectWrite");

        let cleartypeParams = "";
        try {
          cleartypeParams = gfxInfo.cleartypeParameters;
          pushInfoRow(trGraphics, "clearTypeParameters", cleartypeParams);
        } catch(e) {}
      }
    }

    var webglrenderer;
    var webglenabled;
    try {
      webglrenderer = gfxInfo.getWebGLParameter("full-renderer");
      webglenabled = true;
    } catch (e) {
      webglrenderer = false;
      webglenabled = false;
    }

    let webglfeature = gfxInfo.FEATURE_WEBGL_OPENGL;
    if (AppConstants.platform == "win") {
      // If ANGLE is not available but OpenGL is, we want to report on the OpenGL feature, because that's what's going to get used.
      // In all other cases we want to report on the ANGLE feature.
      webglfeature = gfxInfo.FEATURE_WEBGL_ANGLE;
      if (gfxInfo.getFeatureStatus(gfxInfo.FEATURE_WEBGL_ANGLE)  != gfxInfo.FEATURE_STATUS_OK &&
          gfxInfo.getFeatureStatus(gfxInfo.FEATURE_WEBGL_OPENGL) == gfxInfo.FEATURE_STATUS_OK)
        webglfeature = gfxInfo.FEATURE_WEBGL_OPENGL;
    }
    pushFeatureInfoRow(trGraphics, "webglRenderer", webglfeature, webglenabled, webglrenderer);

    appendChildren(graphics_tbody, trGraphics);

    // display registered graphics properties
    let graphics_info_properties = document.getElementById("graphics-info-properties");
    var info = gfxInfo.getInfo();
    let trGraphicsProperties = [];
    for (var property in info) {
      pushLiteralInfoRow(trGraphicsProperties, property, info[property]);
    }
    appendChildren(graphics_info_properties, trGraphicsProperties);

    // display any failures that have occurred
    let graphics_failures_tbody = document.getElementById("graphics-failures-tbody");

    let data = {};

    let failureCount = {};
    let failureIndices = {};

    let failures = gfxInfo.getFailures(failureCount, failureIndices);
    if (failures.length) {
      data.failures = failures;
      if (failureIndices.value.length == failures.length) {
        data.indices = failureIndices.value;
      }
    }
    if ("failures" in data) {
      let trGraphicsFailures;
      // If indices is there, it should be the same length as failures,
      // (see Troubleshoot.jsm) but we check anyway:
      if ("indices" in data && data.failures.length == data.indices.length) {
        let combined = [];
        for (let i = 0; i < data.failures.length; i++) {
          let assembled = assembleFromGraphicsFailure(i, data);
          combined.push(assembled);
        }
        combined.sort(function(a,b) {
            if (a.index < b.index) return -1;
            if (a.index > b.index) return 1;
            return 0;});
        trGraphicsFailures = combined.map(function(val) {
                                 return createParentElement("tr", [
                                     createElement("th", val.header, {class: "column"}),
                                     createElement("td", val.message),
                                 ]);
                             });
      } else {
        trGraphicsFailures = createParentElement("tr", [
                                 createElement("th", "LogFailure", {class: "column"}),
                                 createParentElement("td", data.failures.map(val =>
                                     createElement("p", val)
                             ))]);
      }

      appendChildren(graphics_failures_tbody, trGraphicsFailures);
    }
  }

  let windows = Services.ww.getWindowEnumerator();
  let acceleratedWindows = 0;
  let totalWindows = 0;
  let mgrType;
  while (windows.hasMoreElements()) {
    totalWindows++;

    let awindow = windows.getNext().QueryInterface(Ci.nsIInterfaceRequestor);
    let windowutils = awindow.getInterface(Ci.nsIDOMWindowUtils);
    try {
      if (windowutils.layerManagerType != "Basic") {
        acceleratedWindows++;
        mgrType = windowutils.layerManagerType;
      }
    } catch (e) {
      continue;
    }
  }
}
