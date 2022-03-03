/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test the spaces toolbar features.
 */

var folderA;
var folderB;

add_task(function setupModule() {
  // Set up two folders.
  window.MailServices.accounts.createLocalMailAccount();
  let account = window.MailServices.accounts.accounts[0];
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("mailFolderA", null);
  folderA = rootFolder.findSubFolder("mailFolderA");
  rootFolder.createSubfolder("mailFolderB", null);
  folderB = rootFolder.findSubFolder("mailFolderB");
});

registerCleanupFunction(async () => {
  folderA.deleteSelf(null);
  folderB.deleteSelf(null);
  // Close all opened tabs.
  let tabmail = document.getElementById("tabmail");
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  // Reset the spaces toolbar to its default visible state.
  window.gSpacesToolbar.toggleToolbar(false);
  // Reset the titlebar pref.
  Services.prefs.clearUserPref("mail.tabs.drawInTitlebar");
  // Reset the menubar visibility.
  let menubar = document.getElementById("toolbar-menubar");
  menubar.removeAttribute("autohide");
  menubar.removeAttribute("inactive");
  await new Promise(resolve => requestAnimationFrame(resolve));
  // Changing the drawInTitlebar pref causes the whole window to reload and we
  // lose the focus.
  window.focus();
});

async function assertMailShown(win = window) {
  await TestUtils.waitForCondition(
    () => win.document.getElementById("mailContent").hasAttribute("selected"),
    "The mail tab should be visible"
  );
}

async function assertChatShown(win = window) {
  await TestUtils.waitForCondition(
    () => win.document.getElementById("chatTabPanel").hasAttribute("selected"),
    "The chat tab should be visible"
  );
}

async function assertCalendarShown(win = window) {
  await TestUtils.waitForCondition(() => {
    return (
      win.document
        .getElementById("calendarTabPanel")
        .hasAttribute("selected") &&
      !win.document.getElementById("calendar-view-box").collapsed
    );
  }, "The calendar view should be visible");
}

async function assertTasksShown(win = window) {
  await TestUtils.waitForCondition(() => {
    return (
      win.document
        .getElementById("calendarTabPanel")
        .hasAttribute("selected") &&
      !win.document.getElementById("calendar-task-box").collapsed
    );
  }, "The task view should be visible");
}

async function assertSettingsShown(win = window) {
  await TestUtils.waitForCondition(() => {
    return win.document.querySelector(
      // preferencesTabWrapper0, preferencesTabWrapper1, etc
      "#tabpanelcontainer > [id^=preferencesTabWrapper][selected]"
    );
  }, "The settings tab should be visible");
}

async function assertContentShown(url, win = window) {
  await TestUtils.waitForCondition(() => {
    let tabWrapper = win.document.querySelector(
      // contentTabWrapper0, contentTabWrapper1, etc
      "#tabpanelcontainer > [id^=contentTabWrapper][selected]"
    );
    if (!tabWrapper) {
      return false;
    }
    let browser = tabWrapper.querySelector("[id^=contentTabBrowser]");
    return browser.contentDocument.URL == url;
  }, `The selected content tab should show ${url}`);
}

async function sub_test_cycle_through_primary_tabs() {
  // We can't really cycle through all buttons and tabs with a simple for loop
  // since some tabs are actual collapsing views and other tabs are separate
  // pages. We can improve this once the new 3pane tab is actually a standalone
  // tab.

  // Switch to address book.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("addressBookButton"),
    {},
    window
  );
  await assertContentShown("about:addressbook");

  // Switch to calendar.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("calendarButton"),
    {},
    window
  );
  await assertCalendarShown();

  // Switch to Mail.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("mailButton"),
    {},
    window
  );
  await assertMailShown();

  // Switch to Tasks.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("tasksButton"),
    {},
    window
  );
  await assertTasksShown();

  // Switch to chat.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("chatButton"),
    {},
    window
  );
  await assertChatShown();

  // Switch to Settings.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("settingsButton"),
    {},
    window
  );
  await assertSettingsShown();

  // Switch to Mail.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("mailButton"),
    {},
    window
  );
  await assertMailShown();

  window.tabmail.closeOtherTabs(window.tabmail.tabInfo[0]);
}

