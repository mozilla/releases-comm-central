/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

let about3Pane = document.getElementById("tabmail").currentAbout3Pane;
let folderA,
  folderAMessages,
  folderB,
  folderBMessages,
  folderC,
  folderCMessages;

add_setup(async function() {
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", false);

  let generator = new MessageGenerator();

  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  let rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("Navigation A", null);
  folderA = rootFolder
    .getChildNamed("Navigation A")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderA.addMessageBatch(
    generator.makeMessages({ count: 5 }).map(message => message.toMboxString())
  );
  folderAMessages = [...folderA.messages];

  rootFolder.createSubfolder("Navigation B", null);
  folderB = rootFolder
    .getChildNamed("Navigation B")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderB.addMessageBatch(
    generator.makeMessages({ count: 5 }).map(message => message.toMboxString())
  );
  folderBMessages = [...folderB.messages];

  rootFolder.createSubfolder("Navigation C", null);
  folderC = rootFolder
    .getChildNamed("Navigation C")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderC.addMessageBatch(
    generator.makeMessages({ count: 5 }).map(message => message.toMboxString())
  );
  folderCMessages = [...folderC.messages];

  for (let message of [
    folderAMessages[0],
    folderAMessages[2],
    folderAMessages[4],
    folderBMessages[0],
    folderBMessages[1],
    folderBMessages[2],
    folderBMessages[3],
    folderBMessages[4],
    folderCMessages[2],
    folderCMessages[3],
  ]) {
    message.markRead(true);
  }

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mailnews.mark_message_read.auto");
  });
});

function assertSelectedFolder(expected) {
  Assert.equal(about3Pane.gFolder.URI, expected.URI, "selected folder");
}

function assertSelectedMessage(expected, comment) {
  if (expected) {
    Assert.notEqual(
      about3Pane.threadTree.selectedIndex,
      -1,
      "a message should be selected"
    );
    Assert.equal(
      about3Pane.gDBView.getMsgHdrAt(about3Pane.threadTree.selectedIndex)
        .subject,
      expected.subject,
      comment ?? "selected message"
    );
  } else {
    Assert.equal(
      about3Pane.threadTree.selectedIndex,
      -1,
      "no message should be selected"
    );
  }
}

add_task(async function testNextPreviousMessage() {
  about3Pane.displayFolder(folderA.URI);
  assertSelectedMessage();

  for (let i = 0; i < 5; i++) {
    EventUtils.synthesizeKey("f", {}, about3Pane);
    assertSelectedMessage(folderAMessages[i]);
  }

  EventUtils.synthesizeKey("f", {}, about3Pane);
  assertSelectedMessage(
    folderAMessages[4],
    "the selected message should not change"
  );

  for (let i = 3; i >= 0; i--) {
    EventUtils.synthesizeKey("b", {}, about3Pane);
    assertSelectedMessage(folderAMessages[i]);
  }

  EventUtils.synthesizeKey("b", {}, about3Pane);
  assertSelectedMessage(
    folderAMessages[0],
    "the selected message should not change"
  );

  about3Pane.threadTree.selectedIndex = -1;
});

add_task(async function testNextUnreadMessage() {
  about3Pane.displayFolder(folderA.URI);
  assertSelectedMessage();

  // Select the first unread message.
  EventUtils.synthesizeKey("n", {}, about3Pane);
  assertSelectedMessage(folderAMessages[1]);

  // Select the next unread message.
  EventUtils.synthesizeKey("n", {}, about3Pane);
  assertSelectedMessage(folderAMessages[3]);

  // Select the next unread message. Loops to start of folder.
  EventUtils.synthesizeKey("n", {}, about3Pane);
  assertSelectedMessage(folderAMessages[1]);

  // Mark the message as read.
  EventUtils.synthesizeKey("m", {}, about3Pane);
  assertSelectedMessage(folderAMessages[1]);

  // Select the next unread message.
  EventUtils.synthesizeKey("n", {}, about3Pane);
  assertSelectedMessage(folderAMessages[3]);

  // Select the next unread message. Changes to the next folder.
  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeKey("n", {}, about3Pane);
  await dialogPromise;
  assertSelectedFolder(folderC);
  assertSelectedMessage(folderCMessages[0]);

  // Select the next unread message.
  EventUtils.synthesizeKey("n", {}, about3Pane);
  assertSelectedMessage(folderCMessages[1]);

  // Select the next unread message.
  EventUtils.synthesizeKey("n", {}, about3Pane);
  assertSelectedMessage(folderCMessages[4]);

  // Go back to the first folder. The previous selection should be restored.
  about3Pane.displayFolder(folderA.URI);
  assertSelectedMessage(folderAMessages[3]);

  // Select the next unread message. Changes to the next folder.
  // The previous selection should NOT be restored.
  dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeKey("n", {}, about3Pane);
  await dialogPromise;
  assertSelectedFolder(folderC);
  assertSelectedMessage(folderCMessages[0]);
});
