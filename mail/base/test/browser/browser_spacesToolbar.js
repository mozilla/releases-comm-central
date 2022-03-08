/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test the spaces toolbar features.
 */

const DEFAULT_ICON = "chrome://mozapps/skin/extensions/category-extensions.svg";

registerCleanupFunction(async () => {
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
  let abOpened = false;
  let tabmail = document.getElementById("tabmail");
  for (let tabInfo of tabmail.tabInfo) {
    let tab = tabmail.getTabForBrowser(tabInfo.browser);
    if (tab?.urlbar?.value == "about:addressbook") {
      abOpened = true;
      break;
    }
  }
  Assert.ok(abOpened, "The address book tab is visible");

  // Switch to calendar.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("calendarButton"),
    {},
    window
  );
  Assert.ok(
    document.getElementById("calendarTabPanel").hasAttribute("selected"),
    "The calendar tab is visible"
  );

  // Switch to Mail.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("mailButton"),
    {},
    window
  );
  Assert.ok(
    document.getElementById("mailContent").hasAttribute("selected"),
    "The mail tab is visible"
  );

  // Switch to Tasks.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("tasksButton"),
    {},
    window
  );
  Assert.ok(
    document.getElementById("calendarTabPanel").hasAttribute("selected") &&
      !document.getElementById("calendar-task-box").collapsed,
    "The tasks tab is visible"
  );

  // Switch to chat.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("chatButton"),
    {},
    window
  );
  Assert.ok(
    document.getElementById("chatTabPanel").hasAttribute("selected"),
    "The chat tab is visible"
  );

  // Switch to Settings.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("settingsButton"),
    {},
    window
  );
  Assert.ok(
    document.getElementById("preferencesTabWrapper0").hasAttribute("selected"),
    "The preferences tab is visible"
  );

  // Switch to Mail.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("mailButton"),
    {},
    window
  );
  Assert.ok(
    document.getElementById("mailContent").hasAttribute("selected"),
    "The mail tab is visible"
  );
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

  // Clicked buttons open or move to the correct tab.
  await sub_test_cycle_through_primary_tabs();
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

add_task(async function testSpacesToolbarExtension() {
  window.gSpacesToolbar.toggleToolbar(false);

  for (let i = 0; i < 10; i++) {
    window.gSpacesToolbar
      .createToolbarButton(`testButton${i}`, `Title ${i}`, "about:addons")
      .then(() => {
        let button = document.getElementById(`testButton${i}`);
        Assert.ok(button);
        Assert.equal(button.title, `Title ${i}`);
        Assert.equal(button.querySelector("img").src, DEFAULT_ICON);

        let menuitem = document.getElementById(`testButton${i}-menuitem`);
        Assert.ok(menuitem);
        Assert.equal(menuitem.label, `Title ${i}`);
        Assert.equal(
          menuitem.getAttribute("style"),
          `list-style-image: url("${DEFAULT_ICON}")`
        );
      });
  }

  let originalHeight = window.innerHeight;
  // Set a ridiculous tiny height to be sure all add-on buttons are hidden.
  let windowResized = TestUtils.waitForCondition(
    () => window.innerHeight == 300,
    "waiting for window to be resized"
  );
  window.resizeTo(window.innerWidth, 300);
  await windowResized;
  await new Promise(resolve => setTimeout(resolve));

  let overflowPopup = document.getElementById("spacesToolbarAddonsPopup");
  let popupshown = BrowserTestUtils.waitForEvent(overflowPopup, "popupshown");
  document.getElementById("spacesToolbarAddonsOverflowButton").click();
  await popupshown;

  Assert.ok(overflowPopup.hasChildNodes());

  // Restore the original height.
  window.resizeTo(window.innerWidth, originalHeight);
});
