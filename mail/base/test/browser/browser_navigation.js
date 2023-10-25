/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

let tabmail = document.getElementById("tabmail");
let about3Pane = tabmail.currentAbout3Pane;
let { messageBrowser, multiMessageBrowser, threadTree } = about3Pane;
let mailboxService = MailServices.messageServiceFromURI("mailbox:");
let folderA,
  folderAMessages,
  folderB,
  folderBMessages,
  folderC,
  folderCMessages,
  folderD,
  folderDMessages;

add_setup(async function () {
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
  folderA.markAllMessagesRead(null);

  rootFolder.createSubfolder("Navigation B", null);
  folderB = rootFolder
    .getChildNamed("Navigation B")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderB.addMessageBatch(
    generator.makeMessages({ count: 5 }).map(message => message.toMboxString())
  );
  folderBMessages = [...folderB.messages];
  folderB.markAllMessagesRead(null);

  rootFolder.createSubfolder("Navigation C", null);
  folderC = rootFolder
    .getChildNamed("Navigation C")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  // Add a lot of messages so scrolling can be tested.
  folderC.addMessageBatch(
    generator
      .makeMessages({ count: 500 })
      .map(message => message.toMboxString())
  );
  folderC.addMessageBatch(
    generator.makeMessages({ count: 5 }).map(message => message.toMboxString())
  );
  folderCMessages = [...folderC.messages];
  folderC.markAllMessagesRead(null);

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
  folderD.markAllMessagesRead(null);

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mailnews.mark_message_read.auto");
  });
});

/** Tests the next message/previous message commands. */
add_task(async function testNextPreviousMessageInAbout3Pane() {
  const aboutMessage = messageBrowser.contentWindow;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  about3Pane.displayFolder(folderA.URI);
  assertSelectedMessage();
  await assertNoDisplayedMessage(aboutMessage);

  for (let i = 0; i < 5; i++) {
    goDoCommand("cmd_nextMsg");
    assertSelectedMessage(folderAMessages[i]);
    await assertDisplayedMessage(aboutMessage, folderAMessages[i]);
  }

  threadTree.addEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  goDoCommand("cmd_nextMsg");
  assertSelectedMessage(
    folderAMessages[4],
    "the selected message should not change"
  );
  await assertDisplayedMessage(aboutMessage, folderAMessages[4]);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  threadTree.removeEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  for (let i = 3; i >= 0; i--) {
    goDoCommand("cmd_previousMsg");
    assertSelectedMessage(folderAMessages[i]);
    await assertDisplayedMessage(aboutMessage, folderAMessages[i]);
  }

  threadTree.addEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  goDoCommand("cmd_previousMsg");
  assertSelectedMessage(
    folderAMessages[0],
    "the selected message should not change"
  );
  await assertDisplayedMessage(aboutMessage, folderAMessages[0]);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  threadTree.removeEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  threadTree.selectedIndex = -1;
  await assertNoDisplayedMessage(aboutMessage);
});

async function subtestNextPreviousMessage(win, aboutMessage) {
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  await assertDisplayedMessage(aboutMessage, folderAMessages[2]);

  for (let i = 3; i < 5; i++) {
    win.goDoCommand("cmd_nextMsg");
    await assertDisplayedMessage(aboutMessage, folderAMessages[i]);
  }

  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  win.goDoCommand("cmd_nextMsg");
  await assertDisplayedMessage(aboutMessage, folderAMessages[4]);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  for (let i = 3; i >= 0; i--) {
    win.goDoCommand("cmd_previousMsg");
    await assertDisplayedMessage(aboutMessage, folderAMessages[i]);
  }

  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  win.goDoCommand("cmd_previousMsg");
  await assertDisplayedMessage(aboutMessage, folderAMessages[0]);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);
}

/** Tests the next message/previous message commands in a message tab. */
add_task(async function testNextPreviousMessageInATab() {
  await withMessageInATab(folderAMessages[2], subtestNextPreviousMessage);
});

/** Tests the next message/previous message commands in a message window. */
add_task(async function testNextPreviousMessageInAWindow() {
  await withMessageInAWindow(folderAMessages[2], subtestNextPreviousMessage);
});

