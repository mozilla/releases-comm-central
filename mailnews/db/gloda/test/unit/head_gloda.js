var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../../";

registerCleanupFunction(function() {
  load(gDEPTH + "mailnews/resources/mailShutdown.js");
});
