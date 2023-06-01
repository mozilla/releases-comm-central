/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// FIXME: Break up test.
requestLongerTimeout(10);

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
  let extension = await getMenuExtension(manifest);
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
add_task(async function test_tools_menu_mv2() {
  let toolbar = window.document.getElementById("toolbar-menubar");
  let initialState = toolbar.getAttribute("inactive");
  toolbar.setAttribute("inactive", "false");

  await subtest_tools_menu(
    window,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: true },
    {
      manifest_version: 2,
    }
  );

  toolbar.setAttribute("inactive", initialState);
}).__skipMe = AppConstants.platform == "macosx";
add_task(async function test_compose_tools_menu_mv2() {
  let testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: false },
    {
      manifest_version: 2,
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).__skipMe = AppConstants.platform == "macosx";
add_task(async function test_messagewindow_tools_menu_mv2() {
  let testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: false },
    {
      manifest_version: 2,
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).__skipMe = AppConstants.platform == "macosx";
add_task(async function test_tools_menu_mv3() {
  let toolbar = window.document.getElementById("toolbar-menubar");
  let initialState = toolbar.getAttribute("inactive");
  toolbar.setAttribute("inactive", "false");

  await subtest_tools_menu(
    window,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: true },
    {
      manifest_version: 3,
    }
  );

  toolbar.setAttribute("inactive", initialState);
}).__skipMe = AppConstants.platform == "macosx";
add_task(async function test_compose_tools_menu_mv3() {
  let testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: false },
    {
      manifest_version: 3,
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).__skipMe = AppConstants.platform == "macosx";
add_task(async function test_messagewindow_tools_menu_mv3() {
  let testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  await subtest_tools_menu(
    testWindow,
    {
      menuItemId: "tools_menu",
    },
    { active: true, index: 0, mailTab: false },
    {
      manifest_version: 3,
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
}).__skipMe = AppConstants.platform == "macosx";

async function subtest_folder_pane(manifest) {
  let extension = await getMenuExtension(manifest);

  await extension.startup();
  await extension.awaitMessage("menus-created");

  let about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  let folderTree = about3Pane.document.getElementById("folderTree");
  let menu = about3Pane.document.getElementById("folderPaneContext");
  await rightClick(menu, folderTree.rows[1].querySelector(".container"));
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_folder_pane"));
  menu.hidePopup();

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
  menu.hidePopup();

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

async function subtest_message_panes(manifest) {
  let tabmail = document.getElementById("tabmail");
  let about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({
    messagePaneVisible: true,
    folderURI: gFolders[0].URI,
  });

  let extension = await getMenuExtension(manifest);

  await extension.startup();
  await extension.awaitMessage("menus-created");

  info("Test the thread pane in the 3-pane tab.");

  let threadTree = about3Pane.document.getElementById("threadTree");
  let menu = about3Pane.document.getElementById("mailContext");
  threadTree.selectedIndex = 0;
  await rightClick(menu, threadTree.getRowAtIndex(0));
  Assert.ok(menu.querySelector("#menus_mochi_test-menuitem-_message_list"));
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["message_list"],
      contexts: ["message_list", "all"],
      displayedFolder: manifest?.permissions?.includes("accountsRead")
        ? { accountId: gAccount.key, path: "/Trash" }
        : undefined,
      selectedMessages: manifest?.permissions?.includes("messagesRead")
        ? { id: null, messages: [{ subject: gMessage.subject }] }
        : undefined,
    },
    { active: true, index: 0, mailTab: true }
  );

  info("Test the message pane in the 3-pane tab.");

  let messagePane =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();

  await subtest_content(
    extension,
    manifest?.permissions?.includes("messagesRead"),
    messagePane,
    /^mailbox\:/,
    {
      active: true,
      index: 0,
      mailTab: true,
    }
  );

  about3Pane.threadTree.selectedIndices = [];
  await awaitBrowserLoaded(messagePane, "about:blank");

  info("Test the message pane in a tab.");

  await openMessageInTab(gMessage);
  messagePane = tabmail.currentAboutMessage.getMessagePaneBrowser();

  await subtest_content(
    extension,
    manifest?.permissions?.includes("messagesRead"),
    messagePane,
    /^mailbox\:/,
    {
      active: true,
      index: 1,
      mailTab: false,
    }
  );

  tabmail.closeOtherTabs(0);

  info("Test the message pane in a separate window.");

  let displayWindow = await openMessageInWindow(gMessage);
  let displayDocument = displayWindow.document;
  menu = displayDocument.getElementById("mailContext");
  messagePane = displayDocument
    .getElementById("messageBrowser")
    .contentWindow.getMessagePaneBrowser();

  await subtest_content(
    extension,
    manifest?.permissions?.includes("messagesRead"),
    messagePane,
    /^mailbox\:/,
    {
      active: true,
      index: 0,
      mailTab: false,
    }
  );

  await extension.unload();

  await BrowserTestUtils.closeWindow(displayWindow);
}
add_task(async function test_message_panes_mv2() {
  return subtest_message_panes({
    manifest_version: 2,
    permissions: ["accountsRead", "messagesRead"],
  });
});
add_task(async function test_message_panes_no_accounts_permission_mv2() {
  return subtest_message_panes({
    manifest_version: 2,
    permissions: ["messagesRead"],
  });
});
add_task(async function test_message_panes_no_messages_permission_mv2() {
  return subtest_message_panes({
    manifest_version: 2,
    permissions: ["accountsRead"],
  });
});
add_task(async function test_message_panes_no_permissions_mv2() {
  return subtest_message_panes({
    manifest_version: 2,
  });
});
add_task(async function test_message_panes_mv3() {
  return subtest_message_panes({
    manifest_version: 3,
    permissions: ["accountsRead", "messagesRead"],
  });
});
add_task(async function test_message_panes_no_accounts_permission_mv3() {
  return subtest_message_panes({
    manifest_version: 3,
    permissions: ["messagesRead"],
  });
});
add_task(async function test_message_panes_no_messages_permission_mv3() {
  return subtest_message_panes({
    manifest_version: 3,
    permissions: ["accountsRead"],
  });
});
add_task(async function test_message_panes_no_permissions_mv3() {
  return subtest_message_panes({
    manifest_version: 3,
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

  let extension = await getMenuExtension(manifest);

  await extension.startup();
  await extension.awaitMessage("menus-created");

  let tabmail = document.getElementById("tabmail");
  window.openContentTab("about:config");
  window.openContentTab("about:mozilla");
  tabmail.openTab("mail3PaneTab", { folderURI: gFolders[0].URI });

  let tabs = document.getElementById("tabmail-tabs").allTabs;
  let menu = document.getElementById("tabContextMenu");

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

add_task(async function test_content_mv2() {
  let tabmail = document.getElementById("tabmail");
  let about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({
    messagePaneVisible: true,
    folderURI: gFolders[0].URI,
  });

  let oldPref = Services.prefs.getStringPref("mailnews.start_page.url");
  Services.prefs.setStringPref(
    "mailnews.start_page.url",
    `${URL_BASE}/content.html`
  );

  let loadPromise = BrowserTestUtils.browserLoaded(about3Pane.webBrowser);
  window.goDoCommand("cmd_goStartPage");
  await loadPromise;

  let extension = await getMenuExtension({
    manifest_version: 2,
    host_permissions: ["<all_urls>"],
  });

  await extension.startup();

  await extension.awaitMessage("menus-created");
  await subtest_content(
    extension,
    true,
    about3Pane.webBrowser,
    `${URL_BASE}/content.html`,
    {
      active: true,
      index: 0,
      mailTab: true,
    }
  );

  await extension.unload();

  Services.prefs.setStringPref("mailnews.start_page.url", oldPref);
});
add_task(async function test_content_tab_mv2() {
  let tab = window.openContentTab(`${URL_BASE}/content.html`);
  await awaitBrowserLoaded(tab.browser);

  let extension = await getMenuExtension({
    manifest_version: 2,
    host_permissions: ["<all_urls>"],
  });

  await extension.startup();
  await extension.awaitMessage("menus-created");

  await subtest_content(
    extension,
    true,
    tab.browser,
    `${URL_BASE}/content.html`,
    {
      active: true,
      index: 1,
      mailTab: false,
    }
  );

  await extension.unload();

  let tabmail = document.getElementById("tabmail");
  tabmail.closeOtherTabs(0);
});
add_task(async function test_content_window_mv2() {
  let extensionWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.openDialog(
    "chrome://messenger/content/extensionPopup.xhtml",
    "_blank",
    "width=800,height=500,resizable",
    `${URL_BASE}/content.html`
  );
  let extensionWindow = await extensionWindowPromise;
  await focusWindow(extensionWindow);
  await awaitBrowserLoaded(
    extensionWindow.browser,
    url => url != "about:blank"
  );

  let extension = await getMenuExtension({
    manifest_version: 2,
    host_permissions: ["<all_urls>"],
  });

  await extension.startup();
  await extension.awaitMessage("menus-created");

  await subtest_content(
    extension,
    true,
    extensionWindow.browser,
    `${URL_BASE}/content.html`,
    {
      active: true,
      index: 0,
      mailTab: false,
    }
  );

  await extension.unload();

  await BrowserTestUtils.closeWindow(extensionWindow);
});
add_task(async function test_content_mv3() {
  let tabmail = document.getElementById("tabmail");
  let about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({
    messagePaneVisible: true,
    folderURI: gFolders[0].URI,
  });

  let oldPref = Services.prefs.getStringPref("mailnews.start_page.url");
  Services.prefs.setStringPref(
    "mailnews.start_page.url",
    `${URL_BASE}/content.html`
  );

  let loadPromise = BrowserTestUtils.browserLoaded(about3Pane.webBrowser);
  window.goDoCommand("cmd_goStartPage");
  await loadPromise;

  let extension = await getMenuExtension({
    manifest_version: 3,
    host_permissions: ["<all_urls>"],
  });

  await extension.startup();

  await extension.awaitMessage("menus-created");
  await subtest_content(
    extension,
    true,
    about3Pane.webBrowser,
    `${URL_BASE}/content.html`,
    {
      active: true,
      index: 0,
      mailTab: true,
    }
  );

  await extension.unload();

  Services.prefs.setStringPref("mailnews.start_page.url", oldPref);
});
add_task(async function test_content_tab_mv3() {
  let tab = window.openContentTab(`${URL_BASE}/content.html`);
  await awaitBrowserLoaded(tab.browser);

  let extension = await getMenuExtension({
    manifest_version: 3,
    host_permissions: ["<all_urls>"],
  });

  await extension.startup();
  await extension.awaitMessage("menus-created");

  await subtest_content(
    extension,
    true,
    tab.browser,
    `${URL_BASE}/content.html`,
    {
      active: true,
      index: 1,
      mailTab: false,
    }
  );

  await extension.unload();

  let tabmail = document.getElementById("tabmail");
  tabmail.closeOtherTabs(0);
});
add_task(async function test_content_window_mv3() {
  let extensionWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.openDialog(
    "chrome://messenger/content/extensionPopup.xhtml",
    "_blank",
    "width=800,height=500,resizable",
    `${URL_BASE}/content.html`
  );
  let extensionWindow = await extensionWindowPromise;
  await focusWindow(extensionWindow);
  await awaitBrowserLoaded(
    extensionWindow.browser,
    url => url != "about:blank"
  );

  let extension = await getMenuExtension({
    manifest_version: 3,
    host_permissions: ["<all_urls>"],
  });

  await extension.startup();
  await extension.awaitMessage("menus-created");

  await subtest_content(
    extension,
    true,
    extensionWindow.browser,
    `${URL_BASE}/content.html`,
    {
      active: true,
      index: 0,
      mailTab: false,
    }
  );

  await extension.unload();

  await BrowserTestUtils.closeWindow(extensionWindow);
});

async function subtest_compose(manifest) {
  let extension = await getMenuExtension(manifest);

  await extension.startup();
  await extension.awaitMessage("menus-created");

  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  params.composeFields.body = await fetch(`${URL_BASE}/content_body.html`).then(
    r => r.text()
  );

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

  await subtest_compose_body(
    extension,
    manifest.permissions?.includes("compose"),
    messagePane,
    "about:blank?compose",
    {
      active: true,
      index: 0,
      mailTab: false,
    }
  );

  const chromeElementsMap = {
    msgSubject: "composeSubject",
    toAddrInput: "composeTo",
  };
  for (let elementId of Object.keys(chromeElementsMap)) {
    info(`Test element ${elementId}.`);
    await subtest_element(
      extension,
      manifest.permissions?.includes("compose"),
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
      attachments: manifest.permissions?.includes("compose")
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
      attachments: manifest.permissions?.includes("compose")
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
add_task(async function test_compose_mv2() {
  return subtest_compose({
    manifest_version: 2,
    permissions: ["compose"],
  });
});
add_task(async function test_compose_no_permissions_mv2() {
  return subtest_compose({
    manifest_version: 2,
  });
});
add_task(async function test_compose_mv3() {
  return subtest_compose({
    manifest_version: 3,
    permissions: ["compose"],
  });
});
add_task(async function test_compose_no_permissions_mv3() {
  return subtest_compose({
    manifest_version: 3,
  });
});

async function subtest_action_menu(
  testWindow,
  target,
  expectedInfo,
  expectedTab,
  manifest
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

    info(
      `Choosing 'Remove Extension' in ${menu.id} should show confirm dialog.`
    );
    await rightClick(menu, element);
    await extension.awaitMessage("onShown");
    let removeExtension = menu.querySelector(
      ".customize-context-removeExtension"
    );
    let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    let promptPromise = BrowserTestUtils.promiseAlertDialog(
      undefined,
      undefined,
      {
        async callback(promptWindow) {
          await TestUtils.waitForCondition(
            () => Services.focus.activeWindow == promptWindow,
            "waiting for prompt to become active"
          );

          let promptDocument = promptWindow.document;
          // Check if the correct add-on is being removed.
          is(promptDocument.title, `Remove ${name}?`);
          if (
            !Services.prefs.getBoolPref("prompts.windowPromptSubDialog", false)
          ) {
            is(
              promptDocument.getElementById("infoBody").textContent,
              `Remove ${name} as well as its configuration and data from ${brand}?`
            );
          }
          let acceptButton = promptDocument
            .querySelector("dialog")
            .getButton("accept");
          is(acceptButton.label, "Remove");
          EventUtils.synthesizeMouseAtCenter(acceptButton, {}, promptWindow);
        },
      }
    );
    menu.activateItem(removeExtension);
    await hiddenPromise;
    await promptPromise;
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

  let extension = await getMenuExtension(manifest);

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
add_task(async function test_browser_action_menu_mv2() {
  await subtest_action_menu(
    window,
    {
      menuId: "toolbar-context-menu",
      elementId: "menus_mochi_test-browserAction-toolbarbutton",
      context: "browser_action",
      nonActionButtonElementId: "button-newmsg",
    },
    {
      pageUrl: "about:blank",
      menuItemId: "browser_action",
    },
    { active: true, index: 0, mailTab: true },
    {
      manifest_version: 2,
      browser_action: {
        default_title: "This is a test",
      },
    }
  );
}).skip(); // TODO

add_task(async function test_message_display_action_menu_pane_mv2() {
  let tab = await openMessageInTab(gMessage);
  // No check for menu entries in nonActionButtonElements as the header-toolbar
  // does not have a context menu associated.
  await subtest_action_menu(
    tab.chromeBrowser.contentWindow,
    {
      menuId: "header-toolbar-context-menu",
      elementId: "menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action",
    },
    { active: true, index: 1, mailTab: false },
    {
      manifest_version: 2,
      message_display_action: {
        default_title: "This is a test",
      },
    }
  );
  window.document.getElementById("tabmail").closeTab(tab);
});
add_task(async function test_message_display_action_menu_window_mv2() {
  let testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  // No check for menu entries in nonActionButtonElements as the header-toolbar
  // does not have a context menu associated.
  await subtest_action_menu(
    testWindow.messageBrowser.contentWindow,
    {
      menuId: "header-toolbar-context-menu",
      elementId: "menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action",
    },
    { active: true, index: 0, mailTab: false },
    {
      manifest_version: 2,
      message_display_action: {
        default_title: "This is a test",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_compose_action_menu_mv2() {
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
    { active: true, index: 0, mailTab: false },
    {
      manifest_version: 2,
      compose_action: {
        default_title: "This is a test",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_compose_action_menu_formattoolbar_mv2() {
  let testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_action_menu(
    testWindow,
    {
      menuId: "format-toolbar-context-menu",
      elementId: "menus_mochi_test-composeAction-toolbarbutton",
      context: "compose_action",
    },
    {
      pageUrl: "about:blank?compose",
      menuItemId: "compose_action",
    },
    { active: true, index: 0, mailTab: false },
    {
      manifest_version: 2,
      compose_action: {
        default_title: "This is a test",
        default_area: "formattoolbar",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_browser_action_menu_mv3() {
  await subtest_action_menu(
    window,
    {
      menuId: "toolbar-context-menu",
      elementId: "menus_mochi_test-browserAction-toolbarbutton",
      context: "action",
      nonActionButtonElementId: "button-newmsg",
    },
    {
      pageUrl: "about:blank",
      menuItemId: "action",
    },
    { active: true, index: 0, mailTab: true },
    {
      manifest_version: 3,
      action: {
        default_title: "This is a test",
      },
    }
  );
}).skip(); // TODO

add_task(async function test_message_display_action_menu_pane_mv3() {
  let tab = await openMessageInTab(gMessage);
  // No check for menu entries in nonActionButtonElements as the header-toolbar
  // does not have a context menu associated.
  await subtest_action_menu(
    tab.chromeBrowser.contentWindow,
    {
      menuId: "header-toolbar-context-menu",
      elementId: "menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action",
    },
    { active: true, index: 1, mailTab: false },
    {
      manifest_version: 3,
      message_display_action: {
        default_title: "This is a test",
      },
    }
  );
  window.document.getElementById("tabmail").closeTab(tab);
});
add_task(async function test_message_display_action_menu_window_mv3() {
  let testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  // No check for menu entries in nonActionButtonElements as the header-toolbar
  // does not have a context menu associated.
  await subtest_action_menu(
    testWindow.messageBrowser.contentWindow,
    {
      menuId: "header-toolbar-context-menu",
      elementId: "menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action",
    },
    { active: true, index: 0, mailTab: false },
    {
      manifest_version: 3,
      message_display_action: {
        default_title: "This is a test",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_compose_action_menu_mv3() {
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
    { active: true, index: 0, mailTab: false },
    {
      manifest_version: 3,
      compose_action: {
        default_title: "This is a test",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_compose_action_menu_formattoolbar_mv3() {
  let testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_action_menu(
    testWindow,
    {
      menuId: "format-toolbar-context-menu",
      elementId: "menus_mochi_test-composeAction-toolbarbutton",
      context: "compose_action",
    },
    {
      pageUrl: "about:blank?compose",
      menuItemId: "compose_action",
    },
    { active: true, index: 0, mailTab: false },
    {
      manifest_version: 3,
      compose_action: {
        default_title: "This is a test",
        default_area: "formattoolbar",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
