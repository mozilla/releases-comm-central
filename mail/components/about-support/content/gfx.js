/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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

  function pushInfoRow(table, name, value)
  {
    if(value) {
      table.push(createParentElement("tr", [
        createHeader(bundle.GetStringFromName(name)),
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

  function pushFeatureInfoRow(table, name, feature, isEnabled, message) {
    message = message || isEnabled;
    if (!isEnabled) {
      var errorMessage = errorMessageForFeature(feature);
      if (errorMessage)
        message = errorMessage;
    }
    table.push(createParentElement("tr", [
      createHeader(bundle.GetStringFromName(name)),
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
    pushInfoRow(trGraphics, "adapterDescription", gfxInfo.adapterDescription);
    pushInfoRow(trGraphics, "adapterVendorID", gfxInfo.adapterVendorID);
    pushInfoRow(trGraphics, "adapterDeviceID", gfxInfo.adapterDeviceID);
    pushInfoRow(trGraphics, "adapterRAM", gfxInfo.adapterRAM);
    pushInfoRow(trGraphics, "adapterDrivers", gfxInfo.adapterDriver);
    pushInfoRow(trGraphics, "driverVersion", gfxInfo.adapterDriverVersion);
    pushInfoRow(trGraphics, "driverDate", gfxInfo.adapterDriverDate);

#ifdef XP_WIN
    pushInfoRow(trGraphics, "adapterDescription2", gfxInfo.adapterDescription2);
    pushInfoRow(trGraphics, "adapterVendorID2", gfxInfo.adapterVendorID2);
    pushInfoRow(trGraphics, "adapterDeviceID2", gfxInfo.adapterDeviceID2);
    pushInfoRow(trGraphics, "adapterRAM2", gfxInfo.adapterRAM2);
    pushInfoRow(trGraphics, "adapterDrivers2", gfxInfo.adapterDriver2);
    pushInfoRow(trGraphics, "driverVersion2", gfxInfo.adapterDriverVersion2);
    pushInfoRow(trGraphics, "driverDate2", gfxInfo.adapterDriverDate2);
    pushInfoRow(trGraphics, "isGPU2Active", gfxInfo.isGPU2Active);

    var version = Services.sysinfo.getProperty("version");
    var isWindowsVistaOrHigher = (parseFloat(version) >= 6.0);
    if (isWindowsVistaOrHigher) {
      var d2dEnabled = "false";
      try {
        d2dEnabled = gfxInfo.D2DEnabled;
      } catch(e) {}
      pushFeatureInfoRow(trGraphics, "direct2DEnabled", gfxInfo.FEATURE_DIRECT2D, d2dEnabled);

      var dwEnabled = "false";
      try {
        dwEnabled = gfxInfo.DWriteEnabled + " (" + gfxInfo.DWriteVersion + ")";
      } catch(e) {}
      pushInfoRow(trGraphics, "directWriteEnabled", dwEnabled);

      var cleartypeParams = "";
      try {
        cleartypeParams = gfxInfo.cleartypeParameters;
      } catch(e) {
        cleartypeParams = bundle.GetStringFromName("clearTypeParametersNotFound");
      }
      pushInfoRow(trGraphics, "clearTypeParameters", cleartypeParams);
    }

#endif

    var webglrenderer;
    var webglenabled;
    try {
      webglrenderer = gfxInfo.getWebGLParameter("full-renderer");
      webglenabled = true;
    } catch (e) {
      webglrenderer = false;
      webglenabled = false;
    }
#ifdef XP_WIN
    // If ANGLE is not available but OpenGL is, we want to report on the OpenGL feature, because that's what's going to get used.
    // In all other cases we want to report on the ANGLE feature.
    var webglfeature = gfxInfo.FEATURE_WEBGL_ANGLE;
    if (gfxInfo.getFeatureStatus(gfxInfo.FEATURE_WEBGL_ANGLE)  != gfxInfo.FEATURE_STATUS_OK &&
        gfxInfo.getFeatureStatus(gfxInfo.FEATURE_WEBGL_OPENGL) == gfxInfo.FEATURE_STATUS_OK)
      webglfeature = gfxInfo.FEATURE_WEBGL_OPENGL;
#else
    var webglfeature = gfxInfo.FEATURE_WEBGL_OPENGL;
#endif
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

    let data = {failures: [], indices: []};

    let failureCount = {};
    let failureIndices = {};

    let failures = gfxInfo.getFailures(failureCount, failureIndices);
    if (failures.length) {
      data.failures = failures;
      if (failureIndices.value.length == failures.length) {
        data.indices = failureIndices.value;
      }
    }
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
                               createParentElement("tr", [
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
  } // end if (gfxInfo)

  let windows = Services.ww.getWindowEnumerator();
  let acceleratedWindows = 0;
  let totalWindows = 0;
  let mgrType;
  while (windows.hasMoreElements()) {
    totalWindows++;

    let awindow = windows.getNext().QueryInterface(Ci.nsIInterfaceRequestor);
    let windowutils = awindow.getInterface(Ci.nsIDOMWindowUtils);
    if (windowutils.layerManagerType != "Basic") {
      acceleratedWindows++;
      mgrType = windowutils.layerManagerType;
    }
  }

  let msg = acceleratedWindows;
  if (acceleratedWindows) {
    msg += "/" + totalWindows + " " + mgrType;
  } else {
#ifdef XP_WIN
    var feature = gfxInfo.FEATURE_DIRECT3D_9_LAYERS;
#else
    var feature = gfxInfo.FEATURE_OPENGL_LAYERS;
#endif
    var errMsg = errorMessageForFeature(feature);
    if (errMsg)
      msg += ". " + errMsg;
  }

  appendChildren(graphics_tbody, [
    createParentElement("tr", [
      createHeader(bundle.GetStringFromName("acceleratedWindows")),
      createElement("td", msg),
    ])
  ]);
}
