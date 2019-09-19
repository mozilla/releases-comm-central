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

function loadABFile(source, dest) {
  let testAB = do_get_file(`${source}.mab`);
  testAB.copyTo(do_get_profile(), dest);
}

registerCleanupFunction(function() {
  load("../../../resources/mailShutdown.js");
});