/** Tests the next unread message command. */
add_task(async function testNextUnreadMessageInAbout3Pane() {
  const aboutMessage = messageBrowser.contentWindow;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  folderA.markMessagesRead([folderAMessages[1], folderAMessages[3]], false);
  folderC.markMessagesRead(
    [folderCMessages[500], folderCMessages[501], folderCMessages[504]],
    false
  );
  folderD.markMessagesRead(
    [
      folderDMessages[3],
      folderDMessages[4],
      folderDMessages[6],
      folderDMessages[7],
    ],
    false
  );

  about3Pane.displayFolder(folderA.URI);
  threadTree.selectedIndex = -1;
  assertSelectedMessage();
  await assertNoDisplayedMessage(aboutMessage);

  // Select the first unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

  // Select the next unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderAMessages[3]);
  await assertDisplayedMessage(aboutMessage, folderAMessages[3]);

  // Select the next unread message. Loops to start of folder.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

  // Mark the message as read.
  goDoCommand("cmd_markAsRead");
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

  // Select the next unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderAMessages[3]);
  await assertDisplayedMessage(aboutMessage, folderAMessages[3]);

  // Select the next unread message. Changes to the next folder.
  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  goDoCommand("cmd_nextUnreadMsg");
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));
  assertSelectedFolder(folderC);
  assertSelectedMessage(folderCMessages[500]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[500]);

  // Select the next unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderCMessages[501]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[501]);

  // Select the next unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderCMessages[504]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[504]);

  // Select the first message in folder D and make sure all threads are
  // collapsed.
  about3Pane.displayFolder(folderD.URI);
  threadTree.selectedIndex = 0;
  let selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_collapseAllThreads");
  await selectPromise;
  assertSelectedMessage(folderDMessages[0]);

  // Go to the next thread without expanding it.
  EventUtils.synthesizeKey("KEY_ArrowDown");
  assertSelectedMessage(folderDMessages[3]);

  // The next displayed message should be the root message of the now expanded
  // thread.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderDMessages[3]);
  await assertDisplayedMessage(aboutMessage, folderDMessages[3]);

  // Select the next unread message in the thread.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderDMessages[4]);
  await assertDisplayedMessage(aboutMessage, folderDMessages[4]);

  // Select the next unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderDMessages[6]);
  await assertDisplayedMessage(aboutMessage, folderDMessages[6]);

  // Select the next unread message.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedMessage(folderDMessages[7]);
  await assertDisplayedMessage(aboutMessage, folderDMessages[7]);

  // Mark folder D read again.
  folderD.markAllMessagesRead(null);

  // Go back to the first folder. The previous selection should be restored.
  about3Pane.displayFolder(folderA.URI);
  assertSelectedMessage(folderAMessages[3]);
  await assertDisplayedMessage(aboutMessage, folderAMessages[3]);

  // Select the next unread message. Changes to the next folder.
  // The previous selection should NOT be restored.
  dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  goDoCommand("cmd_nextUnreadMsg");
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));
  assertSelectedFolder(folderC);
  assertSelectedMessage(folderCMessages[500]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[500]);

  folderC.markAllMessagesRead(null);
  // No more unread messages, prompt to move to the next folder.
  // Cancel the prompt.
  threadTree.addEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  dialogPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  goDoCommand("cmd_nextUnreadMsg");
  await dialogPromise;
  assertSelectedFolder(folderC);
  assertSelectedMessage(folderCMessages[500]);

  folderA.markAllMessagesRead(null);
  // No unread messages anywhere, do nothing.
  goDoCommand("cmd_nextUnreadMsg");
  assertSelectedFolder(folderC);
  assertSelectedMessage(folderCMessages[500]);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  threadTree.removeEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  threadTree.selectedIndex = -1;
  await assertNoDisplayedMessage(aboutMessage);
});

async function subtestNextUnreadMessage(win, aboutMessage) {
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  folderA.markMessagesRead([folderAMessages[1], folderAMessages[3]], false);
  folderC.markMessagesRead(
    [folderCMessages[500], folderCMessages[501], folderCMessages[504]],
    false
  );
  Assert.equal(folderC.getNumUnread(false), 3);

  await assertDisplayedMessage(aboutMessage, folderAMessages[0]);

  // Select the first unread message.
  win.goDoCommand("cmd_nextUnreadMsg");
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

  // Select the next unread message.
  win.goDoCommand("cmd_nextUnreadMsg");
  await assertDisplayedMessage(aboutMessage, folderAMessages[3]);

  // Select the next unread message. Loops to start of folder.
  win.goDoCommand("cmd_nextUnreadMsg");
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

  // Mark the message as read.
  win.goDoCommand("cmd_markAsRead");
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

  // Select the next unread message.
  win.goDoCommand("cmd_nextUnreadMsg");
  await assertDisplayedMessage(aboutMessage, folderAMessages[3]);

  // Select the next unread message. Changes to the next folder.
  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  win.goDoCommand("cmd_nextUnreadMsg");
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));
  await assertDisplayedMessage(aboutMessage, folderCMessages[500]);

  // Select the next unread message.
  win.goDoCommand("cmd_nextUnreadMsg");
  await assertDisplayedMessage(aboutMessage, folderCMessages[501]);

  // Select the next unread message.
  win.goDoCommand("cmd_nextUnreadMsg");
  await assertDisplayedMessage(aboutMessage, folderCMessages[504]);

  folderC.markAllMessagesRead(null);
  // No more unread messages, prompt to move to the next folder.
  // Cancel the prompt.
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  dialogPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  win.goDoCommand("cmd_nextUnreadMsg");
  await dialogPromise;

  folderA.markAllMessagesRead(null);
  // No unread messages anywhere, do nothing.
  win.goDoCommand("cmd_nextUnreadMsg");

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);
}

