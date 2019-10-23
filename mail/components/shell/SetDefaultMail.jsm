/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This file implements the nsICommandLineHandler interface.
 *
 * This component handles the startup command line argument of the form:
 *   -setDefaultMail
 * by making the current executable the "default mail app."
 */

var EXPORTED_SYMBOLS = ["SetDefaultMail"];

function SetDefaultMail() {}

SetDefaultMail.prototype = {
  /* nsISupports */
  QueryInterface: ChromeUtils.generateQI([Ci.nsICommandLineHandler]),

  /* nsICommandLineHandler */
  handle(cmdline) {
    if (cmdline.handleFlag("setDefaultMail", false)) {
      var shell = Cc["@mozilla.org/mail/shell-service;1"].getService(
        Ci.nsIShellService
      );
      shell.setDefaultClient(true, Ci.nsIShellService.MAIL);
    }
  },

  helpInfo: "  -setDefaultMail    Set this app as the default mail client.\n",
};
