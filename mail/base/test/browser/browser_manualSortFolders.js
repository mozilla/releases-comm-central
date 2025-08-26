/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const { folderPane, folderTree } = about3Pane;

let rootFolder,
  outboxFolder,
  trashFolder,
  folderA,
  folderB,
  folderC,
  folderD,
  folderD_1,
  folderD_2,
  folderD_3;

add_setup(async function () {
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);

  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    `${account.key}user`,
    "localhost",
    "none"
  );
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  outboxFolder = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Queue);
  trashFolder = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);

  folderA = rootFolder.createLocalSubfolder("folderA");
  folderB = rootFolder.createLocalSubfolder("folderB");
  folderC = rootFolder.createLocalSubfolder("folderC");
  folderD = rootFolder
    .createLocalSubfolder("folderD")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderD_1 = folderD.createLocalSubfolder("folderD_1");
  folderD_2 = folderD.createLocalSubfolder("folderD_2");
  folderD_3 = folderD.createLocalSubfolder("folderD_3");

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
  });
});

async function dragAndDropFolder(element, target, below = false) {
  const dropIndicator = about3Pane.document.getElementById("dropIndicator");
  const elementRow = about3Pane.folderPane.getRowForFolder(element);
  const targetRow = about3Pane.folderPane.getRowForFolder(target);
  const targetRect = targetRow.getBoundingClientRect();
  const toY = below ? targetRect.top + targetRow.offsetHeight : targetRect.top;

  dragService.startDragSessionForTests(
    about3Pane,
    Ci.nsIDragService.DRAGDROP_ACTION_MOVE
  );
  const [result, dataTransfer] = EventUtils.synthesizeDragOver(
    elementRow,
    targetRow,
    null,
    null,
    about3Pane,
    about3Pane
  );

  EventUtils.sendDragEvent(
    {
      type: "dragover",
      clientY: toY,
      dataTransfer,
      _domDispatchOnly: true,
    },
    targetRow,
    about3Pane
  );

  Assert.equal(
    dataTransfer.effectAllowed,
    "copyMove",
    "effectAllowed of drag operation"
  );
  Assert.equal(dataTransfer.dropEffect, "move", "dropEffect of drag operation");
  await new Promise(resolve => setTimeout(resolve));
  await BrowserTestUtils.waitForMutationCondition(
    dropIndicator,
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isVisible(dropIndicator)
  );
  Assert.ok(
    elementRow.classList.contains("drag-target"),
    "The dragged folder should have the proper class applied"
  );

  const rowContainer = targetRow.querySelector(".container");
  const rowRectTop = targetRect.top + rowContainer.clientTop;
  const rowRectBottom =
    rowRectTop + rowContainer.offsetHeight + rowContainer.clientTop / 2;
  const indicatorRect = dropIndicator.getBoundingClientRect();
  // We use Math.round() to avoid annoying issues with subdecimal test failures.
  Assert.equal(
    Math.round(indicatorRect.left + dropIndicator.inlineCorrection),
    Math.round(
      rowContainer.querySelector(".icon").getBoundingClientRect().left
    ),
    "The drop indicator left position should match the folder icon left position"
  );
  Assert.equal(
    Math.round(indicatorRect.top + dropIndicator.blockCorrection),
    Math.round(below ? rowRectBottom : rowRectTop),
    `The drop indicator top position should match the folder ${below ? `bottom` : `top`} position`
  );

  EventUtils.synthesizeDropAfterDragOver(
    result,
    dataTransfer,
    targetRow,
    about3Pane,
    { type: "drop", clientY: toY, _domDispatchOnly: true }
  );
  dragService.getCurrentSession().endDragSession(true);
  await new Promise(resolve => setTimeout(resolve));

  Assert.ok(
    !elementRow.classList.contains("drag-target"),
    "The dragged folder should have cleared the dragged class"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(dropIndicator),
    "The drop indicator should be hidden"
  );
  Assert.ok(
    !dropIndicator.style.insetBlockStart,
    "The inset-block style should have been cleared"
  );
  Assert.ok(
    !dropIndicator.style.insetInlineStart,
    "The inset-inline style should have been cleared"
  );
}

