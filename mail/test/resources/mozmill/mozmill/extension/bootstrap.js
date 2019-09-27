/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

function install() {}

function uninstall() {}

function startup(data, reason) {
  let env = Cc["@mozilla.org/process/environment;1"].getService(
    Ci.nsIEnvironment
  );
  let protocolHandler = Services.io
    .getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler);

  let modulesFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  modulesFile.initWithPath(env.get("TESTING_MODULES_DIR"));
  protocolHandler.setSubstitution(
    "testing-common",
    Services.io.newFileURI(modulesFile)
  );

  loadDefaultPrefs();

  ExtensionSupport.registerWindowListener(data.id, {
    chromeURLs: ["chrome://messenger/content/messenger.xul"],
    onLoadWindow: setupUI,
  });
}

function loadDefaultPrefs() {
  let defaultBranch = Services.prefs.getDefaultBranch(null);

  // Debugging prefs
  defaultBranch.setBoolPref("browser.dom.window.dump.enabled", true);
  defaultBranch.setBoolPref("javascript.options.showInConsole", true);
}

function shutdown(data, reason) {
  ExtensionSupport.unregisterWindowListener(data.id);
}

function setupUI(domWindow) {
  console.log("=== Mozmill: Seen window " + domWindow.document.location.href);
  loadScript("chrome://mozmill/content/overlay.js", domWindow);
}

function loadScript(url, targetWindow) {
  Services.scriptloader.loadSubScript(url, targetWindow);
}

function logException(exc) {
  try {
    Services.console.logStringMessage(exc.toString() + "\n" + exc.stack);
  } catch (x) {}
}
