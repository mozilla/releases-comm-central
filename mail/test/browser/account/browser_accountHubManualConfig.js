/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

// The guessConfig requests make this test take a long time, so we need a
// longer timeout.
// TODO: Split up this test so longer timeout isn't required.
requestLongerTimeout(2);

add_setup(function () {
  // Set the pref to load a local autoconfig file.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);
});

registerCleanupFunction(function () {
  // Restore the original pref.
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
});

add_task(async function test_account_email_advanced_setup_incoming() {
  // Fill in email auto form and click continue, waiting for config found
  // view to be shown.
  const dialog = await subtest_open_account_hub_dialog();

  const emailUser = {
    name: "John Doe",
    email: "john.doe@momo.invalid",
    password: "abc12345",
    incomingHost: "mail.momo.invalid",
    incomingPort: 123,
    outgoingHost: "mail.momo.invalid",
    outgoingPort: 465,
  };

  await subtest_fill_initial_config_fields(dialog, emailUser);

  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

  // Edit configuration button should lead to incoming config template.
  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#editConfiguration"),
    {}
  );

  const incomingConfigTemplate = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view"
  );

  // Update the port number and click advanced config to confirm that the
  // account being created takes the updated incoming field.
  const incomingPort = incomingConfigTemplate.querySelector("#incomingPort");
  EventUtils.synthesizeMouseAtCenter(incomingPort, {});
  incomingPort.value = "";
  const inputEvent = BrowserTestUtils.waitForEvent(
    incomingPort,
    "input",
    false,
    event => event.target.value === "123"
  );
  EventUtils.sendString("123", window);
  await inputEvent;

  const advancedConfigButton = incomingConfigTemplate.querySelector(
    "#advancedConfigurationIncoming"
  );
  EventUtils.synthesizeMouseAtCenter(advancedConfigButton, {});

  const tabmail = document.getElementById("tabmail");
  const oldTab = tabmail.selectedTab;

  await BrowserTestUtils.promiseAlertDialog("accept");

  // The dialog should automatically close after clicking advanced config
  await BrowserTestUtils.waitForEvent(dialog, "close");

  await BrowserTestUtils.waitForCondition(
    () => tabmail.selectedTab != oldTab,
    "The tab should change to the account settings tab"
  );

  await subtest_verify_account_hub_account(
    tabmail.selectedTab,
    emailUser,
    "pop"
  );

  await subtest_clear_status_bar();

  tabmail.closeTab(tabmail.currentTabInfo);

  // Confirm that the folder pane is visible.
  Assert.ok(BrowserTestUtils.isVisible(tabmail.currentAbout3Pane.folderTree));
});

add_task(async function test_account_email_advanced_setup_outgoing() {
  // Fill in email auto form and click continue, waiting for config found
  // view to be shown.
  const dialog = await subtest_open_account_hub_dialog();

  const emailUser = {
    name: "John Doe",
    email: "john.doe@momo.invalid",
    password: "abc12345",
    incomingHost: "mail.momo.invalid",
    outgoingHost: "mail.momo.invalid",
    outgoingPort: 465,
  };

  await subtest_fill_initial_config_fields(dialog, emailUser);

  const footerForward = dialog
    .querySelector("account-hub-footer")
    .querySelector("#forward");
  const configFoundTemplate = dialog.querySelector("email-config-found");

  // Edit configuration button should lead to incoming config template.
  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#editConfiguration"),
    {}
  );

  const incomingConfigTemplate = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view"
  );

  // Update the port numbers for both incoming and outgoing and click
  // advanced config to confirm that the account being created takes the
  // updated incoming and outgoing fields.
  const incomingPort = incomingConfigTemplate.querySelector("#incomingPort");
  EventUtils.synthesizeMouseAtCenter(incomingPort, {});
  incomingPort.value = "";
  let inputEvent = BrowserTestUtils.waitForEvent(
    incomingPort,
    "input",
    false,
    event => event.target.value === "123"
  );
  EventUtils.sendString("123", window);
  await inputEvent;
  emailUser.incomingPort = 123;

  const outgoingConfigTemplate = dialog.querySelector(
    "#emailOutgoingConfigSubview"
  );
  const isOutgoingVisible = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(outgoingConfigTemplate),
    "The outgoing config template should be in view"
  );
  // Click continue and wait for outgoing config template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await isOutgoingVisible;

  const outgoingPort = outgoingConfigTemplate.querySelector("#outgoingPort");
  EventUtils.synthesizeMouseAtCenter(outgoingPort, {});
  outgoingPort.value = "";
  inputEvent = BrowserTestUtils.waitForEvent(
    outgoingPort,
    "input",
    false,
    event => event.target.value === "321"
  );
  EventUtils.sendString("321", window);
  emailUser.outgoingPort = 321;
  await inputEvent;

  const advancedConfigButton = outgoingConfigTemplate.querySelector(
    "#advancedConfigurationOutgoing"
  );
  EventUtils.synthesizeMouseAtCenter(advancedConfigButton, {});

  const tabmail = document.getElementById("tabmail");
  const oldTab = tabmail.selectedTab;

  await BrowserTestUtils.promiseAlertDialog("accept");

  // The dialog should automatically close after clicking advanced config
  await BrowserTestUtils.waitForEvent(dialog, "close");

  await BrowserTestUtils.waitForCondition(
    () => tabmail.selectedTab != oldTab,
    "The tab should change to the account settings tab"
  );

  await subtest_verify_account_hub_account(
    tabmail.selectedTab,
    emailUser,
    "pop"
  );

  tabmail.closeTab(tabmail.currentTabInfo);

  // Confirm that the folder pane is visible.
  Assert.ok(BrowserTestUtils.isVisible(tabmail.currentAbout3Pane.folderTree));
});