add_task(async function testSpacesToolbarExists() {
  let spacesToolbar = document.getElementById("spacesToolbar");
  let toggleButton = document.getElementById("spacesToolbarReveal");
  let pinnedButton = document.getElementById("spacesPinnedButton");
  Assert.ok(spacesToolbar, "The spaces toolbar exists");
  Assert.ok(!spacesToolbar.hidden, "The spaces toolbar is visible");
  Assert.ok(toggleButton.hidden, "The status bar toggle button is hidden");
  Assert.ok(pinnedButton.collapsed, "The pinned titlebar button is hidden");

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("collapseButton"),
    {},
    window
  );
  Assert.ok(spacesToolbar.hidden, "The spaces toolbar is hidden");
  Assert.ok(!toggleButton.hidden, "The status bar toggle button is visible");
  Assert.ok(!pinnedButton.collapsed, "The pinned titlebar button is visible");

  // Test the app menu button.
  let appMenu = document.getElementById("appMenu-popup");
  let menuShownPromise = BrowserTestUtils.waitForEvent(appMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("button-appmenu"),
    {},
    window
  );
  await menuShownPromise;

  let viewShownPromise = BrowserTestUtils.waitForEvent(
    appMenu.querySelector("#appMenu-viewView"),
    "ViewShown"
  );
  EventUtils.synthesizeMouseAtCenter(
    appMenu.querySelector("#appmenu_View"),
    {},
    window
  );
  await viewShownPromise;

  let toolbarShownPromise = BrowserTestUtils.waitForEvent(
    appMenu.querySelector("#appMenu-toolbarsView"),
    "ViewShown"
  );
  EventUtils.synthesizeMouseAtCenter(
    appMenu.querySelector("#appmenu_Toolbars"),
    {},
    window
  );
  await toolbarShownPromise;

  let appMenuButton = document.getElementById("appmenu_spacesToolbar");
  Assert.ok(!appMenuButton.checked, "The app menu item is not checked");

  EventUtils.synthesizeMouseAtCenter(appMenuButton, {}, window);

  Assert.ok(!spacesToolbar.hidden, "The spaces toolbar is visible");
  Assert.ok(toggleButton.hidden, "The status bar toggle button is hidden");
  Assert.ok(pinnedButton.collapsed, "The pinned titlebar button is hidden");
  Assert.ok(appMenuButton.checked, "The app menu item is checked");

  // Close the appmenu.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("button-appmenu"),
    {},
    window
  );

  // Clicked buttons open or move to the correct tab, starting with just one tab
  // open.
  await sub_test_cycle_through_primary_tabs();
});

