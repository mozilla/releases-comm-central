var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

// Ensure the profile directory is set up
do_get_profile();

// Import the required setup scripts.
/* import-globals-from ../../../test/resources/abSetup.js */
load("../../../resources/abSetup.js");

registerCleanupFunction(function() {
  load("../../../resources/mailShutdown.js");
});

function promiseDirectoryRemoved() {
  return new Promise(resolve => {
    let observer = {
      onItemRemoved() {
        MailServices.ab.removeAddressBookListener(this);
        resolve();
      },
    };
    MailServices.ab.addAddressBookListener(
      observer,
      Ci.nsIAbListener.directoryRemoved
    );
  });
}
