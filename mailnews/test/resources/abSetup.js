/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Sets up the directory service provider to return the app dir as the profile
 * directory for the address book to use for locating its files during the
 * tests.
 *
 * Note there are further configuration setup items below this.
 */

/**
 * General Configuration Data that applies to the address book.
 */

// Personal Address Book configuration items.
var kPABData = {
  URI: "jsaddrbook://abook.sqlite",
  fileName: "abook.sqlite",
  dirName: "Personal Address Book",
  dirType: 101,
  dirPrefID: "ldap_2.servers.pab",
  readOnly: false,
  position: 1,
};

// Collected Address Book configuration items.
var kCABData = {
  URI: "jsaddrbook://history.sqlite",
  fileName: "history.sqlite",
  dirName: "Collected Addresses",
  dirType: 101,
  dirPrefID: "ldap_2.servers.history",
  readOnly: false,
  position: 2,
};

// This currently applies to all address books of local type.
var kNormalPropertiesURI =
  "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml";

/**
 * Installs a pre-prepared address book file into the profile directory.
 * This version is for JS/SQLite address books, if you create a new type,
 * replace this function to test them.
 *
 * @param {string} source - Path to the source data, without extension
 * @param {string} dest - Final file name in the profile, with extension
 */
function loadABFile(source, dest) {
  const sourceFile = do_get_file(`${source}.sql`);
  const destFile = do_get_profile();
  destFile.append(dest);

  info(`Creating ${destFile.path} from ${sourceFile.path}`);

  const fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  const cstream = Cc[
    "@mozilla.org/intl/converter-input-stream;1"
  ].createInstance(Ci.nsIConverterInputStream);
  fstream.init(sourceFile, -1, 0, 0);
  cstream.init(fstream, "UTF-8", 0, 0);

  let data = "";
  let read = 0;
  do {
    const str = {};
    read = cstream.readString(0xffffffff, str);
    data += str.value;
  } while (read != 0);
  cstream.close();

  const conn = Services.storage.openDatabase(destFile);
  conn.executeSimpleSQL(data);
  conn.close();
}
