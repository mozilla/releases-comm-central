/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Creating a new address book with the same name as an existing one should
 * always produce a unique preference branch. Check that it does.
 */
add_task(function testSameName() {
  const name0 = MailServices.ab.newAddressBook("name", null, kPABData.dirType);
  equal(name0, "ldap_2.servers.name");

  const name1 = MailServices.ab.newAddressBook("name", null, kPABData.dirType);
  equal(name1, "ldap_2.servers.name_1");

  const name2 = MailServices.ab.newAddressBook("name", null, kPABData.dirType);
  equal(name2, "ldap_2.servers.name_2");

  const name3 = MailServices.ab.newAddressBook("name", null, kPABData.dirType);
  equal(name3, "ldap_2.servers.name_3");
});

/**
 * Tests that creating a new book with the UID argument assigns the UID to
 * that book and stores it in the preferences.
 */
function subtestCreateWithUID(type, uidValue) {
  const prefID = MailServices.ab.newAddressBook(
    "Got a UID",
    null,
    type,
    uidValue
  );
  Assert.equal(
    Services.prefs.getStringPref(`${prefID}.uid`, ""),
    uidValue,
    "UID is saved to the preferences"
  );

  const book = MailServices.ab.getDirectoryFromId(prefID);
  Assert.equal(book.UID, uidValue, "created book has the right UID");
}

add_task(function testCreateWithUID_JS() {
  subtestCreateWithUID(
    Ci.nsIAbManager.JS_DIRECTORY_TYPE,
    "01234567-89ab-cdef-0123-456789abcdef"
  );

  Assert.throws(
    () =>
      MailServices.ab.newAddressBook(
        "Should fail",
        null,
        Ci.nsIAbManager.JS_DIRECTORY_TYPE,
        "01234567-89ab-cdef-0123-456789abcdef"
      ),
    /NS_ERROR_ABORT/,
    "reusing a UID should throw an exception"
  );
});

add_task(function testCreateWithUID_CardDAV() {
  subtestCreateWithUID(
    Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE,
    "456789ab-cdef-0123-4567-89abcdef0123"
  );
});

add_task(function testCreateWithUID_LDAP() {
  subtestCreateWithUID(
    Ci.nsIAbManager.LDAP_DIRECTORY_TYPE,
    "89abcdef-0123-4567-89ab-cdef01234567"
  );
});
