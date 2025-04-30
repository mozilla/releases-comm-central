/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test of setup of localMailFolders

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  var rootFolder = localAccountUtils.incomingServer.rootFolder;

  var expectedFolders = ["Inbox"]; // Inbox hard-coded in LocalAccountUtils.sys.mjs

  // These two MailNews adds by default
  expectedFolders.push("Unsent Messages");
  expectedFolders.push("Trash");

  Assert.equal(rootFolder.numSubFolders, expectedFolders.length);
  for (var i = 0; i < expectedFolders.length; ++i) {
    Assert.ok(rootFolder.containsChildNamed(expectedFolders[i]));
  }
  Assert.ok(rootFolder.isAncestorOf(localAccountUtils.inboxFolder));
}
