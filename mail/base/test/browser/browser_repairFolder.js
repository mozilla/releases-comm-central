/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that when a folder is repaired, the view settings are preserved.
 */

const { FolderTreeProperties } = ChromeUtils.importESModule(
  "resource:///modules/FolderTreeProperties.sys.mjs"
);
const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/IMAPServer.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const { folderPane, folderTree, threadTree } = about3Pane;
let rootFolder, localTestFolder, imapTestFolder;

add_setup(async function () {
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);

  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  localTestFolder = rootFolder
    .createLocalSubfolder("repairFolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  localTestFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );

  const imapServer = new IMAPServer();
  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.username = "user";
  imapAccount.incomingServer.password = "password";
  const imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapTestFolder = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  await imapServer.addMessages(imapTestFolder, generator.makeMessages({}));

  await ensure_table_view();

  registerCleanupFunction(async () => {
    await promiseServerIdle(imapAccount.incomingServer);
    MailServices.accounts.removeAccount(account, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    await ensure_cards_view();
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
  });
});

add_task(async function testLocalFolder() {
  await subtestRepairFolder(localTestFolder);
});

add_task(async function testImapFolder() {
  await subtestRepairFolder(imapTestFolder);
});

async function subtestRepairFolder(folder) {
  about3Pane.displayFolder(folder);

  await toggleColumn("sizeCol");
  await toggleColumn("tagsCol");
  about3Pane.sortController.sortThreadPane("correspondentCol");
  about3Pane.sortController.sortAscending();
  about3Pane.sortController.groupBySort();
  await BrowserTestUtils.waitForCondition(
    () => threadTree.dataset.showGroupedBySort == "true",
    "The tree view should be grouped by sort"
  );

  const dialog = await openFolderProperties(folder);
  dialog.repairFolder();
  await dialog.accept();
  await BrowserTestUtils.waitForCondition(
    () => about3Pane.dbViewWrapperListener.allMessagesLoaded,
    "waiting for message list to finish loading"
  );
  // Leave the folder and return to ensure that the current view settings are
  // actually persisted in the folder database.
  about3Pane.displayFolder(rootFolder);
  about3Pane.displayFolder(folder);

  assert_visible_columns([
    "threadCol",
    "flaggedCol",
    "attachmentCol",
    "subjectCol",
    "unreadButtonColHeader",
    "correspondentCol",
    "junkStatusCol",
    "dateCol",
    "sizeCol",
    "tagsCol",
  ]);
  Assert.equal(
    about3Pane.gViewWrapper.primarySortType,
    Ci.nsMsgViewSortType.byCorrespondent,
    "The repaired folder should still be sorted by Correspondent"
  );
  Assert.equal(
    about3Pane.gViewWrapper.primarySortOrder,
    Ci.nsMsgViewSortOrder.ascending,
    "The repaired folder should still be sorted ascending"
  );
  Assert.equal(
    about3Pane.gViewWrapper.showGroupedBySort,
    true,
    "The tree view should still be grouped by sort"
  );
}

async function openFolderProperties(folder) {
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

/**
 * Verify that the provided list of columns is visible in the given order,
 * throwing an exception if it is not the case.
 *
 * @param {string[]} desiredColumns - A list of column ID strings for columns
 *   that should be visible in the order that they should be visible.
 */
function assert_visible_columns(desiredColumns) {
  const columns = about3Pane.threadPane.columns;
  const visibleColumns = columns
    .filter(column => !column.hidden)
    .map(column => column.id);
  let failCol = visibleColumns.filter(x => !desiredColumns.includes(x));
  if (failCol.length) {
    throw new Error(
      `Found unexpected visible columns: '${failCol}'!\ndesired list: ${desiredColumns}\nactual list: ${visibleColumns}`
    );
  }
  failCol = desiredColumns.filter(x => !visibleColumns.includes(x));
  if (failCol.length) {
    throw new Error(
      `Found unexpected hidden columns: '${failCol}'!\ndesired list: ${desiredColumns}\nactual list: ${visibleColumns}`
    );
  }
}

/**
 * Toggle the column visibility .
 *
 * @param {string} columnID - Id of the thread column element to click.
 */
async function toggleColumn(columnID) {
  const colPicker = about3Pane.document.querySelector(
    `th[is="tree-view-table-column-picker"] button`
  );
  const colPickerPopup = about3Pane.document.querySelector(
    `th[is="tree-view-table-column-picker"] menupopup`
  );

  EventUtils.synthesizeMouseAtCenter(colPicker, {}, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(colPickerPopup, "shown");

  const menuItem = colPickerPopup.querySelector(`[value="${columnID}"]`);
  const checkedState = menuItem.getAttribute("checked");
  colPickerPopup.activateItem(menuItem);
  await BrowserTestUtils.waitForMutationCondition(
    menuItem,
    { attributes: true },
    () => checkedState != menuItem.getAttribute("checked")
  );

  // The column picker menupopup doesn't close automatically on purpose.
  EventUtils.synthesizeKey("VK_ESCAPE", {}, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(colPickerPopup, "hidden");
}
