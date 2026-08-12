/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that incoming IMAP filters finish copying every message before a
 * destructive move of the source messages begins.
 */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const MESSAGE_COUNT = 3;
const MESSAGE_IDS = Array.from(
  { length: MESSAGE_COUNT },
  (_, index) => `copy-before-move-${index + 1}@example.invalid`
);
const BODY_SENTINELS = Array.from(
  { length: MESSAGE_COUNT },
  (_, index) => `Complete body for filtered message ${index + 1}.`
);

let copyFolder;
let moveFolder;

function getImapCommands() {
  const transaction = IMAPPump.server.playTransaction();
  return (Array.isArray(transaction) ? transaction : [transaction])
    .flatMap(item => item.them)
    .map(command => command.toUpperCase());
}

add_setup(async function () {
  setupIMAPPump("MOVE,RFC4315");
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  const copyFolderAdded =
    PromiseTestUtils.promiseFolderAdded("Filtered copies");
  copyFolder =
    localAccountUtils.rootFolder.createLocalSubfolder("Filtered copies");
  await copyFolderAdded;

  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;
  const moveFolderAdded = PromiseTestUtils.promiseFolderAdded("Moved");
  IMAPPump.incomingServer.rootFolder.createSubfolder("Moved", null);
  await moveFolderAdded;
  moveFolder = IMAPPump.incomingServer.rootFolder
    .getChildNamed("Moved")
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  const filterList = IMAPPump.incomingServer.getFilterList(null);
  const filter = filterList.createFilter("copy before move");
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
    teardownIMAPPump();
  });
});

add_task(async function testCopyFinishesBeforeMove() {
  const generator = new MessageGenerator();
  for (let index = 0; index < MESSAGE_COUNT; index++) {
    const message = generator.makeMessage({
      subject: `Filtered message ${index + 1}`,
      body: {
        body: BODY_SENTINELS[index],
        contentType: "text/plain",
      },
    });
    message.messageId = MESSAGE_IDS[index];
    const dataUri = Services.io.newURI(
      "data:text/plain;base64," + btoa(message.toMessageString())
    );
    IMAPPump.mailbox.addMessage(
      new ImapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, [])
    );
  }

  const updateListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, updateListener);
  await updateListener.promise;

  await TestUtils.waitForCondition(() => {
    const commands = getImapCommands();
    const bodyFetchCount = commands
      .filter(command => command.includes("UID FETCH"))
      .filter(command => command.includes("BODY.PEEK[]")).length;
    const hasMove = commands.some(command => command.includes("UID MOVE"));
    return bodyFetchCount == MESSAGE_COUNT && hasMove;
  }, "all body fetches and the filtered move should run");
  const commands = getImapCommands();
  const bodyFetchIndexes = commands
    .map((command, index) => [command, index])
    .filter(([command]) => command.includes("UID FETCH"))
    .filter(([command]) => command.includes("BODY.PEEK[]"))
    .map(([, index]) => index);
  const firstMoveIndex = commands.findIndex(command =>
    command.includes("UID MOVE")
  );

  Assert.equal(
    bodyFetchIndexes.length,
    MESSAGE_COUNT,
    "each message should have one full-body fetch"
  );
  Assert.greater(
    firstMoveIndex,
    bodyFetchIndexes.at(-1),
    "the destructive move should follow every body fetch"
  );

  await TestUtils.waitForCondition(
    () => copyFolder.getTotalMessages(false) == MESSAGE_COUNT,
    "all filtered copies should finish"
  );

  for (let index = 0; index < MESSAGE_COUNT; index++) {
    const header = copyFolder.msgDatabase.getMsgHdrForMessageID(
      MESSAGE_IDS[index]
    );
    Assert.notEqual(header, null, `${MESSAGE_IDS[index]} should be copied`);
    const copiedMessage = mailTestUtils.loadMessageToString(copyFolder, header);
    Assert.stringContains(
      copiedMessage,
      BODY_SENTINELS[index],
      `${MESSAGE_IDS[index]} should retain its complete body`
    );
  }

  await TestUtils.waitForCondition(
    () => IMAPPump.inbox.getTotalMessages(false) == 0,
    "the filtered move should finish"
  );
  const moveUpdateListener = new PromiseTestUtils.PromiseUrlListener();
  moveFolder.updateFolderWithListener(null, moveUpdateListener);
  await moveUpdateListener.promise;

  Assert.equal(
    IMAPPump.inbox.getTotalMessages(false),
    0,
    "the source Inbox should be empty after the copies finish"
  );
  Assert.equal(
    moveFolder.getTotalMessages(false),
    MESSAGE_COUNT,
    "every source message should reach the move destination"
  );
  for (const messageId of MESSAGE_IDS) {
    Assert.notEqual(
      moveFolder.msgDatabase.getMsgHdrForMessageID(messageId),
      null,
      `${messageId} should be moved`
    );
  }
});
