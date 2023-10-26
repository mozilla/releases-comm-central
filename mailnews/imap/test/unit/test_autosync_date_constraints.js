/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test autosync date constraints
 */

var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var gMsgImapInboxFolder;

// Adds some messages directly to a mailbox (eg new mail)
function addMessagesToServer(messages, mailbox) {
  // Create the ImapMessages and store them on the mailbox
  messages.forEach(function (message) {
    const dataUri = "data:text/plain," + message.toMessageString();
    mailbox.addMessage(new ImapMessage(dataUri, mailbox.uidnext++, []));
  });
}

add_setup(function () {
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
  const messageGenerator = new MessageGenerator();

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
});

add_task(async function downloadForOffline() {
  // ...and download for offline use.
  // This downloads all messages, ignoring the autosync age constraints.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(listener, null);
  await listener.promise;
});

add_task(function test_applyRetentionSettings() {
  IMAPPump.inbox.applyRetentionSettings();
  const enumerator = IMAPPump.inbox.msgDatabase.enumerateMessages();
  if (enumerator) {
    const now = new Date();
    const dateInSeconds = now.getSeconds();
    const cutOffDateInSeconds = dateInSeconds - 5 * 60 * 24;
    for (const header of enumerator) {
      if (header instanceof Ci.nsIMsgDBHdr) {
        if (header.dateInSeconds < cutOffDateInSeconds) {
          Assert.equal(header.getStringProperty("pendingRemoval"), "1");
        } else {
          Assert.equal(header.getStringProperty("pendingRemoval"), "");
        }
      }
    }
  }
});

add_task(function endTest() {
  teardownIMAPPump();
});
