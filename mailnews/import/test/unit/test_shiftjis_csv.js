const {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

function run_test()
{
  Services.prefs.setCharPref("intl.charset.detector", "ja_parallel_state_machine");
  registerCleanupFunction(function() {
      Services.prefs.clearUserPref("intl.charset.detector");
  });

  // Due to the import code using nsIAbManager off the main thread, we need
  // to ensure that it is initialized before we start the main test.
  let abMgr = MailServices.ab;

  let file = do_get_file("resources/shiftjis_addressbook.csv");
  let helper = new AbImportHelper(file, "csv",
                                  "shiftjis_addressbook", "shiftjis_csv");

  helper.setFieldMap(helper.getDefaultFieldMap(true));
  helper.beginImport();
}