add_task(async function test_sort_single_folder() {
  Assert.deepEqual(
    Array.from(
      folderTree.querySelectorAll("[role=group] li"),
      folderTreeRow => folderTreeRow.uri
    ),
    [
      rootFolder,
      trashFolder,
      outboxFolder,
      folderA,
      folderB,
      folderC,
      folderD,
      folderD_1,
      folderD_2,
      folderD_3,
    ].map(folder => folder.URI),
    "Initial folder tree structure should match expected order."
  );

  // Click on folderA to select it.
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(folderA).querySelector(".name"),
    {},
    about3Pane
  );
  Assert.equal(folderTree.selectedIndex, 3);

  // Test dragging folderB above folderA.
  await dragAndDropFolder(folderB, folderA);

  Assert.deepEqual(
    Array.from(
      folderTree.querySelectorAll("[role=group] li"),
      folderTreeRow => folderTreeRow.uri
    ),
    [
      rootFolder,
      trashFolder,
      outboxFolder,
      folderB,
      folderA,
      folderC,
      folderD,
      folderD_1,
      folderD_2,
      folderD_3,
    ].map(folder => folder.URI),
    "Dragging folderB above folderA should order folderB before folderA."
  );

  // Test dragging folderC below folderB.
  await dragAndDropFolder(folderC, folderB, true);

  Assert.deepEqual(
    Array.from(
      folderTree.querySelectorAll("[role=group] li"),
      folderTreeRow => folderTreeRow.uri
    ),
    [
      rootFolder,
      trashFolder,
      outboxFolder,
      folderB,
      folderC,
      folderA,
      folderD,
      folderD_1,
      folderD_2,
      folderD_3,
    ].map(folder => folder.URI),
    "Dragging folderC below folderB should order folderC between folderB and folderA."
  );

  // Test dragging folderB below folderD_1 and making it a child of folderD.
  await dragAndDropFolder(folderB, folderD_1, true);

  // folderB should now be a child of folderD.
  folderB = folderD.getChildNamed("folderB");

  Assert.deepEqual(
    Array.from(
      folderTree.querySelectorAll("[role=group] li"),
      folderTreeRow => folderTreeRow.uri
    ),
    [
      rootFolder,
      trashFolder,
      outboxFolder,
      folderC,
      folderA,
      folderD,
      folderD_1,
      folderB,
      folderD_2,
      folderD_3,
    ].map(folder => folder.URI),
    "Dragging folderB below folderD_1 should make it a child of folderD."
  );

  // Test dragging folderB above folderC and making it a child of rootFolder.
  await dragAndDropFolder(folderB, folderC);

  // folderB should now be a child of rootFolder.
  folderB = rootFolder.getChildNamed("folderB");

  Assert.deepEqual(
    Array.from(
      folderTree.querySelectorAll("[role=group] li"),
      folderTreeRow => folderTreeRow.uri
    ),
    [
      rootFolder,
      trashFolder,
      outboxFolder,
      folderB,
      folderC,
      folderA,
      folderD,
      folderD_1,
      folderD_2,
      folderD_3,
    ].map(folder => folder.URI),
    "Dragging folderB above folderC should make it a child of rootFolder."
  );

  const booFolder = rootFolder.createLocalSubfolder("Boo");
  Assert.deepEqual(
    Array.from(
      folderTree.querySelectorAll("[role=group] li"),
      folderTreeRow => folderTreeRow.uri
    ),
    [
      rootFolder,
      trashFolder,
      outboxFolder,
      booFolder,
      folderB,
      folderC,
      folderA,
      folderD,
      folderD_1,
      folderD_2,
      folderD_3,
    ].map(folder => folder.URI),
    "New folder Boo should be added alphabetically after special folders"
  );
  booFolder.deleteSelf(null); // Moves Boo to Trash.
  trashFolder.getChildNamed("Boo").deleteSelf(null);
});

add_task(async function test_reset_folder_sorting() {
  const contextMenu = about3Pane.document.getElementById("folderPaneContext");
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(rootFolder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(contextMenu, "shown");

  contextMenu.activateItem(
    about3Pane.document.getElementById("folderPaneContext-resetSort")
  );
  await BrowserTestUtils.waitForEvent(about3Pane, "folder-sort-order-restored");

  Assert.deepEqual(
    Array.from(
      folderTree.querySelectorAll("[role=group] li"),
      folderTreeRow => folderTreeRow.uri
    ),
    [
      rootFolder,
      trashFolder,
      outboxFolder,
      folderA,
      folderB,
      folderC,
      folderD,
      folderD_1,
      folderD_2,
      folderD_3,
    ].map(folder => folder.URI),
    "Initial folder tree order should have been restored."
  );
});
