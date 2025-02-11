/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/**
 * nsIMsgPluggableStore interface tests
 */

function test_discoverSubFolders() {
  const directory = create_temporary_directory();

  // Just an ordinary folder with an ordinary name.
  const file = directory.clone();
  // Create a directory for maildir stores to find.
  file.append("file");
  file.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
  // And a summary file.
  file.leafName += ".msf";
  file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

  // A folder with a name that once was hashed by NS_MsgHashIfNecessary.
  // This name no longer needs hashing but this test is making sure it still
  // works with the hashed file names.
  const hashedFile = directory.clone();
  hashedFile.append("1ad41a64");
  hashedFile.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
  // Copy the summary file containing the folder's real name.
  do_get_file("data/hashedFolder.msf").copyTo(directory, "1ad41a64.msf");

  // A folder with a name that used to require hashing (on Windows).
  // This is only really here for completeness.
  const unhashedFile = directory.clone();
  unhashedFile.append("test π");
  unhashedFile.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
  unhashedFile.leafName += ".msf";
  unhashedFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

  const rootFolder = setup_mailbox("none", directory);
  rootFolder.msgStore.discoverSubFolders(rootFolder, true);

  const prefix = rootFolder.URI;
  Assert.deepEqual(Array.from(rootFolder.descendants, f => f.URI).toSorted(), [
    `${prefix}/1ad41a64`,
    `${prefix}/Trash`, // Created automagically.
    `${prefix}/Unsent%20Messages`, // Created automagically.
    `${prefix}/file`,
    `${prefix}/test%20%CF%80`,
  ]);

  const hashedFolder = MailServices.folderLookup.getFolderForURL(
    `${prefix}/1ad41a64`
  );
  Assert.equal(hashedFolder.name, "test τ");
  Assert.equal(hashedFolder.prettyName, "test τ");
  Assert.equal(hashedFolder.filePath.leafName, "1ad41a64");
  Assert.equal(hashedFolder.summaryFile.leafName, "1ad41a64.msf");

  const unhashedFolder = MailServices.folderLookup.getFolderForURL(
    `${prefix}/test%20%CF%80`
  );
  Assert.equal(unhashedFolder.name, "test π");
  Assert.equal(unhashedFolder.prettyName, "test π");
  Assert.equal(unhashedFolder.filePath.leafName, "test π");
  Assert.equal(unhashedFolder.summaryFile.leafName, "test π.msf");
}

// Load messages into a msgStore and make sure we can read
// them back correctly using asyncScan().
async function test_asyncScan() {
  const msg1 =
    "To: bob@invalid\r\n" +
    "From: alice@invalid\r\n" +
    "Subject: Hello\r\n" +
    "\r\n" +
    "Hello, Bob! Haven't heard\r\n" +
    "From you in a while...\r\n"; // escaping will be required on this line.

  const msg2 =
    "To: alice@invalid\r\n" +
    "From: bob@invalid\r\n" +
    "Subject: Re: Hello\r\n" +
    "\r\n" +
    "Hi there Alice! All good here.\r\n";

  const testCases = [
    [msg1],
    [msg1, msg2],
    [], // Empty mbox.
  ];

  for (const messages of testCases) {
    // NOTE: we should be able to create stand-alone msgStore to run tests on,
    // but currently they are tightly coupled with folders, msgDB et al...
    // Bug 1714472 should sort that out and strip away some of this gubbins.
    localAccountUtils.loadLocalMailAccount();
    const inbox = localAccountUtils.inboxFolder;

    // Populate the folder with the test messages.

    inbox.addMessageBatch(messages);

    // Perform an async scan on the folder, and make sure we get back all
    // the messages we put in.
    const listener = new PromiseTestUtils.PromiseStoreScanListener();
    inbox.msgStore.asyncScan(inbox, listener);
    await listener.promise;

    // Note: can't rely on message ordering (especially on maildir).
    Assert.deepEqual(listener.messages.toSorted(), messages.toSorted());

    // Clear up so we can run again on different store type.
    localAccountUtils.clearAll();
  }
}

// Return a wrapper which sets the store type before running fn().
function withStore(store, fn) {
  return async () => {
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID", store);
    await fn();
  };
}

for (const store of localAccountUtils.pluggableStores) {
  add_task(withStore(store, test_discoverSubFolders));
  add_task(withStore(store, test_asyncScan));
}
