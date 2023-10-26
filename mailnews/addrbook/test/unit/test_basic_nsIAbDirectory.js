/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for basic address book functions - tests obtaining the (default)
 * personal address book and getting its details from the nsIAbDirectory.
 *
 * Functions/attributes not currently tested:
 * - lastModifiedDate
 * - childNodes
 * - childCards
 * - deleteDirectory
 * - hasCard
 * - hasDirectory
 * - addCard
 * - modifyCard
 * - deleteCards
 * - dropCard
 * - addressLists
 * - addMailList
 * - listNickName
 * - description
 * - editMailListToDatabase
 * - copyMailList
 */

// Main function for the this test so we can check both personal and
// collected books work correctly in an easy manner.
function check_ab(abConfig) {
  // Test - Get the directory

  const AB = MailServices.ab.getDirectory(abConfig.URI);

  // Test - Is it the right type?

  if (abConfig.dirType == 2) {
    Assert.ok(AB instanceof Ci.nsIAbMDBDirectory);
  }

  // Test - Check attributes

  Assert.equal(AB.propertiesChromeURI, kNormalPropertiesURI);
  Assert.equal(AB.readOnly, abConfig.readOnly);
  Assert.equal(AB.dirName, abConfig.dirName);
  Assert.equal(AB.dirType, abConfig.dirType);
  Assert.equal(AB.fileName, abConfig.fileName);
  Assert.equal(AB.URI, abConfig.URI);
  Assert.equal(AB.position, abConfig.position);
  Assert.equal(AB.isMailList, false);
  Assert.equal(AB.isRemote, false);
  Assert.equal(AB.isSecure, false);
  Assert.equal(AB.supportsMailingLists, true);
  Assert.equal(AB.dirPrefId, abConfig.dirPrefID);

  // Test - autocomplete enable/disable

  // enable is the default
  Assert.equal(AB.useForAutocomplete(""), true);

  Services.prefs.setBoolPref("mail.enable_autocomplete", false);
  Assert.equal(AB.useForAutocomplete(""), false);

  Services.prefs.setBoolPref("mail.enable_autocomplete", true);
  Assert.equal(AB.useForAutocomplete(""), true);

  AB.setBoolValue("enable_autocomplete", false);
  Assert.equal(AB.useForAutocomplete(""), false);

  AB.setBoolValue("enable_autocomplete", true);
  Assert.equal(AB.useForAutocomplete(""), true);

  // Test - check getting default preferences

  Assert.equal(AB.getIntValue("random", 54321), 54321);
  Assert.equal(AB.getBoolValue("random", false), false);
  Assert.equal(AB.getStringValue("random", "abc"), "abc");
  Assert.equal(AB.getLocalizedStringValue("random", "xyz"), "xyz");

  // Test - check get/set int preferences on nsIAbDirectory

  AB.setIntValue("inttest", 12345);
  Assert.equal(
    Services.prefs.getIntPref(abConfig.dirPrefID + ".inttest"),
    12345
  );
  Assert.equal(AB.getIntValue("inttest", -1), 12345);

  AB.setIntValue("inttest", 123456);
  Assert.equal(
    Services.prefs.getIntPref(abConfig.dirPrefID + ".inttest"),
    123456
  );
  Assert.equal(AB.getIntValue("inttest", -2), 123456);

  // Test - check get/set bool preferences on nsIAbDirectory

  AB.setBoolValue("booltest", true);
  Assert.equal(
    Services.prefs.getBoolPref(abConfig.dirPrefID + ".booltest"),
    true
  );
  Assert.equal(AB.getBoolValue("booltest", false), true);

  AB.setBoolValue("booltest", false);
  Assert.equal(
    Services.prefs.getBoolPref(abConfig.dirPrefID + ".booltest"),
    false
  );
  Assert.equal(AB.getBoolValue("booltest", true), false);

  // Test - check get/set string preferences on nsIAbDirectory

  AB.setStringValue("stringtest", "tyu");
  Assert.equal(
    Services.prefs.getCharPref(abConfig.dirPrefID + ".stringtest"),
    "tyu"
  );
  Assert.equal(AB.getStringValue("stringtest", ""), "tyu");
}

function run_test() {
  // Check the default personal address book
  check_ab(kPABData);

  // Check the default collected address book
  check_ab(kCABData);
}
