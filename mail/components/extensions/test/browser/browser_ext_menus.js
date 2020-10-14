/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gAccount, gFolders, gMessages;

const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

const treeClick = mailTestUtils.treeClick.bind(null, EventUtils, window);

async function checkShownEvent(extension, expectedInfo, expectedTab) {
  let [info, tab] = await extension.awaitMessage("onShown");
  Assert.deepEqual(info.menuIds, expectedInfo.menuIds);
  Assert.deepEqual(info.contexts, expectedInfo.contexts);

  Assert.equal(
    !!info.attachments,
    !!expectedInfo.attachments,
    "attachments in info"
  );
  if (expectedInfo.attachments) {
    Assert.equal(info.attachments.length, expectedInfo.attachments.length);
    for (let i = 0; i < expectedInfo.attachments.length; i++) {
      Assert.equal(info.attachments[i].name, expectedInfo.attachments[i].name);
      Assert.equal(info.attachments[i].size, expectedInfo.attachments[i].size);
    }
  }

  for (let infoKey of ["displayedFolder", "selectedFolder"]) {
    Assert.equal(
      !!info[infoKey],
      !!expectedInfo[infoKey],
      `${infoKey} in info`
    );
    if (expectedInfo[infoKey]) {
      Assert.equal(info[infoKey].accountId, expectedInfo[infoKey].accountId);
      Assert.equal(info[infoKey].path, expectedInfo[infoKey].path);
      Assert.ok(Array.isArray(info[infoKey].subFolders));
    }
  }

  Assert.equal(
    !!info.selectedMessages,
    !!expectedInfo.selectedMessages,
    "selectedMessages in info"
  );
  if (expectedInfo.selectedMessages) {
    Assert.equal(info.selectedMessages.id, null);
    Assert.equal(
      info.selectedMessages.messages.length,
      expectedInfo.selectedMessages.messages.length
    );
    for (let i = 0; i < expectedInfo.selectedMessages.messages.length; i++) {
      Assert.equal(
        info.selectedMessages.messages[i].subject,
        expectedInfo.selectedMessages.messages[i].subject
      );
    }
  }

  Assert.equal(tab.active, expectedTab.active, "tab is active");
  Assert.equal(tab.index, expectedTab.index, "tab index");
  Assert.equal(tab.mailTab, expectedTab.mailTab, "tab is mailTab");

  return [info, tab];
}

async function checkClickedEvent(extension, properties) {
  let [info, tab] = await extension.awaitMessage("onClicked");
  for (let [name, value] of Object.entries(properties)) {
    Assert.equal(info[name], value);
  }
  return [info, tab];
}

function createExtension(...permissions) {
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
        "compose_attachments",
      ]) {
        browser.menus.create({
          id: context,
          title: context,
          contexts: [context],
        });
      }

      browser.menus.onShown.addListener((...args) => {
        // Test the getFile function here, we can't pass it to sendMessage.
        if ("attachments" in args[0]) {
          for (let attachment of args[0].attachments) {
            browser.test.assertEq(
              "function",
              typeof attachment.getFile,
              "attachment has a getFile function"
            );
          }
        }
        browser.test.sendMessage("onShown", args);
      });

      browser.menus.onClicked.addListener((...args) => {
        // Test the getFile function here, we can't pass it to sendMessage.
        if ("attachments" in args[0]) {
          for (let attachment of args[0].attachments) {
            browser.test.assertEq(
              "function",
              typeof attachment.getFile,
              "attachment has a getFile function"
            );
          }
        }
        browser.test.sendMessage("onClicked", args);
      });
    },
    manifest: {
      applications: {
        gecko: {
          id: "test1@mochi.test",
        },
      },
      permissions: [...permissions, "menus"],
    },
  });
}

