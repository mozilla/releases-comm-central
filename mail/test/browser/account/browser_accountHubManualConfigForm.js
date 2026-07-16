const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);
const MANUAL_CONFIG_PREF = "mail.accounthub.manualconfig.enabled";

add_setup(function () {
  // Set the pref to load a local autoconfig file.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);
  Services.prefs.setBoolPref(MANUAL_CONFIG_PREF, true);
});

registerCleanupFunction(function () {
  // Restore the original pref.
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
  Services.prefs.setBoolPref(MANUAL_CONFIG_PREF, false);
});

add_task(async function test_account_email_manual_config_form() {
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

  // Edit configuration button should lead to manual config form.
  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#editConfiguration"),
    {}
  );

  const manualConfigTemplate = dialog.querySelector(
    "#emailManualConfigSubview"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(manualConfigTemplate),
    "The manual config template should be in view"
  );

  await subtest_close_account_hub_dialog(dialog, manualConfigTemplate);
});

add_task(async function test_account_email_manual_config_form_pop3() {
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

  // Edit configuration button should lead to manual config form.
  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#editConfiguration"),
    {}
  );

  const manualConfigTemplate = dialog.querySelector(
    "#emailManualConfigSubview"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(manualConfigTemplate),
    "The manual config template should be in view"
  );

  await subtest_close_account_hub_dialog(dialog, manualConfigTemplate);
});

add_task(async function test_manual_config_error_summary_for_invalid_fields() {
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

  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#editConfiguration"),
    {}
  );

  const manualConfigTemplate = dialog.querySelector(
    "#emailManualConfigSubview"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(manualConfigTemplate),
    "The manual config template should be in view"
  );

  const incomingHostname = manualConfigTemplate.querySelector(
    "#manualIncomingHostname"
  );
  const incomingUsername = manualConfigTemplate.querySelector(
    "#manualIncomingUsername"
  );
  const incomingPort = manualConfigTemplate.querySelector(
    "#manualIncomingPort"
  );
  incomingHostname.value = "";
  incomingUsername.value = "";
  incomingPort.value = "0";

  const footerForward = dialog.querySelector("#emailFooter #forward");
  Assert.ok(!footerForward.disabled, "Connect should start enabled");
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const header =
    manualConfigTemplate.shadowRoot.querySelector(
      "account-hub-header"
    ).shadowRoot;
  const notification = header.querySelector("#emailFormNotification");
  await TestUtils.waitForCondition(
    () => !notification.hidden && notification.open,
    "The expanded error notification should be visible"
  );

  Assert.ok(footerForward.disabled, "Connect should be disabled after errors");
  Assert.deepEqual(
    Array.from(header.querySelectorAll(".manual-config-error-list a")).map(
      link => link.textContent
    ),
    ["Hostname", "Username", "Port"],
    "The notification should list the invalid fields"
  );

  const hostnameInput = incomingHostname.querySelector("input");
  Assert.equal(
    hostnameInput.getAttribute("aria-describedby"),
    "manualIncomingHostnameInputErrorMessage",
    "The invalid hostname should be described by its error text"
  );

  header.querySelector(".manual-config-error-list a").click();
  await TestUtils.waitForCondition(
    () =>
      document.querySelector("account-hub-container").shadowRoot
        .activeElement == hostnameInput,
    "The invalid field should be focused"
  );
  Assert.equal(
    document.querySelector("account-hub-container").shadowRoot.activeElement,
    hostnameInput,
    "Clicking an error summary link should focus the field"
  );

  incomingHostname.value = "imap.mail.momo.invalid";
  incomingHostname.dispatchEvent(new Event("input", { bubbles: true }));
  incomingUsername.value = "john.doe";
  incomingUsername.dispatchEvent(new Event("input", { bubbles: true }));
  incomingPort.value = "993";
  incomingPort.dispatchEvent(new Event("input", { bubbles: true }));

  await TestUtils.waitForCondition(
    () => !footerForward.disabled,
    "Connect should be re-enabled after errors are fixed"
  );

  await subtest_close_account_hub_dialog(dialog, manualConfigTemplate);
});
