/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailCommandLine"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const NS_ENIGCLINE_SERVICE_CID = Components.ID(
  "{847b3ab1-7ab1-11d4-8f02-006008948af5}"
);
const NS_CLINE_SERVICE_CONTRACTID = "@mozilla.org/enigmail/cline-handler;1";

function Handler() {}

Handler.prototype = {
  classDescription: "OpenPGP Key Manager CommandLine Service",
  classID: NS_ENIGCLINE_SERVICE_CID,
  contractID: NS_CLINE_SERVICE_CONTRACTID,
  QueryInterface: ChromeUtils.generateQI([
    "nsICommandLineHandler",
    "nsIFactory",
  ]),

  // nsICommandLineHandler
  handle(cmdLine) {
    if (cmdLine.handleFlag("pgpkeyman", false)) {
      cmdLine.preventDefault = true; // do not open main app window

      Services.ww.openWindow(
        null,
        "chrome://openpgp/content/ui/enigmailKeyManager.xhtml",
        "_blank",
        "chrome,dialog=no,all",
        cmdLine
      );
    }
  },

  helpInfo: "  -pgpkeyman         Open the OpenPGP key manager.\n",

  lockFactory(lock) {},
};

var EnigmailCommandLine = {
  Handler,
  categoryRegistry: {
    category: "command-line-handler",
    entry: "m-cline-enigmail",
    serviceName: NS_CLINE_SERVICE_CONTRACTID,
  },
};