add_task(async function test_account_email_manual_form() {
  // Fill in email auto form and click continue, waiting for config found
  // view to be shown.
  const dialog = await subtest_open_account_hub_dialog();

  const emailUser = {
    name: "John Doe",
    email: "john.doe@momo.invalid",
    password: "abc12345",
    incomingHost: "mail.momo.invalid",
    incomingPort: 123,
    outgoingHost: "mail.momo.invalid",
    outgoingPort: 465,
  };

  await subtest_fill_initial_config_fields(dialog, emailUser);
  const footer = dialog.querySelector("account-hub-footer");
  const footerForward = footer.querySelector("#forward");
  const footerBack = footer.querySelector("#back");
  const footerCustom = footer.querySelector("#custom");
  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

  // Edit configuration button should lead to incoming config template.
  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#editConfiguration"),
    {},
    window
  );

  const incomingConfigTemplate = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view"
  );

  // We should check that the EWS changes to the config form aren't here, as
  // we're not editing an EWS config.
  Assert.ok(
    BrowserTestUtils.isVisible(
      incomingConfigTemplate.querySelector("#incomingProtocol")
    ),
    "Default protocol dropdown should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      incomingConfigTemplate.querySelector("#incomingConnectionSecurity")
    ),
    "Incoming connection security dropdown should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      incomingConfigTemplate.querySelector("#incomingPort")
    ),
    "Incoming port input should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(
      incomingConfigTemplate.querySelector("#incomingExchangeUrl")
    ),
    "EWS URL input should be hidden"
  );

  let outgoingConfigTemplate = dialog.querySelector(
    "#emailOutgoingConfigSubview"
  );
  let isOutgoingVisible = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(outgoingConfigTemplate),
    "The outgoing config template should be in view"
  );
  // Continuing from incoming with a found config should keep the continue
  // button on the outgoing config page enabled.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await isOutgoingVisible;
  Assert.ok(!footerForward.disabled, "Continue button is enabled");

  // Go back and update the incoming hostname to have an invalid character,
  // which should disable the continue button.
  EventUtils.synthesizeMouseAtCenter(footerBack, {});
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view"
  );

  const incomingHostname =
    incomingConfigTemplate.querySelector("#incomingHostname");
  EventUtils.synthesizeMouseAtCenter(incomingHostname, {});
  const inputEvent = BrowserTestUtils.waitForEvent(
    incomingHostname,
    "input",
    false,
    event => event.target.value === `pop.${emailUser.incomingHost}-`
  );
  // Ensure we move to the end of the input.
  EventUtils.synthesizeKey("KEY_End", {});
  EventUtils.sendString("-", window);
  await inputEvent;

  Assert.ok(footerForward.disabled, "Continue button should be disabled");

  // Delete the invalid character should re-enable the continue button.
  const deleteEvent = BrowserTestUtils.waitForEvent(
    incomingHostname,
    "input",
    false,
    event => event.target.value === `pop.${emailUser.incomingHost}`
  );
  EventUtils.synthesizeKey("KEY_Backspace", {}, window);
  await deleteEvent;

  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  outgoingConfigTemplate = dialog.querySelector("#emailOutgoingConfigSubview");
  isOutgoingVisible = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(outgoingConfigTemplate),
    "The outgoing config template should be in view"
  );
  // Continuing on to outgoing should reveal a disabled continue button and an
  // enabled test button.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await isOutgoingVisible;

  Assert.ok(footerForward.disabled, "Continue button should be disabled");
  Assert.ok(!footerCustom.disabled, "Test button should be enabled");

  await subtest_close_account_hub_dialog(dialog, outgoingConfigTemplate);
});

