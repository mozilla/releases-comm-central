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

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: gFolders[0],
    messagePaneVisible: true,
  });
  about3Pane.threadTree.selectedIndex = 0;
  await awaitBrowserLoaded(
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser()
  );
});

async function subtest_action_popup_menu(
  testWindow,
  target,
  expectedInfo,
  expectedTab,
  manifest
) {
  const extension = await getMenuExtension(manifest);

  await extension.startup();
  await extension.awaitMessage("menus-created");

  const element = testWindow.document.querySelector(target.elementSelector);
  const menu = element.querySelector("menupopup");

  await openMenuPopup(menu, element);
  await checkShownEvent(
    extension,
    { menuIds: [target.context], contexts: [target.context, "all"] },
    expectedTab
  );

  const clickedPromise = checkClickedEvent(
    extension,
    expectedInfo,
    expectedTab
  );
  await clickItemInMenuPopup(
    menu.querySelector(`#menus_mochi_test-menuitem-_${target.context}`)
  );
  await clickedPromise;
  await extension.unload();
}

add_task(async function test_browser_action_menu_popup_mv2() {
  await subtest_action_popup_menu(
    window,
    {
      elementSelector: `.unified-toolbar [extension="menus@mochi.test"]`,
      context: "browser_action_menu",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "browser_action_menu",
    },
    { active: true, index: 0, type: "mail" },
    {
      manifest_version: 2,
      browser_action: {
        default_title: "This is a test",
        type: "menu",
      },
    }
  );
});
add_task(async function test_browser_action_menu_popup_message_window_mv2() {
  const testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  await subtest_action_popup_menu(
    testWindow,
    {
      elementSelector: "#menus_mochi_test-browserAction-toolbarbutton",
      context: "browser_action_menu",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "browser_action_menu",
    },
    { active: true, index: 0, type: "messageDisplay" },
    {
      manifest_version: 2,
      browser_action: {
        default_title: "This is a test",
        default_windows: ["messageDisplay"],
        type: "menu",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_message_display_action_menu_popup_pane_mv2() {
  const tabmail = document.getElementById("tabmail");
  const aboutMessage = tabmail.currentAboutMessage;
  await SimpleTest.promiseFocus(aboutMessage);

  await subtest_action_popup_menu(
    aboutMessage,
    {
      elementSelector: "#menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action_menu",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action_menu",
    },
    { active: true, index: 0, type: "mail" },
    {
      manifest_version: 2,
      message_display_action: {
        default_title: "This is a test",
        type: "menu",
      },
    }
  );
});
add_task(async function test_message_display_action_menu_popup_tab_mv2() {
  const tab = await openMessageInTab(gMessage);
  await subtest_action_popup_menu(
    tab.chromeBrowser.contentWindow,
    {
      elementSelector: "#menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action_menu",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action_menu",
    },
    { active: true, index: 1, type: "messageDisplay" },
    {
      manifest_version: 2,
      message_display_action: {
        default_title: "This is a test",
        type: "menu",
      },
    }
  );
  window.document.getElementById("tabmail").closeTab(tab);
});
add_task(async function test_message_display_action_menu_popup_window_mv2() {
  const testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  await subtest_action_popup_menu(
    testWindow.messageBrowser.contentWindow,
    {
      elementSelector: "#menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action_menu",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action_menu",
    },
    { active: true, index: 0, type: "messageDisplay" },
    {
      manifest_version: 2,
      message_display_action: {
        default_title: "This is a test",
        type: "menu",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_compose_action_menu_popup_mv2() {
  const testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_action_popup_menu(
    testWindow,
    {
      elementSelector: "#menus_mochi_test-composeAction-toolbarbutton",
      context: "compose_action_menu",
    },
    {
      pageUrl: "about:blank?compose",
      menuItemId: "compose_action_menu",
    },
    { active: true, index: 0, type: "messageCompose" },
    {
      manifest_version: 2,
      compose_action: {
        default_title: "This is a test",
        type: "menu",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_compose_action_menu_popup_formattoolbar_mv2() {
  const testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_action_popup_menu(
    testWindow,
    {
      elementSelector: "#menus_mochi_test-composeAction-toolbarbutton",
      context: "compose_action_menu",
    },
    {
      pageUrl: "about:blank?compose",
      menuItemId: "compose_action_menu",
    },
    { active: true, index: 0, type: "messageCompose" },
    {
      manifest_version: 2,
      compose_action: {
        default_title: "This is a test",
        default_area: "formattoolbar",
        type: "menu",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});

add_task(async function test_browser_action_menu_popup_mv3() {
  await subtest_action_popup_menu(
    window,
    {
      elementSelector: `.unified-toolbar [extension="menus@mochi.test"]`,
      context: "action_menu",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "action_menu",
    },
    { active: true, index: 0, type: "mail" },
    {
      manifest_version: 3,
      action: {
        default_title: "This is a test",
        type: "menu",
      },
    }
  );
});
add_task(async function test_browser_action_menu_popup_message_window_mv3() {
  const testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  await subtest_action_popup_menu(
    testWindow,
    {
      elementSelector: "#menus_mochi_test-browserAction-toolbarbutton",
      context: "action_menu",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "action_menu",
    },
    { active: true, index: 0, type: "messageDisplay" },
    {
      manifest_version: 3,
      action: {
        default_title: "This is a test",
        default_windows: ["messageDisplay"],
        type: "menu",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_message_display_action_menu_popup_pane_mv3() {
  const tabmail = document.getElementById("tabmail");
  const aboutMessage = tabmail.currentAboutMessage;
  await SimpleTest.promiseFocus(aboutMessage);

  await subtest_action_popup_menu(
    aboutMessage,
    {
      elementSelector: "#menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action_menu",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action_menu",
    },
    { active: true, index: 0, type: "mail" },
    {
      manifest_version: 3,
      message_display_action: {
        default_title: "This is a test",
        type: "menu",
      },
    }
  );
});
add_task(async function test_message_display_action_menu_popup_tab_mv3() {
  const tab = await openMessageInTab(gMessage);
  await subtest_action_popup_menu(
    tab.chromeBrowser.contentWindow,
    {
      elementSelector: "#menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action_menu",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action_menu",
    },
    { active: true, index: 1, type: "messageDisplay" },
    {
      manifest_version: 3,
      message_display_action: {
        default_title: "This is a test",
        type: "menu",
      },
    }
  );
  window.document.getElementById("tabmail").closeTab(tab);
});
add_task(async function test_message_display_action_menu_popup_window_mv3() {
  const testWindow = await openMessageInWindow(gMessage);
  await focusWindow(testWindow);
  await subtest_action_popup_menu(
    testWindow.messageBrowser.contentWindow,
    {
      elementSelector: "#menus_mochi_test-messageDisplayAction-toolbarbutton",
      context: "message_display_action_menu",
    },
    {
      pageUrl: /^mailbox\:/,
      menuItemId: "message_display_action_menu",
    },
    { active: true, index: 0, type: "messageDisplay" },
    {
      manifest_version: 3,
      message_display_action: {
        default_title: "This is a test",
        type: "menu",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_compose_action_menu_popup_mv3() {
  const testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_action_popup_menu(
    testWindow,
    {
      elementSelector: "#menus_mochi_test-composeAction-toolbarbutton",
      context: "compose_action_menu",
      nonActionButtonSelector: "#button-attach",
    },
    {
      pageUrl: "about:blank?compose",
      menuItemId: "compose_action_menu",
    },
    { active: true, index: 0, type: "messageCompose" },
    {
      manifest_version: 3,
      compose_action: {
        default_title: "This is a test",
        type: "menu",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
add_task(async function test_compose_action_menu_popup_formattoolbar_mv3() {
  const testWindow = await openComposeWindow(gAccount);
  await focusWindow(testWindow);
  await subtest_action_popup_menu(
    testWindow,
    {
      elementSelector: "#menus_mochi_test-composeAction-toolbarbutton",
      context: "compose_action_menu",
    },
    {
      pageUrl: "about:blank?compose",
      menuItemId: "compose_action_menu",
    },
    { active: true, index: 0, type: "messageCompose" },
    {
      manifest_version: 3,
      compose_action: {
        default_title: "This is a test",
        default_area: "formattoolbar",
        type: "menu",
      },
    }
  );
  await BrowserTestUtils.closeWindow(testWindow);
});
