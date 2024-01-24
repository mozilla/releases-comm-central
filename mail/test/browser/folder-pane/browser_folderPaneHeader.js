/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { XULStoreUtils } = ChromeUtils.importESModule(
  "resource:///modules/XULStoreUtils.sys.mjs"
);

var { add_message_sets_to_folders, be_in_folder, create_thread } =
  ChromeUtils.import(
    "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
  );

let tabmail,
  about3Pane,
  folderPaneHeader,
  fetchButton,
  newButton,
  moreButton,
  moreContext,
  fetchContext,
  folderModesContextMenu,
  folderModesContextMenuPopup;

add_setup(async function () {
  tabmail = document.getElementById("tabmail");
  about3Pane = tabmail.currentAbout3Pane;
  folderPaneHeader = about3Pane.document.getElementById("folderPaneHeaderBar");
  fetchButton = folderPaneHeader.querySelector("#folderPaneGetMessages");
  fetchContext = about3Pane.document.getElementById(
    "folderPaneGetMessagesContext"
  );
  newButton = folderPaneHeader.querySelector("#folderPaneWriteMessage");
  moreButton = folderPaneHeader.querySelector("#folderPaneMoreButton");
  moreContext = about3Pane.document.getElementById("folderPaneMoreContext");
  folderModesContextMenu = about3Pane.document.getElementById(
    "folderModesContextMenu"
  );
  folderModesContextMenuPopup = about3Pane.document.getElementById(
    "folderModesContextMenuPopup"
  );
  registerCleanupFunction(() => {
    Services.xulStore.removeDocument(
      "chrome://messenger/content/messenger.xhtml"
    );
  });
});

async function assertAriaLabel(row, expectedLabel) {
  await BrowserTestUtils.waitForCondition(
    () => row.getAttribute("aria-label") === expectedLabel,
    "The selected row aria-label should match the expected value"
  );
}

add_task(function testFolderPaneHeaderDefaultState() {
  Assert.ok(!folderPaneHeader.hidden, "The folder pane header is visible");
  Assert.ok(!fetchButton.disabled, "The Get Messages button is enabled");
  Assert.ok(!newButton.disabled, "The New Message button is enabled");
});

add_task(async function testHideFolderPaneHeader() {
  const shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  const hiddenPromise = BrowserTestUtils.waitForCondition(
    () => folderPaneHeader.hidden,
    "The folder pane header is hidden"
  );
  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderHideMenuItem")
  );
  await hiddenPromise;

  await BrowserTestUtils.waitForCondition(
    () => XULStoreUtils.isItemHidden("messenger", "folderPaneHeaderBar"),
    "The customization data was saved"
  );

  // Can't access the menubar in macOS tests, so simply simulate a click on the
  // toolbarbutton inside the app menu to reveal the header. The app menu
  // behavior is tested later.
  if (AppConstants.platform == "macosx") {
    document.getElementById("appmenu_toggleFolderHeader").click();
    return;
  }

  const menubar = document.getElementById("toolbar-menubar");
  menubar.removeAttribute("autohide");
  menubar.removeAttribute("inactive");
  await new Promise(resolve => requestAnimationFrame(resolve));

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

  const viewMenuPopup = document.getElementById("menu_View_Popup");
  Assert.ok(viewMenuPopup.querySelector("#menu_FolderViews"));

  const folderViewShownPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("menu_FolderViewsPopup"),
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    viewMenuPopup.querySelector("#menu_FolderViews"),
    {},
    window
  );
  await folderViewShownPromise;

  const toggleFolderHeader = menubar.querySelector(`[name="paneheader"]`);
  Assert.ok(
    !toggleFolderHeader.hasAttribute("checked"),
    "The toggle header menu item is not checked"
  );

  EventUtils.synthesizeMouseAtCenter(toggleFolderHeader, {}, window);
  await BrowserTestUtils.waitForCondition(
    () => toggleFolderHeader.getAttribute("checked") == "true",
    "The toggle header menu item is checked"
  );

  const folderViewHiddenPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("menu_FolderViewsPopup"),
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await folderViewHiddenPromise;

  const viewHiddenPromise = BrowserTestUtils.waitForEvent(
    viewMenuPopup,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await viewHiddenPromise;

  await BrowserTestUtils.waitForCondition(
    () => !folderPaneHeader.hidden,
    "The folder pane header is visible"
  );
  await BrowserTestUtils.waitForCondition(
    () => !XULStoreUtils.isItemHidden("messenger", "folderPaneHeaderBar"),
    "The customization data was saved"
  );
});