add_task(async function test_pop3_manual_config_flow() {
  // Fill in email auto form and click continue, waiting for config found
  // view to be shown.
  const dialog = await subtest_open_account_hub_dialog();

  const emailUser = {
    name: "John Doe",
    email: "john.doe@momo.invalid",
    password: "abc12345",
    incomingHost: "mail.momo.invalid",
    incomingPort: 123,
    outgoingHost: "mail.momo.invalid",
    outgoingPort: 465,
  };

  await subtest_fill_initial_config_fields(dialog, emailUser);
  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#pop3")),
    "The POP3 config option should be visible"
  );

  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#pop3"),
    {}
  );

  // POP3 should be the selected config.
  Assert.ok(
    configFoundTemplate.querySelector("#pop3").classList.contains("selected"),
    "POP3 should be the selected config option"
  );

  // Edit configuration button should lead to incoming config template.
  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#editConfiguration"),
    {}
  );

  const incomingConfigTemplate = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view"
  );

  Assert.equal(
    incomingConfigTemplate.querySelector("#incomingProtocol").value,
    "2",
    "The incoming protocol should be POP3"
  );

  await subtest_close_account_hub_dialog(dialog, incomingConfigTemplate);
});

add_task(async function test_invalid_manual_config_flow() {
  const dialog = await subtest_open_account_hub_dialog();

  const emailTemplate = dialog.querySelector("email-auto-form");
  const nameInput = emailTemplate.querySelector("#realName");
  const emailInput = emailTemplate.querySelector("#email");
  const footerForward = dialog.querySelector("#emailFooter #forward");
  const footerCustom = dialog.querySelector("#emailFooter #custom");

  // Ensure fields are empty.
  nameInput.value = "";
  emailInput.value = "";

  await fillInvalidUserInfo(nameInput, emailInput);

  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for incoming config view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const incomingConfigTemplate = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );
  let incomingConfigTemplatePromise = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view",
    500,
    500
  );
  await incomingConfigTemplatePromise;

  // The continue button should be enabled if you go back to the email form.
  const footerBack = dialog.querySelector("#emailFooter #back");
  EventUtils.synthesizeMouseAtCenter(footerBack, {});
  const emailFormTemplatePromise = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(emailTemplate),
    "The email form template should be in view"
  );
  await emailFormTemplatePromise;
  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Go directly back to the incoming form with the the invalid config.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  incomingConfigTemplatePromise = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view",
    500,
    500
  );
  await incomingConfigTemplatePromise;

  // The continue button should be disabled as the user needs to update the
  // incorrect config.
  Assert.ok(footerForward.disabled, "Continue button should be disabled");

  // The invalid configuration should have an invalid hostname, so the invalid
  // hostname input should be marked as invalid.
  const incomingHostname = incomingConfigTemplate.querySelector(
    "#incomingHostname:invalid"
  );
  Assert.ok(incomingHostname, "The incoming hostname should be invalid.");
  Assert.ok(
    BrowserTestUtils.isVisible(
      incomingConfigTemplate.querySelector("#incomingHostnameErrorMessage")
    ),
    "The incoming hostname error message should be visible"
  );

  // Fixing the hostname should enable the continue button.
  EventUtils.synthesizeMouseAtCenter(incomingHostname, {});
  EventUtils.synthesizeKey("KEY_Home", { shiftKey: true });
  EventUtils.synthesizeKey("KEY_ArrowLeft", {});
  EventUtils.synthesizeKey("KEY_ArrowRight", {});

  let deleteEvent = BrowserTestUtils.waitForEvent(
    incomingHostname,
    "input",
    false,
    event => event.target.value === "example.localhost"
  );
  EventUtils.synthesizeKey("KEY_Backspace", {}, window);
  await deleteEvent;
  Assert.ok(!footerForward.disabled, "Continue button should be enabled");
  Assert.ok(
    BrowserTestUtils.isHidden(
      incomingConfigTemplate.querySelector("#incomingHostnameErrorMessage")
    ),
    "The incoming hostname error message should be hidden"
  );

  // Changing the connection security to "None" should show a warning message
  // but keep the continue button enabled.
  const incomingConnectionSecurity = incomingConfigTemplate.querySelector(
    "#incomingConnectionSecurity"
  );

  const incomingConnectionPromise =
    BrowserTestUtils.waitForSelectPopupShown(window);

  await EventUtils.synthesizeMouseAtCenter(incomingConnectionSecurity, {});

  const incomingConnectionPopup = await incomingConnectionPromise;

  const incomingConnectionItems =
    incomingConnectionPopup.querySelectorAll("menuitem");

  // #incomingConnectionSecurityNoEncryption
  incomingConnectionPopup.activateItem(incomingConnectionItems[1]);

  await BrowserTestUtils.waitForPopupEvent(incomingConnectionPopup, "hidden");

  const securityWarning = incomingConfigTemplate
    .querySelector("#incomingConnectionSecurity")
    .shadowRoot.querySelector("#securityWarning");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", securityWarning);

  Assert.ok(
    BrowserTestUtils.isVisible(securityWarning),
    "Should show security warning"
  );
  await BrowserTestUtils.waitForAttributeRemoval("disabled", footerForward);
  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Clicking continue should lead to the outgoing view, with an invalid
  // hostname again, with the continue button disabled.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  const outgoingConfigTemplate = dialog.querySelector(
    "#emailOutgoingConfigSubview"
  );
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    outgoingConfigTemplate
  );
  Assert.ok(footerForward.disabled, "Continue button should be disabled");
  const outgoingHostname = outgoingConfigTemplate.querySelector(
    "#outgoingHostname:invalid"
  );
  Assert.ok(outgoingHostname, "The outgoing hostname should be invalid.");
  Assert.ok(
    BrowserTestUtils.isVisible(
      outgoingConfigTemplate.querySelector("#outgoingHostnameErrorMessage")
    ),
    "The outgoing hostname error message should be visible"
  );

  // Updating the hostname to be valid should not enable the continue button
  // as the incoming config was edited.
  EventUtils.synthesizeMouseAtCenter(outgoingHostname, {});
  EventUtils.synthesizeKey("KEY_Home", { shiftKey: true });
  EventUtils.synthesizeKey("KEY_ArrowLeft", {});
  EventUtils.synthesizeKey("KEY_ArrowRight", {});
  deleteEvent = BrowserTestUtils.waitForEvent(
    outgoingHostname,
    "input",
    false,
    event => event.target.value === "example.localhost"
  );
  EventUtils.synthesizeKey("KEY_Backspace", {}, window);
  await deleteEvent;
  Assert.ok(footerForward.disabled, "Continue button should be disabled");
  Assert.ok(
    BrowserTestUtils.isHidden(
      incomingConfigTemplate.querySelector("#incomingHostnameErrorMessage")
    ),
    "The outgoing hostname error message should be hidden"
  );

  // Hitting the test footer button should change the back button to cancel, to
  // cancel finding the config.
  let backTextPromise = BrowserTestUtils.waitForMutationCondition(
    footerBack,
    { attributes: true },
    () =>
      footerBack.getAttribute("data-l10n-id") ===
      "account-hub-email-cancel-button"
  );
  EventUtils.synthesizeMouseAtCenter(footerCustom, {});
  await backTextPromise;

  // Hitting cancel should change the back button text to "back" and keep the
  // form as the outgoing form.
  EventUtils.synthesizeMouseAtCenter(footerBack, {});
  backTextPromise = BrowserTestUtils.waitForMutationCondition(
    footerBack,
    { attributes: true },
    () =>
      footerBack.getAttribute("data-l10n-id") ===
      "account-hub-email-back-button"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(outgoingConfigTemplate),
    "The outgoing form should still be visible"
  );

  // We still have a config that can't be found because of the testing domain,
  // so hitting the test button should lead back to the incoming config, with
  // an error notification.
  EventUtils.synthesizeMouseAtCenter(footerCustom, {});
  incomingConfigTemplatePromise = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view"
  );
  await incomingConfigTemplatePromise;
  const header =
    incomingConfigTemplate.shadowRoot.querySelector("account-hub-header");
  await TestUtils.waitForCondition(
    () =>
      header.shadowRoot
        .querySelector("#emailFormNotification")
        .classList.contains("error"),
    "The notification should be present"
  );

  // The continue button should still be enabled, but going to outgoing the
  // continue button should be disabled.
  Assert.ok(!footerForward.disabled, "Continue button should be enabled");
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    outgoingConfigTemplate
  );
  Assert.ok(footerForward.disabled, "Continue button should be disabled");
  await subtest_close_account_hub_dialog(dialog, outgoingConfigTemplate);
});

