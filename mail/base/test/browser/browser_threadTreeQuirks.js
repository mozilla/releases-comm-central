/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

let about3Pane = document.getElementById("tabmail").currentAbout3Pane;
let threadTree = about3Pane.threadTree;
// Not `currentAboutMessage` as (a) that's null right now, and (b) we'll be
// testing things that happen when about:message is hidden.
let aboutMessage = about3Pane.messageBrowser.contentWindow;
let messagePaneBrowser = aboutMessage.getMessagePaneBrowser();
let rootFolder, folderA, folderB, trashFolder, sourceMessages, sourceMessageIDs;

add_setup(async function() {
  let generator = new MessageGenerator();

  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("folder a", null);
  folderA = rootFolder
    .getChildNamed("folder a")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  rootFolder.createSubfolder("folder b", null);
  folderB = rootFolder.getChildNamed("folder b");
  trashFolder = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);

  // Make some messages, then change their dates to simulate a different order.
  let syntheticMessages = generator.makeMessages({
    count: 15,
    msgsPerThread: 5,
  });
  syntheticMessages[1].date = generator.makeDate();
  syntheticMessages[2].date = generator.makeDate();
  syntheticMessages[3].date = generator.makeDate();
  syntheticMessages[4].date = generator.makeDate();

  folderA.addMessageBatch(
    syntheticMessages.map(message => message.toMboxString())
  );
  sourceMessages = [...folderA.messages];
  sourceMessageIDs = sourceMessages.map(m => m.messageId);

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testExpandCollapseUpdates() {
  about3Pane.restoreState({
    messagePaneVisible: true,
    folderURI: folderA.URI,
  });

  // Clicking the twisty to collapse a row should update the message display.
  goDoCommand("cmd_expandAllThreads");
  threadTree.selectedIndex = 5;
  await messageLoaded(10);

  let selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(5).querySelector(".twisty"),
    {},
    about3Pane
  );
  await selectPromise;
  Assert.equal(threadTree.view.rowCount, 11, "thread collapsed");
  Assert.equal(threadTree.selectedIndex, 5, "thread root still selected");
  Assert.ok(
    BrowserTestUtils.is_hidden(about3Pane.messageBrowser),
    "messageBrowser became hidden"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(about3Pane.multiMessageBrowser),
    "multiMessageBrowser became visible"
  );

  // Clicking the twisty to expand a row should update the message display.
  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(5).querySelector(".twisty"),
    {},
    about3Pane
  );
  await selectPromise;
  Assert.equal(threadTree.view.rowCount, 15, "thread expanded");
  Assert.equal(threadTree.selectedIndex, 5, "thread root still selected");
  Assert.ok(
    BrowserTestUtils.is_hidden(about3Pane.multiMessageBrowser),
    "multiMessageBrowser became hidden"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(about3Pane.messageBrowser),
    "messageBrowser became visible"
  );
  await messageLoaded(10);

  // Collapsing all rows while the first message in a thread is selected should
  // update the message display.
  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_collapseAllThreads");
  await selectPromise;
  Assert.equal(threadTree.view.rowCount, 3, "all threads collapsed");
  Assert.equal(threadTree.selectedIndex, 1, "thread root still selected");
  Assert.ok(
    BrowserTestUtils.is_hidden(about3Pane.messageBrowser),
    "messageBrowser became hidden"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(about3Pane.multiMessageBrowser),
    "multiMessageBrowser became visible"
  );

  // Expanding all rows while the first message in a thread is selected should
  // update the message display.
  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_expandAllThreads");
  await selectPromise;
  Assert.equal(threadTree.view.rowCount, 15, "all threads expanded");
  Assert.equal(threadTree.selectedIndex, 5, "thread root still selected");
  Assert.ok(
    BrowserTestUtils.is_hidden(about3Pane.multiMessageBrowser),
    "multiMessageBrowser became hidden"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(about3Pane.messageBrowser),
    "messageBrowser became visible"
  );
  await messageLoaded(10);

  // Collapsing all rows while a message inside a thread is selected should
  // select the first message in the thread and update the message display.
  threadTree.selectedIndex = 2;
  await messageLoaded(7);

  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_collapseAllThreads");
  await selectPromise;
  Assert.equal(threadTree.view.rowCount, 3, "all threads collapsed");
  Assert.equal(threadTree.selectedIndex, 0, "thread root became selected");
  Assert.ok(
    BrowserTestUtils.is_hidden(about3Pane.messageBrowser),
    "messageBrowser became hidden"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(about3Pane.multiMessageBrowser),
    "multiMessageBrowser became visible"
  );

  // Expanding all rows while the first message in a thread is selected should
  // update the message display. (This is effectively the same test as earlier.)
  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_expandAllThreads");
  await selectPromise;
  Assert.equal(threadTree.view.rowCount, 15, "all threads expanded");
  Assert.equal(threadTree.selectedIndex, 0, "thread root still selected");
  Assert.ok(
    BrowserTestUtils.is_hidden(about3Pane.multiMessageBrowser),
    "multiMessageBrowser became hidden"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(about3Pane.messageBrowser),
    "messageBrowser became visible"
  );
  await messageLoaded(5);

  // Select several things and collapse all.
  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  threadTree.selectedIndices = [2, 3, 5];
  await selectPromise;
  Assert.ok(
    BrowserTestUtils.is_hidden(about3Pane.messageBrowser),
    "messageBrowser became hidden"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(about3Pane.multiMessageBrowser),
    "multiMessageBrowser became visible"
  );

  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_collapseAllThreads");
  await selectPromise;
  Assert.equal(threadTree.view.rowCount, 3, "all threads collapsed");
  Assert.deepEqual(
    threadTree.selectedIndices,
    [0, 1],
    "thread roots became selected"
  );
  Assert.ok(
    BrowserTestUtils.is_hidden(about3Pane.messageBrowser),
    "messageBrowser stayed hidden"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(about3Pane.multiMessageBrowser),
    "multiMessageBrowser stayed visible"
  );
});

