ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

var CC = Components.Constructor;

// Ensure the profile directory is set up
do_get_profile();

// Import the required setup scripts.
load("../../../resources/abSetup.js");

registerCleanupFunction(function() {
  load("../../../resources/mailShutdown.js");
});
