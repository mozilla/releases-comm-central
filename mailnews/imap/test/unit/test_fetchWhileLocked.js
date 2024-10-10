/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_task(async function () {
  // Set up IMAP and download some initial messages.

  setupIMAPPump();

  const server = IMAPPump.incomingServer;
  const inbox = IMAPPump.inbox;

  addImapMessage();
  addImapMessage();
  let urlListener = new PromiseTestUtils.PromiseUrlListener();
  server.getNewMessages(inbox, null, urlListener);
  await urlListener.promise;

  let messages = [...inbox.messages];
  Assert.equal(messages.length, 2, "we should begin with 2 messages");

  await TestUtils.waitForCondition(() => inbox.filePath.exists());
  let mbox = await IOUtils.readUTF8(inbox.filePath.path);
  info(mbox);

  // Acquire the semaphore.

  inbox.acquireSemaphore(MailServices.accounts);

  // Add a message to the server and download it.

  const testMessage = addImapMessage();
  urlListener = new PromiseTestUtils.PromiseUrlListener();
  server.getNewMessages(inbox, null, urlListener);
  await urlListener.promise;

  // Check it exists in the database and doesn't have the offline flag or store
  // token.

  messages = [...inbox.messages];
  Assert.equal(messages.length, 3, "a third message should be in the database");
  Assert.equal(messages[2].subject, testMessage.subject);
  Assert.ok(
    !(messages[2].flags & Ci.nsMsgMessageFlags.Offline),
    "the offline flag should not be set"
  );
  Assert.equal(messages[2].storeToken, "", "there should be no store token");

  // Check it isn't in the mbox file.

  mbox = await IOUtils.readUTF8(inbox.filePath.path);
  info(mbox);
  Assert.ok(
    !mbox.includes(`Subject: ${testMessage.subject}`),
    "the new message should not be added to the mbox file"
  );

  // Fetch the message to "read" it. It still shouldn't have the flag or the
  // token, or exist in the mbox.

  const uri = inbox.getUriForMsg(messages[2]);
  const service = MailServices.messageServiceFromURI(uri);

  urlListener = new PromiseTestUtils.PromiseUrlListener();
  service.loadMessage(uri, null, null, urlListener, false);
  await urlListener.promise;

  messages = [...inbox.messages];
  Assert.equal(
    messages.length,
    3,
    "there should still be 3 messages in the database"
  );
  Assert.equal(messages[2].subject, testMessage.subject);
  Assert.ok(
    !(messages[2].flags & Ci.nsMsgMessageFlags.Offline),
    "the offline flag should not be set"
  );
  Assert.equal(messages[2].storeToken, "", "there should be no store token");

  mbox = await IOUtils.readUTF8(inbox.filePath.path);
  info(mbox);
  Assert.ok(
    !mbox.includes(`Subject: ${testMessage.subject}`),
    "the new message should still not be in the mbox file"
  );

  // Release the semaphore.

  inbox.releaseSemaphore(MailServices.accounts);

  // Fetch messages from the server.

  urlListener = new PromiseTestUtils.PromiseUrlListener();
  service.loadMessage(uri, null, null, urlListener, false);
  await urlListener.promise;

  // Check the message exists in the mbox.

  mbox = await IOUtils.readUTF8(inbox.filePath.path);
  info(mbox);
  const indexOfSubject = mbox.indexOf(`Subject: ${testMessage.subject}`);
  Assert.greater(
    indexOfSubject,
    0,
    "the new message should now be in the mbox file"
  );

  // Check it exists in the database and has the offline flag and a store
  // token pointing to the correct place in the mbox file.

  messages = [...inbox.messages];
  Assert.equal(
    messages.length,
    3,
    "there should still be 3 messages in the database"
  );
  Assert.equal(messages[2].subject, testMessage.subject);
  Assert.ok(
    messages[2].flags & Ci.nsMsgMessageFlags.Offline,
    "the offline flag should be set"
  );
  Assert.equal(
    messages[2].storeToken,
    mbox.lastIndexOf("\r\nFrom - ", indexOfSubject) + 2,
    "there should be a store token and it should point to the message"
  );
});
