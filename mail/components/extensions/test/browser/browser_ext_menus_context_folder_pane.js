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
});

async function subtest_folder_pane(manifest) {
  const extension = await getMenuExtension(manifest);

  await extension.startup();
  await extension.awaitMessage("menus-created");

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  const folderTree = about3Pane.document.getElementById("folderTree");
  const menu = about3Pane.document.getElementById("folderPaneContext");
  await rightClick(menu, folderTree.rows[1].querySelector(".container"));
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_folder_pane"));
  await closeMenuPopup(menu);

  await checkShownEvent(
    extension,
    {
      menuIds: ["folder_pane"],
      contexts: ["folder_pane", "all"],
      selectedFolder: manifest?.permissions?.includes("accountsRead")
        ? { accountId: gAccount.key, path: "/Trash" }
        : undefined,
    },
    { active: true, index: 0, mailTab: true }
  );

  await rightClick(menu, folderTree.rows[0].querySelector(".container"));
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_folder_pane"));
  await closeMenuPopup(menu);

  await checkShownEvent(
    extension,
    {
      menuIds: ["folder_pane"],
      contexts: ["folder_pane", "all"],
      selectedAccount: manifest?.permissions?.includes("accountsRead")
        ? { id: gAccount.key, type: "none" }
        : undefined,
    },
    { active: true, index: 0, mailTab: true }
  );

  await extension.unload();
}
add_task(async function test_folder_pane_mv2() {
  return subtest_folder_pane({
    manifest_version: 2,
    permissions: ["accountsRead"],
  });
});
add_task(async function test_folder_pane_no_permissions_mv2() {
  return subtest_folder_pane({
    manifest_version: 2,
  });
});
add_task(async function test_folder_pane_mv3() {
  return subtest_folder_pane({
    manifest_version: 3,
    permissions: ["accountsRead"],
  });
});
add_task(async function test_folder_pane_no_permissions_mv3() {
  return subtest_folder_pane({
    manifest_version: 3,
  });
});
