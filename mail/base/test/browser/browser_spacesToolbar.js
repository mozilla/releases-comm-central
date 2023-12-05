/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test the spaces toolbar features.
 */

/* globals gSpacesToolbar */

var folderA;
var folderB;
var testAccount;

add_setup(function () {
  // Set up two folders.
  testAccount = MailServices.accounts.createLocalMailAccount();
  const rootFolder = testAccount.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  folderA = rootFolder.createLocalSubfolder("spacesToolbarA");
  folderB = rootFolder.createLocalSubfolder("spacesToolbarB");
});

registerCleanupFunction(async () => {
  window.MailServices.accounts.removeAccount(testAccount, true);
  // Close all opened tabs.
  const tabmail = document.getElementById("tabmail");
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  // Reset the spaces toolbar to its default visible state.
  window.gSpacesToolbar.toggleToolbar(false);
  // Reset the menubar visibility.
  const menubar = document.getElementById("toolbar-menubar");
  menubar.removeAttribute("autohide");
  menubar.removeAttribute("inactive");
  await new Promise(resolve => requestAnimationFrame(resolve));
});

async function assertMailShown(win = window) {
  await TestUtils.waitForCondition(
    () =>
      win.document.getElementById("tabmail").currentTabInfo.mode.name ==
      "mail3PaneTab",
    "The mail tab should be visible"
  );
}

async function assertAddressBookShown(win = window) {
  await TestUtils.waitForCondition(() => {
    const panel = win.document.querySelector(
      // addressBookTabWrapper0, addressBookTabWrapper1, etc
      "#tabpanelcontainer > [id^=addressBookTabWrapper][selected]"
    );
    if (!panel) {
      return false;
    }
    const browser = panel.querySelector("[id^=addressBookTabBrowser]");
    return browser.contentDocument.readyState == "complete";
  }, "The address book tab should be visible and loaded");
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
    const panel = win.document.querySelector(
      // preferencesTabWrapper0, preferencesTabWrapper1, etc
      "#tabpanelcontainer > [id^=preferencesTabWrapper][selected]"
    );
    if (!panel) {
      return false;
    }
    const browser = panel.querySelector("[id^=preferencesTabBrowser]");
    return browser.contentDocument.readyState == "complete";
  }, "The settings tab should be visible and loaded");
}

