/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(2);

let gAccount, gFolders, gMessage;

const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

const URL_BASE =
  "http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data";

const treeClick = mailTestUtils.treeClick.bind(null, EventUtils, window);

/**
 * Left-click on something and wait for the context menu to appear.
 * For elements in the parent process only.
 *
 * @param {Element} menu     The <menu> that should appear.
 * @param {Element} element  The element to be clicked on.
 * @returns {Promise}        A promise that resolves when the menu appears.
 */
function leftClick(menu, element) {
  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(element, {}, element.ownerGlobal);
  return shownPromise;
}
/**
 * Right-click on something and wait for the context menu to appear.
 * For elements in the parent process only.
 *
 * @param {Element} menu     The <menu> that should appear.
 * @param {Element} element  The element to be clicked on.
 * @returns {Promise}        A promise that resolves when the menu appears.
 */
function rightClick(menu, element) {
  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    element,
    { type: "contextmenu" },
    element.ownerGlobal
  );
  return shownPromise;
}

/**
 * Right-click on something in a content document and wait for the context
 * menu to appear.
 *
 * @param {Element} menu     The <menu> that should appear.
 * @param {string} selector  CSS selector of the element to be clicked on.
 * @param {Element} browser  <browser> containing the element.
 * @returns {Promise}        A promise that resolves when the menu appears.
 */
async function rightClickOnContent(menu, selector, browser) {
  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    selector,
    { type: "contextmenu" },
    browser
  );
  return shownPromise;
}

/**
 * Check the parameters of a browser.onShown event was fired.
 *
 * @see https://thunderbird-webextensions.readthedocs.io/en/latest/menus.html#menus-onshown
 *
 * @param extension
 * @param {Object} expectedInfo
 * @param {Array?} expectedInfo.menuIds
 * @param {Array?} expectedInfo.contexts
 * @param {Array?} expectedInfo.attachments
 * @param {Object?} expectedInfo.displayedFolder
 * @param {Object?} expectedInfo.selectedFolder
 * @param {Array?} expectedInfo.selectedMessages
 * @param {RegExp?} expectedInfo.pageUrl
 * @param {string?} expectedInfo.selectionText
 * @param {Object} expectedTab
 * @param {boolean} expectedTab.active
 * @param {integer} expectedTab.index
 * @param {boolean} expectedTab.mailTab
 */
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

  Assert.equal(!!info.pageUrl, !!expectedInfo.pageUrl, "pageUrl in info");
  if (expectedInfo.pageUrl) {
    if (typeof expectedInfo.pageUrl == "string") {
      Assert.equal(info.pageUrl, expectedInfo.pageUrl);
    } else {
      Assert.ok(info.pageUrl.match(expectedInfo.pageUrl));
    }
  }

  Assert.equal(
    !!info.selectionText,
    !!expectedInfo.selectionText,
    "selectionText in info"
  );
  if (expectedInfo.selectionText) {
    Assert.equal(info.selectionText, expectedInfo.selectionText);
  }

  Assert.equal(tab.active, expectedTab.active, "tab is active");
  Assert.equal(tab.index, expectedTab.index, "tab index");
  Assert.equal(tab.mailTab, expectedTab.mailTab, "tab is mailTab");
}

/**
 * Check the parameters of a browser.onClicked event was fired.
 *
 * @see https://thunderbird-webextensions.readthedocs.io/en/latest/menus.html#menus-onclicked
 *
 * @param extension
 * @param {Object} expectedInfo
 * @param {string?} expectedInfo.selectionText
 * @param {string?} expectedInfo.linkText
 * @param {RegExp?} expectedInfo.pageUrl
 * @param {RegExp?} expectedInfo.linkUrl
 * @param {RegExp?} expectedInfo.srcUrl
 * @param {Object} expectedTab
 * @param {boolean} expectedTab.active
 * @param {integer} expectedTab.index
 * @param {boolean} expectedTab.mailTab
 */
