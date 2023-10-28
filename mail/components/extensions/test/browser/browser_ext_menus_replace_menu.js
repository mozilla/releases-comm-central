/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

function getVisibleChildrenIds(menuElem) {
  return Array.from(menuElem.children)
    .filter(elem => !elem.hidden)
    .map(elem => elem.id || elem.tagName);
}

function checkIsDefaultMenuItemVisible(visibleMenuItemIds) {
  // In this whole test file, we open a menu on a link. Assume that all
  // default menu items are shown if one link-specific menu item is shown.
  ok(
    visibleMenuItemIds.includes("browserContext-copylink"),
    `The default 'Copy Link Location' menu item should be in ${visibleMenuItemIds}.`
  );
}

// Tests the following:
// - Calling overrideContext({}) during oncontextmenu forces the menu to only
//   show an extension's own items.
// - These menu items all appear in the root menu.
// - The usual extension filtering behavior (e.g. documentUrlPatterns and
//   targetUrlPatterns) is still applied; some menu items are therefore hidden.
// - Calling overrideContext({showDefaults:true}) causes the default menu items
//   to be shown, but only after the extension's.
// - overrideContext expires after the menu is opened once.
// - overrideContext can be called from shadow DOM.
add_task(async function overrideContext_in_extension_tab() {
  await SpecialPowers.pushPrefEnv({
    set: [["security.allow_eval_with_system_principal", true]],
  });

  function extensionTabScript() {
    document.addEventListener(
      "contextmenu",
      () => {
        browser.menus.overrideContext({});
        browser.test.sendMessage("oncontextmenu_in_dom_part_1");
      },
      { once: true }
    );

    const shadowRoot = document
      .getElementById("shadowHost")
      .attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `<a href="http://example.com/">Link</a>`;
    shadowRoot.firstChild.addEventListener(
      "contextmenu",
      () => {
        browser.menus.overrideContext({});
        browser.test.sendMessage("oncontextmenu_in_shadow_dom");
      },
      { once: true }
    );

    browser.menus.create({
      id: "tab_1",
      title: "tab_1",
      documentUrlPatterns: [document.URL],
      onclick() {
        document.addEventListener(
          "contextmenu",
          () => {
            // Verifies that last call takes precedence.
            browser.menus.overrideContext({ showDefaults: false });
            browser.menus.overrideContext({ showDefaults: true });
            browser.test.sendMessage("oncontextmenu_in_dom_part_2");
          },
          { once: true }
        );
        browser.test.sendMessage("onClicked_tab_1");
      },
    });
    browser.menus.create(
      {
        id: "tab_2",
        title: "tab_2",
        onclick() {
          browser.test.sendMessage("onClicked_tab_2");
        },
      },
      () => {
        browser.test.sendMessage("menu-registered");
      }
    );
  }

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["menus", "menus.overrideContext"],
    },
    files: {
      "tab.html": `
        <!DOCTYPE html><meta charset="utf-8">
        <a href="http://example.com/">Link</a>
        <div id="shadowHost"></div>
        <script src="tab.js"></script>
      `,
      "tab.js": extensionTabScript,
    },
    background() {
      // Expected to match and thus be visible.
      browser.menus.create({ id: "bg_1", title: "bg_1" });
      browser.menus.create({
        id: "bg_2",
        title: "bg_2",
        targetUrlPatterns: ["*://example.com/*"],
      });

      // Expected to not match and be hidden.
      browser.menus.create({
        id: "bg_3",
        title: "bg_3",
        targetUrlPatterns: ["*://nomatch/*"],
      });
      browser.menus.create({
        id: "bg_4",
        title: "bg_4",
        documentUrlPatterns: [document.URL],
      });

      browser.menus.onShown.addListener(info => {
        browser.test.assertEq("tab", info.viewType, "Expected viewType");
        browser.test.assertEq(
          "bg_1,bg_2,tab_1,tab_2",
          info.menuIds.join(","),
          "Expected menu items."
        );
        browser.test.assertEq(
          "all,link",
          info.contexts.sort().join(","),
          "Expected menu contexts"
        );
        browser.test.sendMessage("onShown");
      });

      browser.tabs.create({ url: "tab.html" });
    },
  });

  const otherExtension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["menus"],
    },
    background() {
      browser.menus.create(
        { id: "other_extension_item", title: "other_extension_item" },
        () => {
          browser.test.sendMessage("other_extension_item_created");
        }
      );
    },
  });
  await otherExtension.startup();
  await otherExtension.awaitMessage("other_extension_item_created");

  await extension.startup();
  await extension.awaitMessage("menu-registered");

  const EXPECTED_EXTENSION_MENU_IDS = [
    `${makeWidgetId(extension.id)}-menuitem-_bg_1`,
    `${makeWidgetId(extension.id)}-menuitem-_bg_2`,
    `${makeWidgetId(extension.id)}-menuitem-_tab_1`,
    `${makeWidgetId(extension.id)}-menuitem-_tab_2`,
  ];
  const OTHER_EXTENSION_MENU_ID = `${makeWidgetId(
    otherExtension.id
  )}-menuitem-_other_extension_item`;

  {
    // Tests overrideContext({})
    info("Expecting the menu to be replaced by overrideContext.");
    const menu = await openContextMenu("a");
    await extension.awaitMessage("oncontextmenu_in_dom_part_1");
    await extension.awaitMessage("onShown");

    Assert.deepEqual(
      getVisibleChildrenIds(menu),
      EXPECTED_EXTENSION_MENU_IDS,
      "Expected only extension menu items"
    );

    const menuItems = menu.getElementsByAttribute("label", "tab_1");
    await closeExtensionContextMenu(menuItems[0]);
    await extension.awaitMessage("onClicked_tab_1");
  }

  {
    // Tests overrideContext({showDefaults:true}))
    info(
      "Expecting the menu to be replaced by overrideContext, including default menu items."
    );
    const menu = await openContextMenu("a");
    await extension.awaitMessage("oncontextmenu_in_dom_part_2");
    await extension.awaitMessage("onShown");

    const visibleMenuItemIds = getVisibleChildrenIds(menu);
    Assert.deepEqual(
      visibleMenuItemIds.slice(0, EXPECTED_EXTENSION_MENU_IDS.length),
      EXPECTED_EXTENSION_MENU_IDS,
      "Expected extension menu items at the start."
    );

    checkIsDefaultMenuItemVisible(visibleMenuItemIds);

    is(
      visibleMenuItemIds[visibleMenuItemIds.length - 1],
      OTHER_EXTENSION_MENU_ID,
      "Other extension menu item should be at the end."
    );

    const menuItems = menu.getElementsByAttribute("label", "tab_2");
    await closeExtensionContextMenu(menuItems[0]);
    await extension.awaitMessage("onClicked_tab_2");
  }

  {
    // Tests that previous overrideContext call has been forgotten,
    // so the default behavior should occur (=move items into submenu).
    info(
      "Expecting the default menu to be used when overrideContext is not called."
    );
    const menu = await openContextMenu("a");
    await extension.awaitMessage("onShown");

    checkIsDefaultMenuItemVisible(getVisibleChildrenIds(menu));

    const menuItems = menu.getElementsByAttribute("ext-type", "top-level-menu");
    is(menuItems.length, 1, "Expected top-level menu element for extension.");
    const topLevelExtensionMenuItem = menuItems[0];
    is(
      topLevelExtensionMenuItem.nextSibling,
      null,
      "Extension menu should be the last element."
    );

    const submenu = await openSubmenu(topLevelExtensionMenuItem);
    is(submenu, topLevelExtensionMenuItem.menupopup, "Correct submenu opened");

    Assert.deepEqual(
      getVisibleChildrenIds(submenu),
      EXPECTED_EXTENSION_MENU_IDS,
      "Extension menu items should be in the submenu by default."
    );

    await closeContextMenu();
  }

  {
    info(
      "Expecting the menu to be replaced by overrideContext from a listener inside shadow DOM."
    );
    // Tests that overrideContext({}) can be used from a listener inside shadow DOM.
    const menu = await openContextMenu(
      () => this.document.getElementById("shadowHost").shadowRoot.firstChild
    );
    await extension.awaitMessage("oncontextmenu_in_shadow_dom");
    await extension.awaitMessage("onShown");

    Assert.deepEqual(
      getVisibleChildrenIds(menu),
      EXPECTED_EXTENSION_MENU_IDS,
      "Expected only extension menu items after overrideContext({}) in shadow DOM"
    );

    await closeContextMenu();
  }

  // Unloading the extension will automatically close the extension's tab.html
  await extension.unload();
  await otherExtension.unload();

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);
});

