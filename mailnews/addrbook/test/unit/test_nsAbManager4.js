/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Creating a new address book with the same name as an existing one should
// always produce a unique preference branch. Check that it does.

function run_test() {
  let name0 = MailServices.ab.newAddressBook("name", null, kPABData.dirType);
  equal(name0, "ldap_2.servers.name");

  let name1 = MailServices.ab.newAddressBook("name", null, kPABData.dirType);
  equal(name1, "ldap_2.servers.name_1");

  let name2 = MailServices.ab.newAddressBook("name", null, kPABData.dirType);
  equal(name2, "ldap_2.servers.name_2");

  let name3 = MailServices.ab.newAddressBook("name", null, kPABData.dirType);
  equal(name3, "ldap_2.servers.name_3");
}
