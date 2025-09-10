/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var ewsServer;
var incomingServer;

const generator = new MessageGenerator();

/**
 * Open the folder properties window for a given folder. This function has been
 * largely copied from the one with the same name in
 * mail/base/test/browser/browser_repairFolder.js.
 *
 * @param {nsIMsgFolder} folder - The folder which properties to open.
 * @returns {object} - An object with two functions: `repairFolder()` which
 *   clicks on the "Repair Folder" button, and `accept()`, which is async and
 *   closes the folder properties window.
 */
async function openFolderProperties(folder) {
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  const { folderPane } = about3Pane;

  const folderPaneContext =
    about3Pane.document.getElementById("folderPaneContext");
  const folderPaneContextProperties = about3Pane.document.getElementById(
    "folderPaneContext-properties"
  );

  EventUtils.synthesizeMouseAtCenter(
    folderPane.getRowForFolder(folder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(folderPaneContext, "shown");

  const windowOpenedPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  folderPaneContext.activateItem(folderPaneContextProperties);
  const dialogWindow = await windowOpenedPromise;
  const dialogDocument = dialogWindow.document;

  const repairButton = dialogDocument.getElementById(
    "folderRebuildSummaryButton"
  );
  const folderPropertiesDialog = dialogDocument.querySelector("dialog");

  return {
    repairFolder() {
      EventUtils.synthesizeMouseAtCenter(repairButton, {}, dialogWindow);
    },
    async accept() {
      const windowClosedPromise =
        BrowserTestUtils.domWindowClosed(dialogWindow);
      EventUtils.synthesizeMouseAtCenter(
        folderPropertiesDialog.getButton("accept"),
        {},
        dialogWindow
      );
      await windowClosedPromise;
    },
  };
}

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

  // Trigger the repair and wait for the folder to be fully loaded.
  const dialog = await openFolderProperties(folder);
  eventPromise = PromiseTestUtils.promiseFolderEvent(folder, "FolderLoaded");
  dialog.repairFolder();
  await dialog.accept();
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
