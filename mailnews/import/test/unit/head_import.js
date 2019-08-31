var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

var CC = Components.Constructor;

// Ensure the profile directory is set up
do_get_profile();

// Import the required setup scripts.
/* import-globals-from ../../../test/resources/abSetup.js */
load("../../../resources/abSetup.js");

// Import the script with basic import functions
/* import-globals-from resources/import_helper.js */
load("resources/import_helper.js");

registerCleanupFunction(function() {
  load("../../../resources/mailShutdown.js");
});
