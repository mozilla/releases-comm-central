/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

let {
  currentAbout3Pane: about3Pane,
  currentAboutMessage: aboutMessage,
} = document.getElementById("tabmail");
let { messageBrowser, multiMessageBrowser, threadTree } = about3Pane;
let messagePaneBrowser = aboutMessage.getMessagePaneBrowser();
let mailboxService = MailServices.messageServiceFromURI("mailbox:");
let folderA,
  folderAMessages,
  folderB,
  folderBMessages,
  folderC,
  folderCMessages,
  folderD,
  folderDMessages;

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

  rootFolder.createSubfolder("Navigation D", null);
  folderD = rootFolder
    .getChildNamed("Navigation D")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderD.addMessageBatch(
    generator
      .makeMessages({
        count: 12,
        msgsPerThread: 3,
      })
      .map(message => message.toMboxString())
  );
  folderDMessages = [...folderD.messages];

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
    folderDMessages[3],
    folderDMessages[4],
    folderDMessages[5],
    folderDMessages[6],
    folderDMessages[7],
  ]) {
    message.markRead(true);
  }

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mailnews.mark_message_read.auto");
  });
});

/** Tests the next message/previous message commands. */
add_task(async function testNextPreviousMessage() {
  about3Pane.displayFolder(folderA.URI);
  assertSelectedMessage();
  await assertNoDisplayedMessage();

  for (let i = 0; i < 5; i++) {
    goDoCommand("cmd_nextMsg");
    assertSelectedMessage(folderAMessages[i]);
    await assertDisplayedMessage(folderAMessages[i]);
  }

  threadTree.addEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  goDoCommand("cmd_nextMsg");
  assertSelectedMessage(
    folderAMessages[4],
    "the selected message should not change"
  );
  await assertDisplayedMessage(folderAMessages[4]);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(f => setTimeout(f, 500));
  threadTree.removeEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  for (let i = 3; i >= 0; i--) {
    goDoCommand("cmd_previousMsg");
    assertSelectedMessage(folderAMessages[i]);
    await assertDisplayedMessage(folderAMessages[i]);
  }

  threadTree.addEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  goDoCommand("cmd_previousMsg");
  assertSelectedMessage(
    folderAMessages[0],
    "the selected message should not change"
  );
  await assertDisplayedMessage(folderAMessages[0]);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(f => setTimeout(f, 500));
  threadTree.removeEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  threadTree.selectedIndex = -1;
  await assertNoDisplayedMessage();
});

/** Tests the next unread message command. */
add_task(async function testNextUnreadMessage() {
  about3Pane.displayFolder(folderA.URI);
  threadTree.selectedIndex = -1;
  assertSelectedMessage();
  await assertNoDisplayedMessage();

  // Select the first unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(folderAMessages[1]);

  // Select the next unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderAMessages[3]);
  await assertDisplayedMessage(folderAMessages[3]);

  // Select the next unread message. Loops to start of folder.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(folderAMessages[1]);

  // Mark the message as read.
  goDoCommand("cmd_markAsRead");
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(folderAMessages[1]);

  // Select the next unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderAMessages[3]);
  await assertDisplayedMessage(folderAMessages[3]);

  // Select the next unread message. Changes to the next folder.
  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  goDoCommand("cmd_nextUnreadMsg");
  await dialogPromise;
  assertSelectedFolder(folderC);
  assertSelectedMessage(folderCMessages[0]);
  await assertDisplayedMessage(folderCMessages[0]);

  // Select the next unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderCMessages[1]);
  await assertDisplayedMessage(folderCMessages[1]);

  // Select the next unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderCMessages[4]);
  await assertDisplayedMessage(folderCMessages[4]);

  // Go back to the first folder. The previous selection should be restored.
  about3Pane.displayFolder(folderA.URI);
  assertSelectedMessage(folderAMessages[3]);
  await assertDisplayedMessage(folderAMessages[3]);

  // Select the next unread message. Changes to the next folder.
  // The previous selection should NOT be restored.
  dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  goDoCommand("cmd_nextUnreadMsg");
  await dialogPromise;
  assertSelectedFolder(folderC);
  assertSelectedMessage(folderCMessages[0]);
  await assertDisplayedMessage(folderCMessages[0]);

  threadTree.selectedIndex = -1;
  await assertNoDisplayedMessage();
});

