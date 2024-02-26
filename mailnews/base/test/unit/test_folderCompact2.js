/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/*
 * A few more specific mbox compaction tests for local folders:
 * - mbox file contains exactly what we expect after compaction?
 *   test_folderCompact.js tends to rely on checking values in the msgDB.
 * - works with messages larger than compaction code internal buffer?
 * - X-Mozilla-Status/Status2/Keys headers handled as expected?
 *
 * Note: all these tests perform a seemingly-arbitrary delete.
 * This is to trigger the folder compactor to actually do work. Without that
 * delete it tends to think that compaction isn't required and does nothing.
 */

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

// Escape a string for more useful debug output - show EOLs and spaces.
function esc(s) {
  s = s.replace(/\r/g, "\\r");
  s = s.replace(/\n/g, "\\n\n");
  s = s.replace(/ /g, "\u2420"); // U+2420 SYMBOL FOR SPACE
  return s;
}

// Load raw messages into folder (and sanitycheck them).
function loadMsgs(folder, inputMsgs) {
  folder.addMessageBatch(inputMsgs);
  // Make sure all the loaded messages are the expected size.
  // If this fails, it probably means addMessageBatch() no longer assumes input
  // data is mbox format, which is good! See Bug 1763263.
  const hdrs = Array.from(folder.messages);
  for (let i = 0; i < hdrs.length; ++i) {
    Assert.equal(
      inputMsgs[i].length,
      hdrs[i].messageSize,
      `Loaded message ${i} should match size in msgDB`
    );
  }
}

// Delete the specified messages.
async function deleteMsgs(folder, indexesToDelete) {
  const hdrs = Array.from(folder.messages);
  const doomed = indexesToDelete.map(i => hdrs[i]);
  const listener = new PromiseTestUtils.PromiseCopyListener();
  folder.deleteMessages(doomed, null, false, true, listener, true);
  await listener.promise;
}

// Check the raw mbox file of the folder against our list of expected
// messages.
async function checkMbox(folder, expectedMsgs) {
  // Massage both mbox and expectedMsgs into a standardised form.
  // 1) Bare "From " separator lines.
  // 2) Use LF as end-of-line (EOL) indicator.
  // EOLs are handled inconsistently - most code will just leave EOLs as they
  // come in, but new EOLs (e.g. added between messages in mbox) will use
  // platform native EOLs. So our cheap and cheerful hack here is to just
  // ditch all CRs and use pure LFs.

  // Read in the mbox file.
  let mbox = await IOUtils.readUTF8(folder.filePath.path);
  mbox = mbox.replace(/\r/g, "");
  mbox = mbox.replace(/^From .*$/gm, "From ");

  // Now manually mash our expected messages into an mbox string.
  let expected = "";
  for (const raw of expectedMsgs) {
    expected += "From \n";
    expected += raw.replace(/\r/g, "");
    expected += "\n"; // mbox has blank line between messages
  }

  // Now we can compare them.
  if (mbox != expected) {
    // Pretty-print before we assert. Makes life so much easier.
    dump(`=======mbox=========\n${esc(mbox)}\n============\n`);
    dump(`=======expected=====\n${esc(expected)}\n============\n`);
  }
  Assert.ok(mbox == expected, "mbox should contain expected data");
}

// Some chunks from which we'll construct test messages.

// These are the default X-Mozilla- headers for local folders (they are
// re-written in place when flags and keywords are modified).
const xhdrs =
  `X-Mozilla-Status: 0000\r\n` +
  `X-Mozilla-Status2: 00010000\r\n` + // 'New' flag is set
  `X-Mozilla-Keys:                                                                                 \r\n`;

const hdrs1 =
  "Date: Fri, 21 Nov 1997 09:26:06 -0600\r\n" +
  "From: bob@invalid\r\n" +
  "Subject: Test message 1\r\n" +
  "Message-ID: <blah1@invalid>\r\n";

const bod1 = "Body of message 1.\r\n";

const hdrs2 =
  "Date: Fri, 21 Nov 1997 10:55:32 -0600\r\n" +
  "From: bob@invalid\r\n" +
  "Subject: Test message 2\r\n" +
  "Message-ID: <blah2@invalid>\r\n";

const bod2 = "Body of message2.\r\n";

