/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test the message header customization features.
 */
var { be_in_folder, get_about_message, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

const aboutMessage = get_about_message();

var { MailTelemetryForTests } = ChromeUtils.importESModule(
  "resource:///modules/MailGlue.sys.mjs"
);
var { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

var gFolder;

add_setup(async function () {
  Services.xulStore.removeDocument(
    "chrome://messenger/content/messenger.xhtml"
  );
  Services.fog.testResetFOG();

  const account = createAccount();
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
  be_in_folder(gFolder);
  await select_click_row(0);

  const moreBtn = aboutMessage.document.getElementById("otherActionsButton");
  // Make sure we loaded the expected message.
  await assertVisibility(moreBtn, true, "The more button is visible");

  // Confirm we're starting from a clean state.
  const header = aboutMessage.document.getElementById("messageHeader");
  Assert.ok(
    header.classList.contains("message-header-show-recipient-avatar"),
    "The From recipient is showing the avatar"
  );
  const avatar = aboutMessage.document.querySelector(".recipient-avatar");
  await assertVisibility(avatar, true, "The recipient avatar is shown");

  Assert.ok(
    header.classList.contains("message-header-show-sender-full-address"),
    "The From recipient is showing the full address on two lines"
  );
  const multiLine = aboutMessage.document.querySelector(
    ".recipient-multi-line"
  );
  await assertVisibility(
    multiLine,
    true,
    "The recipient multi line is visible"
  );
  const singleLine = aboutMessage.document.querySelector(
    ".recipient-single-line"
  );
  await assertVisibility(
    singleLine,
    false,
    "he recipient single line is hidden"
  );

  Assert.ok(
    header.classList.contains("message-header-hide-label-column"),
    "The labels column is hidden"
  );

  const firstLabel = aboutMessage.document.querySelector(
    ".message-header-label"
  );
  Assert.equal(
    firstLabel.style.minWidth,
    "0px",
    "The first label has no min-width value"
  );
  await assertVisibility(firstLabel, false, "The labels column is hidden");

  Assert.ok(
    header.classList.contains("message-header-large-subject"),
    "The message header has a large subject"
  );
  Assert.ok(
    !header.classList.contains("message-header-buttons-only-icons"),
    "The message header buttons aren't showing only icons"
  );
  Assert.ok(
    !header.classList.contains("message-header-buttons-only-text"),
    "The message header buttons aren't showing only text"
  );

  MailTelemetryForTests.reportUIConfiguration();

  const popup = aboutMessage.document.getElementById("otherActionsPopup");
  let popupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreBtn, {}, aboutMessage);
  await popupShown;

  const panel = aboutMessage.document.getElementById(
    "messageHeaderCustomizationPanel"
  );
  const customizeBtn = aboutMessage.document.getElementById(
    "messageHeaderMoreMenuCustomize"
  );
  let panelShown = BrowserTestUtils.waitForEvent(panel, "popupshown");
  EventUtils.synthesizeMouseAtCenter(customizeBtn, {}, aboutMessage);
  await panelShown;

  const buttonStyle = aboutMessage.document.getElementById("headerButtonStyle");
  // Assert the options are in a default state.
  Assert.equal(
    buttonStyle.value,
    "default",
    "The buttons style is in the default state"
  );
  const subjectLarge =
    aboutMessage.document.getElementById("headerSubjectLarge");
  Assert.ok(subjectLarge.checked, "The subject field is in the default state");

  const showAvatar = aboutMessage.document.getElementById("headerShowAvatar");
  Assert.ok(
    showAvatar.checked,
    "The show avatar field is in the default state"
  );

  const showFullAddress = aboutMessage.document.getElementById(
    "headerShowFullAddress"
  );
  Assert.ok(
    showFullAddress.checked,
    "The show full address field is in the default state"
  );

  const hideLabels = aboutMessage.document.getElementById("headerHideLabels");
  Assert.ok(
    hideLabels.checked,
    "The hide labels field is in the default state"
  );

  const openMenuPopup = async function () {
    aboutMessage.document.getElementById("headerButtonStyle").focus();

    const menuPopupShown = BrowserTestUtils.waitForEvent(
      aboutMessage.document.querySelector("#headerButtonStyle menupopup"),
      "popupshown"
    );
    // Use the keyboard to open and cycle through the menulist items because the
    // mouse events are unreliable in tests.
    EventUtils.synthesizeMouseAtCenter(
      aboutMessage.document.getElementById("headerButtonStyle"),
      {},
      aboutMessage
    );
    await menuPopupShown;
  };

  // Cycle through the buttons style and confirm the style is properly applied.
  // Use the keyboard to open and cycle through the menulist items because the
  // mouse events are unreliable in tests.
  await openMenuPopup();
  EventUtils.sendKey("down", aboutMessage);
  EventUtils.sendKey("return", aboutMessage);

  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-buttons-only-text"),
    "The buttons are showing only text"
  );
  Assert.ok(
    header.classList.contains("message-header-large-subject"),
    "The subject line wasn't changed"
  );
  Assert.ok(
    header.classList.contains("message-header-show-recipient-avatar"),
    "The avatar visibility wasn't changed"
  );
  Assert.ok(
    header.classList.contains("message-header-show-sender-full-address"),
    "The full address visibility wasn't changed"
  );
  Assert.ok(
    header.classList.contains("message-header-hide-label-column"),
    "The labels column visibility wasn't changed"
  );

  await openMenuPopup();
  EventUtils.sendKey("down", aboutMessage);
  EventUtils.sendKey("return", aboutMessage);
  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-buttons-only-icons"),
    "The buttons are showing only icons"
  );
  Assert.ok(
    header.classList.contains("message-header-large-subject"),
    "The subject line wasn't changed"
  );

  await openMenuPopup();
  EventUtils.sendKey("up", aboutMessage);
  EventUtils.sendKey("up", aboutMessage);
  EventUtils.sendKey("return", aboutMessage);
  await BrowserTestUtils.waitForCondition(
    () =>
      !header.classList.contains("message-header-buttons-only-icons") &&
      !header.classList.contains("message-header-buttons-only-text") &&
      header.classList.contains("message-header-large-subject") &&
      header.classList.contains("message-header-show-recipient-avatar") &&
      header.classList.contains("message-header-show-sender-full-address") &&
      header.classList.contains("message-header-hide-label-column"),
    "The message header is clear of any custom style"
  );

  EventUtils.synthesizeMouseAtCenter(subjectLarge, {}, aboutMessage);
  await BrowserTestUtils.waitForCondition(
    () => !header.classList.contains("message-header-large-subject"),
    "The subject line was changed"
  );

  EventUtils.synthesizeMouseAtCenter(showAvatar, {}, aboutMessage);
  await BrowserTestUtils.waitForCondition(
    () => !header.classList.contains("message-header-show-recipient-avatar"),
    "The avatar style was changed"
  );
  await assertVisibility(avatar, false, "The recipient avatar is hidden");

  EventUtils.synthesizeMouseAtCenter(showFullAddress, {}, aboutMessage);
  await BrowserTestUtils.waitForCondition(
    () => !header.classList.contains("message-header-show-sender-full-address"),
    "The full address style was changed"
  );
  await assertVisibility(
    multiLine,
    false,
    "The recipient multi line is hidden"
  );
  await assertVisibility(
    singleLine,
    true,
    "The recipient single line is visible"
  );

  EventUtils.synthesizeMouseAtCenter(hideLabels, {}, aboutMessage);
  await BrowserTestUtils.waitForCondition(
    () => !header.classList.contains("message-header-hide-label-column"),
    "The labels column style was changed"
  );
  await assertVisibility(firstLabel, true, "The first label is visible");
  await BrowserTestUtils.waitForCondition(
    () => firstLabel.style.minWidth != "0px",
    "The first label has a min-width value"
  );

  await openMenuPopup();
  EventUtils.sendKey("down", aboutMessage);
  EventUtils.sendKey("down", aboutMessage);
  EventUtils.sendKey("return", aboutMessage);
  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-buttons-only-icons"),
    "The buttons are showing only icons"
  );
  await BrowserTestUtils.waitForCondition(
    () => !header.classList.contains("message-header-large-subject"),
    "The subject line edit was maintained"
  );

  let panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  EventUtils.synthesizeKey("VK_ESCAPE", {}, aboutMessage);
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

  MailTelemetryForTests.reportUIConfiguration();

  Assert.equal(
    Glean.tb.uiConfigurationMessageHeader.subjectLarge.testGetValue(),
    "false",
    "should have correct subjectLarge"
  );

  Assert.equal(
    Glean.tb.uiConfigurationMessageHeader.buttonStyle.testGetValue(),
    "only-icons",
    "should have correct buttonStyle"
  );
  Assert.equal(
    Glean.tb.uiConfigurationMessageHeader.hideLabels.testGetValue(),
    "false",
    "should have correct hideLabels"
  );
  Assert.equal(
    Glean.tb.uiConfigurationMessageHeader.showAvatar.testGetValue(),
    "false",
    "should have correct showAvatar"
  );
  Assert.equal(
    Glean.tb.uiConfigurationMessageHeader.showFullAddress.testGetValue(),
    "false",
    "should have correct showFullAddress"
  );

  popupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreBtn, {}, aboutMessage);
  await popupShown;

  panelShown = BrowserTestUtils.waitForEvent(panel, "popupshown");
  EventUtils.synthesizeMouseAtCenter(customizeBtn, {}, aboutMessage);
  await panelShown;

  await openMenuPopup();
  EventUtils.sendKey("up", aboutMessage);
  EventUtils.sendKey("up", aboutMessage);
  EventUtils.sendKey("return", aboutMessage);

  await BrowserTestUtils.waitForCondition(
    () =>
      !header.classList.contains("message-header-buttons-only-icons") &&
      !header.classList.contains("message-header-buttons-only-text"),
    "The buttons style was reverted to the default"
  );

  EventUtils.synthesizeMouseAtCenter(subjectLarge, {}, aboutMessage);
  EventUtils.synthesizeMouseAtCenter(showAvatar, {}, aboutMessage);
  EventUtils.synthesizeMouseAtCenter(showFullAddress, {}, aboutMessage);
  EventUtils.synthesizeMouseAtCenter(hideLabels, {}, aboutMessage);

  panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  EventUtils.synthesizeKey("VK_ESCAPE", {}, aboutMessage);
  await panelHidden;

  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-large-subject"),
    "The subject line is large again"
  );
  await assertVisibility(avatar, true, "The recipient avatar is visible");
  await assertVisibility(
    multiLine,
    true,
    "The recipient multi line is visible"
  );
  await assertVisibility(
    singleLine,
    false,
    "he recipient single line is hidden"
  );
  await BrowserTestUtils.waitForCondition(
    () => firstLabel.style.minWidth == "0px",
    "The first label has no min-width value"
  );
  await assertVisibility(firstLabel, false, "The labels column is hidden");

  MailTelemetryForTests.reportUIConfiguration();

  Assert.equal(
    Glean.tb.uiConfigurationMessageHeader.subjectLarge.testGetValue(),
    "true",
    "should have correct subjectLarge"
  );
  Assert.equal(
    Glean.tb.uiConfigurationMessageHeader.buttonStyle.testGetValue(),
    "default",
    "should have correct buttonStyle"
  );
  Assert.equal(
    Glean.tb.uiConfigurationMessageHeader.hideLabels.testGetValue(),
    "true",
    "should have correct hideLabels"
  );
  Assert.equal(
    Glean.tb.uiConfigurationMessageHeader.showAvatar.testGetValue(),
    "true",
    "should have correct showAvatar"
  );
  Assert.equal(
    Glean.tb.uiConfigurationMessageHeader.showFullAddress.testGetValue(),
    "true",
    "should have correct showFullAddress"
  );
});
