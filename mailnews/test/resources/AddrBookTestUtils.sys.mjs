/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The Personal Address Book.
 */
export const kPABData = {
  URI: "jsaddrbook://abook.sqlite",
  fileName: "abook.sqlite",
  dirName: "Personal Address Book",
  dirType: 101,
  dirPrefID: "ldap_2.servers.pab",
  readOnly: false,
  position: 1,
};

/**
 * The Collected Addresses address book.
 */
export const kCABData = {
  URI: "jsaddrbook://history.sqlite",
  fileName: "history.sqlite",
  dirName: "Collected Addresses",
  dirType: 101,
  dirPrefID: "ldap_2.servers.history",
  readOnly: false,
  position: 2,
};

/**
 * The properties dialog of local address books.
 */
export const kNormalPropertiesURI =
  "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml";

/**
 * Create a JS/SQLite address book file in the profile from an SQL dump.
 * The test must have called do_get_profile() first.
 *
 * @param {nsIFile} sourceFile - The SQL file to run.
 * @param {string} destName - The file name of the address book in the
 *   profile, e.g. kPABData.fileName.
 */
export function loadABFile(sourceFile, destName) {
  const destFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  destFile.append(destName);

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