async function run_overrideContext_test_in_popup(testWindow, buttonSelector) {
  function extensionPopupScript() {
    document.addEventListener(
      "contextmenu",
      () => {
        browser.menus.overrideContext({});
        browser.test.sendMessage("oncontextmenu_in_dom_part_1");
      },
      { once: true }
    );

    const shadowRoot = document
      .getElementById("shadowHost")
      .attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `<a href="http://example.com/">Link2</a>`;
    shadowRoot.firstChild.addEventListener(
      "contextmenu",
      () => {
        browser.menus.overrideContext({});
        browser.test.sendMessage("oncontextmenu_in_shadow_dom");
      },
      { once: true }
    );

    browser.menus.create({
      id: "popup_1",
      title: "popup_1",
      documentUrlPatterns: [document.URL],
      onclick() {
        document.addEventListener(
          "contextmenu",
          () => {
            // Verifies that last call takes precedence.
            browser.menus.overrideContext({ showDefaults: false });
            browser.menus.overrideContext({ showDefaults: true });
            browser.test.sendMessage("oncontextmenu_in_dom_part_2");
          },
          { once: true }
        );
        browser.test.sendMessage("onClicked_popup_1");
      },
    });
    browser.menus.create(
      {
        id: "popup_2",
        title: "popup_2",
        onclick() {
          browser.test.sendMessage("onClicked_popup_2");
        },
      },
      () => {
        browser.test.sendMessage("menu-registered");
      }
    );
  }

  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    manifest: {
      applications: {
        gecko: {
          id: `overrideContext@mochi.test`,
        },
      },
      permissions: ["menus", "menus.overrideContext"],
      browser_action: {
        default_popup: "popup.html",
        default_title: "Popup",
      },
      compose_action: {
        default_popup: "popup.html",
        default_title: "Popup",
      },
      message_display_action: {
        default_popup: "popup.html",
        default_title: "Popup",
      },
    },
    files: {
      "popup.html": `
        <!DOCTYPE html><meta charset="utf-8">
        <a id="link1" href="http://example.com/">Link1</a>
        <div id="shadowHost"></div>
        <script src="popup.js"></script>
      `,
      "popup.js": extensionPopupScript,
    },
    background() {
      // Expected to match and thus be visible.
      browser.menus.create({
        id: "bg_1",
        title: "bg_1",
        viewTypes: ["popup"],
      });
      // Expected to not match and be hidden.
      browser.menus.create({
        id: "bg_2",
        title: "bg_2",
        viewTypes: ["tab"],
      });
      browser.menus.onShown.addListener(info => {
        browser.test.assertEq("popup", info.viewType, "Expected viewType");
        browser.test.assertEq(
          "bg_1,popup_1,popup_2",
          info.menuIds.join(","),
          "Expected menu items."
        );
        browser.test.sendMessage("onShown");
      });

      browser.test.sendMessage("ready");
    },
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  const EXPECTED_EXTENSION_MENU_IDS = [
    `${makeWidgetId(extension.id)}-menuitem-_bg_1`,
    `${makeWidgetId(extension.id)}-menuitem-_popup_1`,
    `${makeWidgetId(extension.id)}-menuitem-_popup_2`,
  ];
  const button = testWindow.document.querySelector(buttonSelector);
  Assert.ok(button, "Button created");
  EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 }, testWindow);
  await extension.awaitMessage("menu-registered");

  {
    // Tests overrideContext({})
    info("Expecting the menu to be replaced by overrideContext.");

    const menu = await openContextMenuInPopup(extension, "#link1", testWindow);
    await extension.awaitMessage("oncontextmenu_in_dom_part_1");
    await extension.awaitMessage("onShown");

    Assert.deepEqual(
      getVisibleChildrenIds(menu),
      EXPECTED_EXTENSION_MENU_IDS,
      "Expected only extension menu items"
    );

    const menuItems = menu.getElementsByAttribute("label", "popup_1");

    await closeExtensionContextMenu(menuItems[0], {}, testWindow);
    await extension.awaitMessage("onClicked_popup_1");
  }

  {
    // Tests overrideContext({showDefaults:true}))
    info(
      "Expecting the menu to be replaced by overrideContext, including default menu items."
    );
    const menu = await openContextMenuInPopup(extension, "#link1", testWindow);
    await extension.awaitMessage("oncontextmenu_in_dom_part_2");
    await extension.awaitMessage("onShown");
    const visibleMenuItemIds = getVisibleChildrenIds(menu);
    Assert.deepEqual(
      visibleMenuItemIds.slice(0, EXPECTED_EXTENSION_MENU_IDS.length),
      EXPECTED_EXTENSION_MENU_IDS,
      "Expected extension menu items at the start."
    );
    checkIsDefaultMenuItemVisible(visibleMenuItemIds);

    const menuItems = menu.getElementsByAttribute("label", "popup_2");
    await closeExtensionContextMenu(menuItems[0], {}, testWindow);
    await extension.awaitMessage("onClicked_popup_2");
  }

  {
    // Tests that previous overrideContext call has been forgotten,
    // so the default behavior should occur (=move items into submenu).
    info(
      "Expecting the default menu to be used when overrideContext is not called."
    );
    const menu = await openContextMenuInPopup(extension, "#link1", testWindow);
    await extension.awaitMessage("onShown");

    checkIsDefaultMenuItemVisible(getVisibleChildrenIds(menu));

    const menuItems = menu.getElementsByAttribute("ext-type", "top-level-menu");
    is(menuItems.length, 1, "Expected top-level menu element for extension.");
    const topLevelExtensionMenuItem = menuItems[0];
    is(
      topLevelExtensionMenuItem.nextSibling,
      null,
      "Extension menu should be the last element."
    );

    const submenu = await openSubmenu(topLevelExtensionMenuItem);
    is(submenu, topLevelExtensionMenuItem.menupopup, "Correct submenu opened");

    Assert.deepEqual(
      getVisibleChildrenIds(submenu),
      EXPECTED_EXTENSION_MENU_IDS,
      "Extension menu items should be in the submenu by default."
    );

    await closeContextMenu(menu);
  }

  {
    info("Testing overrideContext from a listener inside a shadow DOM.");
    // Tests that overrideContext({}) can be used from a listener inside shadow DOM.
    const menu = await openContextMenuInPopup(
      extension,
      () => this.document.getElementById("shadowHost").shadowRoot.firstChild,
      testWindow
    );
    await extension.awaitMessage("oncontextmenu_in_shadow_dom");
    await extension.awaitMessage("onShown");

    Assert.deepEqual(
      getVisibleChildrenIds(menu),
      EXPECTED_EXTENSION_MENU_IDS,
      "Expected only extension menu items after overrideContext({}) in shadow DOM"
    );

    await closeContextMenu(menu);
  }

  await closeBrowserAction(extension, testWindow);
  await extension.unload();
}

