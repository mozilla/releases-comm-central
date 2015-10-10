/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imStatusUtils.jsm");

function StatusCLH() { }
StatusCLH.prototype = {
  classDescription: "Instantbird Status Commandline Handler Component",
  classID:          Components.ID("{9da72063-b727-488d-9b3f-cc12e854ab33}"),
  contractID:       "@instantbird.org/status/clh;1",
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsICommandLineHandler]),

  /** nsICommandLineHandler **/
  handle: function(cmdLine) {
    let statusIndex = cmdLine.findFlag("status", false);
    if (statusIndex == -1 || cmdLine.length <= statusIndex + 1)
      return;

    let statusParam = cmdLine.getArgument(statusIndex + 1).toLowerCase();

    // Remove the arguments since they've been handled.
    cmdLine.removeArguments(statusIndex, statusIndex + 1);

    // We're keeping the old status message here.
    let us = Services.core.globalUserStatus;
    us.setStatus(Status.toFlag(statusParam), us.statusText);

    // Only perform the default action (i.e. loading the buddy list) if
    // Instantbird is launched with a status flag.
    if (cmdLine.state != Ci.nsICommandLine.STATE_INITIAL_LAUNCH)
      cmdLine.preventDefault = true;
  },

  // Follow the guidelines in nsICommandLineHandler.idl for the help info
  // specifically, flag descriptions should start at character 24, and lines
  // should be wrapped at 72 characters with embedded newlines, and finally, the
  // string should end with a newline.
  helpInfo: "  -status <status>     Set the online status.\n" +
            "                       <status> can be one of\n" +
            "                       available, away, offline.\n"
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([StatusCLH]);
