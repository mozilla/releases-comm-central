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

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * General Configuration Data that applies to the address book.
 */

// Personal Address Book configuration items.
var kPABData = {
  URI: "moz-abmdbdirectory://abook.mab",
  fileName: "abook.mab",
  dirName: "Personal Address Book",
  dirType: 2,
  dirPrefID: "ldap_2.servers.pab",
  readOnly: false,
  position: 1,
};

// Collected Address Book configuration items.
var kCABData = {
  URI: "moz-abmdbdirectory://history.mab",
  fileName: "history.mab",
  dirName: "Collected Addresses",
  dirType: 2,
  dirPrefID: "ldap_2.servers.history",
  readOnly: false,
  position: 2,
};

// Windows (Outlook Express) Address Book deactivation. (Bug 448859)
Services.prefs.deleteBranch("ldap_2.servers.oe.");

// OSX Address Book deactivation (Bug 955842)
Services.prefs.deleteBranch("ldap_2.servers.osx.");

// This currently applies to all address books of local type.
var kNormalPropertiesURI =
  "chrome://messenger/content/addressbook/abAddressBookNameDialog.xul";
