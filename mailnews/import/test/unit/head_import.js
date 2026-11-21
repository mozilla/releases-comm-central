var { MailShutdown } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailShutdown.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

var CC = Components.Constructor;

// Ensure the profile directory is set up
do_get_profile();

// Import the required setup scripts.
var { kCABData, kNormalPropertiesURI, kPABData, loadABFile } =
  ChromeUtils.importESModule(
    "resource://testing-common/mailnews/AddrBookTestUtils.sys.mjs"
  );

// Import the script with basic import functions
/* import-globals-from resources/import_helper.js */
load("resources/import_helper.js");

registerCleanupFunction(function () {
  MailShutdown.simulate();
});