add_task(async function testTogglePaneHeaderFromAppMenu() {
  Assert.ok(
    !folderPaneHeader.hidden,
    "Start with a visible folder pane header"
  );

  async function toggleFolderPaneHeader(shouldBeChecked) {
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
      appMenu.querySelector("#appMenu-foldersView"),
      "ViewShown"
    );
    EventUtils.synthesizeMouseAtCenter(
      appMenu.querySelector("#appmenu_FolderViews"),
      {},
      window
    );
    await toolbarShownPromise;

    const appMenuButton = document.getElementById("appmenu_toggleFolderHeader");
    Assert.equal(
      appMenuButton.checked,
      shouldBeChecked,
      `The app menu item should ${shouldBeChecked ? "" : "not "}be checked`
    );

    EventUtils.synthesizeMouseAtCenter(appMenuButton, {}, window);

    const menuHiddenPromise = BrowserTestUtils.waitForEvent(
      appMenu,
      "popuphidden"
    );
    // Close the appmenu.
    EventUtils.synthesizeMouseAtCenter(
      document.getElementById("button-appmenu"),
      {},
      window
    );
    await menuHiddenPromise;
  }

  await toggleFolderPaneHeader(true);
  await toggleFolderPaneHeader(false);
});

/**
 * Test the toggle that shows/hides the buttons on the folder pane header from
 * the context menu.
 */
add_task(async function testTogglePaneHeaderButtons() {
  Assert.ok(!folderPaneHeader.hidden, "The folder pane header is visible");
  Assert.ok(!fetchButton.hidden, "The Get Messages button is visible");
  Assert.ok(!newButton.hidden, "The New Message button is visible");

  const folderPaneHdrToggleBtns = [
    {
      menuId: "#folderPaneHeaderToggleGetMessages",
      buttonId: "#folderPaneGetMessages",
      label: "Get messages",
    },
    {
      menuId: "#folderPaneHeaderToggleNewMessage",
      buttonId: "#folderPaneWriteMessage",
      label: "New message",
    },
  ];

  for (const toggle of folderPaneHdrToggleBtns) {
    const toggleMenuItem = moreContext.querySelector(toggle.menuId);
    const toggleButton = folderPaneHeader.querySelector(toggle.buttonId);
    let shouldBeChecked = !toggleButton.hidden;

    // Hide the toggle buttons
    const shownPromise = BrowserTestUtils.waitForEvent(
      moreContext,
      "popupshown"
    );
    EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
    await shownPromise;

    Assert.equal(
      toggleMenuItem.hasAttribute("checked"),
      shouldBeChecked,
      `The "${toggle.label}" menuitem should ${
        shouldBeChecked ? "" : "not"
      } be checked`
    );

    EventUtils.synthesizeMouseAtCenter(toggleMenuItem, {}, about3Pane);

    await BrowserTestUtils.waitForCondition(
      () => !toggleMenuItem.hasAttribute("checked"),
      `The ${toggle.label} menu item is unchecked`
    );

    await BrowserTestUtils.waitForCondition(
      () => toggleButton.hidden,
      `The ${toggle.label}  button is hidden`
    );

    const buttonName =
      toggle.buttonId == "#folderPaneGetMessages"
        ? "folderPaneGetMessages"
        : "folderPaneWriteMessage";
    await BrowserTestUtils.waitForCondition(
      () => XULStoreUtils.isItemHidden("messenger", buttonName),
      "The customization data was saved"
    );

    const menuHiddenPromise = BrowserTestUtils.waitForEvent(
      moreContext,
      "popuphidden"
    );
    EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
    await menuHiddenPromise;

    // display the toggle buttons
    EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
    await shownPromise;

    shouldBeChecked = !toggleButton.hidden;

    Assert.equal(
      toggleMenuItem.hasAttribute("checked"),
      shouldBeChecked,
      `The "${toggle.label}" menuitem should ${
        shouldBeChecked ? "" : "not"
      } be checked`
    );
    EventUtils.synthesizeMouseAtCenter(toggleMenuItem, {}, about3Pane);

    await BrowserTestUtils.waitForCondition(
      () => toggleMenuItem.hasAttribute("checked"),
      `The ${toggle.label} menu item is checked`
    );

    await BrowserTestUtils.waitForCondition(
      () => !toggleButton.hidden,
      `The ${toggle.label} button is not hidden`
    );
    await BrowserTestUtils.waitForCondition(
      () => !XULStoreUtils.isItemHidden("messenger", buttonName),
      "The customization data was saved"
    );

    EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
    await menuHiddenPromise;
  }
});

