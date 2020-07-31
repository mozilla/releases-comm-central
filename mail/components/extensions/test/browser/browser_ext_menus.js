/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gAccount, gFolders;

const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

const treeClick = mailTestUtils.treeClick.bind(null, EventUtils, window);

async function checkShownEvent(extension, menuIds, contexts) {
  let [info, tab] = await extension.awaitMessage("onShown");
  is(info.menuIds.length, menuIds.length);
  for (let i = 0; i < menuIds.length; i++) {
    is(info.menuIds[i], menuIds[i]);
  }
  is(info.contexts.length, contexts.length);
  for (let i = 0; i < contexts.length; i++) {
    is(info.contexts[i], contexts[i]);
  }
  return [info, tab];
}

async function checkClickedEvent(extension, properties) {
  let [info, tab] = await extension.awaitMessage("onClicked");
  for (let [name, value] of Object.entries(properties)) {
    is(info[name], value);
  }
  return [info, tab];
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
        browser.menus.create({
          id: context,
          title: context,
          contexts: [context],
        });
      }

      browser.menus.onShown.addListener((...args) => {
        browser.test.sendMessage("onShown", args);
      });

      browser.menus.onClicked.addListener((...args) => {
        browser.test.sendMessage("onClicked", args);
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
  await Services.search.init();

  gAccount = createAccount();
  gFolders = [...gAccount.incomingServer.rootFolder.subFolders];
  createMessages(gFolders[0], 10);

  window.gFolderTreeView.selectFolder(gAccount.incomingServer.rootFolder);
  if (
    document.getElementById("folderpane_splitter").getAttribute("state") ==
    "collapsed"
  ) {
    window.MsgToggleFolderPane();
  }
});

add_task(async function test_folder_pane() {
  let extension = createExtension();
  await extension.startup();

  let folderTree = document.getElementById("folderTree");
  treeClick(folderTree, 1, 0, {});
  treeClick(folderTree, 1, 0, { type: "contextmenu" });

  let menu = document.getElementById("folderPaneContext");
  await BrowserTestUtils.waitForEvent(menu, "popupshown");
  ok(menu.querySelector("#test1_mochi_test-menuitem-_folder_pane"));
  menu.hidePopup();

  let [info] = await checkShownEvent(
    extension,
    ["folder_pane"],
    ["folder_pane", "all"]
  );
  is(info.selectedFolder.accountId, gAccount.key);
  is(info.selectedFolder.path, "/Trash");
  ok(!info.displayedFolder);
  ok(!info.selectedMessages);

  await extension.unload();
});

add_task(async function test_thread_pane() {
  let extension = createExtension();
  await extension.startup();

  let threadTree = document.getElementById("threadTree");
  treeClick(threadTree, 1, 1, {});
  treeClick(threadTree, 1, 1, { type: "contextmenu" });

  let menu = document.getElementById("mailContext");
  await BrowserTestUtils.waitForEvent(menu, "popupshown");
  ok(menu.querySelector("#test1_mochi_test-menuitem-_message_list"));
  menu.hidePopup();

  let [info] = await checkShownEvent(
    extension,
    ["message_list"],
    ["message_list", "all"]
  );
  is(info.displayedFolder.accountId, gAccount.key);
  is(info.displayedFolder.path, "/Trash");
  is(info.selectedMessages.cursor, undefined);
  ok(!info.selectedFolder);

  await extension.unload();
});

add_task(async function test_tab() {
  async function checkTabEvent(index, active, mailTab) {
    EventUtils.synthesizeMouseAtCenter(
      tabs[index],
      { type: "contextmenu" },
      window
    );

    await BrowserTestUtils.waitForEvent(menu, "popupshown");
    ok(menu.querySelector("#test1_mochi_test-menuitem-_tab"));
    menu.hidePopup();

    let [info, tab] = await checkShownEvent(extension, ["tab"], ["tab"]);
    ok(!info.selectedFolder);
    ok(!info.displayedFolder);
    ok(!info.selectedMessages);
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

  let tabs = document.getElementById("tabmail-tabs").allTabs;
  let menu = document.getElementById("tabContextMenu");

  await checkTabEvent(0, false, true);
  await checkTabEvent(1, false, false);
  await checkTabEvent(2, false, false);
  await checkTabEvent(3, true, true);

  await extension.unload();

  tabmail.closeOtherTabs(tabmail.tabModes.folder.tabs[0]);
});

add_task(async function test_selection() {
  let extension = createExtension();
  await extension.startup();

  if (window.IsMessagePaneCollapsed()) {
    window.MsgToggleMessagePane();
  }

  let oldPref = Services.prefs.getStringPref("mailnews.start_page.url");
  Services.prefs.setStringPref(
    "mailnews.start_page.url",
    "http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html"
  );

  let tabmail = document.getElementById("tabmail");
  let menu = document.getElementById("mailContext");

  window.loadStartPage();
  await BrowserTestUtils.waitForEvent(
    tabmail.selectedBrowser,
    "DOMContentLoaded"
  );

  let { contentDocument, contentWindow } = tabmail.selectedBrowser;

  let text = contentDocument.querySelector("p");
  EventUtils.synthesizeMouseAtCenter(text, {}, contentWindow);
  contentWindow.getSelection().selectAllChildren(text);
  EventUtils.synthesizeMouseAtCenter(
    text,
    { type: "contextmenu" },
    contentWindow
  );

  await BrowserTestUtils.waitForEvent(menu, "popupshown");
  ok(menu.querySelector("#test1_mochi_test-menuitem-_selection"));
  await checkShownEvent(extension, ["selection"], ["selection", "all"]);

  EventUtils.synthesizeMouseAtCenter(
    menu.querySelector("#test1_mochi_test-menuitem-_selection"),
    {}
  );
  await checkClickedEvent(extension, {
    selectionText: "This is text.",
  });

  let link = contentDocument.querySelector("a");
  EventUtils.synthesizeMouseAtCenter(
    link,
    { type: "contextmenu" },
    contentWindow
  );

  await BrowserTestUtils.waitForEvent(menu, "popupshown");
  ok(menu.querySelector("#test1_mochi_test-menuitem-_selection"));
  await checkShownEvent(
    extension,
    ["link", "selection"],
    ["link", "selection", "all"]
  );

  EventUtils.synthesizeMouseAtCenter(
    menu.querySelector(`menu[id^="test1_mochi_test-menuitem"]`),
    {}
  );
  await BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    menu.querySelector("#test1_mochi_test-menuitem-_link"),
    {}
  );
  await checkClickedEvent(extension, {
    linkUrl: "http://mochi.test:8888/",
    linkText: "This is a link with text.",
    selectionText: "This is text.",
  });

  await extension.unload();
  Services.prefs.setStringPref("mailnews.start_page.url", oldPref);
});
