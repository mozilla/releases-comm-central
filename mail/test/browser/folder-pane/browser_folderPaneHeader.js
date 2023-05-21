/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
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
  folderModesContextMenuPopup,
  totalCountBadge;

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

add_task(function testFolderPaneHeaderDefaultState() {
  Assert.ok(!folderPaneHeader.hidden, "The folder pane header is visible");
  Assert.ok(!fetchButton.disabled, "The Get Messages button is enabled");
  Assert.ok(!newButton.disabled, "The New Message button is enabled");
});

add_task(async function testHideFolderPaneHeader() {
  let shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  let hiddenPromise = BrowserTestUtils.waitForCondition(
    () => folderPaneHeader.hidden,
    "The folder pane header is hidden"
  );
  EventUtils.synthesizeMouseAtCenter(
    moreContext.querySelector("#folderPaneHeaderHideMenuItem"),
    {},
    about3Pane
  );
  await hiddenPromise;

  await BrowserTestUtils.waitForCondition(
    () =>
      Services.xulStore.getValue(
        "chrome://messenger/content/messenger.xhtml",
        "folderPaneHeaderBar",
        "hidden"
      ) == "true",
    "The customization data was saved"
  );

  // Can't access the menubar in macOS tests, so simply simulate a click on the
  // toolbarbutton inside the app menu to reveal the header. The app menu
  // behavior is tested later.
  if (AppConstants.platform == "macosx") {
    document.getElementById("appmenu_toggleFolderHeader").click();
    return;
  }

  let menubar = document.getElementById("toolbar-menubar");
  menubar.removeAttribute("autohide");
  menubar.removeAttribute("inactive");
  await new Promise(resolve => requestAnimationFrame(resolve));

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

  let viewMenuPopup = document.getElementById("menu_View_Popup");
  Assert.ok(viewMenuPopup.querySelector("#menu_FolderViews"));

  let folderViewShownPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("menu_FolderViewsPopup"),
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    viewMenuPopup.querySelector("#menu_FolderViews"),
    {},
    window
  );
  await folderViewShownPromise;

  let toggleFolderHeader = menubar.querySelector(`[name="paneheader"]`);
  Assert.ok(
    !toggleFolderHeader.hasAttribute("checked"),
    "The toggle header menu item is not checked"
  );

  EventUtils.synthesizeMouseAtCenter(toggleFolderHeader, {}, window);
  await BrowserTestUtils.waitForCondition(
    () => toggleFolderHeader.getAttribute("checked") == "true",
    "The toggle header menu item is checked"
  );

  let folderViewHiddenPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("menu_FolderViewsPopup"),
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await folderViewHiddenPromise;

  let viewHiddenPromise = BrowserTestUtils.waitForEvent(
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
    () =>
      Services.xulStore.getValue(
        "chrome://messenger/content/messenger.xhtml",
        "folderPaneHeaderBar",
        "hidden"
      ) == "false",
    "The customization data was saved"
  );
});

