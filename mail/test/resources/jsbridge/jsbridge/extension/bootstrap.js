/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);

var addonID;

function install() {}

function uninstall() {}

function startup(data, reason) {
  addonID = data.id;
  ExtensionSupport.registerWindowListener(addonID, {
    chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
    onLoadWindow: setupServer,
  });
}

function shutdown(data, reason) {
  // This should have already been unregistered in setupServer().
  // We do it again, just in case something went wrong.
  ExtensionSupport.unregisterWindowListener(data.id);
}

function setupServer(domWindow) {
  Services.scriptloader.loadSubScript(
    "chrome://jsbridge/content/overlay.js",
    domWindow
  );

  let server = {};
  ChromeUtils.import("chrome://jsbridge/content/modules/server.js", server);
  console.log("=== JS Bridge: Starting server");
  server.startServer(24242);

  // We only needed to start the server once, so unregister the listener.
  ExtensionSupport.unregisterWindowListener(addonID);
}

function logException(exc) {
  try {
    Services.console.logStringMessage(exc.toString() + "\n" + exc.stack);
  } catch (x) {}
}
