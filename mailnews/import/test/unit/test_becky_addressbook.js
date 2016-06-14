function run_test()
{
  // Due to the import code using nsIAbManager off the main thread, we need
  // to ensure that it is initialized before we start the main test.
  let abMgr = Cc["@mozilla.org/abmanager;1"].getService(Ci.nsIAbManager);

  let file = do_get_file("resources/becky/addressbooks");
  let helper = new AbImportHelper(file, "Becky!", "addressbooks",
                                  "becky_addressbook");
  let vcfSupportedAttributes =
    ["FirstName", "LastName", "DisplayName", "NickName", "PrimaryEmail",
     "SecondEmail", "WorkPhone", "HomePhone", "FaxNumber", "PagerNumber",
     "CellularNumber", "HomeAddress", "HomeAddress2", "HomeCity", "HomeState",
     "HomeZipCode", "HomeCountry", "WorkAddress", "WorkAddress2", "WorkCity",
     "WorkState", "WorkZipCode", "WorkCountry", "JobTitle", "Department",
     "Company", "BirthYear", "BirthMonth", "BirthDay", "WebPage1", "WebPage2",
     "Custom1", "Custom2", "Custom3", "Custom4", "Notes", "_AimScreenName"];
  helper.setSupportedAttributes(vcfSupportedAttributes);
  helper.beginImport();
}