add_task(async function testThreadUpdateKeepsSelection() {
  about3Pane.restoreState({
    messagePaneVisible: true,
    folderURI: folderB.URI,
  });

  // Put some messages from different threads in the folder and select one.
  await move([sourceMessages[0]], folderA, folderB);
  await move([sourceMessages[5]], folderA, folderB);
  threadTree.selectedIndex = 1;
  await messageLoaded(5);

  // Move a "newer" message into the folder. This should switch the order of
  // the threads, but no selection change should occur.
  threadTree.addEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  await move([sourceMessages[1]], folderA, folderB);
  Assert.equal(threadTree.selectedIndex, 0, "selection should have moved");
  Assert.equal(
    aboutMessage.gMessage.messageId,
    sourceMessageIDs[5],
    "correct message still loaded"
  );

  // Wait to prove bad things didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(f => setTimeout(f, 500));

  threadTree.removeEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  await restoreMessages();
});

add_task(async function testArchiveDeleteUpdates() {
  about3Pane.restoreState({
    messagePaneVisible: true,
    folderURI: folderA.URI,
  });
  about3Pane.sortController.sortUnthreaded();

  threadTree.focus();
  threadTree.selectedIndex = 3;
  await messageLoaded(7);

  let selectCount = 0;
  let onSelect = () => selectCount++;
  threadTree.addEventListener("select", onSelect);

  let selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_delete");
  await selectPromise;
  Assert.equal(selectCount, 1, "'select' event should've happened only once");
  Assert.equal(threadTree.selectedIndex, 3, "selection should have updated");
  await messageLoaded(8);

  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_delete");
  await selectPromise;
  Assert.equal(selectCount, 2, "'select' event should've happened only once");
  Assert.equal(threadTree.selectedIndex, 3, "selection should have updated");
  await messageLoaded(9);

  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_archive");
  await selectPromise;
  Assert.equal(selectCount, 3, "'select' event should've happened only once");
  Assert.equal(threadTree.selectedIndex, 3, "selection should have updated");
  await messageLoaded(10);

  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_archive");
  await selectPromise;
  Assert.equal(selectCount, 4, "'select' event should've happened only once");
  Assert.equal(threadTree.selectedIndex, 3, "selection should have updated");
  await messageLoaded(11);

  selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  goDoCommand("cmd_delete");
  await selectPromise;
  Assert.equal(selectCount, 5, "'select' event should've happened only once");
  Assert.equal(threadTree.selectedIndex, 3, "selection should have updated");
  await messageLoaded(12);

  threadTree.removeEventListener("select", onSelect);

  await restoreMessages();
});

