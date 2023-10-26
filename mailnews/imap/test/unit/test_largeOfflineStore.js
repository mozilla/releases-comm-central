/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that downloadAllForOffline works correctly for large imap
 * stores, i.e., over 4 GiB.
 */

var { MessageGenerator, MessageScenarioFactory } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

var gOfflineStoreSize;

add_setup(async function () {
  setupIMAPPump();

  // Figure out the name of the IMAP inbox
  const inboxFile = IMAPPump.incomingServer.rootMsgFolder.filePath;
  inboxFile.append("INBOX");
  if (!inboxFile.exists()) {
    inboxFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, parseInt("0644", 8));
  }

  const neededFreeSpace = 0x200000000;
  // On Windows, check whether the drive is NTFS. If it is, mark the file as
  // sparse. If it isn't, then bail out now, because in all probability it is
  // FAT32, which doesn't support file sizes greater than 4 GB.
  if (
    "@mozilla.org/windows-registry-key;1" in Cc &&
    mailTestUtils.get_file_system(inboxFile) != "NTFS"
  ) {
    throw new Error("On Windows, this test only works on NTFS volumes.\n");
  }

  const isFileSparse = mailTestUtils.mark_file_region_sparse(
    inboxFile,
    0,
    0x10000000f
  );
  const freeDiskSpace = inboxFile.diskSpaceAvailable;
  Assert.ok(
    isFileSparse && freeDiskSpace > neededFreeSpace,
    "This test needs " +
      mailTestUtils.toMiBString(neededFreeSpace) +
      " free space to run."
  );
});

add_task(async function addOfflineMessages() {
  // Create a couple test messages on the IMAP server.
  let messages = [];
  const messageGenerator = new MessageGenerator();
  const scenarioFactory = new MessageScenarioFactory(messageGenerator);

  messages = messages.concat(scenarioFactory.directReply(2));
  let dataUri = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[0].toMessageString())
  );
  let imapMsg = new ImapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(imapMsg);

  dataUri = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[1].toMessageString())
  );
  imapMsg = new ImapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(imapMsg);

  // Extend local IMAP inbox to over 4 GiB.
  const outputStream = Cc["@mozilla.org/network/file-output-stream;1"]
    .createInstance(Ci.nsIFileOutputStream)
    .QueryInterface(Ci.nsISeekableStream);
  // Open in write-only mode, no truncate.
  outputStream.init(IMAPPump.inbox.filePath, 0x02, -1, 0);
  // seek to 15 bytes past 4GB.
  outputStream.seek(0, 0x10000000f);
  // Write an empty "from" line.
  outputStream.write("from\r\n", 6);
  outputStream.close();

  // Save initial file size.
  gOfflineStoreSize = IMAPPump.inbox.filePath.fileSize;
  dump(
    "Offline store size (before 1st downloadAllForOffline()) = " +
      gOfflineStoreSize +
      "\n"
  );

  // Download for offline use, to append created messages to local IMAP inbox.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(listener, null);
  await listener.promise;
});

add_task(async function check_result() {
  // Call downloadAllForOffline() a second time.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(listener, null);
  await listener.promise;

  // Make sure offline store grew (i.e., we were not writing over data).
  const offlineStoreSize = IMAPPump.inbox.filePath.fileSize;
  dump(
    "Offline store size (after 2nd downloadAllForOffline()): " +
      offlineStoreSize +
      " Msg hdr offsets should be close to it.\n"
  );
  Assert.ok(offlineStoreSize > gOfflineStoreSize);

  // Verify that the message headers have the offline flag set.
  for (const header of IMAPPump.inbox.msgDatabase.enumerateMessages()) {
    // Verify that each message has been downloaded and looks OK.
    Assert.ok(
      header instanceof Ci.nsIMsgDBHdr &&
        header.flags & Ci.nsMsgMessageFlags.Offline,
      "Message downloaded for offline use"
    );

    // Make sure we don't fall over if we ask to read the message.
    IMAPPump.inbox.getLocalMsgStream(header).close();
  }
});

add_task(function teardown() {
  // Free up disk space - if you want to look at the file after running
  // this test, comment out this line.
  if (IMAPPump.inbox) {
    IMAPPump.inbox.filePath.remove(false);
  }

  teardownIMAPPump();
});
