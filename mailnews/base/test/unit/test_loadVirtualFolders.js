/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test loading of virtualFolders.dat, including verification of the search
// scopes, i.e., folder uri's.

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

// As currently written, this test will only work with Berkeley store.
Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

// main test

function run_test() {
  const vfdat = do_get_file("../../../data/test_virtualFolders.dat");

  vfdat.copyTo(do_get_profile(), "virtualFolders.dat");
  localAccountUtils.loadLocalMailAccount();
  const localMailDir = do_get_profile().clone();
  localMailDir.append("Mail");
  localMailDir.append("Local Folders");
  localMailDir.append("unread-local");
  localMailDir.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
  localMailDir.leafName = "invalidserver-local";
  localMailDir.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
  localMailDir.leafName = "$label1";
  localMailDir.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

  MailServices.accounts.loadVirtualFolders();
  const unreadLocal =
    localAccountUtils.incomingServer.rootMsgFolder.getChildNamed(
      "unread-local"
    );
  let searchScope =
    unreadLocal.msgDatabase.dBFolderInfo.getCharProperty("searchFolderUri");
  Assert.equal(
    searchScope,
    "mailbox://nobody@Local%20Folders/Inbox|mailbox://nobody@Local%20Folders/Trash"
  );
  const invalidServer =
    localAccountUtils.incomingServer.rootMsgFolder.getChildNamed(
      "invalidserver-local"
    );
  searchScope =
    invalidServer.msgDatabase.dBFolderInfo.getCharProperty("searchFolderUri");
  Assert.equal(searchScope, "mailbox://nobody@Local%20Folders/Inbox");

  const tagsFolder =
    localAccountUtils.incomingServer.rootMsgFolder.getChildNamed("$label1");
  Assert.equal(
    tagsFolder.msgDatabase.dBFolderInfo.getCharProperty("searchFolderUri"),
    "*"
  );
  Assert.equal(
    tagsFolder.msgDatabase.dBFolderInfo.getCharProperty("searchStr"),
    "AND (tag,contains,$label1)"
  );
}