/**
 * Test the default state of the context menu in the about3Pane.
 */
add_task(async function testInitialActiveModes() {
  const shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  const shownFolderModesSubMenuPromise = BrowserTestUtils.waitForEvent(
    folderModesContextMenuPopup,
    "popupshown"
  );

  EventUtils.synthesizeMouseAtCenter(folderModesContextMenu, {}, about3Pane);
  await shownFolderModesSubMenuPromise;

  Assert.equal(
    about3Pane.folderPane.activeModes.length,
    1,
    "Only one active mode"
  );
  Assert.equal(
    about3Pane.folderPane.activeModes.at(0),
    "all",
    "The first item is 'all' value"
  );
  Assert.ok(
    moreContext
      .querySelector("#folderPaneMoreContextAllFolders")
      .getAttribute("checked"),
    "'All' toggle is checked"
  );
  Assert.equal(moreContext.state, "open", "The context menu remains open");
});

/**
 * Tests that the menu items are correctly checked corresponding to the current
 * active modes.
 */
add_task(async function testFolderModesActivation() {
  const folderModesArray = [
    { menuID: "#folderPaneMoreContextUnifiedFolders", modeID: "smart" },
    { menuID: "#folderPaneMoreContextUnreadFolders", modeID: "unread" },
    { menuID: "#folderPaneMoreContextFavoriteFolders", modeID: "favorite" },
    { menuID: "#folderPaneMoreContextRecentFolders", modeID: "recent" },
  ];
  let checkedModesCount = 2;
  for (const mode of folderModesArray) {
    Assert.ok(
      !moreContext.querySelector(mode.menuID).hasAttribute("checked"),
      `"${mode.modeID}" option is not checked`
    );

    const checkedPromise = TestUtils.waitForCondition(
      () => moreContext.querySelector(mode.menuID).hasAttribute("checked"),
      `"${mode.modeID}" option has been checked`
    );
    moreContext.activateItem(moreContext.querySelector(mode.menuID));
    await checkedPromise;

    Assert.equal(
      about3Pane.folderPane.activeModes.length,
      checkedModesCount,
      `Correct amount of active modes after enabling the "${mode.modeID}" mode`
    );
    Assert.ok(
      about3Pane.folderPane.activeModes.includes(mode.modeID),
      `"${mode.modeID}" mode is included in the active modes array`
    );
    checkedModesCount++;
  }
  Assert.equal(moreContext.state, "open", "The context menu remains open");
});

/**
 * Tests that the menu items are correctly unchecked corresponding to the
 * current active modes. It verifies that the if every item is unchecked, it
 * returns to the default active mode value and the corresponding menu item is
 * checked.
 */
