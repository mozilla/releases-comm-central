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
let threadTree = about3Pane.threadTree;
let messagePaneBrowser = aboutMessage.getMessagePaneBrowser();
let rootFolder, folderA, folderB, sourceMessages, sourceMessageIDs;

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

  await BrowserTestUtils.browserLoaded(messagePaneBrowser);

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testThreadUpdateKeepsSelection() {
  about3Pane.restoreState({
    messagePaneVisible: true,
    folderURI: folderB.URI,
  });

  // Put some messages from different threads in the folder and select one.
  await move(0);
  await move(5);
  threadTree.selectedIndex = 1;
  await BrowserTestUtils.browserLoaded(messagePaneBrowser);
  Assert.equal(
    aboutMessage.gMessage.messageId,
    sourceMessageIDs[5],
    "correct message loaded"
  );

  // Move a "newer" message into the folder. This should switch the order of
  // the threads, but no selection change should occur.
  threadTree.addEventListener("select", reportBadSelectEvent);
  messagePaneBrowser.addEventListener("load", reportBadLoad, true);
  await move(1);
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
});

async function move(index) {
  let copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    folderA,
    [sourceMessages[index]],
    folderB,
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
