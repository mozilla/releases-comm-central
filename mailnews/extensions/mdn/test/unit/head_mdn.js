var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/LocalAccountUtils.jsm"
);

var CC = Components.Constructor;

// Ensure the profile directory is set up
do_get_profile();

registerCleanupFunction(function () {
  load("../../../../../mailnews/resources/mailShutdown.js");
});
