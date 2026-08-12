/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that incoming IMAP filters finish copying every message before
 * marking any source message deleted.
 */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const MESSAGE_COUNT = 3;
const MESSAGE_IDS = Array.from(
  { length: MESSAGE_COUNT },
  (_, index) => `copy-before-delete-${index + 1}@example.invalid`
);
const BODY_SENTINELS = Array.from(
  { length: MESSAGE_COUNT },
  (_, index) => `Complete body before filtered delete ${index + 1}.`
);

let copyFolder;

function getImapCommands() {
  const transaction = IMAPPump.server.playTransaction();
  return (Array.isArray(transaction) ? transaction : [transaction])
    .flatMap(item => item.them)
    .map(command => command.toUpperCase());
}

add_setup(async function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  IMAPPump.incomingServer.deleteModel = Ci.nsMsgImapDeleteModels.IMAPDelete;

  const copyFolderAdded =
    PromiseTestUtils.promiseFolderAdded("Filtered copies");
  copyFolder =
    localAccountUtils.rootFolder.createLocalSubfolder("Filtered copies");
  await copyFolderAdded;

  const filterList = IMAPPump.incomingServer.getFilterList(null);
  const filter = filterList.createFilter("copy before delete");
  const term = filter.createTerm();
  term.matchAll = true;
  filter.appendTerm(term);

  const copyAction = filter.createAction();
  copyAction.type = Ci.nsMsgFilterAction.CopyToFolder;
  copyAction.targetFolderUri = copyFolder.URI;
  filter.appendAction(copyAction);

  const deleteAction = filter.createAction();
  deleteAction.type = Ci.nsMsgFilterAction.Delete;
  filter.appendAction(deleteAction);

  filter.enabled = true;
  filterList.insertFilterAt(0, filter);

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mail.server.default.autosync_offline_stores");
    teardownIMAPPump();
  });
});

add_task(async function testCopyFinishesBeforeDelete() {
  const generator = new MessageGenerator();
  for (let index = 0; index < MESSAGE_COUNT; index++) {
    const message = generator.makeMessage({
      subject: `Filtered delete ${index + 1}`,
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
    const hasDelete = commands.some(
      command => command.includes("UID STORE") && command.includes("\\DELETED")
    );
    return bodyFetchCount == MESSAGE_COUNT && hasDelete;
  }, "all body fetches and the filtered delete should run");

  const commands = getImapCommands();
  const bodyFetchIndexes = commands
    .map((command, index) => [command, index])
    .filter(([command]) => command.includes("UID FETCH"))
    .filter(([command]) => command.includes("BODY.PEEK[]"))
    .map(([, index]) => index);
  const firstDeleteIndex = commands.findIndex(
    command => command.includes("UID STORE") && command.includes("\\DELETED")
  );

  Assert.equal(
    bodyFetchIndexes.length,
    MESSAGE_COUNT,
    "each message should have one full-body fetch"
  );
  Assert.greater(
    firstDeleteIndex,
    bodyFetchIndexes.at(-1),
    "the destructive delete should follow every body fetch"
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
});