async function checkClickedEvent(extension, expectedInfo, expectedTab) {
  let [info, tab] = await extension.awaitMessage("onClicked");

  Assert.equal(info.selectionText, expectedInfo.selectionText, "selectionText");
  Assert.equal(info.linkText, expectedInfo.linkText, "linkText");
  if (expectedInfo.menuItemId) {
    Assert.equal(info.menuItemId, expectedInfo.menuItemId, "menuItemId");
  }

  for (let infoKey of ["pageUrl", "linkUrl", "srcUrl"]) {
    Assert.equal(
      !!info[infoKey],
      !!expectedInfo[infoKey],
      `${infoKey} in info`
    );
    if (expectedInfo[infoKey]) {
      if (typeof expectedInfo[infoKey] == "string") {
        Assert.equal(info[infoKey], expectedInfo[infoKey]);
      } else {
        Assert.ok(info[infoKey].match(expectedInfo[infoKey]));
      }
    }
  }

  Assert.equal(tab.active, expectedTab.active, "tab is active");
  Assert.equal(tab.index, expectedTab.index, "tab index");
  Assert.equal(tab.mailTab, expectedTab.mailTab, "tab is mailTab");
}

function getExtensionDetails(...permissions) {
  return {
    files: {
      "background.js": async () => {
        for (let context of [
          "audio",
          "browser_action",
          "compose_action",
          "message_display_action",
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
          "tools_menu",
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
        browser.test.sendMessage("menus-created");
      },
    },
    manifest: {
      applications: {
        gecko: {
          id: "menus@mochi.test",
        },
      },
      browser_action: {
        default_title: "This is a test",
      },
      compose_action: {
        default_title: "This is a test",
      },
      message_display_action: {
        default_title: "This is a test",
      },
      background: { scripts: ["background.js"] },
      permissions: [...permissions, "menus"],
    },
    useAddonManager: "temporary",
  };
}

add_task(async function set_up() {
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

  window.gFolderTreeView.selectFolder(gAccount.incomingServer.rootFolder);
  if (
    document.getElementById("folderpane_splitter").getAttribute("state") ==
    "collapsed"
  ) {
    window.MsgToggleFolderPane();
  }
});

async function subtest_tools_menu(testWindow, expectedInfo, expectedTab) {
  let extensionDetails = getExtensionDetails();
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");

  let element = testWindow.document.getElementById("tasksMenu");
  let menu = testWindow.document.getElementById("taskPopup");
  await leftClick(menu, element);
  await checkShownEvent(
    extension,
    { menuIds: ["tools_menu"], contexts: ["tools_menu"] },
    expectedTab
  );

  let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  let clickedPromise = checkClickedEvent(extension, expectedInfo, expectedTab);
  menu.activateItem(
    menu.querySelector("#menus_mochi_test-menuitem-_tools_menu")
  );
  await clickedPromise;
  await hiddenPromise;
  await extension.unload();
}

add_task(async function test_tools_menu() {
  let toolbar = window.document.getElementById("mail-toolbar-menubar2");
  let initialState = toolbar.getAttribute("inactive");
  toolbar.setAttribute("inactive", "false");

  await subtest_tools_menu(
    window,
    {
      pageUrl: "about:blank",
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: true }
  );

  toolbar.setAttribute("inactive", initialState);
}).__skipMe = AppConstants.platform == "macosx";

add_task(async function test_compose_tools_menu() {
  let testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: false }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).__skipMe = AppConstants.platform == "macosx";

add_task(async function test_messagewindow_tools_menu() {
  let testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: false }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).__skipMe = AppConstants.platform == "macosx";

add_task(async function test_addressbook_tools_menu() {
  let testWindow = await openAddressbookWindow();
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: false }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).__skipMe = AppConstants.platform == "macosx";

async function subtest_folder_pane(...permissions) {
  let extensionDetails = getExtensionDetails(...permissions);
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");

  let folderTree = document.getElementById("folderTree");
  let menu = document.getElementById("folderPaneContext");
  treeClick(folderTree, 1, 0, {});
  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  treeClick(folderTree, 1, 0, { type: "contextmenu" });

  await shownPromise;
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_folder_pane"));
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

  treeClick(folderTree, 0, 0, {});
  shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  treeClick(folderTree, 0, 0, { type: "contextmenu" });

  await shownPromise;
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_folder_pane"));
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["folder_pane"],
      contexts: ["folder_pane", "all"],
      selectedAccount: permissions.length
        ? { id: gAccount.key, type: "none" }
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
  window.gFolderTreeView.selectFolder(gFolders[0]);
  window.gFolderDisplay.tree.view.selection.select(0);
  if (window.IsMessagePaneCollapsed()) {
    window.MsgToggleMessagePane();
  }

  let extensionDetails = getExtensionDetails(...permissions);
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");

  info("Test the thread pane in the 3-pane tab.");

  let threadTree = document.getElementById("threadTree");
  treeClick(threadTree, 0, 1, {});
  let menu = document.getElementById("mailContext");
  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  treeClick(threadTree, 0, 1, { type: "contextmenu" });

  await shownPromise;
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_message_list"));
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
        ? { id: null, messages: [{ subject: gMessage.subject }] }
        : undefined,
    },
    { active: true, index: 0, mailTab: true }
  );

  info("Test the message pane in the 3-pane tab.");

  let messagePane = document.getElementById("messagepane");

  await subtest_content(
    extension,
    permissions.includes("messagesRead"),
    messagePane,
    /^mailbox\:/,
    { active: true, index: 0, mailTab: true }
  );

  window.gFolderDisplay.tree.view.selection.clearSelection();
  await BrowserTestUtils.browserLoaded(messagePane, undefined, "about:blank");

  info("Test the message pane in a tab.");

  await openMessageInTab(gMessage);

  await subtest_content(
    extension,
    permissions.includes("messagesRead"),
    messagePane,
    /^mailbox\:/,
    { active: true, index: 1, mailTab: false }
  );

  window.gFolderDisplay.tree.view.selection.clearSelection();

  let tabmail = document.getElementById("tabmail");
  tabmail.closeOtherTabs(tabmail.tabModes.folder.tabs[0]);

  if (
    messagePane.webProgress?.isLoadingDocument ||
    messagePane.currentURI?.spec != "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(messagePane, undefined, "about:blank");
  }

  info("Test the message pane in a separate window.");

  let displayWindow = await openMessageInWindow(gMessage);
  let displayDocument = displayWindow.document;
  menu = displayDocument.getElementById("mailContext");
  messagePane = displayDocument.getElementById("messagepane");

  await subtest_content(
    extension,
    permissions.includes("messagesRead"),
    messagePane,
    /^mailbox\:/,
    { active: true, index: 0, mailTab: false }
  );

  await extension.unload();

  await BrowserTestUtils.closeWindow(displayWindow);
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
    await rightClick(menu, tabs[index]);
    Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_tab"));
    menu.hidePopup();

    await checkShownEvent(
      extension,
      { menuIds: ["tab"], contexts: ["tab"] },
      { active, index, mailTab }
    );
  }

  let extensionDetails = getExtensionDetails();
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");

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

