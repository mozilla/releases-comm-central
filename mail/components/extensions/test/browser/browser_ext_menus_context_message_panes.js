/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Load subscript shared with all menu tests.
Services.scriptloader.loadSubScript(
  new URL("head_menus.js", gTestPath).href,
  this
);

let gAccount, gFolders, gMessage;
add_setup(async () => {
  await Services.search.init();

  gAccount = createAccount();
  addIdentity(gAccount);
  gFolders = gAccount.incomingServer.rootFolder.subFolders;
  createMessages(gFolders[0], {
    count: 1,
    body: {
      contentType: "text/html",
      body: await fetch(`${URL_BASE}/content.html`).then(r => r.text()),
    },
  });
  gMessage = [...gFolders[0].messages][0];

  document.getElementById("tabmail").currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: gAccount.incomingServer.rootFolder.URI,
  });
  await ensure_table_view();
});

async function subtest_message_panes(manifest) {
  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({
    messagePaneVisible: true,
    folderURI: gFolders[0].URI,
  });

  const extension = await getMenuExtension(manifest);

  await extension.startup();
  await extension.awaitMessage("menus-created");

  info("Test the thread pane in the 3-pane tab.");

  const threadTree = about3Pane.document.getElementById("threadTree");
  let menu = about3Pane.document.getElementById("mailContext");
  threadTree.selectedIndex = 0;
  await rightClick(menu, threadTree.getRowAtIndex(0));
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_message_list"));
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["message_list"],
      contexts: ["message_list", "all"],
      displayedFolder: manifest?.permissions?.includes("accountsRead")
        ? { accountId: gAccount.key, path: "/Trash" }
        : undefined,
      selectedMessages: manifest?.permissions?.includes("messagesRead")
        ? { id: null, messages: [{ subject: gMessage.subject }] }
        : undefined,
    },
    { active: true, index: 0, mailTab: true }
  );

  info("Test the message pane in the 3-pane tab.");

  let messagePane =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();

  await subtest_content(
    extension,
    manifest?.permissions?.includes("messagesRead"),
    messagePane,
    /^mailbox\:/,
    {
      active: true,
      index: 0,
      mailTab: true,
    }
  );

  about3Pane.threadTree.selectedIndices = [];
  await awaitBrowserLoaded(messagePane, "about:blank");

  info("Test the message pane in a tab.");

  await openMessageInTab(gMessage);
  messagePane = tabmail.currentAboutMessage.getMessagePaneBrowser();

  await subtest_content(
    extension,
    manifest?.permissions?.includes("messagesRead"),
    messagePane,
    /^mailbox\:/,
    {
      active: true,
      index: 1,
      mailTab: false,
    }
  );

  tabmail.closeOtherTabs(0);

  info("Test the message pane in a separate window.");

  const displayWindow = await openMessageInWindow(gMessage);
  const displayDocument = displayWindow.document;
  menu = displayDocument.getElementById("mailContext");
  messagePane = displayDocument
    .getElementById("messageBrowser")
    .contentWindow.getMessagePaneBrowser();

  await subtest_content(
    extension,
    manifest?.permissions?.includes("messagesRead"),
    messagePane,
    /^mailbox\:/,
    {
      active: true,
      index: 0,
      mailTab: false,
    }
  );

  await extension.unload();

  await BrowserTestUtils.closeWindow(displayWindow);
}
add_task(async function test_message_panes_mv2() {
  return subtest_message_panes({
    manifest_version: 2,
    permissions: ["accountsRead", "messagesRead"],
  });
});
add_task(async function test_message_panes_no_accounts_permission_mv2() {
  return subtest_message_panes({
    manifest_version: 2,
    permissions: ["messagesRead"],
  });
});
add_task(async function test_message_panes_no_messages_permission_mv2() {
  return subtest_message_panes({
    manifest_version: 2,
    permissions: ["accountsRead"],
  });
});
add_task(async function test_message_panes_no_permissions_mv2() {
  return subtest_message_panes({
    manifest_version: 2,
  });
});
add_task(async function test_message_panes_mv3() {
  return subtest_message_panes({
    manifest_version: 3,
    permissions: ["accountsRead", "messagesRead"],
  });
});
add_task(async function test_message_panes_no_accounts_permission_mv3() {
  return subtest_message_panes({
    manifest_version: 3,
    permissions: ["messagesRead"],
  });
});
add_task(async function test_message_panes_no_messages_permission_mv3() {
  return subtest_message_panes({
    manifest_version: 3,
    permissions: ["accountsRead"],
  });
});
add_task(async function test_message_panes_no_permissions_mv3() {
  return subtest_message_panes({
    manifest_version: 3,
  });
});
