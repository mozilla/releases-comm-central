var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
var { localAccountUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/LocalAccountUtils.jsm"
);

var CC = Components.Constructor;

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../";

registerCleanupFunction(function() {
  load(gDEPTH + "mailnews/resources/mailShutdown.js");
});
