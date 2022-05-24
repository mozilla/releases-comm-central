/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test the message header customization features.
 */

var gFolder;

add_setup(async function() {
  Services.xulStore.removeDocument(
    "chrome://messenger/content/messenger.xhtml"
  );

  let account = createAccount();
  gFolder = await createSubfolder(account.incomingServer.rootFolder, "test0");
  createMessages(gFolder, 1);

  registerCleanupFunction(() => {
    gFolder.deleteSelf(null);
    MailServices.accounts.removeAccount(account, true);
    Services.xulStore.removeDocument(
      "chrome://messenger/content/messenger.xhtml"
    );
  });
});

add_task(async function test_customize_toolbar_buttons() {
  window.gFolderTreeView.selectFolder(gFolder);
  window.gFolderDisplay.selectViewIndex(0);

  let moreBtn = document.getElementById("otherActionsButton");
  // Make sure we loaded the expected message.
  await assertVisibility(moreBtn, true, "The more button is visible");

  // Confirm we're starting from a clean state.
  let header = document.getElementById("messageHeader");
  Assert.ok(
    !header.classList.contains("message-header-large-subject"),
    "The message header doesn't have a large subject"
  );
  Assert.ok(
    !header.classList.contains("message-header-buttons-only-icons"),
    "The message header buttons aren't showing only icons"
  );
  Assert.ok(
    !header.classList.contains("message-header-buttons-only-text"),
    "The message header buttons aren't showing only text"
  );

  let popup = document.getElementById("otherActionsPopup");
  let popupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreBtn, {});
  await popupShown;

  let panel = document.getElementById("messageHeaderCustomizationPanel");
  let customizeBtn = document.getElementById("messageHeaderMoreMenuCustomize");
  let panelShown = BrowserTestUtils.waitForEvent(panel, "popupshown");
  EventUtils.synthesizeMouseAtCenter(customizeBtn, {});
  await panelShown;

  let buttonStyle = document.getElementById("headerButtonStyle");
  // Assert the options are in a default state.
  Assert.equal(
    buttonStyle.value,
    "default",
    "The buttons style is in the default state"
  );
  let subjectLarge = document.getElementById("headerSubjectLarge");
  Assert.ok(!subjectLarge.checked, "The subject field is in the default state");

  let openMenuPopup = async function() {
    document.getElementById("headerButtonStyle").focus();

    let menuPopupShown = BrowserTestUtils.waitForEvent(
      document.querySelector("#headerButtonStyle menupopup"),
      "popupshown"
    );
    // Use the keyboard to open and cycle through the menulist items because the
    // mouse events are unreliable in tests.
    EventUtils.synthesizeMouseAtCenter(
      document.getElementById("headerButtonStyle"),
      {}
    );
    await menuPopupShown;
  };

  // Cycle through the buttons style and confirm the style is properly applied.
  // Use the keyboard to open and cycle through the menulist items because the
  // mouse events are unreliable in tests.
  await openMenuPopup();
  EventUtils.sendKey("down", window);
  EventUtils.sendKey("return", window);

  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-buttons-only-text"),
    "The buttons are showing only text"
  );
  Assert.ok(
    !header.classList.contains("message-header-large-subject"),
    "The subject line wasn't changed"
  );

  await openMenuPopup();
  EventUtils.sendKey("down", window);
  EventUtils.sendKey("return", window);
  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-buttons-only-icons"),
    "The buttons are showing only icons"
  );
  Assert.ok(
    !header.classList.contains("message-header-large-subject"),
    "The subject line wasn't changed"
  );

  await openMenuPopup();
  EventUtils.sendKey("up", window);
  EventUtils.sendKey("up", window);
  EventUtils.sendKey("return", window);
  await BrowserTestUtils.waitForCondition(
    () =>
      !header.classList.contains("message-header-buttons-only-icons") &&
      !header.classList.contains("message-header-buttons-only-text") &&
      !header.classList.contains("message-header-large-subject"),
    "The message header is clear of any custom style"
  );

  EventUtils.synthesizeMouseAtCenter(subjectLarge, {});
  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-large-subject"),
    "The subject line was changed"
  );

  await openMenuPopup();
  EventUtils.sendKey("down", window);
  EventUtils.sendKey("down", window);
  EventUtils.sendKey("return", window);
  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-buttons-only-icons"),
    "The buttons are showing only icons"
  );
  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-large-subject"),
    "The subject line edit was maintained"
  );

  let panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  EventUtils.synthesizeKey("VK_ESCAPE", {});
  await panelHidden;

  await BrowserTestUtils.waitForCondition(
    () =>
      Services.xulStore.hasValue(
        "chrome://messenger/content/messenger.xhtml",
        "messageHeader",
        "layout"
      ),
    "The customization data was saved"
  );

  popupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreBtn, {});
  await popupShown;

  panelShown = BrowserTestUtils.waitForEvent(panel, "popupshown");
  EventUtils.synthesizeMouseAtCenter(customizeBtn, {});
  await panelShown;

  await openMenuPopup();
  EventUtils.sendKey("up", window);
  EventUtils.sendKey("up", window);
  EventUtils.sendKey("return", window);

  await BrowserTestUtils.waitForCondition(
    () =>
      !header.classList.contains("message-header-buttons-only-icons") &&
      !header.classList.contains("message-header-buttons-only-text"),
    "The buttons style was reverted to the default"
  );

  EventUtils.synthesizeMouseAtCenter(subjectLarge, {});

  panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  EventUtils.synthesizeKey("VK_ESCAPE", {});
  await panelHidden;

  await BrowserTestUtils.waitForCondition(
    () => !header.classList.contains("message-header-large-subject"),
    "The subject line is not enlarged anymore"
  );
});
