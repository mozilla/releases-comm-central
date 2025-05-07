/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {
  be_in_folder,
  create_folder,
  make_message_sets_in_folders,
  select_click_row,
  select_none,
  select_shift_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { delete_mail_marked_as_junk, mark_selected_messages_as_junk } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/JunkHelpers.sys.mjs"
  );

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

// One folder's enough
var folder = null;
var folder2 = null;
var folder3 = null;

add_setup(async function () {
  folder = await create_folder("JunkCommandsA");
  folder2 = await create_folder("JunkCommandsB");
  folder2.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder3 = await create_folder("JunkCommandsC");
  folder3.QueryInterface(Ci.nsIMsgLocalMailFolder);
  await make_message_sets_in_folders([folder], [{ count: 30 }]);
  registerCleanupFunction(() => {
    folder.deleteSelf(null);
    folder2.deleteSelf(null);
    folder3.deleteSelf(null);
    MailServices.junk.resetTrainingData();
  });
});

/**
 * Test deleting junk messages with no messages marked as spam.
 */
add_task(async function test_delete_no_junk_messages() {
  const initialNumMessages = folder.getTotalMessages(false);
  await be_in_folder(folder);
  await select_none();
  await delete_mail_marked_as_junk(0, folder);
  // Check if we still have the same number of messages
  Assert.equal(
    folder.getTotalMessages(false),
    initialNumMessages,
    "should have the same nbr of msgs"
  );
});

/**
 * Test deleting junk messages with some messages marked as spam.
 */
add_task(async function test_delete_junk_messages() {
  const initialNumMessages = folder.getTotalMessages(false);
  await be_in_folder(folder);
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
  await delete_mail_marked_as_junk(NUM_MESSAGES_TO_JUNK, folder);
  Assert.equal(
    folder.getTotalMessages(false),
    initialNumMessages - NUM_MESSAGES_TO_JUNK,
    "should have the right number of mail left"
  );
  // Check that none of the message keys exist any more
  const db = folder.getDBFolderInfoAndDB({});
  for (const msgHdr of selectedMessages) {
    const key = msgHdr.messageKey;
    Assert.ok(!db.containsKey(key), `db should not contain ${key}`);
  }
});

add_task(async function test_run_junk_controls_on_folder() {
  MailServices.junk.resetTrainingData();

  const messages = {};
  for (const name of ["ham1", "ham2", "spam1", "spam2", "spam3", "spam4"]) {
    const path = getTestFilePath(`${name}.eml`);
    messages[name] = folder2.addMessage(await IOUtils.readUTF8(path));
  }
  await be_in_folder(folder2);

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

add_task(async function test_run_junk_controls_on_selection() {
  MailServices.junk.resetTrainingData();

  const messages = {};
  for (const name of ["ham1", "ham2", "spam1", "spam2", "spam3", "spam4"]) {
    const path = getTestFilePath(`${name}.eml`);
    messages[name] = folder3.addMessage(await IOUtils.readUTF8(path));
  }
  await be_in_folder(folder3);

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
