/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that messages without a "Date:" header are assigned a sensible
 * default, and that it is preserved by folder repair.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// Some messages with no "Date:" header.
const datelessMessages = [
  // 0
  "To: bob@invalid\r\n" +
    "From: alice@invalid\r\n" +
    "Subject: Hello\r\n" +
    "\r\n" +
    "Hello Bob.\r\n" +
    "Just thought you'd like a malformed message with no 'Date:' header!\r\n",

  // 1
  "To: alice@invalid\r\n" +
    "From: bob@invalid\r\n" +
    "Subject: Re: Hello\r\n" +
    "\r\n" +
    "Thanks for that. Here's a malformed message in return.\r\n",
];

/**
 * Make sure that local messages without a "Date:" header are assigned a
 * sensible default. Likely just the current time when received.
 */
async function test_datelessMsgs() {
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  inbox.addMessageBatch(datelessMessages);
  for (const msg of inbox.messages) {
    Assert.notEqual(
      msg.date,
      0,
      "Expect message without 'Date:' header to use date from msgStore."
    );
  }

  localAccountUtils.clearAll(); // Teardown.
}

/**
 * Test that a folder reparse (folder repair) preserves timestamps assigned to
 * messages without a "Date:" header.
 *
 * This will be the timestamp at which they were first written into the
 * msgStore.
 * For maildir, it's the mtime of the message file.
 * For mbox, it's the date in "From <SENDER> <DATE>" separator lines.
 */
async function test_datesPreservedByParseFolder() {
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  inbox.addMessageBatch(datelessMessages);

  const datesBefore = [...inbox.messages].map(m => m.date);

  // Hate this, but current time is recorded when the messages are written
  // into the msgStore.
  // The timestamp will likely be truncated to seconds, so wait until we can
  // be sure it's changed.
  await PromiseTestUtils.promiseDelay(2000);

  // Force a folder reparse (A bit heavy handed, but see bug 1918557).
  inbox.msgDatabase.forceClosed();
  inbox.msgDatabase = null;
  await IOUtils.remove(inbox.summaryFile.path);
  const l = new PromiseTestUtils.PromiseUrlListener();
  inbox.parseFolder(null, l);
  await l.promise;

  const datesAfter = [...inbox.messages].map(m => m.date);

  Assert.deepEqual(
    datesBefore,
    datesAfter,
    "Messages without 'Date:' header should retain date through folder reparse"
  );

  localAccountUtils.clearAll(); // Teardown.
}

add_task(test_datelessMsgs);
add_task(test_datesPreservedByParseFolder);