/** Tests the previous unread message command. This doesn't cross folders. */
add_task(async function testPreviousUnreadMessage() {
  about3Pane.displayFolder(folderC.URI);
  threadTree.selectedIndex = 4;
  assertSelectedMessage(folderCMessages[4]);
  await assertDisplayedMessage(folderCMessages[4]);

  goDoCommand("cmd_previousUnreadMsg");
  assertSelectedMessage(folderCMessages[1]);
  await assertDisplayedMessage(folderCMessages[1]);

  goDoCommand("cmd_previousUnreadMsg");
  assertSelectedMessage(folderCMessages[0]);
  await assertDisplayedMessage(folderCMessages[0]);

  threadTree.addEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  goDoCommand("cmd_previousUnreadMsg");
  assertSelectedMessage(folderCMessages[0]);
  await assertDisplayedMessage(folderCMessages[0]);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(f => setTimeout(f, 500));
  threadTree.removeEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  threadTree.selectedIndex = -1;
  await assertNoDisplayedMessage();
});

/**
 * Tests the next unread thread command. This command depends on marking the
 * thread as read, despite mailnews.mark_message_read.auto being false in this
 * test. Seems wrong, but it does make this test less complicated!
 */
add_task(async function testNextUnreadThread() {
  // In folder C, there are no threads. Going to the next unread thread is the
  // same as going to the next unread message. But as stated above, it does
  // mark the current message as read.
  about3Pane.displayFolder(folderC.URI);
  threadTree.selectedIndex = 0;
  assertSelectedMessage(folderCMessages[0]);
  await assertDisplayedMessage(folderCMessages[0]);

  goDoCommand("cmd_nextUnreadThread");
  assertSelectedMessage(folderCMessages[1]);
  await assertDisplayedMessage(folderCMessages[1]);

  goDoCommand("cmd_nextUnreadThread");
  assertSelectedMessage(folderCMessages[4]);
  await assertDisplayedMessage(folderCMessages[4]);

  // No more unread messages, we'll move to folder D.
  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  goDoCommand("cmd_nextUnreadThread");
  await dialogPromise;
  assertSelectedFolder(folderD);
  assertSelectedMessage(folderDMessages[0]);
  await assertDisplayedMessage(folderDMessages[0]);

  goDoCommand("cmd_nextUnreadThread");
  // The root message is read, we're looking at a single message in the thread.
  assertSelectedMessage(folderDMessages[8]);
  await assertDisplayedMessage(folderDMessages[8]);

  goDoCommand("cmd_nextUnreadThread");
  // The root message is unread.
  assertSelectedMessage(folderDMessages[9]);
  await assertDisplayedMessage(folderDMessages[9]);

  // No more unread messages, prompt to move to the next folder.
  // Cancel the prompt.
  dialogPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  goDoCommand("cmd_nextUnreadThread");
  await dialogPromise;
  assertSelectedMessage(folderDMessages[9]);

  threadTree.selectedIndex = -1;
  await assertNoDisplayedMessage();
});

/** Tests that navigation with a closed message pane does not load messages. */
add_task(async function testHiddenMessagePane() {
  about3Pane.paneLayout.messagePaneVisible = false;
  about3Pane.displayFolder(folderA.URI);
  threadTree.selectedIndex = 0;
  assertSelectedMessage(folderAMessages[0]);
  await assertNoDisplayedMessage();

  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  goDoCommand("cmd_nextMsg");
  assertSelectedMessage(folderAMessages[1]);
  await assertNoDisplayedMessage();

  goDoCommand("cmd_previousMsg");
  assertSelectedMessage(folderAMessages[0]);
  await assertNoDisplayedMessage();

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(f => setTimeout(f, 500));
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  threadTree.selectedIndex = -1;
  about3Pane.paneLayout.messagePaneVisible = true;
});

