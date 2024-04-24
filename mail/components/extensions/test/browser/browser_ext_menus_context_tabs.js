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
  async function checkTabEvent(index, active, type) {
    await openMenuPopup(menu, tabs[index], {
      type: "contextmenu",
    });
    Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_tab"));
    await closeMenuPopup(menu);

    await checkShownEvent(
      extension,
      { menuIds: ["tab"], contexts: ["tab"] },
      { active, index, type }
    );
  }

  const extension = await getMenuExtension(manifest);

  await extension.startup();
  await extension.awaitMessage("menus-created");

  const tabmail = document.getElementById("tabmail");
  const configTab = window.openContentTab("about:config");
  await awaitBrowserLoaded(configTab.browser, "about:config");
  const mozillaTab = window.openContentTab("about:mozilla");
  await awaitBrowserLoaded(mozillaTab.browser, "about:mozilla");
  tabmail.openTab("mail3PaneTab", { folderURI: gFolders[0].URI });

  const tabs = document.getElementById("tabmail-tabs").allTabs;
  const menu = document.getElementById("tabContextMenu");

  await checkTabEvent(0, false, "mail");
  await checkTabEvent(1, false, "special");
  await checkTabEvent(2, false, "special");
  await checkTabEvent(3, true, "mail");

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
