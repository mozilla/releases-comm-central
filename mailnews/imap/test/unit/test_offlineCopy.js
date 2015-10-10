/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * This test checks pseudo-offline message copies (which is triggered
 * by allowUndo == true in CopyMessages).
 */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

load("../../../resources/logHelper.js");

var nsMsgMessageFlags = Ci.nsMsgMessageFlags;

var gMsgFile1 = do_get_file("../../../data/bugmail10");
var gMsgId1 = "200806061706.m56H6RWT004933@mrapp54.mozilla.org";
var gMsgFile2 = do_get_file("../../../data/image-attach-test");
var gMsgId2 = "4A947F73.5030709@example.com";
var gMsgFile3 = do_get_file("../../../data/SpamAssassinYes");
var gMsg3Id = "bugmail7.m47LtAEf007543@mrapp51.mozilla.org";
var gMsgFile4 = do_get_file("../../../data/bug460636");
var gMsg4Id = "foo.12345@example";

var gFolder1;

// Adds some messages directly to a mailbox (eg new mail)
function addMessagesToServer(messages, mailbox, localFolder)
{
  // For every message we have, we need to convert it to a file:/// URI
  messages.forEach(function (message)
  {
    let URI = Services.io.newFileURI(message.file).QueryInterface(Ci.nsIFileURL);
    message.spec = URI.spec;
  });

  // Create the imapMessages and store them on the mailbox
  messages.forEach(function (message)
  {
    mailbox.addMessage(new imapMessage(message.spec, mailbox.uidnext++, []));
  });
}
var tests = [
  function *setup() {
    // Turn off autosync_offline_stores because
    // fetching messages is invoked after copying the messages.
    // (i.e. The fetching process will be invoked after OnStopCopy)
    // It will cause crash with an assertion
    // (ASSERTION: tried to add duplicate listener: 'index == -1') on teardown.
    Services.prefs.setBoolPref("mail.server.default.autosync_offline_stores", false);

    setupIMAPPump();

    let promiseFolderAdded = PromiseTestUtils.promiseFolderAdded("folder 1");
    IMAPPump.incomingServer.rootFolder.createSubfolder("folder 1", null);
    yield promiseFolderAdded;

    gFolder1 = IMAPPump.incomingServer.rootFolder.getChildNamed("folder 1");
    Assert.ok(gFolder1 instanceof Ci.nsIMsgFolder);

    // these hacks are required because we've created the inbox before
    // running initial folder discovery, and adding the folder bails
    // out before we set it as verified online, so we bail out, and
    // then remove the INBOX folder since it's not verified.
    IMAPPump.inbox.hierarchyDelimiter = '/';
    IMAPPump.inbox.verifiedAsOnlineFolder = true;

    // Add messages to the INBOX
    // this is synchronous, afaik
    addMessagesToServer([{file: gMsgFile1, messageId: gMsgId1},
                         {file: gMsgFile2, messageId: gMsgId2},
                        ],
                        IMAPPump.daemon.getMailbox("INBOX"), IMAPPump.inbox);
  },
  function *updateFolder() {
    let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
    yield promiseUrlListener.promise;
  },
  function *downloadAllForOffline() {
     let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
     IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
     yield promiseUrlListener.promise;
  },
  function *copyMessagesToInbox() {
    let promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.CopyFileMessage(gMsgFile3, IMAPPump.inbox, null, false, 0,
                                      "", promiseCopyListener, null);
    yield promiseCopyListener.promise;

    promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.CopyFileMessage(gMsgFile4, IMAPPump.inbox, null, false, 0,
                                      "", promiseCopyListener, null);
    yield promiseCopyListener.promise;

    let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
    yield promiseUrlListener.promise;

    let db = IMAPPump.inbox.msgDatabase;

    // test the headers in the inbox
    let enumerator = db.EnumerateMessages();
    let count = 0;
    while (enumerator.hasMoreElements())
    {
      count++;
      var message = enumerator.getNext();
      message instanceof Ci.nsIMsgDBHdr;
      dump('message <'+ message.subject +
           '> storeToken: <' + message.getStringProperty("storeToken") +
           '> offset: <' + message.messageOffset +
           '> id: <' + message.messageId +
           '>\n');
      // This fails for file copies in bug 790912. Without  this, messages that
      //  are copied are not visible in pre-pluggableStores versions of TB (pre TB 12)
      if (IMAPPump.inbox.msgStore.storeType == "mbox")
        Assert.equal(message.messageOffset, parseInt(message.getStringProperty("storeToken")));
    }
    Assert.equal(count, 4);
  },
  function copyMessagesToSubfolder() {
    //  a message created from IMAP download
    let db = IMAPPump.inbox.msgDatabase;
    let msg1 = db.getMsgHdrForMessageID(gMsgId1);
    let messages = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
    messages.appendElement(msg1, false);
    // this is sync, I believe?
    MailServices.copy.CopyMessages(IMAPPump.inbox, messages, gFolder1, false,
                                   null, null, true);

    // two messages originally created from file copies (like in Send)
    let msg3 = db.getMsgHdrForMessageID(gMsg3Id);
    Assert.ok(msg3 instanceof Ci.nsIMsgDBHdr);
    messages.clear();
    messages.appendElement(msg3, false);
    MailServices.copy.CopyMessages(IMAPPump.inbox, messages, gFolder1, false,
                                   null, null, true);

    let msg4 = db.getMsgHdrForMessageID(gMsg4Id);
    Assert.ok(msg4 instanceof Ci.nsIMsgDBHdr);

    // because bug 790912 created messages with correct storeToken but messageOffset=0,
    //  these messages may not copy correctly. Make sure that they do, as fixed in bug 790912
    msg4.messageOffset = 0;
    messages.clear();
    messages.appendElement(msg4, false);
    MailServices.copy.CopyMessages(IMAPPump.inbox, messages, gFolder1, false,
                                   null, null, true);

    // test the db headers in folder1
    db = gFolder1.msgDatabase;
    let enumerator = db.EnumerateMessages();
    let count = 0;
    while (enumerator.hasMoreElements())
    {
      count++;
      var message = enumerator.getNext();
      message instanceof Ci.nsIMsgDBHdr;
      dump('message <'+ message.subject +
           '> storeToken: <' + message.getStringProperty("storeToken") +
           '> offset: <' + message.messageOffset +
           '> id: <' + message.messageId +
           '>\n');
      if (gFolder1.msgStore.storeType == "mbox")
        Assert.equal(message.messageOffset, parseInt(message.getStringProperty("storeToken")));
    }
    Assert.equal(count, 3);
  },
  function *test_headers() {
    let msgIds = [gMsgId1, gMsg3Id, gMsg4Id];
    for (let msgId of msgIds)
    {
      let newMsgHdr= gFolder1.msgDatabase.getMsgHdrForMessageID(msgId);
      Assert.ok(newMsgHdr.flags & Ci.nsMsgMessageFlags.Offline);
      let msgURI = newMsgHdr.folder.getUriForMsg(newMsgHdr);
      let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
      let msgServ = messenger.messageServiceFromURI(msgURI);
      let promiseStreamListener = new PromiseTestUtils.PromiseStreamListener();
      msgServ.streamHeaders(msgURI, promiseStreamListener, null, true);
      let data = yield promiseStreamListener.promise;
      dump('\nheaders for messageId ' + msgId + '\n' + data + '\n\n');
      Assert.ok(data.includes(msgId));
    }
  },
  function moveMessagesToSubfolder() {
    let db = IMAPPump.inbox.msgDatabase;
    let enumerator = db.EnumerateMessages();
    Assert.ok(enumerator.hasMoreElements());
    let messages = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
    while (enumerator.hasMoreElements())
      messages.appendElement(enumerator.getNext(), false);
    // this is sync, I believe?
    MailServices.copy.CopyMessages(IMAPPump.inbox, messages, gFolder1, true,
                                   null, null, true);

    // the inbox should now be empty
    enumerator = db.EnumerateMessages();
    Assert.ok(!enumerator.hasMoreElements());

    // maildir should also delete the files.
    if (IMAPPump.inbox.msgStore.storeType == "maildir")
    {
      let curDir = IMAPPump.inbox.filePath.clone();
      curDir.append("cur");
      Assert.ok(curDir.exists());
      Assert.ok(curDir.isDirectory());
      let curEnum = curDir.directoryEntries;
      // the directory should be empty, fails from bug 771643
      Assert.ok(!curEnum.hasMoreElements())
    }
  },
  teardownIMAPPump
];

function run_test() {
  tests.forEach(add_task);
  run_next_test();
}
