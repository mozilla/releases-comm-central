/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gAccount, gFolders;

function treeClick(tree, row, column, event) {
  let coords = tree.getCoordsForCellItem(row, tree.columns[column], "cell");
  let treeChildren = tree.lastElementChild;
  EventUtils.synthesizeMouse(
    treeChildren,
    coords.x + (coords.width / 2),
    coords.y + (coords.height / 2),
    event,
    window
  );
}

async function checkEvent(extension, menuIds, contexts) {
  let [event, tab] = await extension.awaitMessage("onShown");
  is(event.menuIds.length, menuIds.length);
  for (let i = 0; i < menuIds.length; i++) {
    is(event.menuIds[i], menuIds[i]);
  }
  is(event.contexts.length, contexts.length);
  for (let i = 0; i < contexts.length; i++) {
    is(event.contexts[i], contexts[i]);
  }
  return [event, tab];
}

function createExtension() {
  return ExtensionTestUtils.loadExtension({
    async background() {
      for (let context of [
        "audio",
        "browser_action",
        "editable",
        "frame",
        "image",
        "link",
        "page",
        "password",
        "selection",
        "tab",
        "video",
        "message_list",
        "folder_pane",
      ]) {
        browser.menus.create({ id: context, title: context, contexts: [context] });
      }

      browser.menus.onShown.addListener((...args) => {
        browser.test.sendMessage("onShown", args);
      });
    },
    manifest: {
      applications: {
        gecko: {
          id: "test1@mochi.test",
        },
      },
      permissions: ["accountsRead", "menus", "messagesRead"],
    },
  });
}

add_task(async function set_up() {
  gAccount = createAccount();
  gFolders = [...gAccount.incomingServer.rootFolder.subFolders];
  createMessages(gFolders[0], 10);
});

add_task(async function test_folder_pane() {
  let extension = createExtension();
  await extension.startup();

  let folderTree = document.getElementById("folderTree");
  treeClick(folderTree, 1, 0, {});
  treeClick(folderTree, 1, 0, {type: "contextmenu"});

  let menu = document.getElementById("folderPaneContext");
  await BrowserTestUtils.waitForEvent(menu, "popupshown");
  ok(menu.querySelector("#test1_mochi_test-menuitem-_folder_pane"));
  menu.hidePopup();

  let [event] = await checkEvent(extension, ["folder_pane"], ["folder_pane", "all"]);
  is(event.selectedFolder.accountId, gAccount.key);
  is(event.selectedFolder.path, "/Trash");
  ok(!event.displayedFolder);
  ok(!event.selectedMessages);

  await extension.unload();
});

add_task(async function test_thread_pane() {
  let extension = createExtension();
  await extension.startup();

  let threadTree = document.getElementById("threadTree");
  treeClick(threadTree, 0, 0, {});
  treeClick(threadTree, 0, 0, {type: "contextmenu"});

  let menu = document.getElementById("mailContext");
  await BrowserTestUtils.waitForEvent(menu, "popupshown");
  ok(menu.querySelector("#test1_mochi_test-menuitem-_message_list"));
  menu.hidePopup();

  let [event] = await checkEvent(extension, ["message_list"], ["message_list", "all"]);
  is(event.displayedFolder.accountId, gAccount.key);
  is(event.displayedFolder.path, "/Trash");
  is(event.selectedMessages.cursor, null);
  ok(!event.selectedFolder);

  await extension.unload();
});

add_task(async function test_tab() {
  async function checkTabEvent(index, active, mailTab) {
    EventUtils.synthesizeMouseAtCenter(tabs[index], {type: "contextmenu"}, window);

    await BrowserTestUtils.waitForEvent(menu, "popupshown");
    ok(menu.querySelector("#test1_mochi_test-menuitem-_tab"));
    menu.hidePopup();

    let [event, tab] = await checkEvent(extension, ["tab"], ["tab"]);
    ok(!event.selectedFolder);
    ok(!event.displayedFolder);
    ok(!event.selectedMessages);
    is(tab.active, active);
    is(tab.index, index);
    is(tab.mailTab, mailTab);
  }

  let extension = createExtension();
  await extension.startup();

  let tabmail = document.getElementById("tabmail");
  window.openContentTab("about:config");
  window.openContentTab("about:mozilla");
  tabmail.openTab("folder", { folder: gFolders[0] });

  let tabs = tabmail.tabbox.tabs.children;
  let menu = document.getElementById("tabContextMenu");

  await checkTabEvent(0, false, true);
  await checkTabEvent(1, false, false);
  await checkTabEvent(2, false, false);
  await checkTabEvent(3, true, true);

  await extension.unload();

  tabmail.closeOtherTabs(tabmail.tabModes.folder.tabs[0]);
});
