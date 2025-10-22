/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { FolderSelectionDataAdapter } = ChromeUtils.importESModule(
  "chrome://messenger/content/FolderSelectionDataAdapter.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

let pop3Account, parent, child;

add_setup(function () {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRootFolder = localAccount.incomingServer.rootFolder;
  localRootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  pop3Account = MailServices.accounts.createAccount();
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "localhost",
    "pop3"
  );
  const pop3RootFolder = pop3Account.incomingServer.rootFolder;
  pop3RootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  parent = pop3RootFolder.createLocalSubfolder("parent");
  parent.QueryInterface(Ci.nsIMsgLocalMailFolder);
  child = parent.createLocalSubfolder("child");
});

/**
 * Test with all servers.
 */
add_task(function testAllServers() {
  const adapter = new FolderSelectionDataAdapter();
  Assert.equal(adapter.rowCount, 2);
  Assert.equal(adapter.getCellText(0, "name"), "nobody on localhost");
  Assert.ok(adapter.rowAt(0).hasProperty("server-type-pop3"));
  Assert.equal(adapter.getCellText(1, "name"), "Local Folders");
  Assert.ok(adapter.rowAt(1).hasProperty("server-type-none"));

  Assert.ok(!adapter.rowAt(0).open);
  adapter.toggleOpenState(0);
  Assert.ok(adapter.rowAt(0).open);

  Assert.equal(adapter.rowCount, 5);
  Assert.equal(adapter.getCellText(0, "name"), "nobody on localhost");
  Assert.equal(adapter.getCellText(1, "name"), "Inbox");
  Assert.ok(adapter.rowAt(1).hasProperty("folder-type-inbox"));
  Assert.equal(adapter.getCellText(2, "name"), "Trash");
  Assert.ok(adapter.rowAt(2).hasProperty("folder-type-trash"));
  Assert.equal(adapter.getCellText(3, "name"), "parent");
  Assert.equal(adapter.getCellText(4, "name"), "Local Folders");

  Assert.ok(!adapter.rowAt(3).open);
  adapter.toggleOpenState(3);
  Assert.ok(adapter.rowAt(3).open);

  Assert.equal(adapter.rowCount, 6);
  Assert.equal(adapter.getCellText(3, "name"), "parent");
  Assert.equal(adapter.getCellText(4, "name"), "child");
});

/**
 * Test with only one of the servers. Only folders from that server are shown,
 * and the root folder is not shown.
 */
add_task(function testSingleServer() {
  const adapter = new FolderSelectionDataAdapter(pop3Account.incomingServer);
  Assert.equal(adapter.rowCount, 3);
  Assert.ok(!adapter.rowAt(2).open);

  Assert.equal(adapter.getCellText(0, "name"), "Inbox");
  Assert.ok(adapter.rowAt(0).hasProperty("folder-type-inbox"));
  Assert.equal(adapter.getCellText(1, "name"), "Trash");
  Assert.ok(adapter.rowAt(1).hasProperty("folder-type-trash"));
  Assert.equal(adapter.getCellText(2, "name"), "parent");

  adapter.toggleOpenState(2);
  Assert.equal(adapter.rowCount, 4);
  Assert.ok(adapter.rowAt(2).open);

  Assert.equal(adapter.getCellText(2, "name"), "parent");
  Assert.equal(adapter.getCellText(3, "name"), "child");
});

/**
 * Test with an array containing only one of the servers. Only folders from
 * that server are shown, and the root folder is shown.
 */
add_task(function testServerArray() {
  const adapter = new FolderSelectionDataAdapter([pop3Account.incomingServer]);
  Assert.equal(adapter.rowCount, 1);

  Assert.equal(adapter.getCellText(0, "name"), "nobody on localhost");
  Assert.ok(adapter.rowAt(0).hasProperty("server-type-pop3"));

  Assert.ok(!adapter.rowAt(0).open);
  adapter.toggleOpenState(0);
  Assert.ok(adapter.rowAt(0).open);

  Assert.equal(adapter.rowCount, 4);
  Assert.equal(adapter.getCellText(0, "name"), "nobody on localhost");
  Assert.equal(adapter.getCellText(1, "name"), "Inbox");
  Assert.ok(adapter.rowAt(1).hasProperty("folder-type-inbox"));
  Assert.equal(adapter.getCellText(2, "name"), "Trash");
  Assert.ok(adapter.rowAt(2).hasProperty("folder-type-trash"));
  Assert.equal(adapter.getCellText(3, "name"), "parent");

  adapter.toggleOpenState(3);
  Assert.equal(adapter.rowCount, 5);
  Assert.ok(adapter.rowAt(3).open);

  Assert.equal(adapter.getCellText(3, "name"), "parent");
  Assert.equal(adapter.getCellText(4, "name"), "child");
});

/**
 * Test with some selected folders. Ancestors of the selected folders should
 * be opened automatically.
 */
add_task(function testSelectedFolders() {
  const adapter = new FolderSelectionDataAdapter();
  adapter.selectedFolders = new Set([parent]);

  Assert.equal(adapter.rowCount, 5);
  Assert.ok(adapter.rowAt(0).open);
  Assert.ok(!adapter.rowAt(3).open);

  Assert.equal(adapter.getCellText(0, "name"), "nobody on localhost");
  Assert.equal(adapter.getCellText(1, "name"), "Inbox");
  Assert.equal(adapter.getCellText(2, "name"), "Trash");
  Assert.equal(adapter.getCellText(3, "name"), "parent");
  Assert.equal(adapter.getCellText(4, "name"), "Local Folders");

  Assert.ok(!adapter.rowAt(0).hasProperty("folderSelected"));
  Assert.ok(!adapter.rowAt(1).hasProperty("folderSelected"));
  Assert.ok(!adapter.rowAt(2).hasProperty("folderSelected"));
  Assert.ok(adapter.rowAt(3).hasProperty("folderSelected"));
  Assert.ok(!adapter.rowAt(4).hasProperty("folderSelected"));

  // Check the selected folders.

  Assert.deepEqual([...adapter.selectedFolders], [parent]);

  adapter.toggleOpenState(3);
  Assert.equal(adapter.getCellText(4, "name"), "child");
  Assert.ok(!adapter.rowAt(4).hasProperty("folderSelected"));

  adapter.rowAt(4).addProperty("folderSelected");
  Assert.deepEqual([...adapter.selectedFolders], [parent, child]);

  // The selected folders should be the same regardless of their visibility.

  adapter.toggleOpenState(3);
  adapter.toggleOpenState(0);
  Assert.deepEqual([...adapter.selectedFolders], [parent, child]);
});
