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

async function subtest_tab(manifest) {
  async function checkTabEvent(index, active, mailTab) {
    await rightClick(menu, tabs[index]);
    Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_tab"));
    menu.hidePopup();

    await checkShownEvent(
      extension,
      { menuIds: ["tab"], contexts: ["tab"] },
      { active, index, mailTab }
    );
  }

  const extension = await getMenuExtension(manifest);

  await extension.startup();
  await extension.awaitMessage("menus-created");

  const tabmail = document.getElementById("tabmail");
  window.openContentTab("about:config");
  window.openContentTab("about:mozilla");
  tabmail.openTab("mail3PaneTab", { folderURI: gFolders[0].URI });

  const tabs = document.getElementById("tabmail-tabs").allTabs;
  const menu = document.getElementById("tabContextMenu");

  await checkTabEvent(0, false, true);
  await checkTabEvent(1, false, false);
  await checkTabEvent(2, false, false);
  await checkTabEvent(3, true, true);

  await extension.unload();

  tabmail.closeOtherTabs(0);
}
add_task(async function test_tab_mv2() {
  await subtest_tab({
    manifest_version: 2,
  });
});
add_task(async function test_tab_mv3() {
  await subtest_tab({
    manifest_version: 3,
  });
});
