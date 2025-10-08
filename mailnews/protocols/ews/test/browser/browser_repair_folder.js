/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var ewsServer;
var incomingServer;

const generator = new MessageGenerator();

add_setup(async function () {
  [ewsServer, incomingServer] = setupEwsTestServer();
});

/**
 * Test that repairing a folder triggers a resync of the folder's message list
 * from scratch.
 */
add_task(async function test_repair_folder() {
  // Create a new folder for our test with a few messages in it, on the server.
  const folderName = "repairFolder";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, null)
  );

  ewsServer.addMessages(folderName, generator.makeMessages({ count: 3 }));

  const rootFolder = incomingServer.rootFolder;
  const listener = new PromiseTestUtils.PromiseUrlListener();
  incomingServer.getNewMessages(rootFolder, null, listener);
  await listener.promise;

  const folder = rootFolder.getChildNamed(folderName);
  await TestUtils.waitForCondition(
    () => [...folder.messages].length == 3,
    "the folder should eventually be populated with three messages"
  );

  let messages = [...folder.messages];

  // "Corrupt" the EWS ID of each message by changing it to a value that isn't
  // the one the server knows; also store the original ID so we can compare it
  // later.
  const originalEwsIds = [];
  for (const message of messages) {
    const ewsId = message.getStringProperty("ewsId");
    originalEwsIds.push(ewsId);
    message.setStringProperty("ewsId", ewsId + "-corrupted");
  }

  // As a baseline for the rest of the test, confirm that all messages have the
  // expected corrupted index.
  for (const [index, message] of messages.entries()) {
    const actualEwsId = message.getStringProperty("ewsId");
    const expectedEwsId = originalEwsIds[index] + "-corrupted";
    Assert.equal(
      actualEwsId,
      expectedEwsId,
      `the message at index ${index} should have the expected corrupted index`
    );
  }

  // Ensure the folder is shown and fully loaded (the latter part is important
  // so no extraneous `FolderLoaded` event is emitted before the repair
  // finishes).
  let eventPromise = PromiseTestUtils.promiseFolderEvent(
    folder,
    "FolderLoaded"
  );
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(folder);
  await eventPromise;

  // Open the folder properties dialog so we can trigger the repair operation.
  const dialogWindow = await openFolderProperties(folder);

  const repairButton = dialogWindow.document.getElementById(
    "folderRebuildSummaryButton"
  );
  const folderPropertiesDialog = dialogWindow.document.querySelector("dialog");

  // Trigger the repair and wait for the folder to be fully loaded.
  eventPromise = PromiseTestUtils.promiseFolderEvent(folder, "FolderLoaded");

  EventUtils.synthesizeMouseAtCenter(repairButton, {}, dialogWindow);
  const windowClosedPromise = BrowserTestUtils.domWindowClosed(dialogWindow);
  EventUtils.synthesizeMouseAtCenter(
    folderPropertiesDialog.getButton("accept"),
    {},
    dialogWindow
  );
  await windowClosedPromise;

  await eventPromise;

  // Check that the messages have all been reloaded and now have the correct,
  // un-"corrupted" IDs.
  messages = [...folder.messages];
  for (const [index, message] of messages.entries()) {
    const actualEwsId = message.getStringProperty("ewsId");
    const expectedEwsId = originalEwsIds[index];
    Assert.equal(
      actualEwsId,
      expectedEwsId,
      `the message at index ${index} should have the expected index`
    );
  }
});
