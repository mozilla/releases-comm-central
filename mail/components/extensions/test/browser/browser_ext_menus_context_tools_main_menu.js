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

async function subtest_tools_menu(
  testWindow,
  expectedInfo,
  expectedTab,
  manifest
) {
  const extension = await getMenuExtension(manifest);
  await extension.startup();
  await extension.awaitMessage("menus-created");

  const element = testWindow.document.getElementById("tasksMenu");
  const menu = testWindow.document.getElementById("taskPopup");
  await openMenuPopup(menu, element);
  await checkShownEvent(
    extension,
    { menuIds: ["tools_menu"], contexts: ["tools_menu"] },
    expectedTab
  );

  const clickedPromise = checkClickedEvent(
    extension,
    expectedInfo,
    expectedTab
  );
  await clickItemInMenuPopup(
    menu.querySelector("#menus_mochi_test-menuitem-_tools_menu")
  );
  await clickedPromise;
  await extension.unload();
}
add_task(async function test_tools_menu_mv2() {
  const toolbar = window.document.getElementById("toolbar-menubar");
  const initialState = toolbar.getAttribute("inactive");
  toolbar.setAttribute("inactive", "false");

  await subtest_tools_menu(
    window,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, type: "mail" },
    {
      manifest_version: 2,
    }
  );

  toolbar.setAttribute("inactive", initialState);
}).skip(AppConstants.platform == "macosx");
add_task(async function test_compose_tools_menu_mv2() {
  const testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, type: "messageCompose" },
    {
      manifest_version: 2,
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).skip(AppConstants.platform == "macosx");
add_task(async function test_messagewindow_tools_menu_mv2() {
  const testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, type: "messageDisplay" },
    {
      manifest_version: 2,
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).skip(AppConstants.platform == "macosx");
add_task(async function test_tools_menu_mv3() {
  const toolbar = window.document.getElementById("toolbar-menubar");
  const initialState = toolbar.getAttribute("inactive");
  toolbar.setAttribute("inactive", "false");

  await subtest_tools_menu(
    window,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, type: "mail" },
    {
      manifest_version: 3,
    }
  );

  toolbar.setAttribute("inactive", initialState);
}).skip(AppConstants.platform == "macosx");
add_task(async function test_compose_tools_menu_mv3() {
  const testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, type: "messageCompose" },
    {
      manifest_version: 3,
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).skip(AppConstants.platform == "macosx");
add_task(async function test_messagewindow_tools_menu_mv3() {
  const testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, type: "messageDisplay" },
    {
      manifest_version: 3,
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).skip(AppConstants.platform == "macosx");