async function subtest_content(
  extension,
  extensionHasPermission,
  browser,
  pageUrl,
  tab
) {
  if (
    browser.webProgress?.isLoadingDocument ||
    !browser.currentURI ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(
      browser,
      undefined,
      url => url != "about:blank"
    );
  }

  let ownerDocument = browser.ownerDocument;
  let menu = ownerDocument.getElementById(browser.getAttribute("context"));

  await BrowserTestUtils.synthesizeMouseAtCenter("body", {}, browser);

  info("Test a part of the page with no content.");

  await rightClickOnContent(menu, "body", browser);
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_page"));
  let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.hidePopup();
  await hiddenPromise;
  // Sometimes, the popup will open then instantly disappear. It seems to
  // still be hiding after the previous appearance. If we wait a little bit,
  // this doesn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 250));

  await checkShownEvent(
    extension,
    {
      menuIds: ["page"],
      contexts: ["page", "all"],
      pageUrl: extensionHasPermission ? pageUrl : undefined,
    },
    tab
  );

  info("Test selection.");

  await SpecialPowers.spawn(browser, [], () => {
    let text = content.document.querySelector("p");
    content.getSelection().selectAllChildren(text);
  });
  await rightClickOnContent(menu, "p", browser);
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_selection"));
  await checkShownEvent(
    extension,
    {
      pageUrl: extensionHasPermission ? pageUrl : undefined,
      selectionText: extensionHasPermission ? "This is text." : undefined,
      menuIds: ["selection"],
      contexts: ["selection", "all"],
    },
    tab
  );

  hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  let clickedPromise = checkClickedEvent(
    extension,
    {
      pageUrl,
      selectionText: "This is text.",
    },
    tab
  );
  menu.activateItem(
    menu.querySelector("#menus_mochi_test-menuitem-_selection")
  );
  await clickedPromise;
  await hiddenPromise;

  // Sometimes, the popup will open then instantly disappear. It seems to
  // still be hiding after the previous appearance. If we wait a little bit,
  // this doesn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 250));

  await BrowserTestUtils.synthesizeMouseAtCenter("body", {}, browser); // Select nothing.

  info("Test link.");

  await rightClickOnContent(menu, "a", browser);
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_link"));
  await checkShownEvent(
    extension,
    {
      pageUrl: extensionHasPermission ? pageUrl : undefined,
      menuIds: ["link"],
      contexts: ["link", "all"],
    },
    tab
  );

  hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  clickedPromise = checkClickedEvent(
    extension,
    {
      pageUrl,
      linkUrl: "http://mochi.test:8888/",
      linkText: "This is a link with text.",
    },
    tab
  );
  menu.activateItem(menu.querySelector("#menus_mochi_test-menuitem-_link"));
  await clickedPromise;
  await hiddenPromise;
  // Sometimes, the popup will open then instantly disappear. It seems to
  // still be hiding after the previous appearance. If we wait a little bit,
  // this doesn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 250));

  info("Test image.");

  await rightClickOnContent(menu, "img", browser);
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_image"));
  await checkShownEvent(
    extension,
    {
      pageUrl: extensionHasPermission ? pageUrl : undefined,
      menuIds: ["image"],
      contexts: ["image", "all"],
    },
    tab
  );

  hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  clickedPromise = checkClickedEvent(
    extension,
    {
      pageUrl,
      srcUrl: `${URL_BASE}/tb-logo.png`,
    },
    tab
  );
  menu.activateItem(menu.querySelector("#menus_mochi_test-menuitem-_image"));
  await clickedPromise;
  await hiddenPromise;
  // Sometimes, the popup will open then instantly disappear. It seems to
  // still be hiding after the previous appearance. If we wait a little bit,
  // this doesn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 250));
}

