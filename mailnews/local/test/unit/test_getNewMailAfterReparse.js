/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Getting new mail on a local inbox whose summary file is out of date should
 * reparse the folder and then go on to check for mail, telling the caller's
 * listener when it is all done.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_task(async function testGetNewMailAfterReparse() {
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  // Give the inbox a message, so the reparse has something to do.
  inbox.addMessageBatch([
    "To: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Existing\r\n\r\nHi.\r\n",
  ]);
  Assert.equal(
    inbox.getTotalMessages(false),
    1,
    "inbox should start with one message"
  );

  // Throw the summary file away, so the next access has to reparse.
  inbox.msgDatabase.forceClosed();
  inbox.msgDatabase = null;
  await IOUtils.remove(inbox.summaryFile.path);

  // The reparse has to finish before the mail check can run, so this only
  // settles if getNewMessages() resumes once the reparse is done.
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  inbox.getNewMessages(false, urlListener);
  await urlListener.promise;

  Assert.ok(
    inbox.msgDatabase.summaryValid,
    "the folder should have been reparsed"
  );
  Assert.equal(
    inbox.getTotalMessages(false),
    1,
    "the reparse should have found the existing message"
  );
});
