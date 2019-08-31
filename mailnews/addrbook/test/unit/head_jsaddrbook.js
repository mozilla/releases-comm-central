var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

// Ensure the profile directory is set up
do_get_profile();

// What follows is a copy of abSetup.js modified for tests with the
// JS directory provider. We don't yet make the personal address book
// and collected addresses book with this provider, so add two new
// directories and pretend they are the original ones.

MailServices.ab.newAddressBook("pab2", "jsaddrbook://abook.sqlite", 101);
MailServices.ab.newAddressBook("history2", "jsaddrbook://abook-1.sqlite", 101);
Services.prefs.setIntPref("ldap_2.servers.history2.position", 2);

// Personal Address Book configuration items.
var kPABData = {
  URI: "jsaddrbook://abook.sqlite",
  fileName: "abook.sqlite",
  dirName: "pab2",
  dirType: 101,
  dirPrefID: "ldap_2.servers.pab2",
  readOnly: false,
  position: 1,
};

// Collected Address Book configuration items.
var kCABData = {
  URI: "jsaddrbook://abook-1.sqlite",
  fileName: "abook-1.sqlite",
  dirName: "history2",
  dirType: 101,
  dirPrefID: "ldap_2.servers.history2",
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
  let sourceFile = do_get_file(`${source}.sql`);
  let destFile = do_get_profile();
  destFile.append(kPABData.fileName);

  let fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  let cstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(
    Ci.nsIConverterInputStream
  );
  fstream.init(sourceFile, -1, 0, 0);
  cstream.init(fstream, "UTF-8", 0, 0);

  let data = "";
  let read = 0;
  do {
    let str = {};
    read = cstream.readString(0xffffffff, str);
    data += str.value;
  } while (read != 0);
  cstream.close();

  let conn = Services.storage.openDatabase(destFile);
  conn.executeSimpleSQL(data);
  conn.close();
}

registerCleanupFunction(function() {
  load("../../../resources/mailShutdown.js");
});
