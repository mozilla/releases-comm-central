/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Test suite for folder compaction
 *
 * Currently tested:
 * - Compacting local mbox stores.
 * TODO:
 * - Compacting imap offline stores.
 * - Compacting maildir stores.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

function copyFileMessage(file, destFolder, isDraftOrTemplate) {
  const listener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    file,
    destFolder,
    null,
    isDraftOrTemplate,
    0,
    "",
    listener,
    null
  );
  return listener.promise;
}

function copyMessages(items, isMove, srcFolder, destFolder) {
  const listener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    srcFolder,
    items,
    destFolder,
    isMove,
    listener,
    null,
    true
  );
  return listener.promise;
}

function deleteMessages(srcFolder, items) {
  const listener = new PromiseTestUtils.PromiseCopyListener();
  srcFolder.deleteMessages(items, null, false, true, listener, true);
  return listener.promise;
}

/**
 * Calculate the expected size of a (compacted) mbox, based on
 * msgDB entries. For use later in verifyMboxSize().
 * We're assuming bare "From " lines, which _won't_ be right, but
 * verifyMboxSize() will do the same, so it works out.
 */
function calculateExpectedMboxSize(folder) {
  const msgDB = folder.msgDatabase;
  let totalSize = 0;
  for (const header of msgDB.enumerateMessages()) {
    totalSize += "From \r\n".length; // Pared-down mbox separator.
    totalSize += header.messageSize; // The actual message data.
    totalSize += "\r\n".length; // Blank line between messages.
  }
  return totalSize;
}

/**
 * Make sure the mbox size of folder matches expectedSize.
 * We can't just use the mbox file size, since we need to normalise the
 * "From " separator lines, which can be variable length.
 * So we load in the whole file, strip anything on lines after the "From ",
 * and check the length after that.
 */
async function verifyMboxSize(folder, expectedSize) {
  showMessages(folder, "verifyMboxSize");
  let mbox = await IOUtils.readUTF8(folder.filePath.path);
  // Pared-down mbox separator.
  mbox = mbox.replace(/^From .*$/gm, "From ");

  Assert.equal(mbox.length, expectedSize, "mbox should be the expected size");
}

/**
 * Debug utility to show the key/offset/ID relationship of messages in a folder.
 * Disabled but not removed, as it's just so useful for troubleshooting
 * if anything goes wrong!
 */
function showMessages(folder, text) {
  dump(`***** Messages in folder <${folder.name}> ${text} *****\n`);
  for (const hdr of folder.messages) {
    dump(
      `  key: ${hdr.messageKey} storeToken: ${hdr.storeToken} size: ${hdr.messageSize} ID: ${hdr.messageId}\n`
    );
  }
}

let gInbox, gFolder2, gFolder3;

add_setup(async function () {
  localAccountUtils.loadLocalMailAccount();
  gInbox = localAccountUtils.inboxFolder;

  // Copy in some files.
  await copyFileMessage(do_get_file("../../../data/bugmail10"), gInbox, false);
  await copyFileMessage(do_get_file("../../../data/bugmail11"), gInbox, false);
  await copyFileMessage(do_get_file("../../../data/draft1"), gInbox, true);
  showMessages(gInbox, "after initial 3 messages copy to inbox");

  const inboxMessages = [...gInbox.messages];

  // Create another folder and copy all the messages to it.
  gFolder2 = localAccountUtils.rootFolder.createLocalSubfolder("folder2");
  await copyMessages(inboxMessages, false, gInbox, gFolder2);
  showMessages(gFolder2, "after copying 3 messages");

  // Create a third folder and move two messages to it.
  gFolder3 = localAccountUtils.rootFolder.createLocalSubfolder("folder3");
  await copyMessages(inboxMessages.slice(0, 2), true, gInbox, gFolder3);
  showMessages(gInbox, "after moving 2 messages");
  showMessages(gFolder3, "after moving 2 messages");
});