add_task(async function test_account_email_manual_to_ews() {
  const dialog = await subtest_open_account_hub_dialog();

  const emailTemplate = dialog.querySelector("email-auto-form");
  const nameInput = emailTemplate.querySelector("#realName");
  const emailInput = emailTemplate.querySelector("#email");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  // Ensure fields are empty.
  nameInput.value = "";
  emailInput.value = "";

  await fillInvalidUserInfo(nameInput, emailInput);

  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for incoming config view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const incomingConfigSubview = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    incomingConfigSubview
  );

  info("Now that we're in the incoming config view, switch to EWS");

  const protocolSelector =
    incomingConfigSubview.querySelector("#incomingProtocol");

  const protocolSelectorPromise =
    BrowserTestUtils.waitForSelectPopupShown(window);

  await EventUtils.synthesizeMouseAtCenter(protocolSelector, {});

  const protocolSelectorPopup = await protocolSelectorPromise;

  const protocolSelectorItems =
    protocolSelectorPopup.querySelectorAll("menuitem");

  // #incomingProtocolEWS
  protocolSelectorPopup.activateItem(protocolSelectorItems[2]);

  await BrowserTestUtils.waitForPopupEvent(protocolSelectorPopup, "hidden");

  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    incomingConfigSubview.querySelector("#incomingExchangeUrlFormGroup")
  );

  const ewsURLInput = incomingConfigSubview.querySelector(
    "#incomingExchangeUrl"
  );
  const focusEvent = BrowserTestUtils.waitForEvent(ewsURLInput, "focus");

  EventUtils.synthesizeMouseAtCenter(ewsURLInput, {});
  await focusEvent;

  const configUpdatedEvent = BrowserTestUtils.waitForEvent(
    incomingConfigSubview,
    "config-updated",
    false,
    () => ewsURLInput.value == "https://example.com/"
  );
  EventUtils.sendString("https://example.com/");
  const { detail: configState } = await configUpdatedEvent;

  Assert.ok(configState.completed, "Should have a complete EWS config");
  Assert.ok(!footerForward.disabled, "Forward button should be enabled");

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const passwordSubview = dialog.querySelector("email-password-form");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", passwordSubview);
  Assert.ok(
    BrowserTestUtils.isVisible(passwordSubview),
    "Should go to password subview next"
  );

  await subtest_close_account_hub_dialog(dialog, passwordSubview);
});

