/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests basic mailbox handling of IMAP, like discovery, rename and empty folder.
 */

var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// The following folder names are not pure ASCII and will be MUTF-7 encoded.
const folderName1 = "I18N box\u00E1"; // I18N boxá
const folderName2 = "test \u00E4"; // test ä

add_setup(async function () {
  setupIMAPPump();

  IMAPPump.daemon.createMailbox(folderName1, { subscribed: true });
  IMAPPump.daemon.createMailbox("Unsubscribed box");
  // Create an all upper case trash folder name to make sure
  // we handle special folder names case-insensitively.
  IMAPPump.daemon.createMailbox("TRASH", { subscribed: true });

  // Get the server list...
  IMAPPump.server.performTest("LIST");

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkDiscovery() {
  const rootFolder = IMAPPump.incomingServer.rootFolder;
  // Check that we've subscribed to the boxes returned by LSUB. We also get
  // checking of proper i18n in mailboxes for free here.
  Assert.ok(rootFolder.containsChildNamed("Inbox"));
  Assert.ok(rootFolder.containsChildNamed("TRASH"));
  // Make sure we haven't created an extra "Trash" folder.
  const trashes = rootFolder.getFoldersWithFlags(Ci.nsMsgFolderFlags.Trash);
  Assert.equal(trashes.length, 1);
  Assert.equal(rootFolder.numSubFolders, 3);
  Assert.ok(rootFolder.containsChildNamed(folderName1));
  // This is not a subscribed box, so we shouldn't be subscribing to it.
  Assert.ok(!rootFolder.containsChildNamed("Unsubscribed box"));

  const i18nChild = rootFolder.getChildNamed(folderName1);

  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.renameLeaf(i18nChild, folderName2, listener, null);
  await listener.promise;
});

add_task(async function checkRename() {
  const rootFolder = IMAPPump.incomingServer.rootFolder;
  Assert.ok(rootFolder.containsChildNamed(folderName2));
  const newChild = rootFolder
    .getChildNamed(folderName2)
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  newChild.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(function checkEmptyFolder() {
  try {
    const serverSink = IMAPPump.server.QueryInterface(Ci.nsIImapServerSink);
    serverSink.possibleImapMailbox("/", "/", 0);
  } catch (ex) {
    // We expect this to fail, but not crash or assert.
  }
});

add_task(function endTest() {
  teardownIMAPPump();
});
