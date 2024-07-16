/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const xulStoreURL = "chrome://messenger/content/messenger.xhtml";
const menubarID = "toolbar-menubar";

let account;

add_setup(async function () {
  MailServices.accounts.createLocalMailAccount();
  account = MailServices.accounts.accounts[0];

  // Reset the menu bar to be hidden.
  const menubar = document.getElementById(menubarID);
  menubar.setAttribute("autohide", "true");
  menubar.setAttribute("inactive", "true");
  await TestUtils.waitForCondition(
    () => menubar.clientHeight == 0,
    "waiting for menu bar to be hidden"
  );
  Services.xulStore.removeDocument(xulStoreURL);
});

registerCleanupFunction(function () {
  MailServices.accounts.removeAccount(account, false);
});

async function assertVisible(win) {
  const menubar = win.document.getElementById(menubarID);
  Assert.equal(
    menubar.getAttribute("autohide"),
    "false",
    `menu bar should have autohide="false" attribute`
  );
  Assert.equal(
    Services.xulStore.getValue(xulStoreURL, menubarID, "autohide"),
    "false",
    `xul store should have autohide="false" value`
  );
  await TestUtils.waitForCondition(
    () => menubar.clientHeight > 0,
    "waiting for menu bar to be visible"
  );
}

async function assertHidden(win) {
  const menubar = win.document.getElementById(menubarID);
  Assert.equal(
    menubar.getAttribute("autohide"),
    "true",
    `menu bar should have autohide="true" attribute`
  );
  if (Services.xulStore.hasValue(xulStoreURL, menubarID, "autohide")) {
    Assert.equal(
      Services.xulStore.getValue(xulStoreURL, menubarID, "autohide"),
      "true",
      `xul store should have autohide="true" value, or no value`
    );
  }
  await TestUtils.waitForCondition(
    () => menubar.clientHeight == 0,
    "waiting for menu bar to be hidden"
  );
}

async function openNewWindow() {
  const newWindowPromise = TestUtils.topicObserved(
    "mail-idle-startup-tasks-finished"
  );
  window.MsgOpenNewWindowForFolder(account.incomingServer.rootFolder.URI);
  const [newWindow] = await newWindowPromise;
  await SimpleTest.promiseFocus(newWindow);
  return newWindow;
}

async function subtestAutohidePersists(callback) {
  await assertHidden(window);

  // Show the menu bar in window 0 using the callback function.

  await callback(window, "false");
  await assertVisible(window);

  // Open a new window to check the visible state was reproduced correctly.
  // This is a reasonable proxy for restarting the application.

  const newWindow1 = await openNewWindow();
  await assertVisible(newWindow1);

  // Hide the menu bar in window 1 using the callback function.

  await callback(newWindow1, "true");
  await assertHidden(newWindow1);

  // Open a new window to check the hidden state was reproduced correctly.

  const newWindow2 = await openNewWindow();
  await assertHidden(newWindow2);

  // Close the windows.

  await BrowserTestUtils.closeWindow(newWindow2);
  await BrowserTestUtils.closeWindow(newWindow1);

  // Hide the menu bar in window 0 to get back to the original state. Since
  // hiding or showing the menu bar in one window doesn't propagate to other
  // windows, the bar is still visible from the first step.

  await SimpleTest.promiseFocus(window);
  await callback(window, "true");
  await assertHidden(window);
}

add_task(async function testToolbarPopup() {
  await subtestAutohidePersists(async function (win, expectChecked) {
    const toolbar = win.document.querySelector(
      "#unifiedToolbarContent > .spacer"
    );
    const menuPopup = win.document.getElementById("unifiedToolbarMenu");
    const menuItem = win.document.getElementById("menuBarToggleVisible");

    EventUtils.synthesizeMouseAtCenter(toolbar, { type: "contextmenu" }, win);
    await BrowserTestUtils.waitForPopupEvent(menuPopup, "shown");
    Assert.equal(
      menuItem.getAttribute("checked"),
      expectChecked,
      `menu item should have checked="${expectChecked}" attribute`
    );
    menuPopup.activateItem(menuItem);
    await BrowserTestUtils.waitForPopupEvent(menuPopup, "hidden");
  });
});

add_task(async function testViewMenu() {
  await subtestAutohidePersists(async function (win, expectChecked) {
    const menubar = win.document.getElementById(menubarID);
    if (menubar.getAttribute("autohide") == "true") {
      EventUtils.synthesizeKey("KEY_Alt", {}, win);
      await TestUtils.waitForCondition(
        () => menubar.clientHeight > 0,
        "waiting for menubar to become visible from Alt key"
      );
    }
    const menu = win.document.getElementById("menu_View");
    const menuPopup = win.document.getElementById("menu_View_Popup");
    const submenu = win.document.getElementById("menu_Toolbars");
    const submenuPopup = win.document.getElementById("view_toolbars_popup");

    EventUtils.synthesizeMouseAtCenter(menu, {}, win);
    await BrowserTestUtils.waitForPopupEvent(menuPopup, "shown");
    submenu.openMenu(true);
    await BrowserTestUtils.waitForPopupEvent(submenuPopup, "shown");
    const submenuItem = await TestUtils.waitForCondition(() =>
      submenuPopup.querySelector(
        `[toolbarid="toolbar-menubar"]`,
        "waiting for submenu item"
      )
    );
    Assert.equal(
      submenuItem.getAttribute("checked"),
      expectChecked,
      `menu item should have checked="${expectChecked}" attribute`
    );
    submenuPopup.activateItem(submenuItem);
    await BrowserTestUtils.waitForPopupEvent(submenuPopup, "hidden");
    await BrowserTestUtils.waitForPopupEvent(menuPopup, "hidden");
  });
});

add_task(async function testAppMenu() {
  await subtestAutohidePersists(async function (win, expectChecked) {
    const appMenu = win.document.getElementById("button-appmenu");
    const appMenuPopup = win.document.getElementById("appMenu-popup");
    const viewMenu = win.document.getElementById("appmenu_View");
    const viewMenuView = win.document.getElementById("appMenu-viewView");
    const toolbarsMenu = win.document.getElementById("appmenu_Toolbars");
    const toolbarsMenuView = win.document.getElementById(
      "appMenu-toolbarsView"
    );

    EventUtils.synthesizeMouseAtCenter(appMenu, {}, win);
    await BrowserTestUtils.waitForPopupEvent(appMenuPopup, "shown");

    const viewShownPromise = BrowserTestUtils.waitForEvent(
      viewMenuView,
      "ViewShown"
    );
    EventUtils.synthesizeMouseAtCenter(viewMenu, {}, win);
    await viewShownPromise;

    const toolbarShownPromise = BrowserTestUtils.waitForEvent(
      toolbarsMenuView,
      "ViewShown"
    );
    EventUtils.synthesizeMouseAtCenter(toolbarsMenu, {}, win);
    await toolbarShownPromise;
    const toolbarsMenuItem = await TestUtils.waitForCondition(
      () => toolbarsMenuView.querySelector(`[toolbarid="toolbar-menubar"]`),
      "waiting for submenu item"
    );

    Assert.equal(
      toolbarsMenuItem.getAttribute("checked"),
      expectChecked,
      `menu item should have checked="${expectChecked}" attribute`
    );
    EventUtils.synthesizeMouseAtCenter(toolbarsMenuItem, {}, win);

    appMenuPopup.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(appMenuPopup, "hidden");
  });
});