add_task(async function testMessageHistory() {
  const { messageHistory } = aboutMessage;
  messageHistory.clear();
  about3Pane.displayFolder(folderA.URI);
  threadTree.selectedIndex = 0;
  assertSelectedMessage(folderAMessages[0]);
  await assertDisplayedMessage(folderAMessages[0]);

  goDoCommand("cmd_nextMsg");
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(folderAMessages[1]);

  Assert.ok(messageHistory.canPop(-1), "Going back should be available");
  Assert.ok(
    !messageHistory.canPop(0),
    "Should not be able to go back to the current message"
  );
  Assert.ok(
    !messageHistory.canPop(1),
    "Should not have any message to go forward to"
  );
  Assert.ok(
    !window.getEnabledControllerForCommand("cmd_goForward"),
    "Go forward should be disabled"
  );

  goDoCommand("cmd_goBack");
  assertSelectedMessage(folderAMessages[0]);
  await assertDisplayedMessage(folderAMessages[0]);

  Assert.ok(!messageHistory.canPop(-1), "Should have no message to go back to");
  Assert.ok(messageHistory.canPop(1), "Should have a message to go forward to");
  Assert.ok(
    !window.getEnabledControllerForCommand("cmd_goBack"),
    "Go back should be disabled"
  );

  goDoCommand("cmd_goForward");
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(folderAMessages[1]);

  Assert.ok(messageHistory.canPop(-1), "Should have a message to go back to");
  Assert.ok(
    !messageHistory.canPop(1),
    "Should have no message to go forward to"
  );
  Assert.ok(
    window.getEnabledControllerForCommand("cmd_goBack"),
    "Go back should be enabled"
  );

  // Switching folder to test going back/forward between folders.
  about3Pane.displayFolder(folderB.URI);
  threadTree.selectedIndex = 0;
  assertSelectedMessage(folderBMessages[0]);
  await assertDisplayedMessage(folderBMessages[0]);

  Assert.ok(messageHistory.canPop(-1), "Should have a message to go back to");
  Assert.ok(
    !messageHistory.canPop(1),
    "Should have no message to go forward to"
  );
  Assert.ok(
    !window.getEnabledControllerForCommand("cmd_goForward"),
    "Go forward should be disabled"
  );

  goDoCommand("cmd_goBack");

  assertSelectedFolder(folderA);
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(folderAMessages[1]);

  Assert.ok(messageHistory.canPop(-1), "Should have a message to go back to");
  Assert.ok(messageHistory.canPop(1), "Should have a message to go forward to");
  Assert.ok(
    window.getEnabledControllerForCommand("cmd_goBack"),
    "Go back should be enabled"
  );

  goDoCommand("cmd_goForward");

  assertSelectedFolder(folderB);
  assertSelectedMessage(folderBMessages[0]);
  await assertDisplayedMessage(folderBMessages[0]);

  Assert.ok(messageHistory.canPop(-1), "Should have a message to go back to");
  Assert.ok(
    !messageHistory.canPop(1),
    "Should have no message to go forward to"
  );
  Assert.ok(
    !window.getEnabledControllerForCommand("cmd_goForward"),
    "Go forward should be disabled"
  );

  goDoCommand("cmd_goBack");

  assertSelectedFolder(folderA);
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(folderAMessages[1]);

  Assert.ok(messageHistory.canPop(-1), "Should have a message to go back to");
  Assert.ok(messageHistory.canPop(1), "Should have a message to go forward to");
  Assert.ok(
    window.getEnabledControllerForCommand("cmd_goBack"),
    "Go back should be enabled"
  );

  // Select a different message while going forward is possible, clearing the
  // previous forward history.

  goDoCommand("cmd_nextMsg");

  assertSelectedMessage(folderAMessages[2]);
  await assertDisplayedMessage(folderAMessages[2]);

  Assert.ok(messageHistory.canPop(-1), "Should have a message to go back to");
  Assert.ok(
    !messageHistory.canPop(1),
    "Should have no message to go forward to"
  );
  Assert.ok(
    !window.getEnabledControllerForCommand("cmd_goForward"),
    "Go forward should be disabled"
  );

  goDoCommand("cmd_goBack");

  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(folderAMessages[1]);

  Assert.ok(messageHistory.canPop(-1), "Should have a message to go back to");
  Assert.ok(messageHistory.canPop(1), "Should have a message to go forward to");
  Assert.ok(
    window.getEnabledControllerForCommand("cmd_goBack"),
    "Go back should be enabled"
  );

  // Remove the previous message in the history from the folder it was
  // displayed in.

  let movedMessage = folderAMessages[0];
  await moveMessage(folderA, movedMessage, folderB);

  Assert.ok(!messageHistory.canPop(-1), "Should have no message to go back to");
  Assert.ok(
    !window.getEnabledControllerForCommand("cmd_goBack"),
    "Go back should be disabled"
  );

  // Display no message, so going back goes to the previously displayed message,
  // which is also the current history entry.
  threadTree.selectedIndex = -1;
  await assertNoDisplayedMessage();

  Assert.ok(
    messageHistory.canPop(0),
    "Can go back to current history entry without selected message"
  );
  Assert.ok(
    window.getEnabledControllerForCommand("cmd_goForward"),
    "Go forward should be enabled"
  );

  goDoCommand("cmd_goBack");

  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(folderAMessages[1]);

  threadTree.selectedIndex = -1;
  let currentFolderBMessages = [...folderB.messages];
  movedMessage = currentFolderBMessages.find(
    message => !folderBMessages.includes(message)
  );
  await moveMessage(folderB, movedMessage, folderA);
});