add_task(async function testCompactFolder() {
  showMessages(gFolder3, "before deleting 1 message");

  // Store message keys before deletion and compaction.
  const keysBefore = Array.from(gFolder3.messages, m => m.messageKey);

  // Delete a message.
  const messageToDelete = gFolder3.messages.getNext();
  await deleteMessages(gFolder3, [messageToDelete]);
  showMessages(gFolder3, "after deleting 1 message");

  const expectedFolderSize = calculateExpectedMboxSize(gFolder3);
  Assert.greater(gFolder3.expungedBytes, 0, "folder3 should need compaction");

  const listener = new PromiseTestUtils.PromiseUrlListener();
  gFolder3.compact(listener, null);
  await listener.promise;

  // Bug 854798: Check if the new message keys are the same as before compaction.
  const keysAfter = Array.from(gFolder3.messages, m => m.messageKey);
  // The first message was deleted so skip it in the old array.
  Assert.deepEqual(
    keysAfter,
    keysBefore.slice(1),
    "keys after compaction should match those before compaction"
  );

  await verifyMboxSize(gFolder3, expectedFolderSize);
});

add_task(async function testCompactAllFolders() {
  showMessages(gFolder2, "before deleting 1 message");

  // Store message keys before deletion and compaction.
  const keysBefore = Array.from(gFolder2.messages, m => m.messageKey);

  // Delete a message.
  const messageToDelete = gFolder2.messages.getNext();
  await deleteMessages(gFolder2, [messageToDelete]);
  showMessages(gFolder2, "after deleting 1 message");

  // The inbox needs compacting, two messages were moved from it.
  const expectedInboxSize = calculateExpectedMboxSize(gInbox);
  Assert.greater(gInbox.expungedBytes, 0, "inbox should need compaction");
  // Folder 2 needs compacting, we just deleted a message.
  const expectedFolder2Size = calculateExpectedMboxSize(gFolder2);
  Assert.greater(gFolder2.expungedBytes, 0, "folder2 should need compaction");
  // Folder 3 doesn't need compacting.
  const expectedFolder3Size = calculateExpectedMboxSize(gFolder3);
  Assert.equal(gFolder3.expungedBytes, 0, "folder3 should not need compaction");

  const listener = new PromiseTestUtils.PromiseUrlListener();
  gInbox.compactAll(listener, null);
  await listener.promise;

  const keysAfter = Array.from(gFolder2.messages, m => m.messageKey);
  // The first message was deleted so skip it in the old array.
  Assert.deepEqual(
    keysAfter,
    keysBefore.slice(1),
    "keys after compaction should match those before compaction"
  );

  await verifyMboxSize(gInbox, expectedInboxSize);
  await verifyMboxSize(gFolder2, expectedFolder2Size);
  await verifyMboxSize(gFolder3, expectedFolder3Size);
});

add_task(async function testAbortCompactingFolder() {
  showMessages(gFolder2, "before deleting 1 message");

  // Remember the size of the mbox before compact.
  const unchangedFolderSize = calculateExpectedMboxSize(gFolder2);

  // Delete a message.
  const messageToDelete = gFolder2.messages.getNext();
  await deleteMessages(gFolder2, [messageToDelete]);
  showMessages(gFolder2, "after deleting 1 message");

  Assert.greater(gFolder2.expungedBytes, 0, "folder2 should need compaction");

  const listener = new PromiseTestUtils.PromiseUrlListener();
  gFolder2.compact(listener, null);

  // Shut down (or pretend to)! This can happen after starting compact because
  // compact is event driven and we haven't released the event loop yet.
  Services.obs.notifyObservers(null, "test-profile-before-change");
  await Assert.rejects(
    listener.promise,
    /2147500036/,
    "compact should exit with NS_ERROR_ABORT"
  );

  await verifyMboxSize(gFolder2, unchangedFolderSize);
});