const hdrs3 =
  `Date: Fri, 21 Nov 1997 11:09:14 -0600\r\n` +
  `From: bob@invalid\r\n` +
  `Message-ID: <blah3@invalid>\r\n` +
  `Subject: Test message 3\r\n`;

const bod3 = `message\r\nthree\r\nis multiple\r\nlines.\r\n`;

const from = "From \r\n";

// Check compact works after a simple delete.
add_task(async function testSimple() {
  localAccountUtils.clearAll();
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  const inMsgs = [
    `${xhdrs}${hdrs1}\r\n${bod1}`,
    `${xhdrs}${hdrs2}\r\n${bod2}`,
    `${xhdrs}${hdrs3}\r\n${bod3}`,
  ];
  const doomed = [1]; // Delete message msg2.
  // Out expected output:
  const outMsgs = [
    `${xhdrs}${hdrs1}\r\n${bod1}`,
    `${xhdrs}${hdrs3}\r\n${bod3}`,
  ];

  loadMsgs(inbox, inMsgs);
  await deleteMsgs(inbox, doomed);

  const l = new PromiseTestUtils.PromiseUrlListener();
  inbox.compact(l, null);
  await l.promise;

  await checkMbox(inbox, outMsgs);
});

// Check that local folder compact adds missing X-Mozilla- headers.
add_task(async function testMissingXMozillaHdrs() {
  localAccountUtils.clearAll();
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  // No X-Mozilla-* headers on input.
  const inMsgs = [
    `${hdrs1}\r\n${bod1}`,
    `${hdrs2}\r\n${bod2}`,
    `${hdrs3}\r\n${bod3}`,
  ];
  const doomed = [1]; // Delete msg2.
  // Out expected output.
  // Compact should have added X-Mozilla-* headers.
  const outMsgs = [
    `${xhdrs}${hdrs1}\r\n${bod1}`,
    `${xhdrs}${hdrs3}\r\n${bod3}`,
  ];

  loadMsgs(inbox, inMsgs);
  await deleteMsgs(inbox, doomed);

  const l = new PromiseTestUtils.PromiseUrlListener();
  inbox.compact(l, null);
  await l.promise;

  await checkMbox(inbox, outMsgs);
});

// Check localfolder compact works on messages are bigger than internal read buffer.
add_task(async function testBigMessages() {
  localAccountUtils.clearAll();
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  // Compaction uses buffer of around 16KB, so we'll go way bigger.
  const targSize = 256 * 1024;

  const inMsgs = [];
  const outMsgs = [];
  const doomed = [0, 1]; //  We'll delete the first 2 messages.
  for (let i = 0; i < 5; ++i) {
    let raw =
      xhdrs +
      `Date: Fri, 21 Nov 1997 09:55:06 -0600\r\n` +
      `From: bob${i}@invalid\r\n` +
      `Message-ID: <blah${i}@invalid>\r\n` +
      `\r\n`;
    while (raw.length < targSize) {
      raw +=
        "BlahBlahBlahBlahBlahBlahBlahBlahBlah" +
        "BlahBlahBlahBlahBlahBlahBlahBlahBlah\r\n";
    }
    inMsgs.push(raw);
    if (!doomed.includes(i)) {
      outMsgs.push(raw);
    }
  }

  loadMsgs(inbox, inMsgs);

  await deleteMsgs(inbox, doomed);

  const l = new PromiseTestUtils.PromiseUrlListener();
  inbox.compact(l, null);
  await l.promise;

  // outMsgs is what we expect to see in the mbox.
  await checkMbox(inbox, outMsgs);
});

// Check that local folder compact moves X-Mozilla-* headers to start of
// header block.
add_task(async function testMoveXMozillaHdrs() {
  localAccountUtils.clearAll();
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  // These have X-Mozilla-* headers after all the other headers.
  const inMsgs = [
    `${hdrs1}${xhdrs}\r\n${bod1}`,
    `${hdrs2}${xhdrs}\r\n${bod2}`,
    `${hdrs3}${xhdrs}\r\n${bod3}`,
  ];
  const doomed = [1]; // Delete msg2.
  // The messages we expect to see in the final mbox.
  // Compact should have moved the X-Mozilla-* headers to the front.
  const outMsgs = [
    `${xhdrs}${hdrs1}\r\n${bod1}`,
    `${xhdrs}${hdrs3}\r\n${bod3}`,
  ];

  loadMsgs(inbox, inMsgs);
  await deleteMsgs(inbox, doomed);

  const l = new PromiseTestUtils.PromiseUrlListener();
  inbox.compact(l, null);
  await l.promise;

  await checkMbox(inbox, outMsgs);
});