/** Tests the next unread message command in a message tab. */
add_task(async function testNextUnreadMessageInATab() {
  await withMessageInATab(folderAMessages[0], subtestNextUnreadMessage);
});

/** Tests the next unread message command in a message window. */
add_task(async function testNextUnreadMessageInAWindow() {
  await withMessageInAWindow(folderAMessages[0], subtestNextUnreadMessage);
});

/** Tests the previous unread message command. This doesn't cross folders. */
add_task(async function testPreviousUnreadMessageInAbout3Pane() {
  const aboutMessage = messageBrowser.contentWindow;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  folderA.markMessagesRead([folderAMessages[1], folderAMessages[3]], false);
  folderC.markMessagesRead(
    [folderCMessages[500], folderCMessages[501], folderCMessages[504]],
    false
  );

  about3Pane.displayFolder(folderC.URI);
  threadTree.scrollToIndex(504, true);
  // Ensure the scrolling from the previous line happens.
  await new Promise(resolve => requestAnimationFrame(resolve));
  threadTree.selectedIndex = 504;
  assertSelectedMessage(folderCMessages[504]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[504]);

  goDoCommand("cmd_previousUnreadMsg");
  assertSelectedMessage(folderCMessages[501]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[501]);

  goDoCommand("cmd_previousUnreadMsg");
  assertSelectedMessage(folderCMessages[500]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[500]);

  threadTree.addEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  goDoCommand("cmd_previousUnreadMsg");
  assertSelectedMessage(folderCMessages[500]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[500]);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  threadTree.removeEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  threadTree.selectedIndex = -1;
  await assertNoDisplayedMessage(aboutMessage);
});

async function subtestPreviousUnreadMessage(win, aboutMessage) {
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  folderA.markMessagesRead([folderAMessages[1], folderAMessages[3]], false);
  folderC.markMessagesRead(
    [folderCMessages[500], folderCMessages[501], folderCMessages[504]],
    false
  );

  await assertDisplayedMessage(aboutMessage, folderCMessages[504]);

  win.goDoCommand("cmd_previousUnreadMsg");
  await assertDisplayedMessage(aboutMessage, folderCMessages[501]);

  win.goDoCommand("cmd_previousUnreadMsg");
  await assertDisplayedMessage(aboutMessage, folderCMessages[500]);

  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  win.goDoCommand("cmd_previousUnreadMsg");
  await assertDisplayedMessage(aboutMessage, folderCMessages[500]);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);
}

/** Tests the previous unread message command in a message tab. */
add_task(async function testPreviousUnreadMessageInATab() {
  await withMessageInATab(folderCMessages[504], subtestPreviousUnreadMessage);
});

/** Tests the previous unread message command in a message window. */
add_task(async function testPreviousUnreadMessageInAWindow() {
  await withMessageInAWindow(
    folderCMessages[504],
    subtestPreviousUnreadMessage
  );
});

/**
 * Tests the next unread thread command. This command depends on marking the
 * thread as read, despite mailnews.mark_message_read.auto being false in this
 * test. Seems wrong, but it does make this test less complicated!
 */
