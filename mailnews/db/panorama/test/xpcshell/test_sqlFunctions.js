/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async function () {
  do_get_profile();
  await loadExistingDB();
});

add_task(function testTagsInclude() {
  const stmt = database.connectionForTests.createStatement(
    "SELECT TAGS_INCLUDE('foo bar baz', :tag) AS result"
  );

  function check(input, expectedOutput) {
    stmt.params.tag = input;
    stmt.executeStep();
    Assert.equal(
      stmt.row.result,
      expectedOutput,
      `tags_include('foo bar baz', '${input}') should return ${expectedOutput}`
    );
    stmt.reset();
  }

  check("foo", 1);
  check("bar", 1);
  check("baz", 1);
  check("quux", 0);
  check("oo", 0);
  check("oo ba", 0);

  stmt.finalize();
});

add_task(function testTagsExclude() {
  const stmt = database.connectionForTests.createStatement(
    "SELECT TAGS_EXCLUDE('foo bar baz', :tag) AS result"
  );

  function check(input, expectedOutput) {
    stmt.params.tag = input;
    stmt.executeStep();
    Assert.equal(
      stmt.row.result,
      expectedOutput,
      `tags_exclude('foo bar baz', '${input}') should return ${expectedOutput}`
    );
    stmt.reset();
  }

  check("foo", 0);
  check("bar", 0);
  check("baz", 0);
  check("quux", 1);

  stmt.finalize();
});

add_task(function testAddressFormat() {
  let contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact.displayName = "Address Book Contact";
  contact.primaryEmail = "contact@test.invalid";
  contact = MailServices.ab.directories[0].addCard(contact);

  const stmt = database.connectionForTests.createStatement(
    "SELECT ADDRESS_FORMAT(:header) AS result"
  );

  function check(input, expectedOutput) {
    stmt.params.header = input;
    stmt.executeStep();
    Assert.equal(
      stmt.row.result,
      expectedOutput,
      `address_format('${input}') should return '${expectedOutput}'`
    );
    stmt.reset();
  }

  // Check an address book contact is displayed correctly.

  check("contact@test.invalid", "Address Book Contact");
  check("Anything <contact@test.invalid>", "Address Book Contact");

  // Change the name, check that the returned value changes.
  contact.displayName = "Updated Contact";
  contact = MailServices.ab.directories[0].modifyCard(contact);
  check("contact@test.invalid", "Updated Contact");
  check("Anything <contact@test.invalid>", "Updated Contact");

  // Turn off the pref.
  Services.prefs.setBoolPref("mail.showCondensedAddresses", false);
  check("contact@test.invalid", "contact@test.invalid");
  check("Anything <contact@test.invalid>", "Anything <contact@test.invalid>");

  Services.prefs.clearUserPref("mail.showCondensedAddresses");

  // Check addresses that aren't in the address book.

  // Full name and address.
  check("", "");
  check("foo@test.invalid", "foo@test.invalid");
  check("Foo <foo@test.invalid>", "Foo <foo@test.invalid>");
  check(`"Foo Bar" <foo.bar@test.invalid>`, "Foo Bar <foo.bar@test.invalid>");
  check(
    `"real@spoofed.invalid" <fake@fake.invalid>`,
    "real@spoofed.invalid <fake@fake.invalid>"
  );

  // Only email.
  Services.prefs.setIntPref("mail.addressDisplayFormat", 1);
  check("", "");
  check("foo@test.invalid", "foo@test.invalid");
  check("Foo <foo@test.invalid>", "foo@test.invalid");
  check(`"Foo Bar" <foo.bar@test.invalid>`, "foo.bar@test.invalid");
  check(`"real@spoofed.invalid" <fake@fake.invalid>`, "fake@fake.invalid");

  // Only name.
  Services.prefs.setIntPref("mail.addressDisplayFormat", 2);
  check("", "");
  check("foo@test.invalid", "foo@test.invalid");
  check("Foo <foo@test.invalid>", "Foo");
  check(`"Foo Bar" <foo.bar@test.invalid>`, "Foo Bar");
  check(
    `"real@spoofed.invalid" <fake@fake.invalid>`,
    "real@spoofed.invalid <fake@fake.invalid>"
  );

  Services.prefs.clearUserPref("mail.addressDisplayFormat");

  // Check multiple addresses.

  check(
    "foo@test.invalid, bar@test.invalid",
    "foo@test.invalid, bar@test.invalid"
  );
  check(
    `"Foo Bar" <foo@test.invalid>, Bar <bar@test.invalid>`,
    "Foo Bar <foo@test.invalid>, Bar <bar@test.invalid>"
  );

  stmt.finalize();
});
