/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests imap msg header download chunking
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MessageGenerator, MessageScenarioFactory } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

/**
 * Keep it so that OVERALL_MESSAGES % CHUNKING_SIZE !== 0.
 * With a modulo operator for CHUNKING_SIZE and a prime number for
 *  OVERALL_MESSAGES this should prove that there have been a
 *  chunking process without being depended on the first chunk.
 */
const CHUNKING_SIZE = 3;
const OVERALL_MESSAGES = 137;

// Dummy message window so we can say the inbox is open in a window.
var dummyMsgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

function FolderIntPropertyChangedListener() {
  this._promise = new Promise(resolve => {
    this._resolve = resolve;
  });
  this._gotNewMailBiff = false;
}

FolderIntPropertyChangedListener.prototype = {
  onFolderIntPropertyChanged(aItem, aProperty, aOldValue, aNewValue) {
    if (
      aProperty == "BiffState" &&
      aNewValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail
    ) {
      this._gotNewMailBiff = true;
      this._resolve();
    }
  },
  get promise() {
    return this._promise;
  },
  get gotNewMailBiff() {
    return this._gotNewMailBiff;
  },
};

var gFolderListener = new FolderIntPropertyChangedListener();
/** Used to store a listener between tasks for inspecting chunking behaviour. */
var gListener = new PromiseTestUtils.PromiseUrlListener();

add_setup(async function () {
  Assert.equal(
    OVERALL_MESSAGES % CHUNKING_SIZE !== 0,
    true,
    "const sanity check"
  );
  setupIMAPPump();
  // We need to register the dummyMsgWindow so that we'll think the
  //  Inbox is open in a folder and fetch headers in chunks.
  dummyMsgWindow.openFolder = IMAPPump.inbox;
  MailServices.mailSession.AddMsgWindow(dummyMsgWindow);
  MailServices.mailSession.AddFolderListener(
    gFolderListener,
    Ci.nsIFolderListener.intPropertyChanged
  );

  // Set chunk size to CHUNKING_SIZE, so we'll have to chain several requests to get
  //  OVERALL_MESSAGES headers.
  Services.prefs.setIntPref("mail.imap.hdr_chunk_size", CHUNKING_SIZE);
  // Turn off offline sync to avoid complications in verifying that we can
  //  run a url after the first header chunk.
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
});

// Upload messages to the imap fake server Inbox.
add_task(async function uploadImapMessages() {
  // make OVERALL_MESSAGES messages
  const messageGenerator = new MessageGenerator();
  const scenarioFactory = new MessageScenarioFactory(messageGenerator);

  // build up a list of messages
  let messages = [];
  messages = messages.concat(scenarioFactory.directReply(OVERALL_MESSAGES));

  // Add OVERALL_MESSAGES messages with uids 1,2,3...,OVERALL_MESSAGES.
  const imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  // Create the ImapMessages and store them on the mailbox.
  messages.forEach(function (message) {
    const dataUri = Services.io.newURI(
      "data:text/plain;base64," + btoa(message.toMessageString())
    );
    imapInbox.addMessage(
      new ImapMessage(dataUri.spec, imapInbox.uidnext++, [])
    );
  });
  // Do not wait for the listener to finish.
  // We want to observe the message batches in the update process.
  // updateFolderWithListener with null for nsIMsgWindow makes biff notify.
  IMAPPump.inbox.updateFolderWithListener(null, gListener);
});

add_task(async function testMessageFetched() {
  // If we're really chunking, then the message fetch should have started before
  // we finished the updateFolder URL.
  await TestUtils.waitForCondition(() => {
    return gFolderListener.gotNewMailBiff === true;
  });
  Assert.ok(gFolderListener.gotNewMailBiff);

  // We do not check for the first chunk as this is unreliable without explicit
  //  listeners/events.
  // Instead we are checking if there's no rest of the division with
  //  CHUNKING_SIZE while the chunking process is ongoing.
  // It's important that the chunking is intact and as well not failing
  //  randomly in the test infrastructure.
  // See at the CHUNKING_SIZE and OVERALL_MESSAGES declarations.
  //
  // HINT:
  // If this causes future problems because stuff getting faster,
  //  try to increase the overall message count.
  await TestUtils.waitForCondition(() => {
    const messagesDBFolder =
      IMAPPump.inbox.msgDatabase.dBFolderInfo.numMessages;
    if (messagesDBFolder !== 0) {
      Assert.equal(
        messagesDBFolder % CHUNKING_SIZE,
        0,
        `${messagesDBFolder} messages in folder should be of chunk size ${CHUNKING_SIZE}`
      ); // This is the primary test.
      return true;
    } else if (messagesDBFolder === OVERALL_MESSAGES) {
      throw new Error(
        `Batching failed in sizes of ${CHUNKING_SIZE} found instead ${OVERALL_MESSAGES} immediately`
      );
    }
    return false; // Rerun waitForCondition.
  }, 50);
}).skip(AppConstants.platform == "macosx"); // Not working on mac. Bug 1776115.

add_task(async function testHdrsDownloaded() {
  await gListener.promise; // Now we wait for the finished update of the Folder.
  // Make sure that we got all OVERALL_MESSAGES headers.
  Assert.equal(
    IMAPPump.inbox.msgDatabase.dBFolderInfo.numMessages,
    OVERALL_MESSAGES
  );
});

// Cleanup
add_task(async function endTest() {
  teardownIMAPPump();
});
