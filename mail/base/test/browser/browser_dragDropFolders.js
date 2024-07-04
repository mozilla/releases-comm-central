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
  result,
  dataTransfer;

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

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
  });
});

async function startDrag(element, target) {
  const elementRow = about3Pane.folderPane.getRowForFolder(element);
  const targetRow = about3Pane.folderPane.getRowForFolder(target);

  dragService.startDragSessionForTests(
    about3Pane,
    Ci.nsIDragService.DRAGDROP_ACTION_MOVE
  );
  [result, dataTransfer] = EventUtils.synthesizeDragOver(
    elementRow,
    targetRow,
    null,
    null,
    about3Pane,
    about3Pane
  );

  Assert.equal(
    dataTransfer.effectAllowed,
    "copyMove",
    "effectAllowed of drag operation"
  );
  Assert.equal(dataTransfer.dropEffect, "move", "dropEffect of drag operation");
  await new Promise(resolve => setTimeout(resolve));
}

async function endDrag(target) {
  const targetRow = about3Pane.folderPane.getRowForFolder(target);

  EventUtils.synthesizeDropAfterDragOver(
    result,
    dataTransfer,
    targetRow,
    about3Pane,
    { type: "drop" }
  );
  dragService.getCurrentSession().endDragSession(true);
  await new Promise(resolve => setTimeout(resolve));
}

add_task(async function test_drag_and_drop_single_folder() {
  Assert.deepEqual(
    Array.from(
      folderTree.querySelectorAll("[role=group] li"),
      folderTreeRow => folderTreeRow.uri
    ),
    [rootFolder, trashFolder, outboxFolder, folderA, folderB, folderC].map(
      folder => folder.URI
    )
  );

  // Click on folderA to select it.
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(folderA).querySelector(".name"),
    {},
    about3Pane
  );
  Assert.equal(folderTree.selectedIndex, 3);

  await startDrag(folderB, folderC);
  await endDrag(folderC);

  // folderB should now be a child of folderC.
  folderB = folderC.getChildNamed("folderB");

  Assert.deepEqual(
    Array.from(
      folderTree.querySelectorAll("[role=group] li"),
      folderTreeRow => folderTreeRow.uri
    ),
    [rootFolder, trashFolder, outboxFolder, folderA, folderC, folderB].map(
      folder => folder.URI
    )
  );
});