add_task(async function testSpacesToolbarContextMenu() {
  window.gFolderTreeView.selectFolder(folderB);

  // Fetch context menu elements.
  let contextMenu = document.getElementById("spacesContextMenu");
  let newTabItem = document.getElementById("spacesContextNewTabItem");
  let newWindowItem = document.getElementById("spacesContextNewWindowItem");

  let settingsMenu = document.getElementById("settingsContextMenu");
  let settingsItem = document.getElementById("settingsContextOpenSettingsItem");
  let accountItem = document.getElementById(
    "settingsContextOpenAccountSettingsItem"
  );
  let addonsItem = document.getElementById("settingsContextOpenAddonsItem");

  /**
   * Open the context menu, test its state, select an action and wait for it to
   * close.
   *
   * @param {Object} input - Input data.
   * @param {Element} input.button - The button whose context menu should be
   *   opened.
   * @param {Element} [input.item] - The context menu item to select. Either
   *   this or switchItem must be given.
   * @param {number} [input.switchItem] - The nth switch-to-tab item to select.
   * @param {Object} expect - The expected state of the context menu when
   *   opened.
   * @param {boolean} [expect.settings=false] - Whether we expect the settings
   *   context menu. If this is true, the other values are ignored.
   * @param {boolean} [expect.newTab=false] - Whether we expect the "Open in new
   *   tab" item to be visible.
   * @param {boolean} [expect.newWindow=false] - Whether we expect the "Open in
   *   new window" item to be visible.
   * @param {number} [expect.numSwitch=0] - The expected number of switch-to-tab
   *   items.
   * @param {string} msg - A message to use in tests.
   */
  async function useContextMenu(input, expect, msg) {
    let menu = expect.settings ? settingsMenu : contextMenu;
    let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(
      input.button,
      { type: "contextmenu" },
      window
    );
    await shownPromise;
    let item = input.item;
    if (!expect.settings) {
      Assert.equal(
        BrowserTestUtils.is_visible(newTabItem),
        expect.newTab || false,
        `Open in new tab item visibility: ${msg}`
      );
      Assert.equal(
        BrowserTestUtils.is_visible(newWindowItem),
        expect.newWindow || false,
        `Open in new window item visibility: ${msg}`
      );
      let switchItems = menu.querySelectorAll(".switch-to-tab");
      Assert.equal(
        switchItems.length,
        expect.numSwitch || 0,
        `Should have the expected number of switch items: ${msg}`
      );
      if (!item) {
        item = switchItems[input.switchItem];
      }
    }
    let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.activateItem(item);
    await hiddenPromise;
  }

  let numTabs = 0;
  /**
   * Wait for and return the latest tab.
   *
   * This should be called every time a tab is created so the test can keep
   * track of the expected number of tabs.
   *
   * @return {MozTabmailTab} - The last tab.
   */
  async function getLastTab() {
    numTabs++;
    let tabs;
    await TestUtils.waitForCondition(() => {
      tabs = document.querySelectorAll("tab.tabmail-tab");
      return tabs.length == numTabs;
    }, `Waiting for ${numTabs} tabs`);
    return tabs[numTabs - 1];
  }

  /**
   * Close a tab and wait for it to close.
   *
   * This should be used alongside getLastTab so the test can keep track of the
   * expected number of tabs.
   *
   * @param {MozTabmailTab} - The tab to close.
   */
  async function closeTab(tab) {
    numTabs--;
    tab.scrollIntoView();
    EventUtils.synthesizeMouseAtCenter(
      tab.querySelector(".tab-close-button"),
      {},
      window
    );
    await TestUtils.waitForCondition(
      () => document.querySelectorAll("tab.tabmail-tab").length == numTabs,
      "Waiting for tab to close"
    );
  }

  let toolbar = document.getElementById("spacesToolbar");
  /**
   * Verify the current tab and space match.
   *
   * @param {MozTabmailTab} tab - The expected tab.
   * @param {Element} spaceButton - The expected button to be shown as the
   *   current space in the spaces toolbar.
   * @param {string} msg - A message to use in tests.
   */
  async function assertTab(tab, spaceButton, msg) {
    await TestUtils.waitForCondition(
      () => tab.selected,
      `Tab should be selected: ${msg}`
    );
    let current = toolbar.querySelectorAll("button.current");
    Assert.equal(current.length, 1, `Should have one current space: ${msg}`);
    Assert.equal(
      current[0],
      spaceButton,
      `Current button ${current[0].id} should match: ${msg}`
    );
  }

  /**
   * Click on a tab and verify we have switched tabs and spaces.
   *
   * @param {MozTabmailTab} tab - The tab to click.
   * @param {Element} spaceButton - The expected button to be shown as the
   *   current space after clicking the tab.
   * @param {string} msg - A message to use in tests.
   */
  async function switchTab(tab, spaceButton, msg) {
    tab.scrollIntoView();
    EventUtils.synthesizeMouseAtCenter(tab, {}, window);
    await assertTab(tab, spaceButton, msg);
  }

  // -- Test initial tab --
  let mailButton = document.getElementById("mailButton");
  let firstTab = await getLastTab();
  await assertTab(firstTab, mailButton, "First tab is mail tab");
  await assertMailShown();

  // -- Test spaces that only open one tab --
  let calendarTab;
  let calendarButton = document.getElementById("calendarButton");
  for (let { name, button, assertShown } of [
    {
      name: "address book",
      button: document.getElementById("addressBookButton"),
      assertShown: assertContentShown.bind(undefined, "about:addressbook"),
    },
    {
      name: "calendar",
      button: calendarButton,
      assertShown: assertCalendarShown,
    },
    {
      name: "tasks",
      button: document.getElementById("tasksButton"),
      assertShown: assertTasksShown,
    },
    {
      name: "chat",
      button: document.getElementById("chatButton"),
      assertShown: assertChatShown,
    },
  ]) {
    info(`Testing ${name} space`);
    // Only have option to open in new tab.
    await useContextMenu(
      { button, item: newTabItem },
      { newTab: true },
      `Opening ${name} tab`
    );
    let newTab = await getLastTab();
    if (name == "calendar") {
      calendarTab = newTab;
    }
    await assertTab(newTab, button, `Opened ${name} tab`);
    await assertShown();
    // Only have option to switch tabs.
    // Doing this from the same tab does nothing.
    await useContextMenu(
      { button, switchItem: 0 },
      { numSwitch: 1 },
      `When ${name} tab is open`
    );
    // Wait one tick to allow tabs to potentially change.
    await TestUtils.waitForTick();
    // However, the same tab should remain shown.
    await assertShown();

    // Switch to first tab and back.
    await switchTab(firstTab, mailButton, `${name} to first tab`);
    await assertMailShown();
    await useContextMenu(
      { button, switchItem: 0 },
      { numSwitch: 1 },
      `Switching from first tab to ${name}`
    );
    await assertTab(newTab, button, `Switched from first tab to ${name}`);
    await assertShown();
  }

  // -- Test opening mail space in a new tab --
  // Open new mail tabs whilst we are still in a non-mail tab.
  await useContextMenu(
    { button: mailButton, item: newTabItem },
    { newWindow: true, newTab: true, numSwitch: 1 },
    "Opening the second mail tab"
  );
  let secondMailTab = await getLastTab();
  await assertTab(secondMailTab, mailButton, "Opened second mail tab");
  await assertMailShown();
  // Displayed folder should be the same as in the first mail tab.
  Assert.equal(
    window.gFolderDisplay.displayedFolder?.URI,
    folderB.URI,
    "Should display folder B in the second mail tab"
  );

  window.gFolderTreeView.selectFolder(folderA);
  // Open a new mail tab whilst in a mail tab.
  await useContextMenu(
    { button: mailButton, item: newTabItem },
    { newWindow: true, newTab: true, numSwitch: 2 },
    "Opening the third mail tab"
  );
  let thirdMailTab = await getLastTab();
  await assertTab(thirdMailTab, mailButton, "Opened third mail tab");
  await assertMailShown();
  // Displayed folder should be the same as in the mail tab that was in view
  // when the context menu was opened, rather than the folder in the first tab.
  Assert.equal(
    window.gFolderDisplay.displayedFolder?.URI,
    folderA.URI,
    "Should display folder A in the third mail tab"
  );

  // -- Test switching between the multiple mail tabs --
  await useContextMenu(
    { button: mailButton, switchItem: 1 },
    { newWindow: true, newTab: true, numSwitch: 3 },
    "Switching to second mail tab"
  );
  await assertTab(secondMailTab, mailButton, "Switch to second mail tab");
  await assertMailShown();
  await useContextMenu(
    { button: mailButton, switchItem: 0 },
    { newWindow: true, newTab: true, numSwitch: 3 },
    "Switching to first mail tab"
  );
  await assertTab(firstTab, mailButton, "Switch to first mail tab");
  await assertMailShown();

  await switchTab(calendarTab, calendarButton, "First mail to calendar tab");
  await useContextMenu(
    { button: mailButton, switchItem: 2 },
    { newWindow: true, newTab: true, numSwitch: 3 },
    "Switching to third mail tab"
  );
  await assertTab(thirdMailTab, mailButton, "Switch to third mail tab");
  await assertMailShown();

  // -- Test the mail button with multiple mail tabs --
  // Clicking the mail button whilst in the mail space does nothing.
  // Specifically, we do not want it to take us to the first tab.
  EventUtils.synthesizeMouseAtCenter(mailButton, {}, window);
  // Wait one cycle to see if the tab would change.
  await TestUtils.waitForTick();
  await assertTab(thirdMailTab, mailButton, "Remain in third tab");
  await assertMailShown();
  Assert.equal(
    window.gFolderDisplay.displayedFolder?.URI,
    folderA.URI,
    "Still display folder A in the third mail tab"
  );

  // Clicking the mail button whilst in a different space takes us to the first
  // mail tab.
  await switchTab(calendarTab, calendarButton, "Third mail to calendar tab");
  EventUtils.synthesizeMouseAtCenter(mailButton, {}, window);
  await assertTab(firstTab, mailButton, "Switch to the first mail tab");
  await assertMailShown();
  Assert.equal(
    window.gFolderDisplay.displayedFolder?.URI,
    folderB.URI,
    "Still display folder B in the first mail tab"
  );

  // -- Test opening the mail space in a new window --
  let windowPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return true;
  });
  await useContextMenu(
    { button: mailButton, item: newWindowItem },
    { newWindow: true, newTab: true, numSwitch: 3 },
    "Opening mail tab in new window"
  );
  let win = await windowPromise;
  // Expect the same folder as the previously focused tab.
  await TestUtils.waitForCondition(
    () => win.gFolderDisplay.displayedFolder?.URI == folderB.URI,
    "Waiting for folder B to be displayed in the new window"
  );
  Assert.equal(
    win.document.querySelectorAll("tab.tabmail-tab").length,
    1,
    "Should only have one tab in the new window"
  );
  await assertMailShown(win);

  // -- Test opening different tabs that belong to the settings space --
  let settingsButton = document.getElementById("settingsButton");
  await useContextMenu(
    { button: settingsButton, item: accountItem },
    { settings: true },
    "Opening account settings"
  );
  let accountTab = await getLastTab();
  // Shown as part of the settings space.
  await assertTab(accountTab, settingsButton, "Opened account settings tab");
  await assertContentShown("about:accountsettings");

  await useContextMenu(
    { button: settingsButton, item: settingsItem },
    { settings: true },
    "Opening settings"
  );
  let settingsTab = await getLastTab();
  // Shown as part of the settings space.
  await assertTab(settingsTab, settingsButton, "Opened settings tab");
  await assertSettingsShown();

  await useContextMenu(
    { button: settingsButton, item: addonsItem },
    { settings: true },
    "Opening add-ons"
  );
  let addonsTab = await getLastTab();
  // Shown as part of the settings space.
  await assertTab(addonsTab, settingsButton, "Opened add-ons tab");
  await assertContentShown("about:addons");

  // -- Test the settings button with multiple settings tabs --
  // Clicking the settings button whilst in the settings space does nothing.
  EventUtils.synthesizeMouseAtCenter(settingsButton, {}, window);
  // Wait one cycle to see if the tab would change.
  await TestUtils.waitForTick();
  await assertTab(addonsTab, settingsButton, "Remain in add-ons tab");
  await assertContentShown("about:addons");

  // Clicking the settings button whilst in a different space takes us to the
  // settings tab, rather than the first tab, since this is the primary tab for
  // the space.
  await switchTab(calendarTab, calendarButton, "Add-ons to calendar tab");
  EventUtils.synthesizeMouseAtCenter(settingsButton, {}, window);
  await assertTab(settingsTab, settingsButton, "Switch to the settings tab");
  await assertSettingsShown();

  // Clicking the settings button whilst in a different space and no settings
  // tab will open a new settings tab, rather than switch to another tab in the
  // settings space because they are not the primary tab for the space.
  await closeTab(settingsTab);
  await switchTab(calendarTab, calendarButton, "Settings to calendar tab");
  EventUtils.synthesizeMouseAtCenter(settingsButton, {}, window);
  settingsTab = await getLastTab();
  await assertTab(settingsTab, settingsButton, "Re-opened settings tab");
  await assertSettingsShown();

  // -- Test opening different settings tabs when they already exist --
  await useContextMenu(
    { button: settingsButton, item: addonsItem },
    { settings: true },
    "Switching to add-ons"
  );
  await assertTab(addonsTab, settingsButton, "Switched to add-ons");
  await assertContentShown("about:addons");

  await useContextMenu(
    { button: settingsButton, item: accountItem },
    { settings: true },
    "Switching to account settings"
  );
  await assertTab(accountTab, settingsButton, "Switched to account settings");
  await assertContentShown("about:accountsettings");

  await useContextMenu(
    { button: settingsButton, item: settingsItem },
    { settings: true },
    "Switching to settings"
  );
  await assertTab(settingsTab, settingsButton, "Switched to settings");
  await assertSettingsShown();

  // -- Test clicking the spaces buttons when all the tabs are already open.
  await sub_test_cycle_through_primary_tabs();

  // Tidy up the opened window.
  // FIXME: Closing the window earlier in the test causes a test failure on the
  // osx build on the try server.
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function testSpacesToolbarMenubar() {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  let spacesToolbar = document.getElementById("spacesToolbar");

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("collapseButton"),
    {},
    window
  );
  Assert.ok(spacesToolbar.hidden, "The spaces toolbar is hidden");
  Assert.ok(
    !document.getElementById("spacesToolbarReveal").hidden,
    "The status bar toggle button is visible"
  );

  // Test the menubar button.
  let viewShownPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("menu_View_Popup"),
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("menu_View"),
    {},
    window
  );
  await viewShownPromise;

  let toolbarsShownPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("view_toolbars_popup"),
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("menu_Toolbars"),
    {},
    window
  );
  await toolbarsShownPromise;

  let menuButton = document.getElementById("viewToolbarsPopupSpacesToolbar");
  Assert.ok(
    menuButton.getAttribute("checked") != "true",
    "The menu item is not checked"
  );

  let viewHiddenPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("menu_View_Popup"),
    "popuphidden"
  );
  EventUtils.synthesizeMouseAtCenter(menuButton, {}, window);
  await viewHiddenPromise;

  Assert.ok(
    menuButton.getAttribute("checked") == "true",
    "The menu item is checked"
  );
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

