const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { GuessConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/GuessConfig.sys.mjs"
);

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

add_task(async function test_manual_config_connect_reviews_updated_settings() {
  const sandbox = sinon.createSandbox();
  const { dialog, manualConfigTemplate } = await openManualConfigSubview();

  const incomingHostname = manualConfigTemplate.querySelector(
    "#manualIncomingHostname"
  );
  const incomingUsername = manualConfigTemplate.querySelector(
    "#manualIncomingUsername"
  );
  const incomingPort = manualConfigTemplate.querySelector(
    "#manualIncomingPort"
  );
  const outgoingHostname = manualConfigTemplate.querySelector(
    "#manualOutgoingHostname"
  );
  const outgoingPort = manualConfigTemplate.querySelector(
    "#manualOutgoingPort"
  );

  incomingHostname.value = "IMAP.MOMO.INVALID";
  incomingUsername.value = "john.doe";
  incomingPort.value = "143";
  outgoingHostname.value = "SMTP.MOMO.INVALID";
  outgoingPort.value = "587";

  const updatedConfig = manualConfigTemplate.captureState().copy();
  updatedConfig.incoming.hostname = "imap.tested.momo.invalid";
  updatedConfig.incoming.port = 993;
  updatedConfig.incoming.socketType = Ci.nsMsgSocketType.SSL;
  updatedConfig.incoming.auth = Ci.nsMsgAuthMethod.passwordCleartext;
  updatedConfig.incoming.username = "john.doe@momo.invalid";
  updatedConfig.outgoing.hostname = "smtp.tested.momo.invalid";
  updatedConfig.outgoing.port = 465;
  updatedConfig.outgoing.socketType = Ci.nsMsgSocketType.SSL;
  updatedConfig.outgoing.auth = Ci.nsMsgAuthMethod.passwordCleartext;
  updatedConfig.outgoing.username = "john.doe@momo.invalid";

  sandbox
    .stub(GuessConfig, "guessConfig")
    .callsFake(async (domain, _progress, initialConfig, configType) => {
      Assert.equal(
        domain,
        "momo.invalid",
        "The manual config test should use the email domain"
      );
      Assert.equal(
        configType,
        "both",
        "The combined manual form should test incoming and outgoing settings"
      );
      Assert.equal(
        initialConfig.incoming.hostname,
        "imap.momo.invalid",
        "The current incoming hostname should be sent for testing"
      );
      Assert.equal(
        initialConfig.incoming.port,
        143,
        "The current incoming port should be sent for testing"
      );
      Assert.equal(
        initialConfig.outgoing.hostname,
        "smtp.momo.invalid",
        "The current outgoing hostname should be sent for testing"
      );
      Assert.equal(
        initialConfig.outgoing.port,
        587,
        "The current outgoing port should be sent for testing"
      );
      return updatedConfig;
    });

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("#emailFooter #forward"),
    {}
  );

  const passwordSubview = dialog.querySelector("#emailPasswordSubview");
  Assert.ok(
    BrowserTestUtils.isHidden(passwordSubview),
    "A config test that updates settings should not continue to the password step"
  );
  const header =
    manualConfigTemplate.shadowRoot.querySelector(
      "account-hub-header"
    ).shadowRoot;
  const notification = header.querySelector("#emailFormNotification");
  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(notification) &&
      notification.classList.contains("success"),
    "The successful config test notification should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(manualConfigTemplate),
    "A config test that updates settings should keep the manual config form visible"
  );
  const successNotificationTitle = header.querySelector(
    "#emailFormNotificationTitle .localized-title"
  );
  Assert.equal(
    document.l10n.getAttributes(successNotificationTitle).id,
    "account-hub-config-test-success",
    "The success notification should report a valid configuration"
  );
  const manualConfigTitle =
    manualConfigTemplate.shadowRoot.querySelector("#title");
  Assert.equal(
    manualConfigTemplate.getAttribute("title-id"),
    "account-hub-manual-config-review-settings-title",
    "The manual config header should ask the user to review the updated settings"
  );
  Assert.equal(
    document.l10n.getAttributes(manualConfigTitle).id,
    "account-hub-manual-config-review-settings-title",
    "The header title should use the review updated settings text"
  );
  Assert.ok(
    !dialog.querySelector("#emailFooter #forward").disabled,
    "Continue should be available after the user reviews the updated settings"
  );
  Assert.equal(
    incomingHostname.value,
    "imap.tested.momo.invalid",
    "The incoming hostname should update from the tested config"
  );
  Assert.equal(
    incomingUsername.value,
    "john.doe@momo.invalid",
    "The incoming username should update from the tested config"
  );
  Assert.equal(
    incomingPort.value,
    "993",
    "The incoming port should update from the tested config"
  );
  Assert.equal(
    outgoingHostname.value,
    "smtp.tested.momo.invalid",
    "The outgoing hostname should update from the tested config"
  );
  Assert.equal(
    outgoingPort.value,
    "465",
    "The outgoing port should update from the tested config"
  );
  Assert.ok(
    GuessConfig.guessConfig.calledOnce,
    "The config should be tested before continuing"
  );

  sandbox.restore();
  await subtest_close_account_hub_dialog(dialog, manualConfigTemplate);
});

