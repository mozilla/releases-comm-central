/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

function jsConsoleHandler() {}
jsConsoleHandler.prototype = {
  handle: function clh_handle(cmdLine) {
    if (!cmdLine.handleFlag("suiteconsole", false))
      return;

    var console = Services.wm.getMostRecentWindow("suite:console");
    if (!console) {
      Services.ww.openWindow(null,
        "chrome://communicator/content/console/console.xul", 
        "_blank", "chrome,dialog=no,all", cmdLine);
    } else {
      console.focus(); // the Error console was already open
    }

    if (cmdLine.state == Ci.nsICommandLine.STATE_REMOTE_AUTO)
      cmdLine.preventDefault = true;
  },

  helpInfo : "  --suiteconsole        Open the Error console.\n",

  classID: Components.ID("{afeee354-8c99-4725-adb1-8502218c5c3c}"),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsICommandLineHandler]),
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([jsConsoleHandler]);