add_task(async function testNextUnreadThreadInAbout3Pane() {
  const aboutMessage = messageBrowser.contentWindow;

  folderC.markMessagesRead(
    [folderCMessages[500], folderCMessages[501], folderCMessages[504]],
    false
  );
  folderD.markMessagesRead(
    [
      folderDMessages[0],
      folderDMessages[1],
      folderDMessages[2],
      folderDMessages[8],
      folderDMessages[9],
      folderDMessages[10],
      folderDMessages[11],
    ],
    false
  );

  // In folder C, there are no threads. Going to the next unread thread is the
  // same as going to the next unread message. But as stated above, it does
  // mark the current message as read.
  about3Pane.displayFolder(folderC.URI);
  threadTree.scrollToIndex(504, true);
  // Ensure the scrolling from the previous line happens.
  await new Promise(resolve => requestAnimationFrame(resolve));
  threadTree.selectedIndex = 500;
  assertSelectedMessage(folderCMessages[500]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[500]);

  goDoCommand("cmd_nextUnreadThread");
  assertSelectedMessage(folderCMessages[501]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[501]);

  goDoCommand("cmd_nextUnreadThread");
  assertSelectedMessage(folderCMessages[504]);
  await assertDisplayedMessage(aboutMessage, folderCMessages[504]);

  // No more unread messages, we'll move to folder D.
  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  goDoCommand("cmd_nextUnreadThread");
  await dialogPromise;
  assertSelectedFolder(folderD);
  assertSelectedMessage(folderDMessages[0]);
  await assertDisplayedMessage(aboutMessage, folderDMessages[0]);

  goDoCommand("cmd_nextUnreadThread");
  // The root message is read, we're looking at a single message in the thread.
  assertSelectedMessage(folderDMessages[8]);
  await assertDisplayedMessage(aboutMessage, folderDMessages[8]);

  goDoCommand("cmd_nextUnreadThread");
  // The root message is unread.
  assertSelectedMessage(folderDMessages[9]);
  await assertDisplayedMessage(aboutMessage, folderDMessages[9]);

  // No more unread messages, prompt to move to the next folder.
  // Cancel the prompt.
  dialogPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  goDoCommand("cmd_nextUnreadThread");
  await dialogPromise;
  assertSelectedMessage(folderDMessages[9]);

  threadTree.selectedIndex = -1;
  await assertNoDisplayedMessage(aboutMessage);
});

async function subtestNextUnreadThread(win, aboutMessage) {
  folderC.markMessagesRead(
    [folderCMessages[500], folderCMessages[501], folderCMessages[504]],
    false
  );
  folderD.markMessagesRead(
    [
      folderDMessages[0],
      folderDMessages[1],
      folderDMessages[2],
      folderDMessages[8],
      folderDMessages[9],
      folderDMessages[10],
      folderDMessages[11],
    ],
    false
  );

  await assertDisplayedMessage(aboutMessage, folderCMessages[500]);

  win.goDoCommand("cmd_nextUnreadThread");
  await assertDisplayedMessage(aboutMessage, folderCMessages[501]);

  win.goDoCommand("cmd_nextUnreadThread");
  await assertDisplayedMessage(aboutMessage, folderCMessages[504]);

  // No more unread messages, we'll move to folder D.
  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  win.goDoCommand("cmd_nextUnreadThread");
  await dialogPromise;
  await assertDisplayedMessage(aboutMessage, folderDMessages[0]);

  win.goDoCommand("cmd_nextUnreadThread");
  // The root message is read, we're looking at a single message in the thread.
  await assertDisplayedMessage(aboutMessage, folderDMessages[8]);

  win.goDoCommand("cmd_nextUnreadThread");
  // The root message is unread.
  await assertDisplayedMessage(aboutMessage, folderDMessages[9]);

  // No more unread messages, prompt to move to the next folder.
  // Cancel the prompt.
  dialogPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  win.goDoCommand("cmd_nextUnreadThread");
  await dialogPromise;
}

/** Tests the next unread thread command in a message tab. */
add_task(async function testNextUnreadThreadInATab() {
  await withMessageInATab(folderCMessages[500], subtestNextUnreadThread);
});

/** Tests the next unread thread command in a message window. */
add_task(async function testNextUnreadThreadInAWindow() {
  await withMessageInAWindow(folderCMessages[500], subtestNextUnreadThread);
});

/** Tests that navigation with a closed message pane does not load messages. */
add_task(async function testHiddenMessagePaneInAbout3Pane() {
  const aboutMessage = messageBrowser.contentWindow;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  about3Pane.paneLayout.messagePaneVisible = false;
  about3Pane.displayFolder(folderA.URI);
  threadTree.selectedIndex = 0;
  assertSelectedMessage(folderAMessages[0]);
  await assertNoDisplayedMessage(aboutMessage);

  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  goDoCommand("cmd_nextMsg");
  assertSelectedMessage(folderAMessages[1]);
  await assertNoDisplayedMessage(aboutMessage);

  goDoCommand("cmd_previousMsg");
  assertSelectedMessage(folderAMessages[0]);
  await assertNoDisplayedMessage(aboutMessage);

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  threadTree.selectedIndex = -1;
  about3Pane.paneLayout.messagePaneVisible = true;
});

