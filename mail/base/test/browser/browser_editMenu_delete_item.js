/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Load common setup code shared by all browser_editMenu* tests.
Services.scriptloader.loadSubScript(
  new URL("head_editMenu.js", gTestPath).href,
  this
);

/**
 * Tests the "Delete" item in the menu. This item calls cmd_delete, which does
 * various things depending on the current context.
 */
add_task(async function testDeleteItem() {
  const about3Pane = tabmail.currentAbout3Pane;
  const { displayFolder, folderTree, paneLayout, threadTree } = about3Pane;
  paneLayout.messagePaneVisible = true;

  // Focus on the folder tree and check that an NNTP account shows
  // "Unsubscribe Folder". The account can't be deleted this way so the menu
  // item should be disabled.

  folderTree.focus();
  displayFolder(nntpRootFolder);
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // Check that an NNTP folder shows "Unsubscribe Folder". Then check that
  // calling cmd_delete actually attempts to unsubscribe the folder.

  displayFolder(nntpFolder);
  await Promise.all([
    BrowserTestUtils.promiseAlertDialog("cancel"),
    helper.activateItem("menu_delete", {
      l10nID: "menu-edit-unsubscribe-newsgroup",
    }),
  ]);

  // Check that a mail account shows "Delete Folder". The account can't be
  // deleted this way so the menu item should be disabled.

  displayFolder(rootFolder);
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // Check that focus on the folder tree and a mail folder shows "Delete
  // Folder". Then check that calling cmd_delete actually attempts to delete
  // the folder.

  displayFolder(testFolder);
  await Promise.all([
    BrowserTestUtils.promiseAlertDialog("cancel"),
    helper.activateItem("menu_delete", { l10nID: "menu-edit-delete-folder" }),
  ]);
  await new Promise(resolve => setTimeout(resolve));

  // Focus the Quick Filter bar text box and check the menu item shows "Delete".

  goDoCommand("cmd_showQuickFilterBar");
  about3Pane.document.getElementById("qfb-qs-textbox").focus();
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // Focus on the thread tree with no messages selected and check the menu
  // item shows "Delete".

  threadTree.table.body.focus();
  threadTree.selectedIndex = -1;
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // With one message selected check the menu item shows "Delete Message".

  threadTree.selectedIndex = 0;
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 1 },
    },
  });

  // Focus the Quick Filter bar text box and check the menu item shows "Delete".
  // It should *not* show "Delete Message" even though one is selected.

  about3Pane.document.getElementById("qfb-qs-textbox").focus();
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // Focus on about:message and check the menu item shows "Delete Message".

  about3Pane.messageBrowser.focus();
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 1 },
    },
  });

  // With multiple messages selected and check the menu item shows "Delete
  // Messages". Then check that calling cmd_delete actually deletes the messages.

  threadTree.table.body.focus();
  threadTree.selectedIndices = [0, 1, 3];
  await Promise.all([
    new PromiseTestUtils.promiseFolderEvent(
      testFolder,
      "DeleteOrMoveMsgCompleted"
    ),
    helper.activateItem("menu_delete", {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 3 },
    }),
  ]);

  // Load an IMAP folder with the "just mark deleted" model. With no messages
  // selected check the menu item shows "Delete".

  // Note that for each flag change, we wait for a second for the change to
  // be sent to the IMAP server.
  const SETFLAG_TIMEOUT = 1200;

  displayFolder(imapFolder);
  await promiseServerIdle(imapFolder.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, SETFLAG_TIMEOUT));
  Assert.equal(threadTree.view.rowCount, 10, "IMAP folder loaded");
  const dbView = about3Pane.gDBView;
  threadTree.selectedIndex = -1;
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // With one message selected check the menu item shows "Delete Message".
  // Then check that calling cmd_delete sets the flag on the message.

  threadTree.selectedIndex = 0;
  const message = dbView.getMsgHdrAt(0);
  await helper.activateItem("menu_delete", {
    l10nID: "menu-edit-delete-messages",
    l10nArgs: { count: 1 },
  });
  await promiseServerIdle(imapFolder.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, SETFLAG_TIMEOUT));
  Assert.ok(
    message.flags & Ci.nsMsgMessageFlags.IMAPDeleted,
    "IMAPDeleted flag should be set"
  );

  // Check the menu item now shows "Undelete Message" and that calling
  // cmd_delete clears the flag on the message.

  // The delete operation moved the selection, go back.
  threadTree.selectedIndex = 0;
  await helper.activateItem("menu_delete", {
    l10nID: "menu-edit-undelete-messages",
    l10nArgs: { count: 1 },
  });
  await promiseServerIdle(imapFolder.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, SETFLAG_TIMEOUT));
  Assert.ok(
    !(message.flags & Ci.nsMsgMessageFlags.IMAPDeleted),
    "IMAPDeleted flag should be cleared on message 0"
  );

  // Check the menu item again shows "Delete Message".

  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 1 },
    },
  });

  // With multiple messages selected and check the menu item shows "Delete
  // Messages". Check that calling cmd_delete sets the flag on the messages.

  threadTree.selectedIndices = [1, 3, 5];
  const messages = dbView.getSelectedMsgHdrs();
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 3 },
    },
  });
  await helper.activateItem("menu_delete");
  await promiseServerIdle(imapFolder.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, SETFLAG_TIMEOUT));
  Assert.ok(
    messages.every(m => m.flags & Ci.nsMsgMessageFlags.IMAPDeleted),
    "IMAPDeleted flags should be set"
  );

  // Check the menu item now shows "Undelete Messages" and that calling
  // cmd_delete clears the flag on the messages.

  threadTree.selectedIndices = [1, 3, 5];
  await helper.activateItem("menu_delete", {
    l10nID: "menu-edit-undelete-messages",
    l10nArgs: { count: 3 },
  });
  await promiseServerIdle(imapFolder.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, SETFLAG_TIMEOUT));
  Assert.ok(
    messages.every(m => !(m.flags & Ci.nsMsgMessageFlags.IMAPDeleted)),
    "IMAPDeleted flags should be cleared"
  );

  // Check the menu item again shows "Delete Messages".

  threadTree.selectedIndices = [1, 3, 5];
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 3 },
    },
  });

  Services.focus.focusedWindow = window;
});
