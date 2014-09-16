/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Test handling of special chars in folder names
 */

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");

function run_test() {
  let testFolderName = "";
  let OSname = Cc["@mozilla.org/system-info;1"].getService(Ci.nsIPropertyBag2).getProperty("name");
  if (OSname == "Windows_NT") {
    // On Windows test file with ' ' in the name.
    testFolderName = "bugmail 1";
  } else if (OSname == "Linux") {
    // On Linux test file with '`' in the name.
    testFolderName = "bugmail`1";
  } else if (OSname == "Darwin") {
    // On Mac test file with ':' in the name (generated from Mozilla 1.8 branch).
    testFolderName = "bugmail:1";
  } else {
    // Not sure what this OS is so just use a safe name.
    testFolderName = "bugmail1";
  }

  let bugmail = do_get_file("../../../data/bugmail-1");
  let bugmailmsf = do_get_file("../../../data/bugmail-1.msf");
  let localMailDir = do_get_profile().clone();
  localMailDir.append("Mail");
  localMailDir.append("Local Folders");
  let pop3dir = do_get_profile().clone();
  pop3dir.append("Mail");
  pop3dir.append("poptest");
  // Copy the file to the local mail directory
  bugmail.copyTo(localMailDir, testFolderName);
  bugmailmsf.copyTo(localMailDir, testFolderName + ".msf");

  // Copy the file to the pop3 server mail directory
  bugmail.copyTo(pop3dir, testFolderName);
  bugmailmsf.copyTo(pop3dir, testFolderName + ".msf");

  // These preferences set up a local folders account so we'll use the
  // contents of the Local Folders dir we've already pre-populated.
  Services.prefs.setCharPref("mail.account.account1.server", "server1");
  Services.prefs.setCharPref("mail.account.account2.server", "server2");
  Services.prefs.setCharPref("mail.accountmanager.accounts",
                             "account1,account2");
  Services.prefs.setCharPref("mail.accountmanager.localfoldersserver",
                             "server1");
  Services.prefs.setCharPref("mail.accountmanager.defaultaccount",
                             "account1");
  Services.prefs.setCharPref("mail.server.server1.directory-rel",
                             "[ProfD]Mail/Local Folders");
  Services.prefs.setCharPref("mail.server.server1.hostname",
                             "Local Folders");
  Services.prefs.setCharPref("mail.server.server1.name", "Local Folders");
  Services.prefs.setCharPref("mail.server.server1.type", "none");
  Services.prefs.setCharPref("mail.server.server1.userName", "nobody");
  Services.prefs.setCharPref("mail.server.server2.directory-rel",
                             "[ProfD]Mail/poptest");
  Services.prefs.setCharPref("mail.server.server2.hostname", "poptest");
  Services.prefs.setCharPref("mail.server.server2.name", "poptest");
  Services.prefs.setCharPref("mail.server.server2.type", "pop3");
  Services.prefs.setCharPref("mail.server.server2.userName", "user");
  // This basically says to ignore the time stamp in the .msf file
  Services.prefs.setIntPref("mail.db_timestamp_leeway", 0x7FFFFFFF);

  localAccountUtils.incomingServer = MailServices.accounts.localFoldersServer;
  // force load of accounts.
  let defaultAccount = MailServices.accounts.defaultAccount;

  let pop3Server = MailServices.accounts.FindServer("user", "poptest", "pop3");
  let rootFolder = localAccountUtils.incomingServer.rootMsgFolder
                                    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  let pop3Root = pop3Server.rootMsgFolder;

  // Note: Inbox is not created automatically when there is no deferred server,
  // so we need to create it.
  localAccountUtils.inboxFolder = rootFolder.createLocalSubfolder("Inbox");
  // a local inbox should have a Mail flag!
  localAccountUtils.inboxFolder.setFlag(Ci.nsMsgFolderFlags.Mail);

  rootFolder = localAccountUtils.incomingServer.rootMsgFolder;
  bugmail = rootFolder.getChildNamed(testFolderName);
  do_check_eq(bugmail.getTotalMessages(false), 1);
  bugmail = pop3Root.getChildNamed(testFolderName);
  do_check_eq(bugmail.getTotalMessages(false), 1);

  // Check if creating an empty folder returns a proper error
  // instead of crash (bug 831190).
  try {
    rootFolder.createSubfolder("", null);
    do_throw("createSubfolder() should have failed on empty folder name.");
  } catch (e) {
    // NS_MSG_ERROR_INVALID_FOLDER_NAME
    do_check_eq(e.result, 2153054242);
  }

  // And try to create an existing folder again.
  try {
    rootFolder.createSubfolder(testFolderName, null);
    do_throw("createSubfolder() should have failed on existing folder.");
  } catch (e) {
    // NS_MSG_FOLDER_EXISTS
    do_check_eq(e.result, 2153054227);
  }
}
