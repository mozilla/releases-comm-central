/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the "run junk mail controls" and "delete messages marked as junk" commands.
 */

var {
  be_in_folder,
  create_folder,
  create_virtual_folder,
  select_click_row,
  select_control_click_row,
  select_none,
  select_shift_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { delete_mail_marked_as_junk, mark_selected_messages_as_junk } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/JunkHelpers.sys.mjs"
  );
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

let folderA, folderB, folderC, folderD, folderE, virtualFolder;

add_setup(async function () {
  folderA = await create_folder("JunkCommandsA");

  folderB = await create_folder("JunkCommandsB");
  folderB.QueryInterface(Ci.nsIMsgLocalMailFolder);

  folderC = await create_folder("JunkCommandsC");
  folderC.QueryInterface(Ci.nsIMsgLocalMailFolder);

  folderD = await create_folder("JunkCommandsD");
  folderE = await create_folder("JunkCommandsE");
  folderE.QueryInterface(Ci.nsIMsgLocalMailFolder);

  virtualFolder = create_virtual_folder("JunkCommandsV", [folderD, folderE]);

  await make_message_sets_in_folders([folderA], [{ count: 30 }]);
  await make_message_sets_in_folders([folderD], [{ count: 3 }]);
  await make_message_sets_in_folders([folderE], [{ count: 7 }]);

  registerCleanupFunction(async () => {
    virtualFolder.deleteSelf(null);
    folderA.deleteSelf(null);
    folderB.deleteSelf(null);
    folderC.deleteSelf(null);
    folderD.deleteSelf(null);
    folderE.deleteSelf(null);
    MailServices.junk.resetTrainingData();
  });
});

/**
 * Test deleting junk messages with no messages marked as spam.
 */
add_task(async function test_delete_no_junk_messages() {
  const initialNumMessages = folderA.getTotalMessages(false);
  await be_in_folder(folderA);
  await select_none();
  await delete_mail_marked_as_junk(0, folderA);
  // Check if we still have the same number of messages
  Assert.equal(
    folderA.getTotalMessages(false),
    initialNumMessages,
    "should have the same nbr of msgs"
  );
});

/**
 * Test deleting junk messages with some messages marked as spam.
 */
add_task(async function test_delete_junk_messages() {
  const initialNumMessages = folderA.getTotalMessages(false);
  await be_in_folder(folderA);
  await select_click_row(1);

  // The number of messages to mark as spam and expect to be deleted.
  const NUM_MESSAGES_TO_JUNK = 8;

  const selectedMessages = await select_shift_click_row(NUM_MESSAGES_TO_JUNK);
  Assert.equal(
    selectedMessages.length,
    NUM_MESSAGES_TO_JUNK,
    `should have selected correct number of msgs`
  );
  // Mark these messages as spam
  mark_selected_messages_as_junk();

  // Now delete junk mail
  await delete_mail_marked_as_junk(NUM_MESSAGES_TO_JUNK, folderA);
  Assert.equal(
    folderA.getTotalMessages(false),
    initialNumMessages - NUM_MESSAGES_TO_JUNK,
    "should have the right number of mail left"
  );
  // Check that none of the message keys exist any more
  const db = folderA.getDBFolderInfoAndDB({});
  for (const msgHdr of selectedMessages) {
    const key = msgHdr.messageKey;
    Assert.ok(!db.containsKey(key), `db should not contain ${key}`);
  }
});

/**
 * Test deleting junk messages from a virtual folder.
 */
add_task(async function test_delete_junk_messages_virtual() {
  await be_in_folder(virtualFolder);
  Assert.equal(folderD.getTotalMessages(false), 3);
  Assert.equal(folderE.getTotalMessages(false), 7);
  Assert.equal(virtualFolder.getTotalMessages(false), 10);

  await select_click_row(0);
  await select_control_click_row(3);
  await select_control_click_row(6);
  await select_control_click_row(9);
  mark_selected_messages_as_junk();

  const completeD = PromiseTestUtils.promiseFolderEvent(
    folderD,
    "DeleteOrMoveMsgCompleted"
  );
  const completeE = PromiseTestUtils.promiseFolderEvent(
    folderE,
    "DeleteOrMoveMsgCompleted"
  );

  await select_click_row(1);
  goDoCommand("cmd_deleteJunk");

  await Promise.all([completeD, completeE]);

  Assert.equal(folderD.getTotalMessages(false), 2);
  Assert.equal(folderE.getTotalMessages(false), 4);
  // This doesn't work, the value remains 10:
  // Assert.equal(virtualFolder.getTotalMessages(false), 6);
});

/**
 * Test running the junk mail controls on a whole folder.
 */
add_task(async function test_run_junk_controls_on_folder() {
  MailServices.junk.resetTrainingData();

  const messages = {};
  for (const name of ["ham1", "ham2", "spam1", "spam2", "spam3", "spam4"]) {
    const path = getTestFilePath(`${name}.eml`);
    messages[name] = folderB.addMessage(await IOUtils.readUTF8(path));
  }
  await be_in_folder(folderB);

  await trainJunkFilter("ham1");
  await trainJunkFilter("spam1");
  await trainJunkFilter("spam2");

  for (const [name, header] of Object.entries(messages)) {
    Assert.equal(
      header.getStringProperty("junkscore"),
      "",
      `message ${name} should have no classification`
    );
  }

  const finished = TestUtils.topicObserved("message-classification-complete");
  goDoCommand("cmd_runJunkControls");
  await finished;
  await TestUtils.waitForTick();

  for (const [name, header] of Object.entries(messages)) {
    if (name.startsWith("spam")) {
      Assert.equal(
        header.getStringProperty("junkscore"),
        "100",
        `message ${name} should be marked as spam`
      );
    } else {
      Assert.equal(
        header.getStringProperty("junkscore"),
        "0",
        `message ${name} should not be marked as spam`
      );
    }
  }
});

