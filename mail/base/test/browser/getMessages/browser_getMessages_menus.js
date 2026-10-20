/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the many ways to make Thunderbird fetch new mail. In this file,
 * browser_getMessages_folder.js and browser_getMessages_messageWindow.js are
 * best case scenarios. Edge cases and failure cases are in separate files.
 *
 * An account of each type is created, and they are tested collectively and
 * individually. For each test, new messages are put on the server, the action
 * being tested is performed, then the test waits for the messages to appear.
 */

// Load common setup code shared by the browser_getMessages tests.
Services.scriptloader.loadSubScript(
  new URL("head_getMessages.js", gTestPath).href,
  this
);

requestLongerTimeout(AppConstants.MOZ_CODE_COVERAGE ? 3 : 2);

/**
 * Tests the "Get All New Messages" menu item from the Folder Pane header button.
 */
add_task(async function testGetMessagesContextAll() {
  await testAllServers(async function () {
    EventUtils.synthesizeMouseAtCenter(
      getMessagesButton,
      { type: "contextmenu" },
      about3Pane
    );
    await checkPopupItemsAndActivateFirst(getMessagesContext, 2);
  });
});

/**
 * Tests each account menu item from the Folder Pane header button.
 */
add_task(async function testGetMessagesContext() {
  await testEachServer(async function (thisInbox) {
    EventUtils.synthesizeMouseAtCenter(
      getMessagesButton,
      { type: "contextmenu" },
      about3Pane
    );
    await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "shown");
    getMessagesContext.activateItem(
      getMessagesContext.querySelector(
        `[data-server-key="${thisInbox.server.key}"]`
      )
    );
    await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "hidden");
  });
});

/**
 * Tests the folder pane context menu.
 */
add_task(async function testFolderPaneContext() {
  await testEachServer(async function (thisInbox) {
    const folderPaneContext =
      about3Pane.document.getElementById("folderPaneContext");
    const folderRow = about3Pane.folderPane.getRowForFolder(
      thisInbox.rootFolder
    );
    folderRow.scrollIntoView({ block: "nearest" });
    EventUtils.synthesizeMouseAtCenter(
      folderRow.querySelector(".name"),
      { type: "contextmenu" },
      about3Pane
    );
    await BrowserTestUtils.waitForPopupEvent(folderPaneContext, "shown");
    folderPaneContext.activateItem(
      folderPaneContext.querySelector("#folderPaneContext-getMessages")
    );
    await BrowserTestUtils.waitForPopupEvent(folderPaneContext, "hidden");
  });
});

/**
 * Tests clicking on the toolbar button.
 */
add_task(async function testToolbarButtonAll() {
  await testAllServers(function () {
    EventUtils.synthesizeMouseAtCenter(toolbarButton, {}, window);
  });
});

/**
 * Tests the "Get All New Messages" menu item from the toolbar button.
 */
add_task(async function testToolbarContextAll() {
  await testAllServers(async function () {
    EventUtils.synthesizeMouseAtCenter(
      toolbarButton,
      { type: "contextmenu" },
      window
    );
    await checkPopupItemsAndActivateFirst(toolbarContext, 2);
  });
});

/**
 * Tests each account menu item from the toolbar button.
 */
add_task(async function testToolbarContext() {
  await testEachServer(async function (thisInbox) {
    EventUtils.synthesizeMouseAtCenter(
      toolbarButton,
      { type: "contextmenu" },
      window
    );
    await BrowserTestUtils.waitForPopupEvent(toolbarContext, "shown");
    toolbarContext.activateItem(
      toolbarContext.querySelector(
        `[data-server-key="${thisInbox.server.key}"]`
      )
    );
    await BrowserTestUtils.waitForPopupEvent(toolbarContext, "hidden");
  });
});

/**
 * Tests the "All Accounts" menu item from the File menu.
 */
add_task(async function testFileMenuAll() {
  await subtestFileMenuAll(window);
}).skip(AppConstants.platform == "macosx"); // Can't click the menu bar on mac.

/**
 * Tests each account menu item from the File menu.
 */
add_task(async function testFileMenu() {
  const fileMenu = document.getElementById("menu_File");
  const fileMenuGetMessages = document.getElementById("menu_getAllNewMsg");
  const fileMenuGetMessagesPopup = fileMenuGetMessages.menupopup;

  await testEachServer(async function (thisInbox) {
    EventUtils.synthesizeMouseAtCenter(fileMenu, {}, window);
    await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
    fileMenuGetMessages.openMenu(true);
    await BrowserTestUtils.waitForPopupEvent(fileMenuGetMessagesPopup, "shown");
    for (const menuitem of fileMenuGetMessagesPopup.children) {
      if (menuitem._folder == thisInbox.rootFolder) {
        fileMenuGetMessagesPopup.activateItem(menuitem);
        break;
      }
    }
    await BrowserTestUtils.waitForPopupEvent(
      fileMenuGetMessagesPopup,
      "hidden"
    );
    await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");
  });
}).skip(AppConstants.platform == "macosx"); // Can't click the menu bar on mac.