async function assertContentShown(url, win = window) {
  await TestUtils.waitForCondition(() => {
    const panel = win.document.querySelector(
      // contentTabWrapper0, contentTabWrapper1, etc
      "#tabpanelcontainer > [id^=contentTabWrapper][selected]"
    );
    if (!panel) {
      return false;
    }
    const doc = panel.querySelector("[id^=contentTabBrowser]").contentDocument;
    return doc.URL == url && doc.readyState == "complete";
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
  await assertAddressBookShown();

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

add_task(async function testSpacesToolbarVisibility() {
  const spacesToolbar = document.getElementById("spacesToolbar");
  const toggleButton = document.getElementById("spacesToolbarReveal");
  const pinnedButton = document.getElementById("spacesPinnedButton");
  Assert.ok(spacesToolbar, "The spaces toolbar exists");

  const assertVisibility = async function (isHidden, msg) {
    await TestUtils.waitForCondition(
      () => spacesToolbar.hidden == !isHidden,
      `The spaces toolbar should be ${!isHidden ? "visible" : "hidden"}: ${msg}`
    );

    await TestUtils.waitForCondition(
      () => toggleButton.hidden == isHidden,
      `The toggle button should be ${isHidden ? "hidden" : "visible"}: ${msg}`
    );

    await TestUtils.waitForCondition(
      () => pinnedButton.hidden == isHidden,
      `The pinned button should be ${isHidden ? "hidden" : "visible"}: ${msg}`
    );
  };

  async function toggleVisibilityWithAppMenu(expectChecked) {
    const appMenu = document.getElementById("appMenu-popup");
    const menuShownPromise = BrowserTestUtils.waitForEvent(
      appMenu,
      "popupshown"
    );
    EventUtils.synthesizeMouseAtCenter(
      document.getElementById("button-appmenu"),
      {},
      window
    );
    await menuShownPromise;

    const viewShownPromise = BrowserTestUtils.waitForEvent(
      appMenu.querySelector("#appMenu-viewView"),
      "ViewShown"
    );
    EventUtils.synthesizeMouseAtCenter(
      appMenu.querySelector("#appmenu_View"),
      {},
      window
    );
    await viewShownPromise;

    const toolbarShownPromise = BrowserTestUtils.waitForEvent(
      appMenu.querySelector("#appMenu-toolbarsView"),
      "ViewShown"
    );
    EventUtils.synthesizeMouseAtCenter(
      appMenu.querySelector("#appmenu_Toolbars"),
      {},
      window
    );
    await toolbarShownPromise;

    const appMenuButton = document.getElementById("appmenu_spacesToolbar");
    Assert.equal(
      appMenuButton.checked,
      expectChecked,
      `The app menu item should ${expectChecked ? "not " : ""}be checked`
    );

    EventUtils.synthesizeMouseAtCenter(appMenuButton, {}, window);

    // Close the appmenu.
    EventUtils.synthesizeMouseAtCenter(
      document.getElementById("button-appmenu"),
      {},
      window
    );
  }
  await assertVisibility(true, "on initial load");

  // Collapse with a mouse click.
  let activeElement = document.activeElement;
  const collapseButton = document.getElementById("collapseButton");
  EventUtils.synthesizeMouseAtCenter(collapseButton, {}, window);
  await assertVisibility(false, "after clicking collapse button");

  await toggleVisibilityWithAppMenu(false);
  await assertVisibility(true, "after revealing with the app menu");

  // We already clicked the collapse button, so it should already be the
  // focusButton for the gSpacesToolbar, and thus focusable.
  collapseButton.focus();
  Assert.ok(
    collapseButton.matches(":focus"),
    "Collapse button should be focusable"
  );

  // Hide the spaces toolbar using the collapse button, which already has focus.
  EventUtils.synthesizeKey(" ", {}, window);
  await assertVisibility(false, "after closing with space key press");
  Assert.ok(
    pinnedButton.matches(":focus"),
    "Pinned button should be focused after closing with a key press"
  );

  // Show using the pinned button menu.
  const pinnedMenu = document.getElementById("spacesButtonMenuPopup");
  const pinnedMenuShown = BrowserTestUtils.waitForEvent(
    pinnedMenu,
    "popupshown"
  );
  EventUtils.synthesizeKey("KEY_Enter", {}, window);
  await pinnedMenuShown;
  pinnedMenu.activateItem(document.getElementById("spacesPopupButtonReveal"));

  await assertVisibility(true, "after opening with pinned menu");
  Assert.ok(
    collapseButton.matches(":focus"),
    "Collapse button should be focused again after showing with the pinned menu"
  );

  // Move focus to the mail button.
  const mailButton = document.getElementById("mailButton");
  // Loop around from the collapse button to the mailButton.
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, window);

  Assert.ok(
    mailButton.matches(":focus"),
    "Mail button should become focused after pressing key down"
  );
  Assert.ok(
    spacesToolbar.matches(":focus-within"),
    "Spaces toolbar should contain the focus"
  );

  // Now move focus elsewhere.
  EventUtils.synthesizeKey("KEY_Tab", {}, window);
  activeElement = document.activeElement;
  Assert.ok(
    !mailButton.matches(":focus"),
    "Mail button should no longer be focused"
  );
  Assert.ok(
    !spacesToolbar.matches(":focus-within"),
    "Spaces toolbar should no longer contain the focus"
  );

  // Hide the spaces toolbar using the app menu.
  await toggleVisibilityWithAppMenu(true);
  await assertVisibility(false, "after hiding with the app menu");

  // macOS by default doesn't move the focus when clicking on toolbar buttons.
  if (AppConstants.platform != "macosx") {
    Assert.notEqual(
      document.activeElement,
      activeElement,
      "The focus moved from the previous element"
    );
    // Focus should be on the main app menu since we used the mouse to toggle the
    // spaces toolbar.
    Assert.equal(
      document.activeElement,
      document.getElementById("button-appmenu"),
      "Active element is on the app menu"
    );
  } else {
    Assert.equal(
      document.activeElement,
      activeElement,
      "The focus didn't move from the previous element"
    );
  }

  // Now click the status bar toggle button to reveal the toolbar again.
  toggleButton.focus();
  Assert.ok(
    toggleButton.matches(":focus"),
    "Toggle button should be focusable"
  );
  EventUtils.synthesizeKey("KEY_Enter", {}, window);
  await assertVisibility(true, "after showing with the toggle button");
  // Focus is restored to the mailButton.
  Assert.ok(
    mailButton.matches(":focus"),
    "Mail button should become focused again"
  );

  // Clicked buttons open or move to the correct tab, starting with just one tab
  // open.
  await sub_test_cycle_through_primary_tabs();
});

add_task(async function testSpacesToolbarContextMenu() {
  const tabmail = document.getElementById("tabmail");
  const firstMailTabInfo = tabmail.currentTabInfo;
  firstMailTabInfo.folder = folderB;

  // Fetch context menu elements.
  const contextMenu = document.getElementById("spacesContextMenu");
  const newTabItem = document.getElementById("spacesContextNewTabItem");
  const newWindowItem = document.getElementById("spacesContextNewWindowItem");

  const settingsMenu = document.getElementById("settingsContextMenu");
  const settingsItem = document.getElementById(
    "settingsContextOpenSettingsItem"
  );
  const accountItem = document.getElementById(
    "settingsContextOpenAccountSettingsItem"
  );
  const addonsItem = document.getElementById("settingsContextOpenAddonsItem");

  /**
   * Open the context menu, test its state, select an action and wait for it to
   * close.
   *
   * @param {object} input - Input data.
   * @param {Element} input.button - The button whose context menu should be
   *   opened.
   * @param {Element} [input.item] - The context menu item to select. Either
   *   this or switchItem must be given.
   * @param {number} [input.switchItem] - The nth switch-to-tab item to select.
   * @param {object} expect - The expected state of the context menu when
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
    const menu = expect.settings ? settingsMenu : contextMenu;
    const shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
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
      const switchItems = menu.querySelectorAll(".switch-to-tab");
      Assert.equal(
        switchItems.length,
        expect.numSwitch || 0,
        `Should have the expected number of switch items: ${msg}`
      );
      if (!item) {
        item = switchItems[input.switchItem];
      }
    }
    const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.activateItem(item);
    await hiddenPromise;
  }

  const tabScroll = document.getElementById("tabmail-arrowscrollbox").scrollbox;
  /**
   * Ensure the tab is scrolled into view.
   *
   * @param {MozTabmailTab} - The tab to scroll into view.
   */
  async function scrollToTab(tab) {
    function tabInView() {
      const tabRect = tab.getBoundingClientRect();
      const scrollRect = tabScroll.getBoundingClientRect();
      return (
        tabRect.left >= scrollRect.left && tabRect.right <= scrollRect.right
      );
    }
    if (tabInView()) {
      info(`Tab ${tab.label} already in view`);
      return;
    }
    tab.scrollIntoView();
    await TestUtils.waitForCondition(
      tabInView,
      "Tab should be scrolled into view: " + tab.label
    );
    info(`Tab ${tab.label} was scrolled into view`);
  }

  let numTabs = 0;
  /**
   * Wait for and return the latest tab.
   *
   * This should be called every time a tab is created so the test can keep
   * track of the expected number of tabs.
   *
   * @returns {MozTabmailTab} - The last tab.
   */
  async function waitForNewTab() {
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
   * This should be used alongside waitForNewTab so the test can keep track of
   * the expected number of tabs.
   *
   * @param {MozTabmailTab} - The tab to close.
   */
  async function closeTab(tab) {
    numTabs--;
    await scrollToTab(tab);
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

  const toolbar = document.getElementById("spacesToolbar");
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
    const current = toolbar.querySelectorAll("button.current");
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
    await scrollToTab(tab);
    EventUtils.synthesizeMouseAtCenter(tab, {}, window);
    await assertTab(tab, spaceButton, msg);
  }

  // -- Test initial tab --

  const mailButton = document.getElementById("mailButton");
  const firstTab = await waitForNewTab();
  await assertTab(firstTab, mailButton, "First tab is mail tab");
  await assertMailShown();

  // -- Test spaces that only open one tab --

  let calendarTab;
  const calendarButton = document.getElementById("calendarButton");
  for (const { name, button, assertShown } of [
    {
      name: "address book",
      button: document.getElementById("addressBookButton"),
      assertShown: assertAddressBookShown,
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
    const newTab = await waitForNewTab();
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
  const secondMailTab = await waitForNewTab();
  await assertTab(secondMailTab, mailButton, "Opened second mail tab");
  await assertMailShown();
  // Displayed folder should be the same as in the first mail tab.
  const [, secondMailTabInfo] =
    tabmail._getTabContextForTabbyThing(secondMailTab);
  await TestUtils.waitForCondition(
    () => secondMailTabInfo.folder?.URI == folderB.URI,
    "Should display folder B in the second mail tab"
  );

  secondMailTabInfo.folder = folderA;

  // Open a new mail tab whilst in a mail tab.
  await useContextMenu(
    { button: mailButton, item: newTabItem },
    { newWindow: true, newTab: true, numSwitch: 2 },
    "Opening the third mail tab"
  );
  const thirdMailTab = await waitForNewTab();
  await assertTab(thirdMailTab, mailButton, "Opened third mail tab");
  await assertMailShown();
  // Displayed folder should be the same as in the mail tab that was in view
  // when the context menu was opened, rather than the folder in the first tab.
  const [, thirdMailTabInfo] =
    tabmail._getTabContextForTabbyThing(thirdMailTab);
  await TestUtils.waitForCondition(
    () => thirdMailTabInfo.folder?.URI == folderA.URI,
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
    thirdMailTabInfo.folder.URI,
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
    firstMailTabInfo.folder.URI,
    folderB.URI,
    "Still display folder B in the first mail tab"
  );

  // -- Test opening the mail space in a new window --

  const windowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  await useContextMenu(
    { button: mailButton, item: newWindowItem },
    { newWindow: true, newTab: true, numSwitch: 3 },
    "Opening mail tab in new window"
  );
  const newMailWindow = await windowPromise;
  const newTabmail = newMailWindow.document.getElementById("tabmail");
  // Expect the same folder as the previously focused tab.
  await TestUtils.waitForCondition(
    () => newTabmail.currentTabInfo.folder?.URI == folderB.URI,
    "Waiting for folder B to be displayed in the new window"
  );
  Assert.equal(
    newMailWindow.document.querySelectorAll("tab.tabmail-tab").length,
    1,
    "Should only have one tab in the new window"
  );
  await assertMailShown(newMailWindow);

  // -- Test opening different tabs that belong to the settings space --

  const settingsButton = document.getElementById("settingsButton");
  await useContextMenu(
    { button: settingsButton, item: accountItem },
    { settings: true },
    "Opening account settings"
  );
  const accountTab = await waitForNewTab();
  // Shown as part of the settings space.
  await assertTab(accountTab, settingsButton, "Opened account settings tab");
  await assertContentShown("about:accountsettings");

  await useContextMenu(
    { button: settingsButton, item: settingsItem },
    { settings: true },
    "Opening settings"
  );
  let settingsTab = await waitForNewTab();
  // Shown as part of the settings space.
  await assertTab(settingsTab, settingsButton, "Opened settings tab");
  await assertSettingsShown();

  await useContextMenu(
    { button: settingsButton, item: addonsItem },
    { settings: true },
    "Opening add-ons"
  );
  const addonsTab = await waitForNewTab();
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
  settingsTab = await waitForNewTab();
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
  await BrowserTestUtils.closeWindow(newMailWindow);
});

add_task(async function testSpacesToolbarMenubar() {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  const spacesToolbar = document.getElementById("spacesToolbar");

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
  const viewShownPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("menu_View_Popup"),
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("menu_View"),
    {},
    window
  );
  await viewShownPromise;

  const toolbarsShownPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("view_toolbars_popup"),
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("menu_Toolbars"),
    {},
    window
  );
  await toolbarsShownPromise;

  const menuButton = document.getElementById("viewToolbarsPopupSpacesToolbar");
  Assert.ok(
    menuButton.getAttribute("checked") != "true",
    "The menu item is not checked"
  );

  const viewHiddenPromise = BrowserTestUtils.waitForEvent(
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
  const size = document
    .getElementById("spacesToolbar")
    .getBoundingClientRect().width;

  // By default, macOS shouldn't need any custom styling.
  Assert.ok(
    !document.getElementById("titlebar").hasAttribute("style"),
    "The custom styling was cleared from all toolbars"
  );

  const styleAppliedPromise = BrowserTestUtils.waitForCondition(
    () =>
      document.getElementById("tabmail-tabs").getAttribute("style") ==
      `margin-inline-start: ${size}px;`,
    "The correct style was applied to the tabmail"
  );

  // Force full screen.
  window.fullScreen = true;
  await new Promise(resolve => requestAnimationFrame(resolve));
  await styleAppliedPromise;

  const styleRemovedPromise = BrowserTestUtils.waitForCondition(
    () => !document.getElementById("tabmail-tabs").hasAttribute("style"),
    "The custom styling was cleared from all toolbars"
  );
  // Restore original window size.
  window.fullScreen = false;
  await new Promise(resolve => requestAnimationFrame(resolve));
  await styleRemovedPromise;
}).__skipMe = AppConstants.platform != "macosx";

add_task(async function testSpacesToolbarClearedAlignment() {
  // Hide the spaces toolbar to check if the style it's cleared.
  window.gSpacesToolbar.toggleToolbar(true);
  Assert.ok(
    !document.getElementById("titlebar").hasAttribute("style") &&
      !document.getElementById("navigation-toolbox").hasAttribute("style"),
    "The custom styling was cleared from all toolbars"
  );
});

add_task(async function testSpacesToolbarExtension() {
  window.gSpacesToolbar.toggleToolbar(false);

  for (let i = 0; i < 6; i++) {
    await window.gSpacesToolbar.createToolbarButton(`testButton${i}`, {
      title: `Title ${i}`,
      url: `https://test.invalid/${i}`,
      iconStyles: new Map([
        [
          "--webextension-toolbar-image",
          'url("chrome://messenger/content/extension.svg")',
        ],
      ]),
    });
    const button = document.getElementById(`testButton${i}`);
    Assert.ok(button);
    Assert.equal(button.title, `Title ${i}`);

    const img = button.querySelector("img");
    Assert.equal(
      img.style.getPropertyValue("--webextension-toolbar-image"),
      `url("chrome://messenger/content/extension.svg")`,
      `Button image should have the correct icon.`
    );

    const menuitem = document.getElementById(`testButton${i}-menuitem`);
    Assert.ok(menuitem);
    Assert.equal(menuitem.label, `Title ${i}`);
    Assert.equal(
      menuitem.style.getPropertyValue("--webextension-toolbar-image"),
      `url("chrome://messenger/content/extension.svg")`,
      `Menuitem should have the correct icon.`
    );

    const space = window.gSpacesToolbar.spaces.find(
      space => space.name == `testButton${i}`
    );
    Assert.ok(space);
    Assert.equal(
      space.url,
      `https://test.invalid/${i}`,
      "Added url should be correct."
    );
  }

  for (let i = 0; i < 6; i++) {
    await window.gSpacesToolbar.updateToolbarButton(`testButton${i}`, {
      title: `Modified Title ${i}`,
      url: `https://test.invalid/${i + 1}`,
      iconStyles: new Map([
        [
          "--webextension-toolbar-image",
          'url("chrome://messenger/skin/icons/new-addressbook.svg")',
        ],
      ]),
    });
    const button = document.getElementById(`testButton${i}`);
    Assert.ok(button);
    Assert.equal(button.title, `Modified Title ${i}`);

    const img = button.querySelector("img");
    Assert.equal(
      img.style.getPropertyValue("--webextension-toolbar-image"),
      `url("chrome://messenger/skin/icons/new-addressbook.svg")`,
      `Button image should have the correct icon.`
    );

    const menuitem = document.getElementById(`testButton${i}-menuitem`);
    Assert.ok(menuitem);
    Assert.equal(
      menuitem.label,
      `Modified Title ${i}`,
      "Updated title should be correct."
    );
    Assert.equal(
      menuitem.style.getPropertyValue("--webextension-toolbar-image"),
      `url("chrome://messenger/skin/icons/new-addressbook.svg")`,
      `Menuitem should have the correct icon.`
    );

    const space = window.gSpacesToolbar.spaces.find(
      space => space.name == `testButton${i}`
    );
    Assert.ok(space);
    Assert.equal(
      space.url,
      `https://test.invalid/${i + 1}`,
      "Updated url should be correct."
    );
  }

  const overflowButton = document.getElementById(
    "spacesToolbarAddonsOverflowButton"
  );

  const originalHeight = window.outerHeight;
  // Set a ridiculous tiny height to be sure all add-on buttons are hidden.
  window.resizeTo(window.outerWidth, 300);
  await new Promise(resolve => requestAnimationFrame(resolve));
  await BrowserTestUtils.waitForCondition(
    () => !overflowButton.hidden,
    "The overflow button is visible"
  );

  const overflowPopup = document.getElementById("spacesToolbarAddonsPopup");
  const popupshown = BrowserTestUtils.waitForEvent(overflowPopup, "popupshown");
  overflowButton.click();
  await popupshown;

  Assert.ok(overflowPopup.hasChildNodes());

  const popuphidden = BrowserTestUtils.waitForEvent(
    overflowPopup,
    "popuphidden"
  );
  // Restore the original height.
  window.resizeTo(window.outerWidth, originalHeight);
  await new Promise(resolve => requestAnimationFrame(resolve));

  await popuphidden;
  await BrowserTestUtils.waitForCondition(
    () => overflowButton.hidden,
    "The overflow button is hidden"
  );

  // Remove all previously added toolbar buttons and make sure all previously
  // generate elements are properly cleared.
  for (let i = 0; i < 6; i++) {
    await window.gSpacesToolbar.removeToolbarButton(`testButton${i}`);
    const space = window.gSpacesToolbar.spaces.find(
      space => space.name == `testButton${i}`
    );
    Assert.ok(!space);

    const button = document.getElementById(`testButton${i}`);
    Assert.ok(!button);

    const menuitem = document.getElementById(`testButton${i}-menuitem`);
    Assert.ok(!menuitem);
  }
});

add_task(function testPinnedSpacesBadge() {
  window.gSpacesToolbar.toggleToolbar(true);
  const spacesPinnedButton = document.getElementById("spacesPinnedButton");
  const spacesPopupButtonChat = document.getElementById(
    "spacesPopupButtonChat"
  );

  window.gSpacesToolbar.updatePinnedBadgeState();

  Assert.ok(
    !spacesPinnedButton.classList.contains("has-badge"),
    "Pinned button does not indicate badged items without any"
  );

  spacesPopupButtonChat.classList.add("has-badge");
  window.gSpacesToolbar.updatePinnedBadgeState();

  Assert.ok(
    spacesPinnedButton.classList.contains("has-badge"),
    "Pinned button indicates it has badged items"
  );

  spacesPopupButtonChat.classList.remove("has-badge");
  window.gSpacesToolbar.updatePinnedBadgeState();

  Assert.ok(
    !spacesPinnedButton.classList.contains("has-badge"),
    "Badge state is reset from pinned button"
  );
});

add_task(async function testSpacesToolbarFocusRing() {
  // Make sure the spaces toolbar is visible.
  window.gSpacesToolbar.toggleToolbar(false);
  // Move the focus ring on the mail toolbar button.
  document.getElementById("mailButton").focus();

  // Collect an array of all currently visible buttons.
  const buttons = [
    ...document.querySelectorAll(".spaces-toolbar-button:not([hidden])"),
  ];

  // Simulate the Arrow Down keypress to make sure the correct button gets the
  // focus.
  for (let i = 1; i < buttons.length; i++) {
    const previousElement = document.activeElement;
    EventUtils.synthesizeKey("KEY_ArrowDown", {}, window);
    Assert.equal(
      document.activeElement.id,
      buttons[i].id,
      "The next button is focused"
    );
    Assert.ok(
      document.activeElement.tabIndex == 0 && previousElement.tabIndex == -1,
      "The roving tab index was updated"
    );
  }

  // Do the same with the Arrow Up key press but reversing the array.
  buttons.reverse();
  for (let i = 1; i < buttons.length; i++) {
    const previousElement = document.activeElement;
    EventUtils.synthesizeKey("KEY_ArrowUp", {}, window);
    Assert.equal(
      document.activeElement.id,
      buttons[i].id,
      "The previous button is focused"
    );
    Assert.ok(
      document.activeElement.tabIndex == 0 && previousElement.tabIndex == -1,
      "The roving tab index was updated"
    );
  }

  // Pressing the END key should move the focus down to the last available
  // button.
  EventUtils.synthesizeKey("KEY_End", {}, window);
  Assert.equal(
    document.activeElement.id,
    "collapseButton",
    "The last button is focused"
  );

  // Pressing the HOME key should move the focus up to the first available
  // button.
  EventUtils.synthesizeKey("KEY_Home", {}, window);
  Assert.equal(
    document.activeElement.id,
    "mailButton",
    "The first button is focused"
  );

  // Focus follows the mouse click.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("calendarButton"),
    {},
    window
  );
  Assert.equal(
    document.activeElement.id,
    "calendarButton",
    "Focus should move to the clicked calendar button"
  );

  // Now press a key to make sure roving index was updated with the click.
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, window);
  Assert.equal(
    document.activeElement.id,
    "tasksButton",
    "Focus should move to the tasks button"
  );
});
