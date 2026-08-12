/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that a failed incoming IMAP filter copy keeps the source message and
 * prevents the later destructive move.
 */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const MESSAGE_ID = "copy-failure@example.invalid";
const SUCCESS_MESSAGE_ID = "copy-success@example.invalid";
const SUCCESS_BODY = "The successful cross-account copy must be complete.";

let copyDaemon;
let copyServer;
let copyIncomingServer;
let copyFolder;
let moveFolder;

function getImapCommands(server) {
  const transaction = server.playTransaction();
  return (Array.isArray(transaction) ? transaction : [transaction])
    .flatMap(item => item.them)
    .map(command => command.toUpperCase());
}

function addIncomingMessage(messageId, subject, body) {
  const generator = new MessageGenerator();
  const message = generator.makeMessage({
    subject,
    body: {
      body,
      contentType: "text/plain",
    },
  });
  message.messageId = messageId;
  const dataUri = Services.io.newURI(
    "data:text/plain;base64," + btoa(message.toMessageString())
  );
  IMAPPump.mailbox.addMessage(
    new ImapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, [])
  );
}

add_setup(async function () {
  setupIMAPPump("MOVE,RFC4315");
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  const moveFolderAdded = PromiseTestUtils.promiseFolderAdded("Moved");
  IMAPPump.incomingServer.rootFolder.createSubfolder("Moved", null);
  await moveFolderAdded;
  moveFolder = IMAPPump.incomingServer.rootFolder
    .getChildNamed("Moved")
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  copyDaemon = new ImapDaemon();
  copyServer = makeServer(copyDaemon, "RFC4315");
  copyIncomingServer = createLocalIMAPServer(copyServer.port, "127.0.0.1");
  copyIncomingServer.maximumConnectionsNumber = 1;

  const copyFolderAdded = PromiseTestUtils.promiseFolderAdded("Copies");
  copyIncomingServer.rootFolder.createSubfolder("Copies", null);
  await copyFolderAdded;
  copyFolder = copyIncomingServer.rootFolder
    .getChildNamed("Copies")
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  const filterList = IMAPPump.incomingServer.getFilterList(null);
  const filter = filterList.createFilter("copy failure preserves source");
  const term = filter.createTerm();
  term.matchAll = true;
  filter.appendTerm(term);

  const copyAction = filter.createAction();
  copyAction.type = Ci.nsMsgFilterAction.CopyToFolder;
  copyAction.targetFolderUri = copyFolder.URI;
  filter.appendAction(copyAction);

  const moveAction = filter.createAction();
  moveAction.type = Ci.nsMsgFilterAction.MoveToFolder;
  moveAction.targetFolderUri = moveFolder.URI;
  filter.appendAction(moveAction);

  filter.enabled = true;
  filterList.insertFilterAt(0, filter);

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mail.server.default.autosync_offline_stores");
    copyIncomingServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(copyIncomingServer, false);
    copyServer.stop();
    teardownIMAPPump();
  });
});

add_task(async function testFailedCopyPreventsMove() {
  addIncomingMessage(
    MESSAGE_ID,
    "Filtered copy failure",
    "Source body must remain available."
  );

  copyDaemon.commandToFail = "APPEND";
  const updateListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, updateListener);
  await updateListener.promise;

  await TestUtils.waitForCondition(() => {
    const copyStarted = getImapCommands(copyServer).some(command =>
      command.includes("APPEND")
    );
    const moveStarted = getImapCommands(IMAPPump.server).some(command =>
      command.includes("UID MOVE")
    );
    return copyStarted || moveStarted;
  }, "the copy or the later move should start");
  Assert.ok(
    !getImapCommands(IMAPPump.server).some(command =>
      command.includes("UID MOVE")
    ),
    "a pending or failed copy should prevent the destructive move"
  );
  Assert.ok(
    getImapCommands(copyServer).some(command => command.includes("APPEND")),
    "the cross-account copy should attempt an APPEND"
  );
  await TestUtils.waitForCondition(
    () => IMAPPump.inbox.getTotalMessages(false) == 1,
    "the source header should remain after the copy fails"
  );

  Assert.equal(
    copyFolder.getTotalMessages(false),
    0,
    "the failed destination should contain no message"
  );
  Assert.equal(
    moveFolder.getTotalMessages(false),
    0,
    "the move destination should contain no message"
  );
  Assert.notEqual(
    IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(MESSAGE_ID),
    null,
    "the failed copy's source header should remain in the Inbox"
  );
});

add_task(async function testSuccessfulCopyAllowsMove() {
  copyDaemon.commandToFail = "";
  addIncomingMessage(SUCCESS_MESSAGE_ID, "Filtered copy success", SUCCESS_BODY);

  const updateListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, updateListener);
  await updateListener.promise;

  await TestUtils.waitForCondition(() => {
    const appendCount = getImapCommands(copyServer).filter(command =>
      command.includes("APPEND")
    ).length;
    const moveStarted = getImapCommands(IMAPPump.server).some(command =>
      command.includes("UID MOVE")
    );
    return appendCount == 2 && moveStarted;
  }, "the successful copy should finish before the move starts");

  const copyUpdateListener = new PromiseTestUtils.PromiseUrlListener();
  copyFolder.updateFolderWithListener(null, copyUpdateListener);
  await copyUpdateListener.promise;
  const moveUpdateListener = new PromiseTestUtils.PromiseUrlListener();
  moveFolder.updateFolderWithListener(null, moveUpdateListener);
  await moveUpdateListener.promise;

  const copiedHeader =
    copyFolder.msgDatabase.getMsgHdrForMessageID(SUCCESS_MESSAGE_ID);
  Assert.notEqual(
    copiedHeader,
    null,
    "the successful cross-account copy should reach its destination"
  );
  const copiedMessageUri = copyFolder.getUriForMsg(copiedHeader);
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  MailServices.messageServiceFromURI(copiedMessageUri).streamMessage(
    copiedMessageUri,
    streamListener,
    null,
    null,
    false,
    "",
    false
  );
  const copiedMessage = await streamListener.promise;
  Assert.stringContains(
    copiedMessage,
    SUCCESS_BODY,
    "the successful cross-account copy should retain its complete body"
  );
  Assert.notEqual(
    moveFolder.msgDatabase.getMsgHdrForMessageID(SUCCESS_MESSAGE_ID),
    null,
    "the source message should move after the successful copy"
  );
  Assert.notEqual(
    IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(MESSAGE_ID),
    null,
    "the earlier failed copy's source message should remain"
  );
});