// Test UI elements which have been made accessible for the menus API.
// Assumed to be run after subtest_content, so we know everything has finished
// loading.
async function subtest_element(
  extension,
  extensionHasPermission,
  element,
  pageUrl,
  tab
) {
  for (let selectedTest of [false, true]) {
    element.focus();
    if (selectedTest) {
      element.value = "This is selected text.";
      element.select();
    } else {
      element.value = "";
    }

    let event = await rightClick(element.ownerGlobal, element);
    let menu = event.target;
    let trigger = menu.triggerNode;
    let menuitem = menu.querySelector("#menus_mochi_test-menuitem-_editable");
    Assert.equal(
      element.id,
      trigger.id,
      "Contextmenu of correct element has been triggered."
    );
    Assert.equal(
      menuitem.id,
      "menus_mochi_test-menuitem-_editable",
      "Contextmenu includes menu."
    );

    await checkShownEvent(
      extension,
      {
        menuIds: selectedTest ? ["editable", "selection"] : ["editable"],
        contexts: selectedTest
          ? ["editable", "selection", "all"]
          : ["editable", "all"],
        pageUrl: extensionHasPermission ? pageUrl : undefined,
        selectionText:
          extensionHasPermission && selectedTest
            ? "This is selected text."
            : undefined,
      },
      tab
    );

    // With text being selected, there will be two "context" entries in an
    // extension submenu. Open the submenu.
    let submenu = null;
    if (selectedTest) {
      for (let foundMenu of menu.querySelectorAll(
        "[id^='menus_mochi_test-menuitem-']"
      )) {
        if (!foundMenu.id.startsWith("menus_mochi_test-menuitem-_")) {
          submenu = foundMenu;
        }
      }
      Assert.ok(submenu, "Submenu found.");
      let submenuPromise = BrowserTestUtils.waitForEvent(
        element.ownerGlobal,
        "popupshown"
      );
      submenu.openMenu(true);
      await submenuPromise;
    }

    let hiddenPromise = BrowserTestUtils.waitForEvent(
      element.ownerGlobal,
      "popuphidden"
    );
    let clickedPromise = checkClickedEvent(
      extension,
      {
        pageUrl,
        selectionText: selectedTest ? "This is selected text." : undefined,
      },
      tab
    );
    if (submenu) {
      submenu.menupopup.activateItem(menuitem);
    } else {
      menu.activateItem(menuitem);
    }
    await clickedPromise;
    await hiddenPromise;

    // Sometimes, the popup will open then instantly disappear. It seems to
    // still be hiding after the previous appearance. If we wait a little bit,
    // this doesn't happen.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(r => setTimeout(r, 250));
  }
}

