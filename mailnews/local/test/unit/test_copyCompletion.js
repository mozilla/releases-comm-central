/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_setup(function () {
  localAccountUtils.loadLocalMailAccount(
    "@mozilla.org/msgstore/berkeleystore;1"
  );
});

add_task(async function test_fileCopyErrorStatus() {
  const target = localAccountUtils.rootFolder.createLocalSubfolder(
    "missing-file-target"
  );
  const file = do_get_profile().clone();
  file.append("missing-message.eml");
  const listener = new PromiseTestUtils.PromiseCopyListener();
  Assert.throws(
    () =>
      MailServices.copy.copyFileMessage(
        file,
        target,
        null,
        false,
        0,
        "",
        listener,
        null
      ),
    error => error.result == Cr.NS_ERROR_FILE_NOT_FOUND,
    "Copying a missing message file should fail with the original file error"
  );
  await Assert.rejects(
    listener.promise,
    new RegExp(Cr.NS_ERROR_FILE_NOT_FOUND),
    "The copy listener should receive the original file error"
  );
  Assert.equal(
    target.getTotalMessages(false),
    0,
    "The failed file copy should leave the destination empty"
  );
});

/**
 * Checks that a partial copy or move reports failure and preserves a valid
 * destination summary after closing and reopening the database.
 *
 * @param {boolean} isMove - Whether to move the messages.
 */
async function checkPartialFailure(isMove) {
  const root = localAccountUtils.rootFolder;
  const source = root
    .createLocalSubfolder(isMove ? "move-source" : "copy-source")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const target = root.createLocalSubfolder(
    isMove ? "move-target" : "copy-target"
  );
  for (let index = 0; index < 3; index++) {
    source.addMessage(
      "From: sender@example.invalid\r\n" +
        "To: recipient@example.invalid\r\n" +
        `Subject: Partial copy ${index}\r\n` +
        `Message-ID: <partial-${isMove}-${index}@example.invalid>\r\n` +
        `\r\nBody ${index}.\r\n`
    );
  }
  const messages = [...source.messages];
  const firstMessageId = messages[0].messageId;
  const targetDB = target.msgDatabase;
  const originalToken = messages[1].storeToken;
  registerCleanupFunction(() => {
    messages[1].storeToken = originalToken;
  });

  // Fail while reading the second message, after the first copy is committed.
  messages[1].storeToken = String(Number(originalToken) + 3);
  const listener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    source,
    messages,
    target,
    isMove,
    listener,
    null,
    false
  );
  await Assert.rejects(
    listener.promise,
    new RegExp(Cr.NS_ERROR_FAILURE),
    "The partial copy or move should report failure"
  );
  messages[1].storeToken = originalToken;
  Assert.equal(
    source.getTotalMessages(false),
    messages.length,
    "The failed batch should retain all source messages"
  );
  Assert.ok(
    targetDB.summaryValid,
    "The destination summary should remain valid after the failed batch"
  );

  target.ForceDBClosed();
  Assert.ok(
    target.msgDatabase.summaryValid,
    "The destination summary should reopen without reparsing"
  );
  Assert.deepEqual(
    [...target.messages].map(message => message.messageId),
    [firstMessageId],
    "The reopened destination should contain only the completed copy"
  );
  const [copied] = target.messages;
  const content = mailTestUtils.loadMessageToString(target, copied);
  Assert.ok(
    content.includes("Body 0."),
    "The completed copy should retain its body after reopening the database"
  );
}

add_task(async function test_partialCopy() {
  await checkPartialFailure(false);
});

add_task(async function test_partialMove() {
  await checkPartialFailure(true);
});