add_task(
  async function test_manual_config_connect_reviews_user_edits_confirmed_by_test() {
    const sandbox = sinon.createSandbox();
    const { dialog, manualConfigTemplate } = await openManualConfigSubview();

    const incomingHostname = manualConfigTemplate.querySelector(
      "#manualIncomingHostname"
    );
    const incomingPort = manualConfigTemplate.querySelector(
      "#manualIncomingPort"
    );
    const outgoingHostname = manualConfigTemplate.querySelector(
      "#manualOutgoingHostname"
    );
    const outgoingPort = manualConfigTemplate.querySelector(
      "#manualOutgoingPort"
    );

    incomingHostname.value = "imap.confirmed.momo.invalid";
    incomingPort.value = "993";
    outgoingHostname.value = "smtp.confirmed.momo.invalid";
    outgoingPort.value = "587";

    sandbox
      .stub(GuessConfig, "guessConfig")
      .callsFake(async (domain, _progress, initialConfig, configType) => {
        Assert.equal(
          domain,
          "momo.invalid",
          "The manual config test should use the email domain"
        );
        Assert.equal(
          configType,
          "both",
          "The combined manual form should test incoming and outgoing settings"
        );
        Assert.equal(
          initialConfig.incoming.hostname,
          "imap.confirmed.momo.invalid",
          "The edited incoming hostname should be sent for testing"
        );
        Assert.equal(
          initialConfig.incoming.port,
          993,
          "The edited incoming port should be sent for testing"
        );
        Assert.equal(
          initialConfig.outgoing.hostname,
          "smtp.confirmed.momo.invalid",
          "The edited outgoing hostname should be sent for testing"
        );
        Assert.equal(
          initialConfig.outgoing.port,
          587,
          "The edited outgoing port should be sent for testing"
        );
        return initialConfig.copy();
      });

    const footerForward = dialog.querySelector("#emailFooter #forward");
    EventUtils.synthesizeMouseAtCenter(footerForward, {});

    const passwordSubview = dialog.querySelector("#emailPasswordSubview");
    Assert.ok(
      BrowserTestUtils.isHidden(passwordSubview),
      "A config test that confirms user edits should not continue to the password step"
    );
    const header =
      manualConfigTemplate.shadowRoot.querySelector(
        "account-hub-header"
      ).shadowRoot;
    const notification = header.querySelector("#emailFormNotification");
    await TestUtils.waitForCondition(
      () =>
        BrowserTestUtils.isVisible(notification) &&
        notification.classList.contains("success"),
      "The successful config test notification should be visible"
    );
    Assert.ok(
      BrowserTestUtils.isVisible(manualConfigTemplate),
      "A config test that confirms user edits should keep the manual config form visible"
    );
    Assert.equal(
      manualConfigTemplate.getAttribute("title-id"),
      "account-hub-manual-config-review-settings-title",
      "The manual config header should ask the user to review the updated settings"
    );
    Assert.ok(
      !footerForward.disabled,
      "Continue should be available after the user reviews the confirmed settings"
    );

    EventUtils.synthesizeMouseAtCenter(footerForward, {});
    await TestUtils.waitForCondition(
      () => BrowserTestUtils.isVisible(passwordSubview),
      "Continuing without more updates should leave the manual config form"
    );
    Assert.ok(
      BrowserTestUtils.isHidden(manualConfigTemplate),
      "The manual config form should be hidden after the reviewed settings are confirmed"
    );
    Assert.equal(
      GuessConfig.guessConfig.callCount,
      2,
      "The config should be tested before each continue attempt"
    );

    sandbox.restore();
    await subtest_close_account_hub_dialog(dialog, passwordSubview);
  }
);

add_task(async function test_manual_config_connect_continues_without_changes() {
  const sandbox = sinon.createSandbox();
  const { dialog, manualConfigTemplate } = await openManualConfigSubview();

  sandbox
    .stub(GuessConfig, "guessConfig")
    .callsFake(async (domain, _progress, initialConfig, configType) => {
      Assert.equal(
        domain,
        "momo.invalid",
        "The manual config test should use the email domain"
      );
      Assert.equal(
        configType,
        "both",
        "The combined manual form should test incoming and outgoing settings"
      );
      return initialConfig.copy();
    });

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("#emailFooter #forward"),
    {}
  );

  const passwordSubview = dialog.querySelector("#emailPasswordSubview");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(passwordSubview),
    "A successful config test with no updates should continue to the password step"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(manualConfigTemplate),
    "A successful config test with no updates should leave the manual config form"
  );
  Assert.ok(
    GuessConfig.guessConfig.calledOnce,
    "The config should be tested before continuing"
  );

  sandbox.restore();
  await subtest_close_account_hub_dialog(dialog, passwordSubview);
});

add_task(async function test_manual_config_connect_shows_test_error() {
  const sandbox = sinon.createSandbox();
  const { dialog, manualConfigTemplate } = await openManualConfigSubview();

  sandbox
    .stub(GuessConfig, "guessConfig")
    .rejects(new Error("Configuration test failed"));

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("#emailFooter #forward"),
    {}
  );

  const header =
    manualConfigTemplate.shadowRoot.querySelector(
      "account-hub-header"
    ).shadowRoot;
  const notification = header.querySelector("#emailFormNotification");
  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(notification) &&
      notification.classList.contains("error"),
    "The failed config test notification should be visible"
  );

  Assert.equal(
    document.l10n.getAttributes(
      header.querySelector("#emailFormNotificationTitle .localized-title")
    ).id,
    "account-hub-find-settings-failed",
    "The error notification should report that settings could not be found"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(manualConfigTemplate),
    "A failed config test should keep the manual config form visible"
  );
  Assert.ok(
    !dialog.querySelector("#emailFooter #forward").disabled,
    "Connect should be available to retry after a config test error"
  );

  sandbox.restore();
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

async function openManualConfigSubview() {
  const dialog = await subtest_open_account_hub_dialog();

  await subtest_fill_initial_config_fields(dialog, {
    name: "John Doe",
    email: "john.doe@momo.invalid",
    password: "abc12345",
    incomingHost: "mail.momo.invalid",
    incomingPort: 123,
    outgoingHost: "mail.momo.invalid",
    outgoingPort: 465,
  });

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

  return { dialog, manualConfigTemplate };
}
