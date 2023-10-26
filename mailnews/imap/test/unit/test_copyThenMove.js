/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file extends test_imapFolderCopy.js to test message
 * moves from a local folder to an IMAP folder.
 *
 * Original Author: Kent James <kent@caspia.com>
 */

var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gEmptyLocal1, gEmptyLocal2;
var gLastKey;
var gMessages = [];

add_setup(function () {
  // Turn off autosync_offline_stores because
  // fetching messages is invoked after copying the messages.
  // (i.e. The fetching process will be invoked after OnStopCopy)
  // It will cause crash with an assertion
  // (ASSERTION: tried to add duplicate listener: 'index == -1') on teardown.
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  setupIMAPPump();

  gEmptyLocal1 = localAccountUtils.rootFolder.createLocalSubfolder("empty 1");
  gEmptyLocal2 = localAccountUtils.rootFolder.createLocalSubfolder("empty 2");

  // these hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;
});

add_task(async function copyFolder1() {
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    SetMessageKey(aKey) {
      gLastKey = aKey;
    },
  });
  MailServices.copy.copyFolder(
    gEmptyLocal1,
    IMAPPump.inbox,
    false,
    copyListener,
    null
  );
  await copyListener.promise;
});

add_task(async function copyFolder2() {
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    SetMessageKey(aKey) {
      gLastKey = aKey;
    },
  });
  MailServices.copy.copyFolder(
    gEmptyLocal2,
    IMAPPump.inbox,
    false,
    copyListener,
    null
  );
  await copyListener.promise;
});

add_task(async function getLocalMessage1() {
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    SetMessageKey(aKey) {
      gLastKey = aKey;
    },
  });
  const file = do_get_file("../../../data/bugmail1");
  MailServices.copy.copyFileMessage(
    file,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;
});

add_task(async function getLocalMessage2() {
  gMessages.push(localAccountUtils.inboxFolder.GetMessageHeader(gLastKey));
  const file = do_get_file("../../../data/draft1");
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    SetMessageKey(aKey) {
      gLastKey = aKey;
    },
  });
  MailServices.copy.copyFileMessage(
    file,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;
});

add_task(async function copyMessages() {
  gMessages.push(localAccountUtils.inboxFolder.GetMessageHeader(gLastKey));
  const folder1 = IMAPPump.inbox.getChildNamed("empty 1");
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    SetMessageKey(aKey) {
      gLastKey = aKey;
    },
  });
  MailServices.copy.copyMessages(
    localAccountUtils.inboxFolder,
    gMessages,
    folder1,
    false,
    copyListener,
    null,
    false
  );
  await copyListener.promise;
});

add_task(async function moveMessages() {
  const folder2 = IMAPPump.inbox.getChildNamed("empty 2");
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    SetMessageKey(aKey) {
      gLastKey = aKey;
    },
  });
  MailServices.copy.copyMessages(
    localAccountUtils.inboxFolder,
    gMessages,
    folder2,
    true,
    copyListener,
    null,
    false
  );
  await copyListener.promise;
});

add_task(async function update1() {
  const folder1 = IMAPPump.inbox
    .getChildNamed("empty 1")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder1.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function update2() {
  const folder2 = IMAPPump.inbox
    .getChildNamed("empty 2")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder2.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(function verifyFolders() {
  const folder1 = IMAPPump.inbox.getChildNamed("empty 1");
  Assert.equal(folderCount(folder1), 2);
  const folder2 = IMAPPump.inbox.getChildNamed("empty 2");
  Assert.ok(folder2 !== null);
  // folder 1 and 2 should each now have two messages in them.
  Assert.ok(folder1 !== null);
  Assert.equal(folderCount(folder2), 2);
  // The local inbox folder should now be empty, since the second
  // operation was a move.
  Assert.equal(folderCount(localAccountUtils.inboxFolder), 0);
});
add_task(function endTest() {
  gMessages = [];
  teardownIMAPPump();
});

function folderCount(folder) {
  return [...folder.msgDatabase.enumerateMessages()].length;
}
