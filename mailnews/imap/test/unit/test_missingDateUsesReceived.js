/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

let gTransaction;

setupIMAPPump();

add_setup(async function () {
  // Message built by hand to omit Date and control the order of Received headers.
  const rawMessage = [
    "Received: from mx1.example.invalid by mx2.example.invalid",
    "\tfor <recipient@example.invalid>; Sat, 01 Jan 2000 00:00:00 +0000",
    "Received: from mx0.example.invalid by mx1.example.invalid",
    "\tfor <recipient@example.invalid>; Fri, 31 Dec 1999 23:59:59 +0000",
    "From: Sender <sender@example.invalid>",
    "To: recipient@example.invalid",
    "Subject: Missing Date header",
    "Message-Id: <missing-date-received@test.invalid>",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Body",
    "",
  ].join("\r\n");

  const dataUri = Services.io.newURI(
    "data:text/plain;base64," + btoa(rawMessage)
  );
  const imapMsg = new ImapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, []);
  imapMsg.date = new Date("2026-01-01T00:00:00Z");
  IMAPPump.mailbox.addMessage(imapMsg);

  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
  gTransaction = IMAPPump.server.playTransaction();
});

add_task(function test_missingDateFallsBackToReceived() {
  const msgHdr = IMAPPump.inbox.GetMessageHeader(1);
  const expectedDate = Date.parse("2000-01-01T00:00:00Z") / 1000;
  const commands =
    gTransaction instanceof Array
      ? gTransaction.flatMap(tx => tx.them)
      : gTransaction.them;

  Assert.ok(
    commands.some(
      line =>
        line.includes("HEADER.FIELDS") &&
        line.toLowerCase().includes("received")
    ),
    "Reduced IMAP header fetch should include Received"
  );
  Assert.equal(msgHdr.getUint32Property("dateReceived"), expectedDate);
  Assert.equal(msgHdr.dateInSeconds, expectedDate);
});

add_task(function endTest() {
  teardownIMAPPump();
});
