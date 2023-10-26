/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for bug 532170. LDAP address book named with cyrillic/chinese
 * letters doesn't work.
 */

var kLDAPUriPrefix = "moz-abldapdirectory://";
var kLDAPTestSpec = "ldap://invalidhost//dc=intranet??sub?(objectclass=*)";

function run_test() {
  // If nsIAbLDAPDirectory doesn't exist in our build options, someone has
  // specified --disable-ldap
  if (!("nsIAbLDAPDirectory" in Ci)) {
    return;
  }

  // Test - Create an LDAP directory

  // Use a UTF-8 based directory name
  var abUri = MailServices.ab.newAddressBook(
    "\u041C\u0435\u043B\u0435\u043D\u043A\u0438",
    kLDAPTestSpec,
    Ci.nsIAbManager.LDAP_DIRECTORY_TYPE
  );

  // Test - Check we have the directory.
  const abDir = MailServices.ab
    .getDirectory(kLDAPUriPrefix + abUri)
    .QueryInterface(Ci.nsIAbLDAPDirectory);

  // Test - Check various fields
  Assert.equal(abDir.dirName, "\u041C\u0435\u043B\u0435\u043D\u043A\u0438");
  Assert.equal(abDir.lDAPURL.spec, kLDAPTestSpec);
  Assert.ok(abDir.readOnly);

  // XXX I'd really like a better check than this, to check that searching
  // works correctly. However we haven't got the support for that at the moment
  // and this at least ensures that we get a consistent ascii based preference
  // for the directory.
  Assert.equal(abDir.dirPrefId, "ldap_2.servers._nonascii");
}
