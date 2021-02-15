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
    manifest: {
      applications: {
        gecko: {
          id: "menus@mochi.test",
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
  gFolders = gAccount.incomingServer.rootFolder.subFolders;
  createMessages(gFolders[0], {
    count: 1,
    body: {
      contentType: "text/html",
      body: await fetch(`${URL_BASE}/content.html`).then(r => r.text()),
    },
  });
  gMessage = gFolders[0].messages.getNext().QueryInterface(Ci.nsIMsgDBHdr);

  window.gFolderTreeView.selectFolder(gAccount.incomingServer.rootFolder);
  if (
    document.getElementById("folderpane_splitter").getAttribute("state") ==
    "collapsed"
  ) {
    window.MsgToggleFolderPane();
  }
});

async function subtest_tools_menu(testwindow, expectedInfo, expectedTab) {
  let extension = createExtension();
  await extension.startup();
  await extension.awaitMessage("menus-created");

  let element = testwindow.document.getElementById("tasksMenu");
  let menu = testwindow.document.getElementById("taskPopup");
  await leftClick(menu, element);
  await checkShownEvent(
    extension,
    { menuIds: ["tools_menu"], contexts: ["tools_menu"] },
    expectedTab
  );

  let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  EventUtils.synthesizeMouseAtCenter(
    menu.querySelector("#menus_mochi_test-menuitem-_tools_menu"),
    {},
    testwindow
  );
  await checkClickedEvent(extension, expectedInfo, expectedTab);
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
  let testwindow = await openComposeWindow(gAccount);
  await focusWindow(testwindow);
  await subtest_tools_menu(
    testwindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: false }
  );
  testwindow.close();
}).__skipMe = AppConstants.platform == "macosx";

add_task(async function test_messagewindow_tools_menu() {
  let testwindow = await openNewWindowForMessage(gMessage);
  await focusWindow(testwindow);
  await subtest_tools_menu(
    testwindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: false }
  );
  testwindow.close();
}).__skipMe = AppConstants.platform == "macosx";

add_task(async function test_addressbook_tools_menu() {
  let testwindow = await openAddressbookWindow();
  await focusWindow(testwindow);
  await subtest_tools_menu(
    testwindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: false }
  );
  testwindow.close();
}).__skipMe = AppConstants.platform == "macosx";

async function subtest_folder_pane(...permissions) {
  let extension = createExtension(...permissions);
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

  let extension = createExtension(...permissions);
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

  window.MailUtils.displayMessages(
    [gMessage],
    window.gFolderDisplay.view,
    document.getElementById("tabmail")
  );

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

  let displayWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.MsgOpenNewWindowForMessage(gMessage);
  let displayWindow = await displayWindowPromise;

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

  let extension = createExtension();
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

  let { ownerDocument, ownerGlobal } = browser;
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
  EventUtils.synthesizeMouseAtCenter(
    menu.querySelector("#menus_mochi_test-menuitem-_selection"),
    {},
    ownerGlobal
  );
  await checkClickedEvent(
    extension,
    {
      pageUrl,
      selectionText: "This is text.",
    },
    tab
  );
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
  EventUtils.synthesizeMouseAtCenter(
    menu.querySelector("#menus_mochi_test-menuitem-_link"),
    {},
    ownerGlobal
  );
  await checkClickedEvent(
    extension,
    {
      pageUrl,
      linkUrl: "http://mochi.test:8888/",
      linkText: "This is a link with text.",
    },
    tab
  );
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
  EventUtils.synthesizeMouseAtCenter(
    menu.querySelector("#menus_mochi_test-menuitem-_image"),
    {},
    ownerGlobal
  );
  await checkClickedEvent(
    extension,
    {
      pageUrl,
      srcUrl: `${URL_BASE}/tb-logo.png`,
    },
    tab
  );
  await hiddenPromise;
  // Sometimes, the popup will open then instantly disappear. It seems to
  // still be hiding after the previous appearance. If we wait a little bit,
  // this doesn't happen.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 250));
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

  let extension = createExtension("<all_urls>");
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

  let extension = createExtension("<all_urls>");
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

  let extension = createExtension("<all_urls>");
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
  let extension = createExtension(...permissions);
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
