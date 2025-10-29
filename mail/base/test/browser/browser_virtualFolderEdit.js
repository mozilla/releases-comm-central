/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the selection of a virtual folder's searched folders.
 */

var { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const context = about3Pane.document.getElementById("folderPaneContext");

let rootFolder, wrappedVirtual, virtualFolder, first, second, third, fourth;

add_setup(async function () {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  rootFolder = localAccount.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  first = rootFolder.createLocalSubfolder("first");
  second = rootFolder.createLocalSubfolder("second");
  third = rootFolder.createLocalSubfolder("third");
  third.QueryInterface(Ci.nsIMsgLocalMailFolder);
  fourth = third.createLocalSubfolder("fourth");

  wrappedVirtual = VirtualFolderHelper.createNewVirtualFolder(
    "virtual",
    rootFolder,
    [first, second],
    "ALL",
    false
  );
  virtualFolder = wrappedVirtual.virtualFolder;

  const pop3Account = MailServices.accounts.createAccount();
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "localhost",
    "pop3"
  );

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
  });
});

add_task(async function () {
  const virtualPropsPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/virtualFolderProperties.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const chosenFoldersCount = doc.getElementById("chosenFoldersCount");
        const folderListButton = doc.getElementById("folderListPicker");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        Assert.equal(chosenFoldersCount.textContent, "2 folders chosen");

        // Open the folder selection dialog.
        folderListButton.click();
        await folderSelectionPromise;
        await SimpleTest.promiseFocus(win);

        Assert.equal(chosenFoldersCount.textContent, "3 folders chosen");

        acceptButton.click();
      },
    }
  );
  const folderSelectionPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/virtualFolderListEdit.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const tree = doc.getElementById("folderPickerTree");
        const { folderNameCol, selectedCol } = tree.columns;
        const treeChildren = tree.lastElementChild;
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        // Check the initial state.
        Assert.equal(tree.view.rowCount, 7);
        Assert.ok(
          !tree.view.isContainerOpen(0),
          "pop3 root folder should not be open"
        );
        Assert.ok(
          tree.view.isContainerOpen(1),
          "local root folder should be open"
        );
        Assert.ok(
          !tree.view.isContainerOpen(6),
          "unselected folder should not be open"
        );
        tree.view.toggleOpenState(6); // Open "third" folder.
        Assert.equal(tree.view.rowCount, 8);

        Assert.equal(
          tree.view.getCellText(0, folderNameCol),
          "nobody on localhost"
        );
        Assert.equal(tree.view.getCellText(1, folderNameCol), "Local Folders");
        Assert.equal(tree.view.getCellText(2, folderNameCol), "Trash");
        Assert.equal(tree.view.getCellText(3, folderNameCol), "Outbox");
        Assert.equal(tree.view.getCellText(4, folderNameCol), "first");
        Assert.equal(tree.view.getCellText(5, folderNameCol), "second");
        Assert.equal(tree.view.getCellText(6, folderNameCol), "third");
        Assert.equal(tree.view.getCellText(7, folderNameCol), "fourth");

        // Check the initial selection.
        const isSelected = index =>
          tree.view
            .getCellProperties(index, selectedCol)
            .includes("selected-true");
        Assert.ok(!isSelected(0));
        Assert.ok(!isSelected(1));
        Assert.ok(!isSelected(2));
        Assert.ok(!isSelected(3));
        Assert.ok(isSelected(4));
        Assert.ok(isSelected(5));
        Assert.ok(!isSelected(6));
        Assert.ok(!isSelected(7));

        // Change the selection by clicking on a check box.
        const coords = tree.getCoordsForCellItem(4, selectedCol, "cell");
        EventUtils.synthesizeMouse(
          treeChildren,
          coords.x + coords.width / 2,
          coords.y + coords.height / 2,
          {},
          win
        );

        // Change the selection by selecting some rows and pressing space.
        tree.view.selection.rangedSelect(6, 7, false);
        tree.focus();
        EventUtils.synthesizeKey(" ", {}, win);

        // Check the changed selection.
        Assert.ok(!isSelected(0));
        Assert.ok(!isSelected(1));
        Assert.ok(!isSelected(2));
        Assert.ok(!isSelected(3));
        Assert.ok(!isSelected(4));
        Assert.ok(isSelected(5));
        Assert.ok(isSelected(6));
        Assert.ok(isSelected(7));

        acceptButton.click();
      },
    }
  );

  // Check the state before we begin.
  Assert.equal(wrappedVirtual.searchString, `ALL`);
  Assert.equal(wrappedVirtual.searchFolderURIs, `${first.URI}|${second.URI}`);

  // Open the virtual folder properties dialog.
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(virtualFolder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(context, "shown");
  context.activateItem(
    about3Pane.document.getElementById("folderPaneContext-properties")
  );
  await BrowserTestUtils.waitForPopupEvent(context, "hidden");
  await virtualPropsPromise;

  // Check the state after we finish.
  Assert.equal(wrappedVirtual.searchString, `ALL`);
  Assert.equal(
    wrappedVirtual.searchFolderURIs,
    `${second.URI}|${third.URI}|${fourth.URI}`
  );
});