// Check that local folder compact handles large X-Mozilla-Keys value.
add_task(async function testBigXMozillaKeys() {
  localAccountUtils.clearAll();
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  const bigKeyword =
    "HugeGreatBigStupidlyLongKeywordNameWhichWillDefinitelyOverflowThe80" +
    "CharactersUsuallyReservedInTheKeywordsHeaderForInPlaceEditing";

  const inMsgs = [
    `${xhdrs}${hdrs1}\r\n${bod1}`,
    `${xhdrs}${hdrs2}\r\n${bod2}`,
    `${xhdrs}${hdrs3}\r\n${bod3}`,
  ];
  const doomed = [1]; // Delete msg2.

  const bigxhdrs =
    `X-Mozilla-Status: 0000\r\n` +
    `X-Mozilla-Status2: 00010000\r\n` + // 'New' flag is set
    `X-Mozilla-Keys: ${bigKeyword}\r\n`;

  // The messages we expect to see in the final mbox:
  const outMsgs = [
    `${bigxhdrs}${hdrs1}\r\n${bod1}`,
    `${xhdrs}${hdrs3}\r\n${bod3}`,
  ];

  loadMsgs(inbox, inMsgs);

  const msgs = Array.from(inbox.messages);
  inbox.addKeywordsToMessages([msgs[0]], bigKeyword);

  await deleteMsgs(inbox, doomed);

  const l = new PromiseTestUtils.PromiseUrlListener();
  inbox.compact(l, null);
  await l.promise;

  await checkMbox(inbox, outMsgs);
});

// Check that local folder compact copes with a malformed (but
// unambiguous-to-a-human) mbox.
add_task(async function testMalformed() {
  localAccountUtils.clearAll();
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  const msgA =
    xhdrs +
    "To: alice@invalid\r\n" +
    "From: bob@invalid\r\n" +
    "Subject: Boring message 1\r\n" +
    "\r\n" +
    "Just a boring but well-formed message.\r\n" +
    "All good here.\r\n";

  const msgB_unescaped =
    xhdrs +
    "To: alice@invalid\r\n" +
    "From: bob@invalid\r\n" +
    "Subject: Non-escaped message\r\n" +
    "\r\n" +
    "The next line looks like a new message, but it's not!\r\n" +
    "From this line, it could be a new message!\r\n" + // Not escaped!
    "But: this line makes it worse!\r\n" + // We've got a from-followed-by-header heuristic.
    "When we get to this line, we know it's not really a new message.\r\n" +
    "Phew.\r\n";

  const msgC =
    xhdrs +
    "To: alice@invalid\r\n" +
    "From: bob@invalid\r\n" +
    "Subject: Boring message 2\r\n" +
    "\r\n" +
    "Just another nice boring message.\r\n";

  const inMsgs = [msgA, msgB_unescaped, msgC];

  // Build and install mbox without "From "-escaping messages.
  const mbox = inMsgs.map(m => `From \r\n${m}\r\n`).join("");
  await IOUtils.writeUTF8(inbox.filePath.path, mbox);

  // Kill the DB file and force a reparse.
  inbox.msgDatabase.forceClosed();
  inbox.msgDatabase = null;
  await IOUtils.remove(inbox.summaryFile.path);
  const parseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  try {
    inbox.getDatabaseWithReparse(parseUrlListener, null /* window */);
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_NOT_INITIALIZED);
  }
  await parseUrlListener.promise;

  // Make sure the folder parsing didn't split messages!
  Assert.equal(inbox.getTotalMessages(false), inMsgs.length);

  // Delete the first message and compact the folder.
  await deleteMsgs(inbox, [0]);

  const l = new PromiseTestUtils.PromiseUrlListener();
  inbox.compact(l, null);
  await l.promise;

  // Compaction will write out a correct mbox, so msgB will be escaped.
  const msgB_corrected = msgB_unescaped.replace(
    /From this line/,
    ">From this line"
  );
  const expectedMsgs = [msgB_corrected, msgC];

  await checkMbox(inbox, expectedMsgs);
});
