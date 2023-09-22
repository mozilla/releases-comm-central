/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
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

// Check the raw mbox file against what we expect to see.
async function checkMbox(folder, outputMsgs) {
  const bytes = await IOUtils.read(folder.filePath.path);
  let mbox = "";
  for (const b of bytes) {
    mbox += String.fromCharCode(b);
  }

  let expected = "";
  for (const raw of outputMsgs) {
    // mbox has blank line between messages
    expected += raw + "\n";
  }

  // Force all EOLs to linefeeds for comparisons.
  // EOLs are handled inconsistently - most code will just leave EOLs as they
  // come in, but new EOLs (e.g. added between messages in mbox) will use
  // platform native EOLs. So our cheap and cheerful hack here is to just
  // ditch all CRs and use pure LFs.
  mbox = mbox.replace(/\r/g, "");
  expected = expected.replace(/\r/g, "");

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
    `${from}${xhdrs}${hdrs1}\r\n${bod1}\r\n`,
    `${from}${xhdrs}${hdrs2}\r\n${bod2}\r\n`,
    `${from}${xhdrs}${hdrs3}\r\n${bod3}\r\n`,
  ];
  const doomed = [1]; // Delete message msg2.
  // Out expected output:
  const outMsgs = [
    `${from}${xhdrs}${hdrs1}\r\n${bod1}\r\n`,
    `${from}${xhdrs}${hdrs3}\r\n${bod3}\r\n`,
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
    `${from}${hdrs1}\r\n${bod1}\r\n`,
    `${from}${hdrs2}\r\n${bod2}\r\n`,
    `${from}${hdrs3}\r\n${bod3}\r\n`,
  ];
  const doomed = [1]; // Delete msg2.
  // Out expected output.
  // Compact should have added X-Mozilla-* headers.
  const outMsgs = [
    `${from}${xhdrs}${hdrs1}\r\n${bod1}\r\n`,
    `${from}${xhdrs}${hdrs3}\r\n${bod3}\r\n`,
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
      `From \r\n` +
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
    raw += `\r\n`;
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
    `${from}${hdrs1}${xhdrs}\r\n${bod1}\r\n`,
    `${from}${hdrs2}${xhdrs}\r\n${bod2}\r\n`,
    `${from}${hdrs3}${xhdrs}\r\n${bod3}\r\n`,
  ];
  const doomed = [1]; // Delete msg2.
  // The messages we expect to see in the final mbox.
  // Compact should have moved the X-Mozilla-* headers to the front.
  const outMsgs = [
    `${from}${xhdrs}${hdrs1}\r\n${bod1}\r\n`,
    `${from}${xhdrs}${hdrs3}\r\n${bod3}\r\n`,
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
    `${from}${xhdrs}${hdrs1}\r\n${bod1}\r\n`,
    `${from}${xhdrs}${hdrs2}\r\n${bod2}\r\n`,
    `${from}${xhdrs}${hdrs3}\r\n${bod3}\r\n`,
  ];
  const doomed = [1]; // Delete msg2.

  const bigxhdrs =
    `X-Mozilla-Status: 0000\r\n` +
    `X-Mozilla-Status2: 00010000\r\n` + // 'New' flag is set
    `X-Mozilla-Keys: ${bigKeyword}\r\n`;

  // The messages we expect to see in the final mbox:
  const outMsgs = [
    `${from}${bigxhdrs}${hdrs1}\r\n${bod1}\r\n`,
    `${from}${xhdrs}${hdrs3}\r\n${bod3}\r\n`,
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