add_task(async function testSpacesToolbarOSX() {
  let size = document.getElementById("spacesToolbar").getBoundingClientRect()
    .width;

  // By default, macOS shouldn't need any custom styling.
  Assert.ok(
    !document.getElementById("titlebar").hasAttribute("style"),
    "The custom styling was cleared from all toolbars"
  );

  let styleAppliedPromise = BrowserTestUtils.waitForCondition(
    () =>
      document.getElementById("tabmail-tabs").getAttribute("style") ==
      `margin-inline-start: ${size}px;`,
    "The correct style was applied to the tabmail"
  );

  // Force full screen.
  window.fullScreen = true;
  await new Promise(resolve => requestAnimationFrame(resolve));
  await styleAppliedPromise;

  let styleRemovedPromise = BrowserTestUtils.waitForCondition(
    () => !document.getElementById("tabmail-tabs").hasAttribute("style"),
    "The custom styling was cleared from all toolbars"
  );
  // Restore original window size.
  window.fullScreen = false;
  await new Promise(resolve => requestAnimationFrame(resolve));
  await styleRemovedPromise;
}).__skipMe = AppConstants.platform != "macosx";

async function sub_test_toolbar_alignment(drawInTitlebar, hideMenu) {
  let menubar = document.getElementById("toolbar-menubar");

  Services.prefs.setBoolPref("mail.tabs.drawInTitlebar", drawInTitlebar);
  if (hideMenu) {
    menubar.setAttribute("autohide", true);
    menubar.setAttribute("inactive", true);
  } else {
    menubar.removeAttribute("autohide");
    menubar.removeAttribute("inactive");
  }
  await new Promise(resolve => requestAnimationFrame(resolve));
  // Changing the drawInTitlebar pref causes the whole window to reload and we
  // lose the focus.
  window.focus();

  let size = document.getElementById("spacesToolbar").getBoundingClientRect()
    .width;
  if (
    document.documentElement.getAttribute("tabsintitlebar") == "true" &&
    menubar.getAttribute("autohide") &&
    menubar.getAttribute("inactive")
  ) {
    Assert.equal(
      document.getElementById("navigation-toolbox").getAttribute("style"),
      `margin-inline-start: ${size}px;`,
      "The correct style was applied to #navigation-toolbox"
    );
  } else {
    Assert.equal(
      document.getElementById("titlebar").getAttribute("style"),
      `margin-inline-start: ${size}px;`,
      "The correct style was applied to the #titlebar"
    );
    Assert.equal(
      document.getElementById("toolbar-menubar").getAttribute("style"),
      `margin-inline-start: -${size}px;`,
      "The correct style was applied to the #toolbar-menubar"
    );
  }
}

add_task(async function testSpacesToolbarAlignment() {
  // Show titlebar in toolbar, show menu.
  await sub_test_toolbar_alignment(true, false);
  // Show titlebar in toolbar, hide menu.
  await sub_test_toolbar_alignment(true, true);
  // Hide titlebar in toolbar, show menu.
  await sub_test_toolbar_alignment(false, false);
  // Hide titlebar in toolbar, hide menu.
  await sub_test_toolbar_alignment(false, true);
}).__skipMe = AppConstants.platform == "macosx";

add_task(async function testSpacesToolbarClearedAlignment() {
  // Hide the spaces toolbar to check if the style it's cleared.
  window.gSpacesToolbar.toggleToolbar(true);
  Assert.ok(
    !document.getElementById("titlebar").hasAttribute("style") &&
      !document.getElementById("navigation-toolbox").hasAttribute("style"),
    "The custom styling was cleared from all toolbars"
  );
});
