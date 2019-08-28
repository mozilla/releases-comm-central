var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

var CC = Components.Constructor;

Services.prefs.setIntPref("ldap_2.servers.history.dirType", 2);
Services.prefs.setStringPref("ldap_2.servers.history.filename", "history.mab");
Services.prefs.setIntPref("ldap_2.servers.pab.dirType", 2);
Services.prefs.setStringPref("ldap_2.servers.pab.filename", "abook.mab");
Services.prefs.setIntPref("mail.addr_book.newDirType", 2);
Services.prefs.setStringPref(
  "mail.collect_addressbook",
  "moz-abmdbdirectory://history.mab"
);
Services.prefs.setStringPref(
  "mail.server.default.whiteListAbURI",
  "moz-abmdbdirectory://abook.mab"
);

// Ensure the profile directory is set up
do_get_profile();

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

function loadABFile(source, dest) {
  let testAB = do_get_file(`${source}.mab`);
  testAB.copyTo(do_get_profile(), dest);
}

registerCleanupFunction(function() {
  load("../../../resources/mailShutdown.js");
});
