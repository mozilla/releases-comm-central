/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This mainly tests that streamHeaders does not result in the crash
 * of bug 752768
 *
 * adapted from test_pop3Pump.js by Kent James <kent@caspia.com>
 */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var testSubjects = ["Hello, did you receive my bugmail?"];

var gHdr;

add_task(async function loadMessages() {
  let pop3Resolve;
  const pop3Promise = new Promise(resolve => {
    pop3Resolve = resolve;
  });
  gPOP3Pump.files = ["../../../data/draft1"];
  gPOP3Pump.onDone = pop3Resolve;
  gPOP3Pump.run();
  await pop3Promise;

  // Get message headers for the inbox folder.
  var msgCount = 0;
  for (gHdr of localAccountUtils.inboxFolder.msgDatabase.enumerateMessages()) {
    msgCount++;
    Assert.equal(gHdr.subject, testSubjects[msgCount - 1]);
  }
  Assert.equal(msgCount, 1);
  gPOP3Pump = null;
});

add_task(async function goodStreaming() {
  // Try to stream the headers of the last message.
  const uri = gHdr.folder.getUriForMsg(gHdr);
  const messageService = MailServices.messageServiceFromURI(uri);
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  messageService.streamHeaders(uri, streamListener, null, true);
  // The message contains this header.
  const streamData = await streamListener.promise;
  Assert.ok(
    streamData.includes(
      "X-Mozilla-Draft-Info: internal/draft; vcard=0; receipt=0; DSN=0; uuencode=0"
    )
  );
});

/**
 * Crash from bug 752768.
 */
add_task(async function badStreaming() {
  // Try to stream the headers of the last message.
  const folder = gHdr.folder;
  const uri = folder.getUriForMsg(gHdr);

  const dbFile = folder.summaryFile;
  // Force an invalid database.
  folder.msgDatabase.forceClosed();
  dbFile.remove(false);
  folder.msgDatabase = null;

  const messageService = MailServices.messageServiceFromURI(uri);
  let haveError = false;
  try {
    const streamListener = new PromiseTestUtils.PromiseStreamListener();
    messageService.streamHeaders(uri, streamListener, null, true);
    await streamListener.promise;
  } catch (e) {
    // Should throw NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE (0x80550005).
    haveError = true;
  } finally {
    Assert.ok(
      haveError,
      "Ensure that the stream crashes with NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE"
    );
  }
});
