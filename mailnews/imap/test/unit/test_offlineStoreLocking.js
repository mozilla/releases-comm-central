/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that code that writes to the imap offline store deals
 * with offline store locking correctly.
 */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

// Globals
var gIMAPTrashFolder, gMsgImapInboxFolder;
var gMovedMsgId;

var gAlertResolve;
var gGotAlert = new Promise(resolve => {
  gAlertResolve = resolve;
});

/* exported alert to alertTestUtils.js */
function alertPS(parent, aDialogTitle, aText) {
  gAlertResolve(aText);
}

function addGeneratedMessagesToServer(messages, mailbox) {
  // Create the ImapMessages and store them on the mailbox
  messages.forEach(function (message) {
    const dataUri = Services.io.newURI(
      "data:text/plain;base64," + btoa(message.toMessageString())
    );
    mailbox.addMessage(new ImapMessage(dataUri.spec, mailbox.uidnext++, []));
  });
}

var gStreamedHdr = null;

add_setup(async function () {
  registerAlertTestUtils();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  setupIMAPPump();

  gMsgImapInboxFolder = IMAPPump.inbox.QueryInterface(Ci.nsIMsgImapMailFolder);
  // these hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  gMsgImapInboxFolder.hierarchyDelimiter = "/";
  gMsgImapInboxFolder.verifiedAsOnlineFolder = true;

  const messageGenerator = new MessageGenerator();
  let messages = [];
  let bodyString = "";
  for (let i = 0; i < 100; i++) {
    bodyString +=
      "1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890\r\n";
  }

  for (let i = 0; i < 50; i++) {
    messages = messages.concat(
      messageGenerator.makeMessage({
        body: { body: bodyString, contentType: "text/plain" },
      })
    );
  }

  addGeneratedMessagesToServer(messages, IMAPPump.daemon.getMailbox("INBOX"));
  // ...and download for offline use.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function downloadForOffline() {
  // ...and download for offline use.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(listener, null);
  await listener.promise;
});

add_task(async function deleteOneMsg() {
  const enumerator = IMAPPump.inbox.msgDatabase.enumerateMessages();
  const msgHdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  IMAPPump.inbox.deleteMessages(
    [msgHdr],
    null,
    false,
    true,
    copyListener,
    false
  );
  await copyListener.promise;
});

add_task(async function compactOneFolder() {
  const enumerator = IMAPPump.inbox.msgDatabase.enumerateMessages();
  const msgHdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
  gStreamedHdr = msgHdr;
  // Mark the message as not being offline, and then we'll make sure that
  //  streaming the message while we're compacting doesn't result in the
  //  message being marked for offline use.
  //  Luckily, compaction compacts the offline store first, so it should
  //  lock the offline store.
  IMAPPump.inbox.msgDatabase.markOffline(msgHdr.messageKey, false, null);
  const msgURI = msgHdr.folder.getUriForMsg(msgHdr);
  const msgServ = MailServices.messageServiceFromURI(msgURI);
  // UrlListener will get called when both expunge and offline store
  //  compaction are finished. dummyMsgWindow is required to make the backend
  //  compact the offline store.
  const compactUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.compact(compactUrlListener, gDummyMsgWindow);
  // Stream the message w/o a stream listener in an attempt to get the url
  //  started more quickly, while the compact is still going on.
  const urlListener = new PromiseTestUtils.PromiseUrlListener({});
  await PromiseTestUtils.promiseDelay(100); // But don't be too fast.
  msgServ.streamMessage(
    msgURI,
    new PromiseTestUtils.PromiseStreamListener(),
    null,
    urlListener,
    false,
    "",
    false
  );
  await compactUrlListener.promise;

  // Because we're streaming the message while compaction is going on,
  // we should not have stored it for offline use.
  Assert.equal(false, gStreamedHdr.flags & Ci.nsMsgMessageFlags.Offline);

  await urlListener.promise;
});

add_task(async function deleteAnOtherMsg() {
  const enumerator = IMAPPump.inbox.msgDatabase.enumerateMessages();
  const msgHdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  IMAPPump.inbox.deleteMessages(
    [msgHdr],
    null,
    false,
    true,
    copyListener,
    false
  );
  await copyListener.promise;
});

add_task(async function updateTrash() {
  gIMAPTrashFolder = IMAPPump.incomingServer.rootFolder
    .getChildNamed("Trash")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  // hack to force uid validity to get initialized for trash.
  gIMAPTrashFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function downloadTrashForOffline() {
  // ...and download for offline use.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gIMAPTrashFolder.downloadAllForOffline(listener, null);
  await listener.promise;
});

add_task(async function testOfflineBodyCopy() {
  // In order to check that offline copy of messages doesn't try to copy
  // the body if the offline store is locked, we're going to go offline.
  // Thunderbird itself does move/copies pseudo-offline, but that's too
  // hard to test because of the half-second delay.
  IMAPPump.server.stop();
  Services.io.offline = true;
  const enumerator = gIMAPTrashFolder.msgDatabase.enumerateMessages();
  const msgHdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
  gMovedMsgId = msgHdr.messageId;
  const compactionListener = new PromiseTestUtils.PromiseUrlListener();
  // NOTE: calling compact() even if msgStore doesn't support compaction.
  // It should be a safe no-op, and we're just testing that the listener is
  // still invoked.
  IMAPPump.inbox.compact(compactionListener, gDummyMsgWindow);
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    gIMAPTrashFolder,
    [msgHdr],
    IMAPPump.inbox,
    true,
    copyListener,
    null,
    true
  );

  // Verify that the moved Msg is not offline.
  try {
    const movedMsg =
      IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMovedMsgId);
    Assert.equal(0, movedMsg.flags & Ci.nsMsgMessageFlags.Offline);
  } catch (ex) {
    throw new Error(ex);
  }
  await compactionListener.promise;
  await copyListener.promise;
});

add_task(async function test_checkAlert() {
  // Check if testing maildir which doesn't produce an the alert like mbox.
  // If so, don't wait for an alert.
  const storageCID = Services.prefs.getCharPref(
    "mail.serverDefaultStoreContractID"
  );
  if (storageCID == "@mozilla.org/msgstore/maildirstore;1") {
    return;
  }

  const alertText = await gGotAlert;
  Assert.ok(
    alertText.startsWith(
      "The folder 'Inbox on Mail for ' cannot be compacted because another operation is in progress. Please try again later."
    )
  );
});

add_task(function teardown() {
  gMsgImapInboxFolder = null;
  gIMAPTrashFolder = null;

  // IMAPPump.server has already stopped, we do not need to IMAPPump.server.stop().
  IMAPPump.inbox = null;
  try {
    IMAPPump.incomingServer.closeCachedConnections();
    const serverSink = IMAPPump.incomingServer.QueryInterface(
      Ci.nsIImapServerSink
    );
    serverSink.abortQueuedUrls();
  } catch (ex) {
    throw new Error(ex);
  }
  const thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
});