add_task(async function testTogglePaneHeaderFromAppMenu() {
  Assert.ok(
    !folderPaneHeader.hidden,
    "Start with a visible folder pane header"
  );

  async function toggleFolderPaneHeader(shouldBeChecked) {
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
      appMenu.querySelector("#appMenu-foldersView"),
      "ViewShown"
    );
    EventUtils.synthesizeMouseAtCenter(
      appMenu.querySelector("#appmenu_FolderViews"),
      {},
      window
    );
    await toolbarShownPromise;

    let appMenuButton = document.getElementById("appmenu_toggleFolderHeader");
    Assert.equal(
      appMenuButton.checked,
      shouldBeChecked,
      `The app menu item should ${shouldBeChecked ? "" : "not "}be checked`
    );

    EventUtils.synthesizeMouseAtCenter(appMenuButton, {}, window);

    let menuHiddenPromise = BrowserTestUtils.waitForEvent(
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

  let folderPaneHdrToggleBtns = [
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

  for (let toggle of folderPaneHdrToggleBtns) {
    let toggleMenuItem = moreContext.querySelector(toggle.menuId);
    let toggleButton = folderPaneHeader.querySelector(toggle.buttonId);
    let shouldBeChecked = !toggleButton.hidden;

    // Hide the toggle buttons
    let shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
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

    let buttonName =
      toggle.buttonId == "#folderPaneGetMessages"
        ? "folderPaneGetMessages"
        : "folderPaneWriteMessage";
    await BrowserTestUtils.waitForCondition(
      () =>
        Services.xulStore.getValue(
          "chrome://messenger/content/messenger.xhtml",
          buttonName,
          "hidden"
        ) == "true",
      "The customization data was saved"
    );

    let menuHiddenPromise = BrowserTestUtils.waitForEvent(
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
      () =>
        Services.xulStore.getValue(
          "chrome://messenger/content/messenger.xhtml",
          buttonName,
          "hidden"
        ) == "false",
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
  let shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  let shownFolderModesSubMenuPromise = BrowserTestUtils.waitForEvent(
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
  let folderModesArray = [
    { menuID: "#folderPaneMoreContextUnifiedFolders", modeID: "smart" },
    { menuID: "#folderPaneMoreContextUnreadFolders", modeID: "unread" },
    { menuID: "#folderPaneMoreContextFavoriteFolders", modeID: "favorite" },
    { menuID: "#folderPaneMoreContextRecentFolders", modeID: "recent" },
  ];
  let checkedModesCount = 2;
  for (let mode of folderModesArray) {
    Assert.ok(
      !moreContext.querySelector(mode.menuID).hasAttribute("checked"),
      `"${mode.modeID}" option is not checked`
    );

    let checkedPromise = TestUtils.waitForCondition(
      () => moreContext.querySelector(mode.menuID).hasAttribute("checked"),
      `"${mode.modeID}" option has been checked`
    );
    EventUtils.synthesizeMouseAtCenter(
      moreContext.querySelector(mode.menuID),
      {},
      about3Pane
    );
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
  let folderActiveModesArray = [
    { menuID: "#folderPaneMoreContextAllFolders", modeID: "all" },
    { menuID: "#folderPaneMoreContextUnifiedFolders", modeID: "smart" },
    { menuID: "#folderPaneMoreContextUnreadFolders", modeID: "unread" },
    { menuID: "#folderPaneMoreContextFavoriteFolders", modeID: "favorite" },
    { menuID: "#folderPaneMoreContextRecentFolders", modeID: "recent" },
  ];
  let checkedModesCount = 4;
  for (let mode of folderActiveModesArray) {
    Assert.ok(
      moreContext.querySelector(mode.menuID).hasAttribute("checked"),
      `"${mode.modeID}" option is checked`
    );

    let uncheckedPromise = TestUtils.waitForCondition(
      () => !moreContext.querySelector(mode.menuID).hasAttribute("checked"),
      `"${mode.modeID}" option has been unchecked`
    );
    EventUtils.synthesizeMouseAtCenter(
      moreContext.querySelector(mode.menuID),
      {},
      about3Pane
    );
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

add_task(async function testActionButtonsState() {
  // Delete all accounts to start clean.
  for (let account of MailServices.accounts.accounts) {
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
  let popServer = MailServices.accounts
    .createIncomingServer("nobody", "foo.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  let identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@foo.invalid";

  let account = MailServices.accounts.createAccount();
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

add_task(async function testTotalCountDefaultState() {
  totalCountBadge = about3Pane.document.querySelector(".total-count");
  Assert.ok(
    !moreContext
      .querySelector("#folderPaneHeaderToggleTotalCount")
      .hasAttribute("checked"),
    "The total count toggle is unchecked"
  );
  Assert.ok(totalCountBadge.hidden, "The total count badges are hidden");
  Assert.notEqual(
    Services.xulStore.getValue(
      "chrome://messenger/content/messenger.xhtml",
      "totalMsgCount",
      "visible"
    ),
    "true",
    "The customization data was saved"
  );
});

add_task(async function testTotalCountVisible() {
  let shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  // Toggle total count ON.
  let toggleOnPromise = BrowserTestUtils.waitForCondition(
    () => !totalCountBadge.hidden,
    "The total count badges are visible"
  );
  EventUtils.synthesizeMouseAtCenter(
    moreContext.querySelector("#folderPaneHeaderToggleTotalCount"),
    {},
    about3Pane
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
    () =>
      Services.xulStore.getValue(
        "chrome://messenger/content/messenger.xhtml",
        "totalMsgCount",
        "visible"
      ) == "true",
    "The customization data was saved"
  );

  let menuHiddenPromise = BrowserTestUtils.waitForEvent(
    moreContext,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;
});

add_task(async function testTotalCountHidden() {
  let shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  // Toggle total count OFF.
  let toggleOffPromise = BrowserTestUtils.waitForCondition(
    () => totalCountBadge.hidden,
    "The total count badges are hidden"
  );
  EventUtils.synthesizeMouseAtCenter(
    moreContext.querySelector("#folderPaneHeaderToggleTotalCount"),
    {},
    about3Pane
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
    () =>
      Services.xulStore.getValue(
        "chrome://messenger/content/messenger.xhtml",
        "totalMsgCount",
        "visible"
      ) == "false",
    "The customization data was saved"
  );
});