add_task(async function testFolderModesDeactivation() {
  const folderActiveModesArray = [
    { menuID: "#folderPaneMoreContextAllFolders", modeID: "all" },
    { menuID: "#folderPaneMoreContextUnifiedFolders", modeID: "smart" },
    { menuID: "#folderPaneMoreContextUnreadFolders", modeID: "unread" },
    { menuID: "#folderPaneMoreContextFavoriteFolders", modeID: "favorite" },
    { menuID: "#folderPaneMoreContextRecentFolders", modeID: "recent" },
  ];
  let checkedModesCount = 4;
  for (const mode of folderActiveModesArray) {
    Assert.ok(
      moreContext.querySelector(mode.menuID).hasAttribute("checked"),
      `"${mode.modeID}" option is checked`
    );

    const uncheckedPromise = TestUtils.waitForCondition(
      () => !moreContext.querySelector(mode.menuID).hasAttribute("checked"),
      `"${mode.modeID}" option has been unchecked`
    );
    moreContext.activateItem(moreContext.querySelector(mode.menuID));
    await uncheckedPromise;

    Assert.ok(
      !about3Pane.folderPane.activeModes.includes(mode.modeID),
      `"${mode.modeID}" mode is not included in the active modes array`
    );
    if (checkedModesCount > 0) {
      Assert.equal(
        about3Pane.folderPane.activeModes.length,
        checkedModesCount,
        `Correct amount of active modes after disabling the "${mode.modeID}" mode`
      );
    } else {
      //checks if it automatically checks "all" mode if every other mode was unchecked
      Assert.equal(
        about3Pane.folderPane.activeModes.length,
        1,
        `Correct amount of active modes after disabling the "${mode.modeID}" mode`
      );
      Assert.equal(
        about3Pane.folderPane.activeModes.at(0),
        "all",
        "The first item is 'all' value"
      );
      Assert.ok(
        moreContext
          .querySelector("#folderPaneMoreContextAllFolders")
          .getAttribute("checked"),
        "'All' toggle is checked"
      );
    }
    checkedModesCount--;
  }
  Assert.equal(moreContext.state, "open", "The context menu remains open");
  let menuHiddenPromise = BrowserTestUtils.waitForEvent(
    folderModesContextMenuPopup,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;

  menuHiddenPromise = BrowserTestUtils.waitForEvent(moreContext, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;
});

add_task(async function testGetMessageContextMenu() {
  const shownPromise = BrowserTestUtils.waitForEvent(
    fetchContext,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    fetchButton,
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  Assert.equal(
    fetchContext.querySelectorAll("menuitem").length,
    2,
    "2 menuitems should be present in the fetch context"
  );

  const menuHiddenPromise = BrowserTestUtils.waitForEvent(
    fetchContext,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;
});

add_task(async function testTotalCountDefaultState() {
  const totalCountBadge = about3Pane.document.querySelector(".total-count");
  Assert.ok(
    !moreContext
      .querySelector("#folderPaneHeaderToggleTotalCount")
      .hasAttribute("checked"),
    "The total count toggle is unchecked"
  );
  Assert.ok(totalCountBadge.hidden, "The total count badges are hidden");
  Assert.notEqual(
    XULStoreUtils.isItemVisible("messenger", "totalMsgCount"),
    "true",
    "The customization data was saved"
  );

  const rootFolder =
    MailServices.accounts.accounts[0].incomingServer.rootFolder;
  const inbox = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  await add_message_sets_to_folders([inbox], [create_thread(10)]);
  await be_in_folder(inbox);

  about3Pane.folderTree.selectedIndex = 1;
  const row = about3Pane.folderTree.getRowAtIndex(1);
  await assertAriaLabel(row, "Inbox, 10 unread messages");

  about3Pane.threadTree.selectedIndex = 0;
  about3Pane.threadTree.expandRowAtIndex(0);
  await assertAriaLabel(row, "Inbox, 9 unread messages");
});

add_task(async function testTotalCountVisible() {
  const totalCountBadge = about3Pane.document.querySelector(".total-count");
  const shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  // Toggle total count ON.
  const toggleOnPromise = BrowserTestUtils.waitForCondition(
    () => !totalCountBadge.hidden,
    "The total count badges are visible"
  );
  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderToggleTotalCount")
  );
  await toggleOnPromise;
  // Check that toggle was successful.
  Assert.ok(
    moreContext
      .querySelector("#folderPaneHeaderToggleTotalCount")
      .hasAttribute("checked"),
    "The total count toggle is checked"
  );
  await BrowserTestUtils.waitForCondition(
    () => XULStoreUtils.isItemVisible("messenger", "totalMsgCount"),
    "The customization data was saved"
  );

  const menuHiddenPromise = BrowserTestUtils.waitForEvent(
    moreContext,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;

  const row = about3Pane.folderTree.getRowAtIndex(1);
  await assertAriaLabel(row, "Inbox, 9 unread messages, 10 total messages");
});

add_task(async function testFolderSizeDefaultState() {
  const folderSizeBadge = about3Pane.document.querySelector(".folder-size");
  Assert.ok(
    !moreContext
      .querySelector("#folderPaneHeaderToggleFolderSize")
      .hasAttribute("checked"),
    "The folder size toggle is unchecked"
  );
  Assert.ok(folderSizeBadge.hidden, "The folder sizes are hidden");
  Assert.notEqual(
    XULStoreUtils.isItemVisible("messenger", "folderPaneFolderSize"),
    "true",
    "The folder size xulStore attribute is set to not visible"
  );
});

add_task(async function testFolderSizeVisible() {
  const folderSizeBadge = about3Pane.document.querySelector(".folder-size");
  const shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  // Toggle folder size ON.
  const toggleOnPromise = BrowserTestUtils.waitForCondition(
    () => !folderSizeBadge.hidden,
    "The folder sizes are visible"
  );
  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderToggleFolderSize")
  );
  await toggleOnPromise;
  // Check that toggle on was successful.
  Assert.ok(
    moreContext
      .querySelector("#folderPaneHeaderToggleFolderSize")
      .hasAttribute("checked"),
    "The folder size toggle is checked"
  );
  await BrowserTestUtils.waitForCondition(
    () => XULStoreUtils.isItemVisible("messenger", "folderPaneFolderSize"),
    "The folder size xulStore attribute is set to visible"
  );

  Assert.ok(!folderSizeBadge.hidden, "The folder sizes are visible");

  const menuHiddenPromise = BrowserTestUtils.waitForEvent(
    moreContext,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;

  const row = about3Pane.folderTree.getRowAtIndex(1);
  await assertAriaLabel(
    row,
    `Inbox, 9 unread messages, 10 total messages, ${row.folderSize}`
  );
});

add_task(async function testFolderSizeHidden() {
  const folderSizeBadge = about3Pane.document.querySelector(".folder-size");
  const shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  // Toggle folder sizes OFF.
  const toggleOffPromise = BrowserTestUtils.waitForCondition(
    () => folderSizeBadge.hidden,
    "The folder sizes are hidden"
  );
  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderToggleFolderSize")
  );
  await toggleOffPromise;

  // Check that toggle was successful.
  Assert.ok(
    !moreContext
      .querySelector("#folderPaneHeaderToggleFolderSize")
      .getAttribute("checked"),
    "The folder size toggle is unchecked"
  );

  await BrowserTestUtils.waitForCondition(
    () => !XULStoreUtils.isItemVisible("messenger", "folderPaneFolderSize"),
    "The folder size xulStore visible attribute was set to false"
  );

  Assert.ok(folderSizeBadge.hidden, "The folder sizes are hidden");

  const menuHiddenPromise = BrowserTestUtils.waitForEvent(
    moreContext,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;
});

add_task(async function testTotalCountHidden() {
  const totalCountBadge = about3Pane.document.querySelector(".total-count");
  const shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  // Toggle total count OFF.
  const toggleOffPromise = BrowserTestUtils.waitForCondition(
    () => totalCountBadge.hidden,
    "The total count badges are hidden"
  );
  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderToggleTotalCount")
  );
  await toggleOffPromise;

  // Check that toggle was successful.
  Assert.ok(
    !moreContext
      .querySelector("#folderPaneHeaderToggleTotalCount")
      .getAttribute("checked"),
    "The total count toggle is unchecked"
  );
  await BrowserTestUtils.waitForCondition(
    () => !XULStoreUtils.isItemVisible("messenger", "totalMsgCount"),
    "The customization data was saved"
  );

  const menuHiddenPromise = BrowserTestUtils.waitForEvent(
    moreContext,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;

  const row = about3Pane.folderTree.getRowAtIndex(1);
  await assertAriaLabel(row, "Inbox, 9 unread messages");
});

add_task(async function testHideLocalFoldersXULStore() {
  let shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderToggleLocalFolders")
  );

  await BrowserTestUtils.waitForCondition(
    () => XULStoreUtils.isItemHidden("messenger", "folderPaneLocalFolders"),
    "The customization data to hide local folders should be saved"
  );

  const menuHiddenPromise = BrowserTestUtils.waitForEvent(
    moreContext,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;

  shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  Assert.ok(
    moreContext
      .querySelector("#folderPaneHeaderToggleLocalFolders")
      .hasAttribute("checked"),
    "The hide local folders menuitem should be checked"
  );

  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderToggleLocalFolders")
  );

  await BrowserTestUtils.waitForCondition(
    () => !XULStoreUtils.isItemHidden("messenger", "folderPaneLocalFolders"),
    "The customization data to hide local folders should be saved"
  );
});

/**
 * Ensure that the various badges and labels are updated and maintained when
 * folders and modes change in the folder pane.
 */
add_task(async function testBadgesPersistentState() {
  const totalCountBadge = about3Pane.document.querySelector(".total-count");
  const folderSizeBadge = about3Pane.document.querySelector(".folder-size");
  // Show total count.
  let toggleOnPromise = BrowserTestUtils.waitForCondition(
    () => !totalCountBadge.hidden,
    "The total count badges are visible"
  );
  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderToggleTotalCount")
  );
  await toggleOnPromise;

  // Show folder size.
  toggleOnPromise = BrowserTestUtils.waitForCondition(
    () => !folderSizeBadge.hidden,
    "The folder sizes are visible"
  );
  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderToggleFolderSize")
  );
  await toggleOnPromise;

  // Hide local folders.
  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderToggleLocalFolders")
  );
  await BrowserTestUtils.waitForCondition(
    () => XULStoreUtils.isItemHidden("messenger", "folderPaneLocalFolders"),
    "The customization data to hide local folders should be saved"
  );
  // The test times out on macOS if we don't wait here before dismissing the
  // context menu. Unknown why.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 250));

  const menuHiddenPromise = BrowserTestUtils.waitForEvent(
    moreContext,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;

  // Ensure the badges are still visible.
  Assert.ok(
    !totalCountBadge.hidden,
    "Folder total count badge should be visible"
  );
  Assert.ok(!folderSizeBadge.hidden, "Folder size badge should be visible");

  // Create a folder and add messages to that folder to ensure the badges are
  // visible and they update properly.
  const rootFolder =
    MailServices.accounts.accounts[0].incomingServer.rootFolder;
  rootFolder.createSubfolder("NewlyCreatedTestFolder", null);
  const folder = rootFolder.getChildNamed("NewlyCreatedTestFolder");
  await be_in_folder(folder);

  about3Pane.folderTree.selectedIndex = 3;
  const row = about3Pane.folderTree.getRowAtIndex(3);
  Assert.equal(
    row.name,
    "NewlyCreatedTestFolder",
    "The correct folder should have been selected"
  );
  // Badges shouldn't be hidden even if there's no content.
  Assert.ok(
    !row.querySelector(".total-count").hidden,
    "The total count badge of the newly created folder should be visible"
  );
  Assert.ok(
    !row.querySelector(".folder-size").hidden,
    "The folder size badge of the newly created folder should be visible"
  );

  const currentTotal = row.querySelector(".total-count").textContent;
  const currentSize = row.querySelector(".folder-size").textContent;

  await add_message_sets_to_folders([folder], [create_thread(10)]);

  // Weird issue with the test in which the focus is lost after creating the
  // messages, and the folder pane doesn't receive the folder size property
  // changes. This doesn't happen while using the app normally.
  about3Pane.folderTree.selectedIndex = 0;
  about3Pane.folderTree.selectedIndex = 3;

  await BrowserTestUtils.waitForCondition(
    () => currentTotal != row.querySelector(".total-count").textContent,
    `${currentTotal} != ${
      row.querySelector(".total-count").textContent
    } | The total count should have changed after adding messages`
  );

  await BrowserTestUtils.waitForCondition(
    () => currentSize != row.querySelector(".folder-size").textContent,
    `${currentSize} != ${
      row.querySelector(".folder-size").textContent
    } | The folder size should have changed after adding messages`
  );
});

add_task(async function testActionButtonsState() {
  // Delete all accounts to start clean.
  for (const account of MailServices.accounts.accounts) {
    MailServices.accounts.removeAccount(account, true);
  }

  // Confirm that we don't have any account in our test run.
  Assert.equal(
    MailServices.accounts.accounts.length,
    0,
    "No account currently configured"
  );

  Assert.ok(fetchButton.disabled, "The Get Messages button is disabled");
  Assert.ok(newButton.disabled, "The New Message button is disabled");

  // Create a POP server.
  const popServer = MailServices.accounts
    .createIncomingServer("nobody", "foo.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  const identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@foo.invalid";

  const account = MailServices.accounts.createAccount();
  account.addIdentity(identity);
  account.incomingServer = popServer;

  await BrowserTestUtils.waitForCondition(
    () => !fetchButton.disabled,
    "The Get Messages button is enabled"
  );

  await BrowserTestUtils.waitForCondition(
    () => !newButton.disabled,
    "The New Message button is enabled"
  );
});
