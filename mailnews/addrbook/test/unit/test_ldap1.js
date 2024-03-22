/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for basic LDAP address book functions
 */

var kLDAPUriPrefix = "moz-abldapdirectory://";
var kLDAPTestSpec = "ldap://invalidhost//dc=intranet??sub?(objectclass=*)";

function run_test() {
  // If nsIAbLDAPDirectory doesn't exist in our build options, someone has
  // specified --disable-ldap
  if (!("nsIAbLDAPDirectory" in Ci)) {
    return;
  }

  const abCountBeforeStart = MailServices.ab.directories.length;

  // Test - Create an LDAP directory
  const abUri = MailServices.ab.newAddressBook(
    "test",
    kLDAPTestSpec,
    Ci.nsIAbManager.LDAP_DIRECTORY_TYPE
  );

  const abCountAfterCreate = MailServices.ab.directories.length;
  Assert.equal(abCountAfterCreate, abCountBeforeStart + 1);

  // Test - Check we have the directory.
  const abDir = MailServices.ab
    .getDirectory(kLDAPUriPrefix + abUri)
    .QueryInterface(Ci.nsIAbLDAPDirectory);

  // Test - Check various fields
  Assert.equal(abDir.dirName, "test");
  Assert.equal(abDir.lDAPURL.spec, kLDAPTestSpec);
  Assert.ok(abDir.readOnly);

  // Test - Write a UTF-8 Auth DN and check it
  abDir.authDn = "test\u00D0";

  Assert.equal(abDir.authDn, "test\u00D0");

  // Test - searchDuringLocalAutocomplete

  // Set up an account and identity in the account manager
  const identity = MailServices.accounts.createIdentity();

  const localAcTests = [
    // Online checks
    {
      useDir: false,
      dirSer: "",
      idOver: false,
      idSer: "",
      idKey: "",
      offline: false,
      result: false,
    },
    {
      useDir: true,
      dirSer: abDir.dirPrefId,
      idOver: false,
      idSer: "",
      idKey: "",
      offline: false,
      result: false,
    },
    // Offline checks with and without global prefs set, no identity key
    {
      useDir: false,
      dirSer: "",
      idOver: false,
      idSer: "",
      idKey: "",
      offline: true,
      result: false,
    },
    {
      useDir: true,
      dirSer: "",
      idOver: false,
      idSer: "",
      idKey: "",
      offline: true,
      result: false,
    },
    {
      useDir: true,
      dirSer: abDir.dirPrefId,
      idOver: false,
      idSer: "",
      idKey: "",
      offline: true,
      result: true,
    },
    // Offline checks with and without global prefs set, with identity key
    {
      useDir: false,
      dirSer: "",
      idOver: false,
      idSer: "",
      idKey: identity.key,
      offline: true,
      result: false,
    },
    {
      useDir: true,
      dirSer: "",
      idOver: false,
      idSer: "",
      idKey: identity.key,
      offline: true,
      result: false,
    },
    {
      useDir: true,
      dirSer: abDir.dirPrefId,
      idOver: false,
      idSer: "",
      idKey: identity.key,
      offline: true,
      result: true,
    },
    // Offline checks, no global prefs, identity ones only
    {
      useDir: false,
      dirSer: "",
      idOver: true,
      idSer: "",
      idKey: identity.key,
      offline: true,
      result: false,
    },
    {
      useDir: false,
      dirSer: "",
      idOver: true,
      idSer: kPABData.dirPrefID,
      idKey: identity.key,
      offline: true,
      result: false,
    },
    {
      useDir: false,
      dirSer: "",
      idOver: true,
      idSer: abDir.dirPrefId,
      idKey: identity.key,
      offline: true,
      result: true,
    },
    {
      useDir: false,
      dirSer: "",
      idOver: false,
      idSer: abDir.dirPrefId,
      idKey: identity.key,
      offline: true,
      result: false,
    },
    // Offline checks, global prefs and identity ones
    {
      useDir: true,
      dirSer: kPABData.dirPrefID,
      idOver: true,
      idSer: abDir.dirPrefId,
      idKey: identity.key,
      offline: true,
      result: true,
    },
    {
      useDir: true,
      dirSer: abDir.dirPrefId,
      idOver: true,
      idSer: kPABData.dirPrefID,
      idKey: identity.key,
      offline: true,
      result: false,
    },
  ];

  function checkAc(element, index) {
    dump("Testing index " + index + "\n");
    Services.prefs.setBoolPref(
      "ldap_2.autoComplete.useDirectory",
      element.useDir
    );
    Services.prefs.setCharPref(
      "ldap_2.autoComplete.directoryServer",
      element.dirSer
    );
    identity.overrideGlobalPref = element.idOver;
    identity.directoryServer = element.idSer;
    Services.io.offline = element.offline;

    Assert.equal(abDir.useForAutocomplete(element.idKey), element.result);
  }

  localAcTests.forEach(checkAc);

  MailServices.ab.deleteAddressBook(abDir.URI);

  const abCountAfterDelete = MailServices.ab.directories.length;
  Assert.equal(abCountAfterDelete, abCountBeforeStart);
}