/** Tests the go back/forward commands. */
add_task(async function testMessageHistoryInAbout3Pane() {
  const aboutMessage = messageBrowser.contentWindow;
  const { messageHistory } = aboutMessage;
  messageHistory.clear();
  about3Pane.displayFolder(folderA.URI);
  threadTree.selectedIndex = 0;
  assertSelectedMessage(folderAMessages[0]);
  await assertDisplayedMessage(aboutMessage, folderAMessages[0]);

  goDoCommand("cmd_nextMsg");
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

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
  await assertDisplayedMessage(aboutMessage, folderAMessages[0]);

  Assert.ok(!messageHistory.canPop(-1), "Should have no message to go back to");
  Assert.ok(messageHistory.canPop(1), "Should have a message to go forward to");
  Assert.ok(
    !window.getEnabledControllerForCommand("cmd_goBack"),
    "Go back should be disabled"
  );

  goDoCommand("cmd_goForward");
  assertSelectedMessage(folderAMessages[1]);
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

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
  await assertDisplayedMessage(aboutMessage, folderBMessages[0]);

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
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

  Assert.ok(messageHistory.canPop(-1), "Should have a message to go back to");
  Assert.ok(messageHistory.canPop(1), "Should have a message to go forward to");
  Assert.ok(
    window.getEnabledControllerForCommand("cmd_goBack"),
    "Go back should be enabled"
  );

  goDoCommand("cmd_goForward");

  assertSelectedFolder(folderB);
  assertSelectedMessage(folderBMessages[0]);
  await assertDisplayedMessage(aboutMessage, folderBMessages[0]);

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
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

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
  await assertDisplayedMessage(aboutMessage, folderAMessages[2]);

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
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

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
  await assertNoDisplayedMessage(aboutMessage);

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
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

  threadTree.selectedIndex = -1;
  let currentFolderBMessages = [...folderB.messages];
  movedMessage = currentFolderBMessages.find(
    message => !folderBMessages.includes(message)
  );
  await moveMessage(folderB, movedMessage, folderA);
  folderAMessages = [...folderA.messages];
});

async function subtestMessageHistory(win, aboutMessage) {
  const { messageHistory } = aboutMessage;
  await assertDisplayedMessage(aboutMessage, folderAMessages[0]);

  Assert.ok(win.getEnabledControllerForCommand("cmd_nextMsg"));
  win.goDoCommand("cmd_nextMsg");
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

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
    !win.getEnabledControllerForCommand("cmd_goForward"),
    "Go forward should be disabled"
  );

  Assert.ok(win.getEnabledControllerForCommand("cmd_goBack"));
  win.goDoCommand("cmd_goBack");
  await assertDisplayedMessage(aboutMessage, folderAMessages[0]);

  Assert.ok(!messageHistory.canPop(-1), "Should have no message to go back to");
  Assert.ok(messageHistory.canPop(1), "Should have a message to go forward to");
  Assert.ok(
    !win.getEnabledControllerForCommand("cmd_goBack"),
    "Go back should be disabled"
  );

  Assert.ok(win.getEnabledControllerForCommand("cmd_goForward"));
  win.goDoCommand("cmd_goForward");
  await assertDisplayedMessage(aboutMessage, folderAMessages[1]);

  Assert.ok(messageHistory.canPop(-1), "Should have a message to go back to");
  Assert.ok(
    !messageHistory.canPop(1),
    "Should have no message to go forward to"
  );
  Assert.ok(
    win.getEnabledControllerForCommand("cmd_goBack"),
    "Go back should be enabled"
  );
}

/** Tests the go back/forward commands in a message tab. */
add_task(async function testMessageHistoryInATab() {
  await withMessageInATab(folderAMessages[0], subtestMessageHistory);
});

/** Tests the go back/forward commands in a message window. */
add_task(async function testMessageHistoryInAWindow() {
  await withMessageInAWindow(folderAMessages[0], subtestMessageHistory);
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
    Assert.ok(
      threadTree.getRowAtIndex(threadTree.selectedIndex),
      "row for selected message should exist and be in view"
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

async function assertDisplayedMessage(aboutMessage, expected) {
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();
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

async function assertNoDisplayedMessage(aboutMessage) {
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();
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

async function withMessageInATab(message, subtest) {
  let tabPromise = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  window.OpenMessageInNewTab(message, { background: false });
  await tabPromise;
  await new Promise(resolve => setTimeout(resolve));

  await subtest(window, tabmail.currentAboutMessage);

  tabmail.closeOtherTabs(0);
}

async function withMessageInAWindow(message, subtest) {
  let winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.MsgOpenNewWindowForMessage(message);
  let win = await winPromise;
  await BrowserTestUtils.waitForEvent(win, "MsgLoaded");
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);

  await subtest(win, win.messageBrowser.contentWindow);

  await BrowserTestUtils.closeWindow(win);
}