function assertSelectedFolder(expected) {
  Assert.equal(about3Pane.gFolder.URI, expected.URI, "selected folder");
}

function assertSelectedMessage(expected, comment) {
  if (expected) {
    Assert.notEqual(
      threadTree.selectedIndex,
      -1,
      "a message should be selected"
    );
    Assert.equal(
      about3Pane.gDBView.getMsgHdrAt(threadTree.selectedIndex).messageId,
      expected.messageId,
      comment ?? "selected message"
    );
  } else {
    Assert.equal(threadTree.selectedIndex, -1, "no message should be selected");
  }
}

async function assertDisplayedMessage(expected) {
  let mailboxURL = expected.folder.getUriForMsg(expected);
  let messageURI = mailboxService.getUrlForUri(mailboxURL);

  if (
    messagePaneBrowser.webProgess?.isLoadingDocument ||
    !messagePaneBrowser.currentURI.equals(messageURI)
  ) {
    await BrowserTestUtils.browserLoaded(
      messagePaneBrowser,
      undefined,
      messageURI.spec
    );
  }
  Assert.equal(
    aboutMessage.gMessage.messageId,
    expected.messageId,
    "correct message loaded"
  );
  Assert.equal(
    messagePaneBrowser.currentURI.spec,
    messageURI.spec,
    "correct message displayed"
  );
}

async function assertDisplayedThread(firstMessage) {
  let items = multiMessageBrowser.contentDocument.querySelectorAll("li");
  Assert.equal(
    items[0].dataset.messageId,
    firstMessage.messageId,
    "correct thread displayed"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(multiMessageBrowser),
    "multimessageview visible"
  );
}

async function assertNoDisplayedMessage() {
  if (
    messagePaneBrowser.webProgess?.isLoadingDocument ||
    messagePaneBrowser.currentURI.spec != "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(
      messagePaneBrowser,
      undefined,
      "about:blank"
    );
  }

  Assert.equal(aboutMessage.gMessage, null, "no message loaded");
  Assert.equal(
    messagePaneBrowser.currentURI.spec,
    "about:blank",
    "no message displayed"
  );
  Assert.ok(BrowserTestUtils.is_hidden(messageBrowser), "about:message hidden");
}

function reportBadSelectEvent() {
  Assert.report(
    true,
    undefined,
    undefined,
    "should not have fired a select event"
  );
}

function reportBadLoad() {
  Assert.report(
    true,
    undefined,
    undefined,
    "should not have reloaded the message"
  );
}

function moveMessage(sourceFolder, message, targetFolder) {
  let copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    sourceFolder,
    [message],
    targetFolder,
    true,
    copyListener,
    window.msgWindow,
    true
  );
  return copyListener.promise;
}
