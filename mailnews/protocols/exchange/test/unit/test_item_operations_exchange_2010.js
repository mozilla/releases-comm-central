/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);
var { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var incomingServer;
var ewsServer;

const generator = new MessageGenerator();

add_setup(async function () {
  [ewsServer, incomingServer] = setupBasicEwsTestServer({
    version: "Exchange2010",
  });
});

/**
 * Tests that marking messages as junk works when the server does not support
 * the `MarkAsJunk` operation.
 *
 * This means marking as junk should result in a `MoveItem` operation from the
 * original folder to the junk folder, and unmarking as junk should result in a
 * `MoveItem` operation from the junk folder to the inbox folder.
 */
add_task(async function test_mark_as_junk() {
  // Create a new folder for our test on the server.
  const originalFolderName = "markAsJunkLegacy";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(originalFolderName, "root", originalFolderName, null)
  );

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  const inboxFolder = rootFolder.getChildNamed("Inbox");
  Assert.ok(!!inboxFolder, "Inbox folder should exist.");
  const junkFolder = rootFolder.getChildNamed("Junk");
  Assert.ok(!!junkFolder, "Junk folder should exist");
  const originalFolder = rootFolder.getChildNamed(originalFolderName);
  Assert.ok(!!junkFolder, `the ${originalFolderName} folder should exist`);

  // Add messages to the inbox.
  const junkMessages = generator.makeMessages({ count: 2 });
  ewsServer.addNewItemOrMoveItemToFolder(
    "junk_message_1",
    originalFolderName,
    junkMessages[0]
  );
  ewsServer.addNewItemOrMoveItemToFolder(
    "junk_message_2",
    originalFolderName,
    junkMessages[1]
  );

  // Ensure we have the right amount of messages to start with.
  await syncFolder(incomingServer, inboxFolder);
  await syncFolder(incomingServer, junkFolder);
  await syncFolder(incomingServer, originalFolder);

  Assert.equal(
    originalFolder.getTotalMessages(false),
    2,
    "Should start with two messages in the source folder."
  );

  Assert.equal(
    inboxFolder.getTotalMessages(false),
    0,
    "Should start with two messages in the inbox folder."
  );

  Assert.equal(
    junkFolder.getTotalMessages(false),
    0,
    "Should start with two messages in the junk folder."
  );

  const findJunkMessages = folder => {
    const messages = [...folder.messages];
    return messages.filter(header =>
      header.getStringProperty("ewsId").startsWith("junk_message_")
    );
  };

  // Identify the messages for our test, and mark them as junk. Since we're on a
  // version older than Exchange Server 2013, this will result in a `MoveItem`
  // operation (from the inbox to the junk folder) rather than `MarkAsJunk`.
  const junkMessageKeys = findJunkMessages(originalFolder).map(
    header => header.messageKey
  );
  Assert.equal(
    junkMessageKeys.length,
    2,
    "Should have found two junk messages."
  );

  const junkListener = new PromiseTestUtils.PromiseCopyListener();
  originalFolder.handleViewCommand(
    Ci.nsMsgViewCommandType.junk,
    junkMessageKeys,
    null,
    junkListener
  );
  await junkListener.promise;

  await TestUtils.waitForCondition(() => {
    return findJunkMessages(originalFolder).length == 0;
  }, "Waiting for inbox to empty.");

  await TestUtils.waitForCondition(() => {
    return findJunkMessages(junkFolder).length == 2;
  }, "Waiting for junk messages to appear in junk folder.");

  // Unjunk the first message and make sure it moved back to the inbox.
  const newMessageKeys = findJunkMessages(junkFolder).map(m => m.messageKey);
  const unjunkListener = new PromiseTestUtils.PromiseCopyListener();
  junkFolder.handleViewCommand(
    Ci.nsMsgViewCommandType.unjunk,
    [newMessageKeys[0]],
    null,
    unjunkListener
  );
  await unjunkListener.promise;

  await TestUtils.waitForCondition(() => {
    return findJunkMessages(inboxFolder).length == 1;
  }, "Waiting for unjunked message to appear in inbox.");

  await TestUtils.waitForCondition(() => {
    return findJunkMessages(junkFolder).length == 1;
  }, "Waiting for unjunked message to disappear from junk folder.");
});