add_task(async function testMessagePaneSelection() {
  await move(sourceMessages.slice(6, 9), folderA, folderB);
  about3Pane.restoreState({
    messagePaneVisible: true,
    folderURI: folderB.URI,
  });
  about3Pane.sortController.sortUnthreaded();
  about3Pane.sortController.sortThreadPane("byDate");
  about3Pane.sortController.sortDescending();

  threadTree.focus();
  threadTree.selectedIndex = 1;
  await messageLoaded(7);

  // Check the initial selection in about:message.
  Assert.equal(aboutMessage.gDBView.selection.getRangeCount(), 1);
  let min = {},
    max = {};
  aboutMessage.gDBView.selection.getRangeAt(0, min, max);
  Assert.equal(min.value, 1);
  Assert.equal(max.value, 1);

  // Add a new message to the folder, which should appear first.
  threadTree.addEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  await move(sourceMessages.slice(9, 10), folderA, folderB);

  Assert.deepEqual(
    Array.from(folderB.messages, m => m.messageId),
    sourceMessageIDs.slice(6, 10),
    "all expected messages are in the folder"
  );

  // Check the selection in about:message.
  Assert.equal(aboutMessage.gDBView.selection.getRangeCount(), 1);
  aboutMessage.gDBView.selection.getRangeAt(0, min, max);
  Assert.equal(min.value, 2);
  Assert.equal(max.value, 2);

  // Wait to prove unwanted selection or load didn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(f => setTimeout(f, 500));
  threadTree.removeEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.removeEventListener("load", reportBadLoad, true);

  // Now click the delete button in about:message.
  let deletePromise = PromiseTestUtils.promiseFolderEvent(
    folderB,
    "DeleteOrMoveMsgCompleted"
  );
  let loadPromise = messageLoaded(6);
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("hdrTrashButton"),
    {},
    aboutMessage
  );
  await Promise.all([deletePromise, loadPromise]);

  // Check which message was deleted.
  Assert.deepEqual(
    Array.from(trashFolder.messages, m => m.messageId),
    [sourceMessageIDs[7]],
    "the right message was deleted"
  );
  Assert.deepEqual(
    Array.from(folderB.messages, m => m.messageId),
    [sourceMessageIDs[6], sourceMessageIDs[8], sourceMessageIDs[9]],
    "the right messages were kept"
  );

  // Check the selection in about:message again.
  Assert.equal(aboutMessage.gDBView.selection.getRangeCount(), 1);
  aboutMessage.gDBView.selection.getRangeAt(0, min, max);
  Assert.equal(min.value, 2);
  Assert.equal(max.value, 2);

  await restoreMessages();
});

async function messageLoaded(index) {
  await BrowserTestUtils.browserLoaded(messagePaneBrowser);
  Assert.equal(
    aboutMessage.gMessage.messageId,
    sourceMessageIDs[index],
    "correct message loaded"
  );
}

async function move(messages, source, dest) {
  let copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    source,
    messages,
    dest,
    true,
    copyListener,
    top.msgWindow,
    false
  );
  await copyListener.promise;
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

async function restoreMessages() {
  // Move all of the messages back to folder A.
  await move([...folderB.messages], folderB, folderA);
  let archiveFolder = rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Archive
  );
  if (archiveFolder) {
    for (let folder of archiveFolder.subFolders) {
      await move([...folder.messages], folder, folderA);
    }
  }
  await move([...trashFolder.messages], trashFolder, folderA);

  // Restore all of the messages in `sourceMessages`, in the right order.
  sourceMessages = [...folderA.messages].sort(
    (a, b) =>
      sourceMessageIDs.indexOf(a.messageId) -
      sourceMessageIDs.indexOf(b.messageId)
  );
}
