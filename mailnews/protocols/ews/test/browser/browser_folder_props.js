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

add_setup(async function () {
  [ewsServer, incomingServer] = setupEwsTestServer();
});

/**
 * Test that the correct options and strings are shown in the folder properties
 * dialog.
 */
add_task(async function test_folder_props() {
  // Create a new folder for our test with a few messages in it, on the server.
  const folderName = "folderProps";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, null)
  );

  // Sync the folder.
  const rootFolder = incomingServer.rootFolder;
  const listener = new PromiseTestUtils.PromiseUrlListener();
  incomingServer.getNewMessages(rootFolder, null, listener);
  await listener.promise;

  // Open the folder properties dialog.
  const folder = rootFolder.getChildNamed(folderName);
  const dialogWindow = await openFolderProperties(folder);
  const dialogDocument = dialogWindow.document;

  // Check the visible tabs.
  Assert.ok(
    dialogDocument.getElementById("SharingTab").hidden,
    "the sharing tab should be hidden"
  );

  Assert.ok(
    dialogDocument.getElementById("QuotaTab").hidden,
    "the quota tab should be hidden"
  );

  // Check the Retention tab.
  const visibleDesc = dialogDocument.querySelectorAll(
    "#RetentionPanel description:not([hidden])"
  );
  Assert.equal(
    visibleDesc.length,
    1,
    "there should be one visible description element in the retention tab"
  );
  Assert.ok(
    !visibleDesc[0].textContent.includes("the remote server"),
    "the description shown should not be the one for IMAP or POP"
  );

  // Check the Synchronization tab.
  Assert.ok(
    BrowserTestUtils.isVisible(
      dialogDocument.getElementById("offline.selectForOfflineFolder")
    ),
    "the label for folders in the sync tab should be visible"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      dialogDocument.getElementById("offline.selectForOfflineNewsgroup")
    ),
    "the label for newsgroups in the sync tab should be hidden"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(
      dialogDocument.getElementById("offline.offlineFolderDownloadButton")
    ),
    "the button for folders in the sync tab should be visible"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      dialogDocument.getElementById("offline.offlineNewsgroupDownloadButton")
    ),
    "the button for newsgroups in the sync tab should be hidden"
  );

  // Close the dialog window. We can't do it as a cleanup action since it needs
  // to be async.
  const windowClosedPromise = BrowserTestUtils.domWindowClosed(dialogWindow);
  EventUtils.synthesizeMouseAtCenter(
    dialogDocument.querySelector("dialog").getButton("accept"),
    {},
    dialogWindow
  );
  await windowClosedPromise;
});