add_task(async function set_up() {
  await Services.search.init();

  gAccount = createAccount();
  addIdentity(gAccount);
  gFolders = [...gAccount.incomingServer.rootFolder.subFolders];
  createMessages(gFolders[0], 10);
  gMessages = [...gFolders[0].messages];

  window.gFolderTreeView.selectFolder(gAccount.incomingServer.rootFolder);
  if (
    document.getElementById("folderpane_splitter").getAttribute("state") ==
    "collapsed"
  ) {
    window.MsgToggleFolderPane();
  }
});

async function subtest_folder_pane(...permissions) {
  let extension = createExtension(...permissions);
  await extension.startup();

  let folderTree = document.getElementById("folderTree");
  let menu = document.getElementById("folderPaneContext");
  treeClick(folderTree, 1, 0, {});
  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  treeClick(folderTree, 1, 0, { type: "contextmenu" });

  await shownPromise;
  Assert.ok(menu.querySelector("#test1_mochi_test-menuitem-_folder_pane"));
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["folder_pane"],
      contexts: ["folder_pane", "all"],
      selectedFolder: permissions.length
        ? { accountId: gAccount.key, path: "/Trash" }
        : undefined,
    },
    { active: true, index: 0, mailTab: true }
  );

  await extension.unload();
}
add_task(async function test_folder_pane() {
  return subtest_folder_pane("accountsRead");
});
add_task(async function test_folder_pane_no_permissions() {
  return subtest_folder_pane();
});

async function subtest_message_panes(...permissions) {
  let extension = createExtension(...permissions);
  await extension.startup();

  // Test the thread pane in the 3-pane tab.

  let threadTree = document.getElementById("threadTree");
  treeClick(threadTree, 1, 1, {});
  let menu = document.getElementById("mailContext");
  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  treeClick(threadTree, 1, 1, { type: "contextmenu" });

  await shownPromise;
  Assert.ok(menu.querySelector("#test1_mochi_test-menuitem-_message_list"));
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["message_list"],
      contexts: ["message_list", "all"],
      displayedFolder: permissions.includes("accountsRead")
        ? { accountId: gAccount.key, path: "/Trash" }
        : undefined,
      selectedMessages: permissions.includes("messagesRead")
        ? { id: null, messages: [{ subject: gMessages[1].subject }] }
        : undefined,
    },
    { active: true, index: 0, mailTab: true }
  );

  // Test the message pane in the 3-pane tab.

  let messagePane = document.getElementById("messagepane");
  await awaitBrowserLoaded(messagePane);

  EventUtils.synthesizeMouseAtCenter(messagePane, {});
  shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(messagePane, { type: "contextmenu" });

  await shownPromise;
  Assert.ok(menu.querySelector("#test1_mochi_test-menuitem-_page"));
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["page"],
      contexts: ["page", "all"],
    },
    { active: true, index: 0, mailTab: true }
  );

  // Test the message pane in a tab.

  window.MsgOpenSelectedMessages();
  await awaitBrowserLoaded(messagePane);

  EventUtils.synthesizeMouseAtCenter(messagePane, {});
  shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(messagePane, { type: "contextmenu" });

  await shownPromise;
  Assert.ok(menu.querySelector("#test1_mochi_test-menuitem-_page"));
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["page"],
      contexts: ["page", "all"],
    },
    { active: true, index: 1, mailTab: false }
  );

  let tabmail = document.getElementById("tabmail");
  tabmail.closeOtherTabs(tabmail.tabModes.folder.tabs[0]);

  await extension.unload();
}
add_task(async function test_message_panes() {
  return subtest_message_panes("accountsRead", "messagesRead");
});
add_task(async function test_message_panes_no_accounts_permission() {
  return subtest_message_panes("messagesRead");
});
add_task(async function test_message_panes_no_messages_permission() {
  return subtest_message_panes("accountsRead");
});
add_task(async function test_message_panes_no_permissions() {
  return subtest_message_panes();
});