add_task(async function overrideContext_in_extension_browser_action_popup() {
  await run_overrideContext_test_in_popup(
    window,
    `.unified-toolbar [extension="overrideContext@mochi.test"]`
  );
});

add_task(async function overrideContext_in_extension_compose_action_popup() {
  const account = createAccount();
  addIdentity(account);

  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);
  await run_overrideContext_test_in_popup(
    composeWindow,
    "#overridecontext_mochi_test-composeAction-toolbarbutton"
  );
  composeWindow.close();
});

add_task(
  async function overrideContext_in_extension_message_display_action_popup_of_mail3pane() {
    const account = createAccount();
    addIdentity(account);
    const rootFolder = account.incomingServer.rootFolder;
    const subFolders = rootFolder.subFolders;
    createMessages(subFolders[0], 10);

    const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
    about3Pane.displayFolder(subFolders[0]);
    about3Pane.threadTree.selectedIndex = 0;

    await run_overrideContext_test_in_popup(
      about3Pane.messageBrowser.contentWindow,
      "#overridecontext_mochi_test-messageDisplayAction-toolbarbutton"
    );

    about3Pane.displayFolder(rootFolder);
  }
);

add_task(
  async function overrideContext_in_extension_message_display_action_popup_of_window() {
    const account = createAccount();
    addIdentity(account);
    const rootFolder = account.incomingServer.rootFolder;
    const subFolders = rootFolder.subFolders;
    createMessages(subFolders[0], 10);
    const messages = subFolders[0].messages;

    const messageWindow = await openMessageInWindow(messages.getNext());
    await focusWindow(messageWindow);
    await run_overrideContext_test_in_popup(
      messageWindow.messageBrowser.contentWindow,
      "#overridecontext_mochi_test-messageDisplayAction-toolbarbutton"
    );
    messageWindow.close();
  }
);

add_task(
  async function overrideContext_in_extension_message_display_action_popup_of_tab() {
    const account = createAccount();
    addIdentity(account);
    const rootFolder = account.incomingServer.rootFolder;
    const subFolders = rootFolder.subFolders;
    createMessages(subFolders[0], 10);
    const messages = subFolders[0].messages;

    await openMessageInTab(messages.getNext());

    const tabmail = document.getElementById("tabmail");
    await run_overrideContext_test_in_popup(
      tabmail.currentAboutMessage,
      "#overridecontext_mochi_test-messageDisplayAction-toolbarbutton"
    );
    tabmail.closeOtherTabs(0);
  }
);
