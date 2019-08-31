/**
 * Test for a regression of Bug 437556: mailnews crashes while importing an
 * address book if a field map is required but not set.
 */
function run_test() {
  var file = do_get_file("resources/basic_addressbook.csv");
  var errorStr = Cc["@mozilla.org/supports-string;1"].createInstance(
    Ci.nsISupportsString
  );
  // get the Address Book text import interface and make sure it succeeded
  var helper = new AbImportHelper(file, "Text file");
  helper.setFieldMap(null);
  helper.setAddressBookLocation(file);

  var abInterface = helper.getInterface();
  Assert.notEqual(abInterface, null);
  // prepare to start the import
  Assert.ok(abInterface.WantsProgress());
  // start the import
  // BeginImport should return false and log an error if the fieldMap isn't set
  Assert.ok(!abInterface.BeginImport(null, errorStr));
  Assert.notEqual(errorStr, "");
}
