/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Test suite for nsIMsgFolderListener events due to IMAP operations
 *
 * Currently tested
 * - Adding new folders
 * - Copying messages from files to mailboxes
 * - Adding new messages directly to mailboxes
 *
 * NOTE (See Bug 1632022):
 * Running this test by itself...
 *
 * $ ./mach xpcshell-test comm/mailnews/imap/test/unit/test_nsIMsgFolderListenerIMAP.js
 * ...will fail.
 *
 * This is because all the IMAP tests run twice - once with mbox storage and
 * once with maildir storage. For this test, the two parallel instances
 * interact badly.
 *
 */

/* import-globals-from ../../../test/resources/msgFolderListenerSetup.js */
load("../../../resources/msgFolderListenerSetup.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

// Globals
var gRootFolder;
var gIMAPInbox, gIMAPFolder2, gIMAPFolder3;
var gIMAPDaemon, gServer, gIMAPIncomingServer;
var gMsgFile1 = do_get_file("../../../data/bugmail10");
var gMsgFile2 = do_get_file("../../../data/bugmail11");
var gMsgFile3 = do_get_file("../../../data/draft1");
var gMsgFile4 = do_get_file("../../../data/bugmail7");
var gMsgFile5 = do_get_file("../../../data/bugmail6");

// Copied straight from the example files
var gMsgId1 = "200806061706.m56H6RWT004933@mrapp54.mozilla.org";
var gMsgId2 = "200804111417.m3BEHTk4030129@mrapp51.mozilla.org";
var gMsgId3 = "4849BF7B.2030800@example.com";
var gMsgId4 = "bugmail7.m47LtAEf007542@mrapp51.mozilla.org";
var gMsgId5 = "bugmail6.m47LtAEf007542@mrapp51.mozilla.org";
var gMsgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

function addFolder(parent, folderName, storeIn) {
  gExpectedEvents = [
    [MailServices.mfn.folderAdded, parent, folderName, storeIn],
  ];
  // No copy listener notification for this
  gCurrStatus |= kStatus.onStopCopyDone;
  parent.createSubfolder(folderName, null);
  gCurrStatus |= kStatus.functionCallDone;
  gServer.performTest("LIST");
  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  }
}

function copyFileMessage(file, messageId, destFolder) {
  copyListener.mFolderStoredIn = destFolder;

  // This *needs* to be a draft (fourth parameter), as for non-UIDPLUS servers,
  // nsImapProtocol::UploadMessageFromFile is hardcoded not to send a copy
  // listener notification. The same function also asks for the message id from
  // the copy listener, without which it will *not* send the notification.

  // ...but wait, nsImapProtocol.cpp requires SEARCH afterwards to retrieve the
  // message header, and fakeserver doesn't implement it yet. So get it to fail
  // earlier by *not* sending the message id.
  // copyListener.mMessageId = messageId;

  // Instead store the message id in gExpectedEvents, so we can match that up
  gExpectedEvents = [
    [MailServices.mfn.msgAdded, { expectedMessageId: messageId }],
    [MailServices.mfn.msgsClassified, [messageId], false, false],
  ];
  destFolder.updateFolder(null);
  MailServices.copy.copyFileMessage(
    file,
    destFolder,
    null,
    true,
    0,
    "",
    copyListener,
    null
  );
  gCurrStatus |= kStatus.functionCallDone;
  gServer.performTest("APPEND");
  // Allow some time for the append operation to complete, so update folder
  // every second
  gFolderBeingUpdated = destFolder;
  doUpdateFolder(gTest);
}

var gFolderBeingUpdated = null;
function doUpdateFolder(test) {
  // In case we've moved on to the next test, exit
  if (gTest > test) {
    return;
  }

  gFolderBeingUpdated.updateFolder(null);

  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  } else {
    do_timeout(1000, function () {
      doUpdateFolder(test);
    });
  }
}

// Adds some messages directly to a mailbox (eg new mail)
function addMessagesToServer(messages, mailbox, localFolder) {
  // For every message we have, we need to convert it to a file:/// URI
  messages.forEach(function (message) {
    const URI = Services.io
      .newFileURI(message.file)
      .QueryInterface(Ci.nsIFileURL);
    // Create the ImapMessage and store it on the mailbox.
    mailbox.addMessage(new ImapMessage(URI.spec, mailbox.uidnext++, []));
    // We can't get the headers again, so just pass on the message id
    gExpectedEvents.push([
      MailServices.mfn.msgAdded,
      { expectedMessageId: message.messageId },
    ]);
  });
  gExpectedEvents.push([
    MailServices.mfn.msgsClassified,
    messages.map(hdr => hdr.messageId),
    false,
    false,
  ]);

  // No copy listener notification for this
  gCurrStatus |= kStatus.functionCallDone | kStatus.onStopCopyDone;

  gFolderBeingUpdated = localFolder;
  doUpdateFolder(gTest);
}

