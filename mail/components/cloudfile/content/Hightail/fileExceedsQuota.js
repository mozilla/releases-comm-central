/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;
var Cr = Components.results;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

document.addEventListener("DOMContentLoaded", function() {
  if ("wrappedJSObject" in window.arguments[0]) {
    let storage = parseInt(window.arguments[0].wrappedJSObject.storage);
    storage = (storage / 1024 / 1024 / 1024).toFixed(2);
    let currentStorage = document.getElementById('currentStorage');
    currentStorage.textContent = currentStorage.textContent.replace('#XXX', storage);
  }
});

