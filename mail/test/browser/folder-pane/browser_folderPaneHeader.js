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
  moreContext;

add_setup(async function() {
  tabmail = document.getElementById("tabmail");
  about3Pane = tabmail.currentAbout3Pane;
  folderPaneHeader = about3Pane.document.getElementById("folderPaneHeaderBar");
  fetchButton = folderPaneHeader.querySelector("#folderPaneGetMessages");
  newButton = folderPaneHeader.querySelector("#folderPaneWriteMessage");
  moreButton = folderPaneHeader.querySelector("#folderPaneMoreButton");
  moreContext = about3Pane.document.getElementById("folderPaneMoreContext");

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
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, about3Pane);
  EventUtils.synthesizeKey("KEY_Enter", {}, about3Pane);
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

    // Close the appmenu.
    EventUtils.synthesizeMouseAtCenter(
      document.getElementById("button-appmenu"),
      {},
      window
    );
  }

  await toggleFolderPaneHeader(true);
  await toggleFolderPaneHeader(false);
  await toggleFolderPaneHeader(true);
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
