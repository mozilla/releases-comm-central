/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that sizeOnDisk succeeds returning 0 for virtual folders in both
 * message storage formats.
 */

const { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

function subTest() {
  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;

  // Create some real folders to test.
  rootFolder.createSubfolder("test A", null);
  const testFolderA = rootFolder.getChildNamed("test A");
  rootFolder.createSubfolder("test B", null);
  const testFolderB = rootFolder.getChildNamed("test B");

  // Create a virtual folder with two search folders.
  const wrappedFolder = VirtualFolderHelper.createNewVirtualFolder(
    "virtual X",
    rootFolder,
    [testFolderA, testFolderB],
    "ANY",
    false
  );
  Assert.equal(
    wrappedFolder.virtualFolder,
    rootFolder.getChildNamed("virtual X")
  );

  Assert.equal(wrappedFolder.virtualFolder.sizeOnDisk, 0);

  MailServices.accounts.removeAccount(account);
}

add_task(function () {
  // Currently we have two mailbox storage formats.
  const pluggableStores = [
    "@mozilla.org/msgstore/berkeleystore;1",
    "@mozilla.org/msgstore/maildirstore;1",
  ];

  for (const store of pluggableStores) {
    Services.prefs.setCharPref(
      "mail.serverDefaultStoreContractID",
      pluggableStores[store]
    );
    subTest();
  }
});
