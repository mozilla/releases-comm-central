/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {ExtensionSupport} = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

function install() {}

function uninstall() {}

function startup(data, reason) {
  loadDefaultPrefs();

  ExtensionSupport.registerWindowListener(
    data.id,
    {
      chromeURLs: [ "chrome://messenger/content/messenger.xul" ],
      onLoadWindow: setupUI
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
  var document = domWindow.document;

  function createMozmillMenu() {
    let m = document.createElement("menuitem");
    m.setAttribute("id", "mozmill-mozmill");
    m.setAttribute("label", "Mozmill");
    m.setAttribute("oncommand", "MozMill.onMenuItemCommand(event);");

    return m;
  }

  console.log("=== Mozmill: Seen window " + domWindow.document.location.href);
  document.getElementById("taskPopup").appendChild(createMozmillMenu());
  loadScript("chrome://mozmill/content/overlay.js", domWindow);
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