function copyMessages(messages, isMove, srcFolder, destFolder) {
  gExpectedEvents = [
    [
      MailServices.mfn.msgsMoveCopyCompleted,
      isMove,
      messages,
      destFolder,
      true,
    ],
  ];
  // We'll also get the msgAdded events when we go and update the destination
  // folder
  messages.forEach(function (message) {
    // We can't use the headers directly, because the notifications we'll
    // receive are for message headers in the destination folder
    gExpectedEvents.push([
      MailServices.mfn.msgKeyChanged,
      { expectedMessageId: message.messageId },
    ]);
    gExpectedEvents.push([
      MailServices.mfn.msgAdded,
      { expectedMessageId: message.messageId },
    ]);
  });
  gExpectedEvents.push([
    MailServices.mfn.msgsClassified,
    messages.map(hdr => hdr.messageId),
    false,
    false,
  ]);
  MailServices.copy.copyMessages(
    srcFolder,
    messages,
    destFolder,
    isMove,
    copyListener,
    gMsgWindow,
    true
  );
  gCurrStatus |= kStatus.functionCallDone;

  gServer.performTest("COPY");

  gFolderBeingUpdated = destFolder;
  doUpdateFolder(gTest);
  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  }
}

var gTestArray = [
  // Adding folders
  // Create another folder to move and copy messages around, and force initialization.
  function testAddFolder1() {
    addFolder(gRootFolder, "folder2", function (folder) {
      gIMAPFolder2 = folder;
    });
  },
  function testAddFolder2() {
    addFolder(gRootFolder, "folder3", function (folder) {
      gIMAPFolder3 = folder;
    });
  },

  // Adding messages to folders
  function testCopyFileMessage1() {
    // Make sure the offline flag is not set for any of the folders
    [gIMAPInbox, gIMAPFolder2, gIMAPFolder3].forEach(function (folder) {
      folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
    });
    copyFileMessage(gMsgFile1, gMsgId1, gIMAPInbox);
  },
  function testCopyFileMessage2() {
    copyFileMessage(gMsgFile2, gMsgId2, gIMAPInbox);
  },

  // Add message straight to the server, so that we get a message added
  // notification on the next folder update
  function testNewMessageArrival1() {
    addMessagesToServer(
      [{ file: gMsgFile3, messageId: gMsgId3 }],
      gIMAPDaemon.getMailbox("INBOX"),
      gIMAPInbox
    );
  },

  // Add another couple of messages, this time to another folder on the server
  function testNewMessageArrival2() {
    addMessagesToServer(
      [
        { file: gMsgFile4, messageId: gMsgId4 },
        { file: gMsgFile5, messageId: gMsgId5 },
      ],
      gIMAPDaemon.getMailbox("INBOX"),
      gIMAPInbox
    );
  },

  // Moving/copying messages (this doesn't work right now)
  function testCopyMessages1() {
    copyMessages(
      [gMsgHdrs[0].hdr, gMsgHdrs[1].hdr],
      false,
      gIMAPInbox,
      gIMAPFolder3
    );
  },
];

function run_test() {
  // This is before any of the actual tests, so...
  gTest = 0;

  gIMAPDaemon = new ImapDaemon();
  gServer = makeServer(gIMAPDaemon, "");

  gIMAPIncomingServer = createLocalIMAPServer(gServer.port);

  // Also make sure a local folders server is created, as that's what is used
  // for sent items
  localAccountUtils.loadLocalMailAccount();

  // We need an identity so that updateFolder doesn't fail
  const localAccount = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  localAccount.addIdentity(identity);
  localAccount.defaultIdentity = identity;
  localAccount.incomingServer = localAccountUtils.incomingServer;

  // Let's also have another account, using the same identity
  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(identity);
  imapAccount.defaultIdentity = identity;
  imapAccount.incomingServer = gIMAPIncomingServer;
  MailServices.accounts.defaultAccount = imapAccount;

  // The server doesn't support more than one connection
  Services.prefs.setIntPref("mail.server.server1.max_cached_connections", 1);
  // Make sure no biff notifications happen
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);
  // We aren't interested in downloading messages automatically
  Services.prefs.setBoolPref("mail.server.server1.download_on_biff", false);

  // Add a listener so that we can check all folder events from this point.
  MailServices.mfn.addListener(gMFListener, allTestedEvents);

  // Get the server list...
  gIMAPIncomingServer.performExpand(null);

  // We get these notifications on initial discovery
  gRootFolder = gIMAPIncomingServer.rootFolder;
  gIMAPInbox = gRootFolder.getChildNamed("Inbox");
  gExpectedEvents = [
    [MailServices.mfn.folderAdded, gRootFolder, "Trash", function (folder) {}],
  ];
  gCurrStatus |= kStatus.onStopCopyDone | kStatus.functionCallDone;

  gServer.performTest("SUBSCRIBE");

  // "Master" do_test_pending(), paired with a do_test_finished() at the end of
  // all the operations.
  do_test_pending();
}

function doTest(test) {
  // eslint-disable-line no-unused-vars
  if (test <= gTestArray.length) {
    const testFn = gTestArray[test - 1];

    dump(`Doing test ${test} (${testFn.name})\n`);

    // Set a limit of ten seconds; if the notifications haven't arrived by then there's a problem.
    do_timeout(10000, function () {
      if (gTest == test) {
        do_throw(
          "Notifications not received in 10000 ms for operation " +
            testFn.name +
            ", current status is " +
            gCurrStatus
        );
      }
    });
    testFn();
  } else {
    MailServices.mfn.removeListener(gMFListener);
    // Cleanup, null out everything, close all cached connections and stop the
    // server
    gRootFolder = null;
    gIMAPInbox.msgDatabase = null;
    gIMAPInbox = null;
    gIMAPFolder2 = null;
    gIMAPFolder3 = null;
    do_timeout(1000, endTest);
  }
}

function endTest() {
  gIMAPIncomingServer.closeCachedConnections();
  gServer.performTest();
  gServer.stop();
  const thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }

  do_test_finished(); // for the one in run_test()
}
