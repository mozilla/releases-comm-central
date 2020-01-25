var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../../";

// glodaTestHelper.js does all the rest of the imports

registerCleanupFunction(function() {
  load(gDEPTH + "mailnews/resources/mailShutdown.js");
});
