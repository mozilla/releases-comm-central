/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite to check that we correctly get child cards for LDAP directories
 * when offline and that we don't crash.
 */

var kLDAPUriPrefix = "moz-abldapdirectory://";
var kLDAPTestSpec = "ldap://invalidhost//dc=intranet??sub?(objectclass=*)";

// Main function for the this test so we can check both personal and
// collected books work correctly in an easy manner.
function run_test() {
  // If nsIAbLDAPDirectory doesn't exist in our build options, someone has
  // specified --disable-ldap
  if (!("nsIAbLDAPDirectory" in Ci)) {
    return;
  }

  // Test set-up
  const abUri = MailServices.ab.newAddressBook(
    "test",
    kLDAPTestSpec,
    Ci.nsIAbManager.LDAP_DIRECTORY_TYPE
  );

  const abDir = MailServices.ab
    .getDirectory(kLDAPUriPrefix + abUri)
    .QueryInterface(Ci.nsIAbLDAPDirectory);

  const kLDAPFileName = "ldap-1.sqlite";

  // Test setup - copy the data file into place
  loadABFile("data/cardForEmail", kLDAPFileName);

  // And tell the ldap directory we want this file.
  abDir.replicationFileName = kLDAPFileName;

  // Now go offline
  Services.io.offline = true;

  // Make sure we clear any memory that is now loose, so that the crash would
  // be triggered.
  gc();

  // Now try and get the card that has been replicated for offline use.
  Assert.equal(abDir.childCards.length, 5);
}