/**
 * Test running the junk mail controls on a virtual folder.
 */
add_task(async function test_run_junk_controls_on_virtual_folder() {
  MailServices.junk.resetTrainingData();

  const beforeCountD = folderD.getTotalMessages(false);
  const beforeCountE = folderE.getTotalMessages(false);

  const messages = {};
  for (const name of ["ham1", "ham2", "spam1", "spam2", "spam3", "spam4"]) {
    const path = getTestFilePath(`${name}.eml`);
    messages[name] = folderE.addMessage(await IOUtils.readUTF8(path));
  }

  await be_in_folder(virtualFolder);

  await trainJunkFilter("ham1");
  await trainJunkFilter("spam1");
  await trainJunkFilter("spam2");

  Assert.equal(folderE.getTotalMessages(false), beforeCountE + 6);
  Assert.equal(
    virtualFolder.getTotalMessages(false),
    beforeCountD + beforeCountE + 6
  );

  for (const [name, header] of Object.entries(messages)) {
    Assert.equal(
      header.getStringProperty("junkscore"),
      "",
      `message ${name} should not be marked as spam`
    );
  }

  const finished = TestUtils.topicObserved("message-classification-complete");
  goDoCommand("cmd_runJunkControls");
  await finished;
  await TestUtils.waitForTick();

  for (const [name, header] of Object.entries(messages)) {
    if (name.startsWith("spam")) {
      Assert.equal(
        header.getStringProperty("junkscore"),
        "100",
        `message ${name} should be marked as spam`
      );
    } else {
      Assert.equal(
        header.getStringProperty("junkscore"),
        "0",
        `message ${name} should not be marked as spam`
      );
    }
  }
});

/**
 * Test running the junk mail controls on the selection.
 */
add_task(async function test_run_junk_controls_on_selection() {
  MailServices.junk.resetTrainingData();

  const messages = {};
  for (const name of ["ham1", "ham2", "spam1", "spam2", "spam3", "spam4"]) {
    const path = getTestFilePath(`${name}.eml`);
    messages[name] = folderC.addMessage(await IOUtils.readUTF8(path));
  }
  await be_in_folder(folderC);

  await trainJunkFilter("ham1");
  await trainJunkFilter("spam1");
  await trainJunkFilter("spam2");

  for (const [name, header] of Object.entries(messages)) {
    Assert.equal(
      header.getStringProperty("junkscore"),
      "",
      `message ${name} should have no classification`
    );
  }

  const tabmail = document.getElementById("tabmail");
  const { gDBView, threadTree } = tabmail.currentAbout3Pane;
  threadTree.selectedIndices = [
    gDBView.findIndexOfMsgHdr(messages.ham2, false),
    gDBView.findIndexOfMsgHdr(messages.spam2, false),
    gDBView.findIndexOfMsgHdr(messages.spam3, false),
  ];

  const finished = TestUtils.topicObserved("message-classification-complete");
  goDoCommand("cmd_recalculateJunkScore");
  await finished;
  await TestUtils.waitForTick();

  for (const [name, header] of Object.entries(messages)) {
    const row = threadTree.getRowAtIndex(
      gDBView.findIndexOfMsgHdr(header, false)
    );
    const spamButton = row.querySelector(".button-spam");

    if (["spam2", "spam3"].includes(name)) {
      Assert.equal(
        header.getStringProperty("junkscore"),
        "100",
        `message ${name} should be marked as spam`
      );
      await TestUtils.waitForCondition(
        () => BrowserTestUtils.isVisible(spamButton),
        "waiting for spam button to become visible"
      );
    } else if (name == "ham2") {
      Assert.equal(
        header.getStringProperty("junkscore"),
        "0",
        `message ${name} should not be marked as spam`
      );
      Assert.ok(
        BrowserTestUtils.isHidden(spamButton),
        "spam button should be hidden"
      );
    } else {
      Assert.equal(
        header.getStringProperty("junkscore"),
        "",
        `message ${name} should have no classification`
      );
      Assert.ok(
        BrowserTestUtils.isHidden(spamButton),
        "spam button should be hidden"
      );
    }
  }
});

async function trainJunkFilter(message) {
  const path = getTestFilePath(`${message}.eml`);
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  let uri = Services.io.newFileURI(file).QueryInterface(Ci.nsIURL);
  uri = uri.mutate().setQuery("type=application/x-message-display").finalize();

  const deferred = Promise.withResolvers();
  MailServices.junk.setMessageClassification(
    uri.spec,
    null,
    message.startsWith("ham") ? MailServices.junk.GOOD : MailServices.junk.JUNK,
    null,
    { onMessageClassified: deferred.resolve }
  );
  return deferred.promise;
}
