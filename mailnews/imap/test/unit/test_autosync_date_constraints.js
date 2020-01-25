/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test autosync date constraints
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/MessageGenerator.jsm");

var gMsgImapInboxFolder;

// Adds some messages directly to a mailbox (eg new mail)
function addMessagesToServer(messages, mailbox) {
  // Create the imapMessages and store them on the mailbox
  messages.forEach(function(message) {
    let dataUri = "data:text/plain," + message.toMessageString();
    mailbox.addMessage(new imapMessage(dataUri, mailbox.uidnext++, []));
  });
}

var tests = [
  setup,
  function* downloadForOffline() {
    // ...and download for offline use.
    // This downloads all messages, ignoring the autosync age constraints.
    IMAPPump.inbox.downloadAllForOffline(asyncUrlListener, null);
    yield false;
  },
  function applyRetentionSettings() {
    IMAPPump.inbox.applyRetentionSettings();
    let enumerator = IMAPPump.inbox.msgDatabase.EnumerateMessages();
    if (enumerator) {
      let now = new Date();
      let dateInSeconds = now.getSeconds();
      let cutOffDateInSeconds = dateInSeconds - 5 * 60 * 24;
      for (let header of enumerator) {
        if (header instanceof Ci.nsIMsgDBHdr) {
          if (header.dateInSeconds < cutOffDateInSeconds) {
            Assert.equal(header.getStringProperty("pendingRemoval"), "1");
          } else {
            Assert.equal(header.getStringProperty("pendingRemoval"), "");
          }
        }
      }
    }
  },
  teardown,
];

function setup() {
  Services.prefs.setIntPref("mail.server.server1.autosync_max_age_days", 4);

  setupIMAPPump();

  gMsgImapInboxFolder = IMAPPump.inbox.QueryInterface(Ci.nsIMsgImapMailFolder);
  // these hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  gMsgImapInboxFolder.hierarchyDelimiter = "/";
  gMsgImapInboxFolder.verifiedAsOnlineFolder = true;

  // Add a couple of messages to the INBOX
  // this is synchronous, afaik
  let messageGenerator = new MessageGenerator();

  // build up a diverse list of messages
  let messages = [];
  messages = messages.concat(
    messageGenerator.makeMessage({ age: { days: 2, hours: 1 } })
  );
  messages = messages.concat(
    messageGenerator.makeMessage({ age: { days: 8, hours: 1 } })
  );
  messages = messages.concat(
    messageGenerator.makeMessage({ age: { days: 10, hours: 1 } })
  );

  addMessagesToServer(messages, IMAPPump.daemon.getMailbox("INBOX"));
}

function teardown() {
  teardownIMAPPump();
}

function run_test() {
  async_run_tests(tests);
}