add_task(async function test_content() {
  window.gFolderTreeView.selectFolder(gFolders[0]);
  if (window.IsMessagePaneCollapsed()) {
    window.MsgToggleMessagePane();
  }

  let oldPref = Services.prefs.getStringPref("mailnews.start_page.url");
  Services.prefs.setStringPref(
    "mailnews.start_page.url",
    `${URL_BASE}/content.html`
  );

  let messagePane = document.getElementById("messagepane");

  let loadPromise = BrowserTestUtils.browserLoaded(messagePane);
  window.loadStartPage();
  await loadPromise;

  let extensionDetails = getExtensionDetails("<all_urls>");
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");

  await subtest_content(
    extension,
    true,
    messagePane,
    `${URL_BASE}/content.html`,
    { active: true, index: 0, mailTab: true }
  );

  await extension.unload();

  Services.prefs.setStringPref("mailnews.start_page.url", oldPref);
});

add_task(async function test_content_tab() {
  let tab = window.openContentTab(`${URL_BASE}/content.html`);
  await BrowserTestUtils.browserLoaded(tab.browser);

  let extensionDetails = getExtensionDetails("<all_urls>");
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");

  await subtest_content(
    extension,
    true,
    tab.browser,
    `${URL_BASE}/content.html`,
    { active: true, index: 1, mailTab: false }
  );

  await extension.unload();

  let tabmail = document.getElementById("tabmail");
  tabmail.closeOtherTabs(tabmail.tabModes.folder.tabs[0]);
});

add_task(async function test_content_window() {
  let extensionWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.openDialog(
    "chrome://messenger/content/extensionPopup.xhtml",
    "_blank",
    "width=800,height=500,resizable",
    `${URL_BASE}/content.html`
  );
  let extensionWindow = await extensionWindowPromise;
  await focusWindow(extensionWindow);

  if (
    extensionWindow.browser.webProgress?.isLoadingDocument ||
    extensionWindow.browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(
      extensionWindow.browser,
      undefined,
      url => url != "about:blank"
    );
  }

  let extensionDetails = getExtensionDetails("<all_urls>");
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");

  await subtest_content(
    extension,
    true,
    extensionWindow.browser,
    `${URL_BASE}/content.html`,
    { active: true, index: 0, mailTab: false }
  );

  await extension.unload();

  await BrowserTestUtils.closeWindow(extensionWindow);
});

