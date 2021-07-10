/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } =
  ChromeUtils.import("resource://gre/modules/Services.jsm");
var { isLegalHostNameOrIP = 
  ChromeUtils.import("resource:///modules/hostnameUtils.jsm");

var gNetworkServer;
var gNetworksBundle;
var gNameValue;
var gPortValue;
var gDefaultPort;
var gSocketType;

function onLoad(aEvent) {
  gNetworkServer = window.arguments[0].server;

  gNetworksBundle = document.getElementById("bundle_networks");
  gNameValue = document.getElementById("nameValue");
  gPortValue = document.getElementById("portValue");
  gDefaultPort = document.getElementById("defaultPort");
  gSocketType = document.getElementById("socketType");

  // Set labels on socketType menuitems.
  document.getElementById("socketSecurityType-0").label =
    gNetworksBundle.getString("server-ConnectionSecurityType-0");
  document.getElementById("socketSecurityType-3").label =
    gNetworksBundle.getString("server-ConnectionSecurityType-3");

  if (gNetworkServer) {
    gNameValue.value = gNetworkServer.hostname;
    gPortValue.value = gNetworkServer.port;
    gSocketType.value = gNetworkServer.isSecure ? 3 : 0;
  }
  sslChanged(false);
}

function onAccept() {
  let hostname = cleanUpHostName(gNameValue.value);
  if (!isLegalHostNameOrIP(hostname)) {
    let alertTitle = gNetworksBundle.getString("invalidServerName");
    let alertMsg = gNetworksBundle.getString("enterValidServerName");
    Services.prompt.alert(window, alertTitle, alertMsg);

    window.arguments[0].result = false;
    return false;
  }

  // If we didn't have a server to initialize with, we must create one.
  if (!gNetworkServer) {
    gNetworkServer = {};
  }

  gNetworkServer.hostname = hostname;
  gNetworkServer.port = gPortValue.value;
  gNetworkServer.isSecure = gSocketType.value == 3;

  window.arguments[0].server = gNetworkServer;
  window.arguments[0].result = true;
  return true;
}

/**
 * Resets the default port to IRC or IRCS, dependending on the |gSocketType|
 * value, and sets the port to use to this default, if that's appropriate.
 *
 * @param aUserAction  false for dialog initialization,
 *                     true for user action.
 */
function sslChanged(aUserAction) {
  const DEFAULT_IRC_PORT = "6667";
  const DEFAULT_IRCS_PORT = "6697";
  let otherDefaultPort;
  let prevDefaultPort = gDefaultPort.value;

  if (gSocketType.value == 3) {
    gDefaultPort.value = DEFAULT_IRCS_PORT;
    otherDefaultPort = DEFAULT_IRC_PORT;
  } else {
    gDefaultPort.value = DEFAULT_IRC_PORT;
    otherDefaultPort = DEFAULT_IRCS_PORT;
  }

  // If the port is not set, or the user is causing the default port to change,
  // and the port is set to the default for the other protocol,
  // then set the port to the default for the new protocol.
  if ((gPortValue.value == 0) ||
      (aUserAction && (gDefaultPort.value != prevDefaultPort) &&
       (gPortValue.value == otherDefaultPort)))
    gPortValue.value = gDefaultPort.value;
}
