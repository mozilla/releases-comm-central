/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

do_get_profile();
const personalBook = MailServices.ab.getDirectoryFromId("ldap_2.servers.pab");
const historyBook = MailServices.ab.getDirectoryFromId(
  "ldap_2.servers.history"
);

function createContact(firstName, lastName, displayName, primaryEmail) {
  const contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact.displayName = displayName ?? `${firstName} ${lastName}`;
  contact.firstName = firstName;
  contact.lastName = lastName;
  contact.primaryEmail =
    primaryEmail ?? `${firstName}.${lastName}@invalid`.toLowerCase();
  return contact;
}

function createMailingList(name) {
  const list = Cc[
    "@mozilla.org/addressbook/directoryproperty;1"
  ].createInstance(Ci.nsIAbDirectory);
  list.isMailList = true;
  list.dirName = name;
  return list;
}