add_task(async function test_direct_to_manual_config() {
  const dialog = await subtest_open_account_hub_dialog();

  const emailTemplate = dialog.querySelector("email-auto-form");
  const nameInput = emailTemplate.querySelector("#realName");
  const emailInput = emailTemplate.querySelector("#email");

  // Ensure fields are empty.
  nameInput.value = "";
  emailInput.value = "";
  const manualConfigButton = emailTemplate.querySelector(
    "#manualConfiguration"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(manualConfigButton),
    "Manual config button should be hidden"
  );

  await fillInvalidUserInfo(nameInput, emailInput);

  Assert.ok(
    BrowserTestUtils.isVisible(manualConfigButton),
    "Manual config button should be visible"
  );

  // Clicking the manual config button should lead to the incoming config form
  // with some prefilled data.
  EventUtils.synthesizeMouseAtCenter(manualConfigButton, {});

  const incomingConfigTemplate = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    incomingConfigTemplate
  );
  Assert.equal(
    incomingConfigTemplate.querySelector("#incomingHostname").value,
    ".example.localhost"
  );
  Assert.equal(
    incomingConfigTemplate.querySelector("#incomingUsername").value,
    "badtest@example.localhost"
  );
  await subtest_close_account_hub_dialog(dialog, incomingConfigTemplate);
});

