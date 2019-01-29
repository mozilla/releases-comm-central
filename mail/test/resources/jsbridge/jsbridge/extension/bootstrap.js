/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {ExtensionSupport} = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");

var addonID;

function install() {}

function uninstall() {}

function startup(data, reason) {
  addonID = data.id;
  ExtensionSupport.registerWindowListener(
    addonID,
    {
      chromeURLs: [ "chrome://messenger/content/messenger.xul" ],
      onLoadWindow: setupServer
    });
}

function shutdown(data, reason) {
  // This should have already been unregistered in setupServer().
  // We do it again, just in case something went wrong.
  ExtensionSupport.unregisterWindowListener(data.id);
}

function setupServer(domWindow) {
  loadScript("chrome://jsbridge/content/overlay.js", domWindow);

  // The server used to be started via the command line (cmdarg.js) which
  // doesn't work for a bootstrapped add-on, so let's do it here.
  let server = {};
  ChromeUtils.import('chrome://jsbridge/content/modules/server.js', server);
  console.log("=== JS Bridge: Starting server");
  server.startServer(24242);

  // We only needed to start the server once, so unregister the listener.
  ExtensionSupport.unregisterWindowListener(addonID);
}

function loadScript(url, targetWindow) {
  let loader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
  loader.loadSubScript(url, targetWindow);
}

function logException(exc) {
  try {
    Services.console.logStringMessage(exc.toString() + "\n" + exc.stack);
  }
  catch (x) {}
}
