/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test the message header customization features.
 */

var { MailTelemetryForTests } = ChromeUtils.import(
  "resource:///modules/MailGlue.jsm"
);
var { TelemetryTestUtils } = ChromeUtils.import(
  "resource://testing-common/TelemetryTestUtils.jsm"
);

var gFolder;

add_setup(async function() {
  Services.xulStore.removeDocument(
    "chrome://messenger/content/messenger.xhtml"
  );
  Services.telemetry.clearScalars();

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
    !header.classList.contains("message-header-show-recipient-avatar"),
    "The From recipient is not showing the avatar"
  );
  let avatar = document.querySelector(".recipient-avatar");
  await assertVisibility(avatar, false, "The recipient avatar is hidden");

  Assert.ok(
    !header.classList.contains("message-header-show-sender-full-address"),
    "The From recipient is not showing the full address on two lines"
  );
  let multiLine = document.querySelector(".recipient-multi-line");
  await assertVisibility(
    multiLine,
    false,
    "The recipient multi line is hidden"
  );
  let singleLine = document.querySelector(".recipient-single-line");
  await assertVisibility(
    singleLine,
    true,
    "he recipient single line is visible"
  );

  Assert.ok(
    !header.classList.contains("message-header-hide-label-column"),
    "The labels column is visible"
  );

  let firstLabel = document.querySelector(".message-header-label");
  Assert.ok(
    firstLabel.style.minWidth != "0px",
    "The first label has a min-width value"
  );
  await assertVisibility(firstLabel, true, "The labels column is visible");

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

  MailTelemetryForTests.reportUIConfiguration();
  let scalarName = "tb.ui.configuration.message_header";
  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertScalarUnset(scalars, scalarName);

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

  let showAvatar = document.getElementById("headerShowAvatar");
  Assert.ok(
    !showAvatar.checked,
    "The show avatar field is in the default state"
  );

  let showFullAddress = document.getElementById("headerShowFullAddress");
  Assert.ok(
    !showFullAddress.checked,
    "The show full address field is in the default state"
  );

  let hideLabels = document.getElementById("headerHideLabels");
  Assert.ok(
    !hideLabels.checked,
    "The hide labels field is in the default state"
  );

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
  Assert.ok(
    !header.classList.contains("message-header-show-recipient-avatar"),
    "The avatar visibility wasn't changed"
  );
  Assert.ok(
    !header.classList.contains("message-header-show-sender-full-address"),
    "The full address visibility wasn't changed"
  );
  Assert.ok(
    !header.classList.contains("message-header-hide-label-column"),
    "The labels column visibility wasn't changed"
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
      !header.classList.contains("message-header-large-subject") &&
      !header.classList.contains("message-header-show-recipient-avatar") &&
      !header.classList.contains("message-header-show-sender-full-address") &&
      !header.classList.contains("message-header-hide-label-column"),
    "The message header is clear of any custom style"
  );

  EventUtils.synthesizeMouseAtCenter(subjectLarge, {});
  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-large-subject"),
    "The subject line was changed"
  );

  EventUtils.synthesizeMouseAtCenter(showAvatar, {});
  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-show-recipient-avatar"),
    "The avatar style was changed"
  );
  await assertVisibility(avatar, true, "The recipient avatar is visible");

  EventUtils.synthesizeMouseAtCenter(showFullAddress, {});
  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-show-sender-full-address"),
    "The full address style was changed"
  );
  await assertVisibility(
    multiLine,
    true,
    "The recipient multi line is visible"
  );
  await assertVisibility(
    singleLine,
    false,
    "The recipient single line is hidden"
  );

  EventUtils.synthesizeMouseAtCenter(hideLabels, {});
  await BrowserTestUtils.waitForCondition(
    () => header.classList.contains("message-header-hide-label-column"),
    "The labels column style was changed"
  );
  await assertVisibility(firstLabel, false, "The first label is hidden");
  await BrowserTestUtils.waitForCondition(
    () => firstLabel.style.minWidth == "0px",
    "The first label doesn't have min-width value"
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

  MailTelemetryForTests.reportUIConfiguration();
  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "subjectLarge", 1);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "buttonStyle", 1);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "hideLabels", 1);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "showAvatar", 1);
  TelemetryTestUtils.assertKeyedScalar(
    scalars,
    scalarName,
    "showFullAddress",
    1
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
  EventUtils.synthesizeMouseAtCenter(showAvatar, {});
  EventUtils.synthesizeMouseAtCenter(showFullAddress, {});
  EventUtils.synthesizeMouseAtCenter(hideLabels, {});

  panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  EventUtils.synthesizeKey("VK_ESCAPE", {});
  await panelHidden;

  await BrowserTestUtils.waitForCondition(
    () => !header.classList.contains("message-header-large-subject"),
    "The subject line is not enlarged anymore"
  );
  await assertVisibility(avatar, false, "The recipient avatar is hidden");
  await assertVisibility(
    multiLine,
    false,
    "The recipient multi line is hidden"
  );
  await assertVisibility(
    singleLine,
    true,
    "he recipient single line is visible"
  );
  await BrowserTestUtils.waitForCondition(
    () => firstLabel.style.minWidth != "0px",
    "The first label has a min-width value"
  );
  await assertVisibility(firstLabel, true, "The labels column is visible");

  MailTelemetryForTests.reportUIConfiguration();
  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "subjectLarge", 0);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "buttonStyle", 0);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "hideLabels", 0);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "showAvatar", 0);
  TelemetryTestUtils.assertKeyedScalar(
    scalars,
    scalarName,
    "showFullAddress",
    0
  );
});