add_task(async function test_account_invalid_email_advanced_setup_incoming() {
  Services.fog.testResetFOG();
  // Fill in email auto form and click continue, incoming config step to show
  // a base invalid configuration.
  const dialog = await subtest_open_account_hub_dialog();

  const emailTemplate = dialog.querySelector("email-auto-form");
  const nameInput = emailTemplate.querySelector("#realName");
  const emailInput = emailTemplate.querySelector("#email");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  // Ensure fields are empty.
  nameInput.value = "";
  emailInput.value = "";

  await fillInvalidUserInfo(nameInput, emailInput);

  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  info("Clicking next to incoming config");

  // Click continue and wait for incoming config view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const incomingConfigTemplate = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );
  const incomingConfigTemplatePromise = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view",
    500,
    500
  );
  await incomingConfigTemplatePromise;

  info("At incoming config view");

  const advancedConfigButton = incomingConfigTemplate.querySelector(
    "#advancedConfigurationIncoming"
  );
  EventUtils.synthesizeMouseAtCenter(advancedConfigButton, {});

  const tabmail = document.getElementById("tabmail");
  const oldTab = tabmail.selectedTab;

  await BrowserTestUtils.promiseAlertDialog("accept");

  // The dialog should automatically close after clicking advanced config
  await BrowserTestUtils.waitForEvent(dialog, "close");
  const accountTab = tabmail.selectedTab;

  await BrowserTestUtils.waitForCondition(
    () => accountTab != oldTab,
    "The tab should change to the account settings tab"
  );

  await BrowserTestUtils.waitForCondition(
    () => !!accountTab.browser.contentWindow.currentAccount,
    "The new account should have been created"
  );

  Assert.equal(
    Glean.mail.successfulEmailAccountSetup["advanced-config"].testGetValue(),
    1,
    "should have recorded advanced-config"
  );

  const account = accountTab.browser.contentWindow.currentAccount;
  const identity = account.defaultIdentity;
  const incoming = account.incomingServer;
  const outgoing = MailServices.outgoingServer.getServerByKey(
    identity.smtpServerKey
  );

  const config = {
    "incoming server username": {
      actual: incoming.username,
      expected: "badtest@example.localhost",
    },
    "outgoing server username": {
      actual: outgoing.username,
      expected: "badtest@example.localhost",
    },
    "incoming server hostname": {
      actual: incoming.hostName,
      expected: ".example.localhost",
    },
    "outgoing server hostname": {
      actual: outgoing.serverURI.host,
      expected: ".example.localhost",
    },
    "user real name": { actual: identity.fullName, expected: "Test User" },
    "user email address": {
      actual: identity.email,
      expected: "badtest@example.localhost",
    },
    "incoming port": {
      actual: incoming.port,
      expected: 143,
    },
    "outgoing port": {
      actual: outgoing.port,
      expected: 0,
    },
  };

  for (const detail in config) {
    Assert.equal(
      config[detail].actual,
      config[detail].expected,
      `Configured ${detail} is ${config[detail].actual}. It should be ${config[detail].expected}`
    );
  }

  removeAccountInternal(accountTab, account);
  await subtest_clear_status_bar();
  tabmail.closeTab(tabmail.currentTabInfo);

  // Confirm that the folder pane is visible.
  Assert.ok(BrowserTestUtils.isVisible(tabmail.currentAbout3Pane.folderTree));
});

async function fillInvalidUserInfo(nameInput, emailInput) {
  EventUtils.synthesizeMouseAtCenter(nameInput, {});

  let inputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === "Test User"
  );
  EventUtils.sendString("Test User", window);
  await inputEvent;

  const focusEvent = BrowserTestUtils.waitForEvent(emailInput, "focus");
  EventUtils.synthesizeMouseAtCenter(emailInput, {});
  await focusEvent;

  inputEvent = BrowserTestUtils.waitForEvent(
    emailInput,
    "input",
    false,
    event => event.target.value === "badtest@example.localhost"
  );
  EventUtils.sendString("badtest@example.localhost", window);
  await inputEvent;
}