add_task(async function test_tab() {
  async function checkTabEvent(index, active, mailTab) {
    let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(
      tabs[index],
      { type: "contextmenu" },
      window
    );

    await shownPromise;
    Assert.ok(menu.querySelector("#test1_mochi_test-menuitem-_tab"));
    menu.hidePopup();

    await checkShownEvent(
      extension,
      { menuIds: ["tab"], contexts: ["tab"] },
      { active, index, mailTab }
    );
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
  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    text,
    { type: "contextmenu" },
    contentWindow
  );

  await shownPromise;
  Assert.ok(menu.querySelector("#test1_mochi_test-menuitem-_selection"));
  await checkShownEvent(
    extension,
    { menuIds: ["selection"], contexts: ["selection", "all"] },
    { active: true, index: 0, mailTab: true }
  );

  EventUtils.synthesizeMouseAtCenter(
    menu.querySelector("#test1_mochi_test-menuitem-_selection"),
    {}
  );
  await checkClickedEvent(extension, {
    selectionText: "This is text.",
  });

  let link = contentDocument.querySelector("a");
  shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    link,
    { type: "contextmenu" },
    contentWindow
  );

  await shownPromise;
  Assert.ok(menu.querySelector("#test1_mochi_test-menuitem-_selection"));
  await checkShownEvent(
    extension,
    { menuIds: ["link", "selection"], contexts: ["link", "selection", "all"] },
    { active: true, index: 0, mailTab: true }
  );

  shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    menu.querySelector(`menu[id^="test1_mochi_test-menuitem"]`),
    {}
  );
  await shownPromise;
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

async function subtest_compose(...permissions) {
  let extension = createExtension(...permissions);
  await extension.startup();

  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  for (let ordinal of ["first", "second", "third", "fourth"]) {
    let attachment = Cc[
      "@mozilla.org/messengercompose/attachment;1"
    ].createInstance(Ci.nsIMsgAttachment);
    attachment.name = `${ordinal}.txt`;
    attachment.url = `data:text/plain,I'm the ${ordinal} attachment!`;
    attachment.size = attachment.url.length - 16;
    params.composeFields.addAttachment(attachment);
  }

  let composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "load");
  let composeDocument = composeWindow.document;
  await focusWindow(composeWindow);

  composeWindow.toggleAttachmentPane("show");
  let menu = composeDocument.getElementById("msgComposeAttachmentItemContext");
  let attachmentBucket = composeDocument.getElementById("attachmentBucket");

  EventUtils.synthesizeMouseAtCenter(
    attachmentBucket.itemChildren[0],
    {},
    composeWindow
  );
  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshowing");
  EventUtils.synthesizeMouseAtCenter(
    attachmentBucket.itemChildren[0],
    { type: "contextmenu" },
    composeWindow
  );
  await shownPromise;
  Assert.ok(
    menu.querySelector("#test1_mochi_test-menuitem-_compose_attachments")
  );
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["compose_attachments"],
      contexts: ["compose_attachments", "all"],
      attachments: permissions.length
        ? [{ name: "first.txt", size: 25 }]
        : undefined,
    },
    { active: true, index: 0, mailTab: false }
  );

  attachmentBucket.addItemToSelection(attachmentBucket.itemChildren[3]);
  shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshowing");
  EventUtils.synthesizeMouseAtCenter(
    attachmentBucket.itemChildren[0],
    { type: "contextmenu" },
    composeWindow
  );
  await shownPromise;
  Assert.ok(
    menu.querySelector("#test1_mochi_test-menuitem-_compose_attachments")
  );
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["compose_attachments"],
      contexts: ["compose_attachments", "all"],
      attachments: permissions.length
        ? [
            { name: "first.txt", size: 25 },
            { name: "fourth.txt", size: 26 },
          ]
        : undefined,
    },
    { active: true, index: 0, mailTab: false }
  );

  await extension.unload();

  await BrowserTestUtils.closeWindow(composeWindow);
}
add_task(async function test_compose() {
  return subtest_compose("compose");
});
add_task(async function test_compose_no_permissions() {
  return subtest_compose();
});
