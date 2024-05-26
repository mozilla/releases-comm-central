function run_test() {
  var file = do_get_file("resources/tab_comma_mixed.csv");
  var helper = new AbImportHelper(file, "@mozilla.org/import/import-text;1");
  var genericInterface = helper.getInterface();
  Assert.notEqual(genericInterface, null);
  const abInterface = genericInterface
    .GetData("addressInterface")
    .QueryInterface(Ci.nsIImportAddressBooks);
  abInterface.SetSampleLocation(file);
  const recordExists = {};

  const sampleData = abInterface.GetSampleData(3, recordExists);
  Assert.ok(recordExists.value);
  Assert.equal(sampleData, "4\n4\n4\n4\n4@host.invalid");
}
