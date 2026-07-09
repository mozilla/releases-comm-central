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
