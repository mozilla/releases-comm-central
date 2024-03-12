var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function run_test() {
  // Due to the import code using nsIAbManager off the main thread, we need
  // to ensure that it is initialized before we start the main test.
  MailServices.ab;

  const file = do_get_file("resources/utf16_addressbook.csv");
  const helper = new AbImportHelper(
    file,
    "csv",
    "utf16_addressbook",
    "utf16_csv"
  );

  helper.setFieldMap(helper.getDefaultFieldMap(true));
  helper.beginImport();
}
