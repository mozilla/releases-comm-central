/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
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

add_task(async function test_mark_as_junk() {
  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  const inboxFolder = rootFolder.getChildNamed("Inbox");
  Assert.ok(!!inboxFolder, "Inbox folder should exist.");
  const junkFolder = rootFolder.getChildNamed("Junk");
  Assert.ok(!!junkFolder, "Junk folder should exist");

  // Add messages to the inbox.
  const junkMessages = generator.makeMessages({ count: 2 });
  ewsServer.addNewItemOrMoveItemToFolder(
    "junk_message_1",
    "inbox",
    junkMessages[0]
  );
  ewsServer.addNewItemOrMoveItemToFolder(
    "junk_message_2",
    "inbox",
    junkMessages[1]
  );

  await syncFolder(incomingServer, inboxFolder);
  await syncFolder(incomingServer, junkFolder);

  Assert.equal(
    inboxFolder.getTotalMessages(false),
    2,
    "Should start with two messages."
  );

  const findJunkMessages = folder => {
    const messages = [...folder.messages];
    return messages.filter(header =>
      header.getStringProperty("ewsId").startsWith("junk_message_")
    );
  };

  const junkMessageKeys = findJunkMessages(inboxFolder).map(
    header => header.messageKey
  );
  Assert.equal(
    junkMessageKeys.length,
    2,
    "Should have found two junk messages."
  );

  const junkListener = new PromiseTestUtils.PromiseCopyListener();
  inboxFolder.handleViewCommand(
    Ci.nsMsgViewCommandType.junk,
    junkMessageKeys,
    null,
    junkListener
  );
  await junkListener.promise;

  TestUtils.waitForCondition(() => {
    return findJunkMessages(inboxFolder).length == 0;
  }, "Waiting for inbox to empty.");

  TestUtils.waitForCondition(() => {
    return findJunkMessages(junkFolder).length == 2;
  }, "Waiting for junk messages to appear in junk folder.");

  await syncFolder(incomingServer, junkFolder);
  await syncFolder(incomingServer, inboxFolder);

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

  await syncFolder(incomingServer, junkFolder);
  await syncFolder(incomingServer, inboxFolder);

  TestUtils.waitForCondition(() => {
    return findJunkMessages(inboxFolder).length == 1;
  }, "Waiting for unjunked message to appear in inbox.");

  TestUtils.waitForCondition(() => {
    return findJunkMessages(junkFolder).length == 1;
  }, "Waiting for unjunked message to disappear from junk folder.");
});
