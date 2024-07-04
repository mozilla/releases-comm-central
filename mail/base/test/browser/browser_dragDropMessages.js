/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);
const mailboxService = MailServices.messageServiceFromURI("mailbox:");

const generator = new MessageGenerator();
const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const { folderPane, threadTree } = about3Pane;
let rootFolder, sourceFolder, destFolder;

add_setup(async function () {
  const account = MailServices.accounts.createLocalMailAccount();

  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  sourceFolder = rootFolder
    .createLocalSubfolder("dragDropSource")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  destFolder = rootFolder
    .createLocalSubfolder("dragDropDest")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  sourceFolder.addMessageBatch(
    generator
      .makeMessages({ count: 15 })
      .map(message => message.toMessageString())
  );

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Tests dragging messages from the thread tree correctly sets up the
 * dataTransfer object. Also checks the flavorDataProvider for exporting
 * messages to the filesystem.
 */
add_task(async function testDragMessageSource() {
  function beginDrag(index) {
    dragService.startDragSessionForTests(
      about3Pane,
      Ci.nsIDragService.DRAGDROP_ACTION_NONE
    );

    return EventUtils.synthesizeDragOver(
      threadTree.getRowAtIndex(index),
      destination,
      null,
      null,
      about3Pane,
      about3Pane,
      {}
    );
  }

  async function checkDataTransfer(headers) {
    Assert.equal(
      dataTransfer.mozItemCount,
      headers.length,
      "item count should match selection count"
    );

    for (const [index, header] of Object.entries(headers)) {
      const messageURI = sourceFolder.getUriForMsg(header);
      const messageURL = mailboxService.getUrlForUri(messageURI).spec;

      Assert.equal(
        dataTransfer.mozGetDataAt("text/plain", index),
        messageURI,
        `text/plain of item ${index}`
      );
      Assert.equal(
        dataTransfer.mozGetDataAt("text/x-moz-message", index),
        messageURI,
        `text/x-moz-message of item ${index}`
      );
      Assert.equal(
        dataTransfer.mozGetDataAt("text/x-moz-url", index),
        messageURL,
        `text/x-moz-url of item ${index}`
      );
      Assert.equal(
        dataTransfer.mozGetDataAt("application/x-moz-file-promise-url", index),
        messageURL,
        `application/x-moz-file-promise-url of item ${index}`
      );
      Assert.equal(
        dataTransfer.mozGetDataAt(
          "application/x-moz-file-promise-dest-filename",
          index
        ),
        `${header.subject}.eml`,
        `application/x-moz-file-promise-dest-filename of item ${index}`
      );
      const flavorDataProvider = dataTransfer.mozGetDataAt(
        "application/x-moz-file-promise",
        index
      );
      Assert.ok(
        flavorDataProvider.QueryInterface(Ci.nsIFlavorDataProvider),
        "nsIFlavorDataProvider exists"
      );

      // Create a fake nsITransferable, mimicking what happens when a dragged
      // message is dropped in a filesystem window.

      const transferable = Cc[
        "@mozilla.org/widget/transferable;1"
      ].createInstance(Ci.nsITransferable);
      transferable.init(window.docShell);

      const supportsURI = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString
      );
      supportsURI.data = messageURI;
      transferable.setTransferData("text/plain", supportsURI);

      const tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
      tempFile.append(`${header.subject}.eml`);
      if (tempFile.exists()) {
        tempFile.remove(false);
      }

      const supportsLeafName = Cc[
        "@mozilla.org/supports-string;1"
      ].createInstance(Ci.nsISupportsString);
      supportsLeafName.data = tempFile.leafName;
      transferable.setTransferData(
        "application/x-moz-file-promise-dest-filename",
        supportsLeafName
      );
      transferable.setTransferData(
        "application/x-moz-file-promise-dir",
        tempFile.parent
      );

      const writePromise = TestUtils.topicObserved("message-saved");
      flavorDataProvider.getFlavorData(
        transferable,
        "application/x-moz-file-promise"
      );
      await writePromise;
      Assert.ok(tempFile.exists(), ".eml file created");

      const fileContent = await IOUtils.readUTF8(tempFile.path);
      Assert.stringContains(
        fileContent,
        `Subject: ${header.subject}\r\n`,
        "message written to file"
      );
    }

    Assert.equal(
      dataTransfer.effectAllowed,
      "copyMove",
      "effectAllowed of drag operation"
    );
    Assert.equal(
      dataTransfer.dropEffect,
      "move",
      "dropEffect of drag operation"
    );
  }

  function endDrag() {
    EventUtils.synthesizeDropAfterDragOver(
      result,
      dataTransfer,
      destination,
      about3Pane,
      {}
    );

    dragService.getCurrentSession().endDragSession(true);
  }

  function checkMove([isMove, , destFolder, destMessages], expectedMessageIDs) {
    Assert.ok(isMove, "message(s) should be moved not copied");
    Assert.equal(
      destFolder,
      destFolder,
      "message(s) should be moved to the right folder"
    );
    Assert.equal(
      destMessages.length,
      expectedMessageIDs.length,
      "number of messages moved"
    );
    for (let i = 0; i < expectedMessageIDs.length; i++) {
      Assert.equal(
        destMessages[i].messageId,
        expectedMessageIDs[i],
        "moved message"
      );
    }
  }

  about3Pane.restoreState({
    folderURI: sourceFolder.URI,
    messagePaneVisible: false,
  });
  ensure_table_view();

  const sourceMessages = [...sourceFolder.messages];
  const sourceMessageIDs = sourceMessages.map(m => m.messageId);
  let result, dataTransfer;
  const destination = folderPane.getRowForFolder(destFolder);

  info("Dragging a single selection");

  let movePromise = new PromiseTestUtils.promiseFolderNotification(
    destFolder,
    "msgsMoveCopyCompleted"
  );
  threadTree.selectedIndex = 0;
  [result, dataTransfer] = beginDrag(0);
  await checkDataTransfer([sourceMessages[0]]);
  endDrag();
  checkMove(await movePromise, [sourceMessageIDs[0]]);

  info("Dragging a contiguous multiple selection");

  movePromise = new PromiseTestUtils.promiseFolderNotification(
    destFolder,
    "msgsMoveCopyCompleted"
  );
  threadTree.selectedIndices = [1, 2];
  [result, dataTransfer] = beginDrag(1);
  await checkDataTransfer([sourceMessages[2], sourceMessages[3]]);
  endDrag();
  checkMove(await movePromise, [sourceMessageIDs[2], sourceMessageIDs[3]]);

  info("Dragging a non-contiguous multiple selection");

  movePromise = new PromiseTestUtils.promiseFolderNotification(
    destFolder,
    "msgsMoveCopyCompleted"
  );
  threadTree.selectedIndices = [3, 5, 7];
  [, dataTransfer] = beginDrag(3);
  await checkDataTransfer([
    sourceMessages[6],
    sourceMessages[8],
    sourceMessages[10],
  ]);
  endDrag();
  checkMove(await movePromise, [
    sourceMessageIDs[6],
    sourceMessageIDs[8],
    sourceMessageIDs[10],
  ]);

  info("Dragging an unselected message");

  movePromise = new PromiseTestUtils.promiseFolderNotification(
    destFolder,
    "msgsMoveCopyCompleted"
  );
  [, dataTransfer] = beginDrag(1);
  await checkDataTransfer([sourceMessages[4]]);
  endDrag();
  checkMove(await movePromise, [sourceMessageIDs[4]]);
});

/**
 * Tests dragging messages over the folder tree allows the right drag action.
 */
add_task(async function testDragMessageDestination() {
  about3Pane.restoreState({
    folderURI: sourceFolder.URI,
    messagePaneVisible: false,
  });
  ensure_table_view();

  dragService.startDragSessionForTests(
    about3Pane,
    Ci.nsIDragService.DRAGDROP_ACTION_NONE
  );
  let result, dataTransfer;

  function dragOver(folder, modifiers, expectedEffect) {
    [result, dataTransfer] = EventUtils.synthesizeDragOver(
      threadTree.getRowAtIndex(0),
      folderPane.getRowForFolder(folder),
      null,
      null,
      about3Pane,
      about3Pane,
      modifiers
    );

    Assert.equal(
      dataTransfer.effectAllowed,
      "copyMove",
      "effectAllowed of drag operation"
    );
    Assert.equal(
      dataTransfer.dropEffect,
      expectedEffect,
      "dropEffect of drag operation"
    );
  }

  dragOver(rootFolder, {}, "none");
  dragOver(destFolder, {}, "move");
  dragOver(
    destFolder,
    {
      altKey: AppConstants.platform == "macosx",
      ctrlKey: AppConstants.platform != "macosx",
    },
    "copy"
  );
  dragOver(sourceFolder, {}, "none");
  dragOver(rootFolder, {}, "none");

  EventUtils.synthesizeDropAfterDragOver(
    result,
    dataTransfer,
    folderPane.getRowForFolder(rootFolder),
    about3Pane,
    { type: "dragend" }
  );

  dragService.getCurrentSession().endDragSession(true);
});

/**
 * Tests dragging a message from the filesystem to the window.
 */
add_task(async function testDragImportFileMessage() {
  function doDrag(file, dragTarget) {
    const dragData = [[{ type: "application/x-moz-file", data: file }]];
    const dataTransfer = new DataTransfer();
    dataTransfer.dropEffect = "move";
    for (let i = 0; i < dragData.length; i++) {
      const item = dragData[i];
      for (let j = 0; j < item.length; j++) {
        dataTransfer.mozSetDataAt(item[j].type, item[j].data, i);
      }
    }
    dragService.startDragSessionForTests(
      about3Pane,
      Ci.nsIDragService.DRAGDROP_ACTION_MOVE
    );
    const session = dragService.getCurrentSession();
    session.dataTransfer = dataTransfer;

    // EventUtils needs a "from" element but it must be somewhere that can't
    // be dragged from or the dataTransfer will get overwritten.
    EventUtils.synthesizeDragOver(
      document.getElementById("spacesToolbar"),
      dragTarget,
      dragData,
      "move",
      about3Pane
    );

    // This makes sure that the fake dataTransfer has still
    // the expected drop effect after the synthesizeDragOver call.
    session.dataTransfer.dropEffect = "move";

    const movePromise = new PromiseTestUtils.promiseFolderNotification(
      sourceFolder,
      "msgAdded"
    );
    EventUtils.synthesizeDropAfterDragOver(
      null,
      session.dataTransfer,
      dragTarget,
      about3Pane,
      {}
    );
    dragService.getCurrentSession().endDragSession(true);
    return movePromise;
  }

  // Drag a message to the folder tree. It should be added to the target
  // folder, not the current folder.

  about3Pane.restoreState({
    folderURI: sourceFolder.URI,
    messagePaneVisible: false,
  });
  let [droppedMessage] = await doDrag(
    new FileUtils.File(getTestFilePath("files/sampleContent.eml")),
    folderPane.getRowForFolder(destFolder)
  );
  Assert.equal(
    droppedMessage.folder,
    destFolder,
    "the message should be added to the right folder"
  );
  Assert.equal(
    droppedMessage.messageId,
    "sample.content@made.up.invalid",
    "the right message should be added"
  );

  // Drag a message to the thread tree. It should be added to the current folder.

  about3Pane.restoreState({
    folderURI: destFolder.URI,
    messagePaneVisible: false,
  });
  [droppedMessage] = await doDrag(
    new FileUtils.File(getTestFilePath("files/formContent.eml")),
    threadTree
  );
  Assert.equal(
    droppedMessage.folder,
    destFolder,
    "the message should be added to the right folder"
  );
  Assert.equal(
    droppedMessage.messageId,
    "form.content@made.up.invalid",
    "the right message should be added"
  );
});