async function subtest_compose(...permissions) {
  let extensionDetails = getExtensionDetails(...permissions);
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");

  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  params.composeFields.body = await fetch(
    `${URL_BASE}/content_body.html`
  ).then(r => r.text());

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
  await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");
  let composeDocument = composeWindow.document;
  await focusWindow(composeWindow);

  info("Test the message being composed.");

  let messagePane = composeWindow.GetCurrentEditorElement();

  await subtest_content(
    extension,
    permissions.includes("compose"),
    messagePane,
    "about:blank?compose",
    { active: true, index: 0, mailTab: false }
  );

  const chromeElementsMap = {
    msgSubject: "composeSubject",
    toAddrInput: "composeTo",
  };
  for (let elementId of Object.keys(chromeElementsMap)) {
    info(`Test element ${elementId}.`);
    await subtest_element(
      extension,
      permissions.includes("compose"),
      composeWindow.document.getElementById(elementId),
      "about:blank?compose",
      {
        active: true,
        index: 0,
        mailTab: false,
        fieldId: chromeElementsMap[elementId],
      }
    );
  }

  info("Test the attachments context menu.");

  composeWindow.toggleAttachmentPane("show");
  let menu = composeDocument.getElementById("msgComposeAttachmentItemContext");
  let attachmentBucket = composeDocument.getElementById("attachmentBucket");

  EventUtils.synthesizeMouseAtCenter(
    attachmentBucket.itemChildren[0],
    {},
    composeWindow
  );
  await rightClick(menu, attachmentBucket.itemChildren[0], composeWindow);
  Assert.ok(
    menu.querySelector("#menus_mochi_test-menuitem-_compose_attachments")
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
  await rightClick(menu, attachmentBucket.itemChildren[0], composeWindow);
  Assert.ok(
    menu.querySelector("#menus_mochi_test-menuitem-_compose_attachments")
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

async function subtest_action_menu(
  testWindow,
  target,
  expectedInfo,
  expectedTab
) {
  function checkVisibility(menu, visible) {
    let removeExtension = menu.querySelector(
      ".customize-context-removeExtension"
    );
    let manageExtension = menu.querySelector(
      ".customize-context-manageExtension"
    );

    info(`Check visibility: ${visible}`);
    is(!removeExtension.hidden, visible, "Remove Extension should be visible");
    is(!manageExtension.hidden, visible, "Manage Extension should be visible");
  }

  async function testContextMenuRemoveExtension(extension, menu, element) {
    let name = "Generated extension";
    let brand = Services.strings
      .createBundle("chrome://branding/locale/brand.properties")
      .GetStringFromName("brandShorterName");

    let { prompt } = Services;
    let promptService = {
      _response: 1,
      QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
      confirmEx(...args) {
        promptService._confirmExArgs = args;
        return promptService._response;
      },
    };
    Services.prompt = promptService;

    info(
      `Choosing 'Remove Extension' in ${menu.id} should show confirm dialog.`
    );
    await rightClick(menu, element);
    await extension.awaitMessage("onShown");
    let removeExtension = menu.querySelector(
      ".customize-context-removeExtension"
    );
    let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.activateItem(removeExtension);
    await hiddenPromise;

    // Check if the correct add-on is being removed.
    is(promptService._confirmExArgs[1], `Remove ${name}?`);
    if (!Services.prefs.getBoolPref("prompts.windowPromptSubDialog", false)) {
      is(
        promptService._confirmExArgs[2],
        `Remove ${name} as well as its configuration and data from ${brand}?`
      );
    }
    is(promptService._confirmExArgs[4], "Remove");

    Services.prompt = prompt;
  }

  async function testContextMenuManageExtension(extension, menu, element) {
    let id = "menus@mochi.test";
    let tabmail = window.document.getElementById("tabmail");

    info(
      `Choosing 'Manage Extension' in ${menu.id} should load the management page.`
    );
    await rightClick(menu, element);
    await extension.awaitMessage("onShown");
    let manageExtension = menu.querySelector(
      ".customize-context-manageExtension"
    );
    let addonManagerPromise = contentTabOpenPromise(tabmail, "about:addons");
    menu.activateItem(manageExtension);
    let managerTab = await addonManagerPromise;

    // Check the UI to make sure that the correct view is loaded.
    let managerWindow = managerTab.linkedBrowser.contentWindow;
    is(
      managerWindow.gViewController.currentViewId,
      `addons://detail/${encodeURIComponent(id)}`,
      "Expected extension details view in about:addons"
    );
    // In HTML about:addons, the default view does not show the inline
    // options browser, so we should not receive an "options-loaded" event.
    // (if we do, the test will fail due to the unexpected message).

    is(managerTab.linkedBrowser.currentURI.spec, "about:addons");
    tabmail.closeTab(managerTab);
  }

  let extensionDetails = getExtensionDetails();
  if (target.area) {
    extensionDetails.manifest[target.context].default_area = target.area;
  }

  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");

  let element = testWindow.document.getElementById(target.elementId);
  let menu = testWindow.document.getElementById(target.menuId);

  await rightClick(menu, element);
  await checkVisibility(menu, true);
  await checkShownEvent(
    extension,
    { menuIds: [target.context], contexts: [target.context, "all"] },
    expectedTab
  );

  let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  let clickedPromise = checkClickedEvent(extension, expectedInfo, expectedTab);
  menu.activateItem(
    menu.querySelector(`#menus_mochi_test-menuitem-_${target.context}`)
  );
  await clickedPromise;
  await hiddenPromise;

  // Test the non actionButton element for visibility of the management menu entries.
  if (target.nonActionButtonElementId) {
    let nonActionButtonElement = testWindow.document.getElementById(
      target.nonActionButtonElementId
    );
    await rightClick(menu, nonActionButtonElement);
    await checkVisibility(menu, false);
    let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.hidePopup();
    await hiddenPromise;
  }

  await testContextMenuManageExtension(extension, menu, element);
  await testContextMenuRemoveExtension(extension, menu, element);
  await extension.unload();
}

add_task(async function test_browser_action_menu() {
  await subtest_action_menu(
    window,
    {
      menuId: "toolbar-context-menu",
      elementId: "menus_mochi_test-browserAction-toolbarbutton",
      context: "browser_action",
      nonActionButtonElementId: "button-chat",
    },
    {
      pageUrl: "about:blank",
      menuItemId: "browser_action",
    },
    { active: true, index: 0, mailTab: true }
  );
});

add_task(async function test_browser_action_menu_tabstoolbar() {
  await subtest_action_menu(
    window,
    {
      menuId: "toolbar-context-menu",
      elementId: "menus_mochi_test-browserAction-toolbarbutton",
      context: "browser_action",
      area: "tabstoolbar",
    },
    {
      pageUrl: "about:blank",
      menuItemId: "browser_action",
    },
    { active: true, index: 0, mailTab: true }
  );
});

add_task(async function test_message_display_action_menu_pane() {
  let tab = await openMessageInTab(gMessage);
  // No check for menu entries in nonActionButtonElements as the header-toolbar
  // does not have a context menu associated.
  await subtest_action_menu(
    window,
    {
      menuId: "header-toolbar-context-menu",
      elementId: "menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action",
    },
    { active: true, index: 1, mailTab: false }
  );
  window.document.getElementById("tabmail").closeTab(tab);
});

add_task(async function test_message_display_action_menu_window() {
  let testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  // No check for menu entries in nonActionButtonElements as the header-toolbar
  // does not have a context menu associated.
  await subtest_action_menu(
    testWindow,
    {
      menuId: "header-toolbar-context-menu",
      elementId: "menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action",
    },
    { active: true, index: 0, mailTab: false }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});

add_task(async function test_compose_action_menu() {
  let testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_action_menu(
    testWindow,
    {
      menuId: "toolbar-context-menu",
      elementId: "menus_mochi_test-composeAction-toolbarbutton",
      context: "compose_action",
      nonActionButtonElementId: "button-attach",
    },
    {
      pageUrl: "about:blank?compose",
      menuItemId: "compose_action",
    },
    { active: true, index: 0, mailTab: false }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});

add_task(async function test_compose_action_menu_formattoolbar() {
  let testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_action_menu(
    testWindow,
    {
      menuId: "format-toolbar-context-menu",
      elementId: "menus_mochi_test-composeAction-toolbarbutton",
      context: "compose_action",
      area: "formattoolbar",
    },
    {
      pageUrl: "about:blank?compose",
      menuItemId: "compose_action",
    },
    { active: true, index: 0, mailTab: false }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
