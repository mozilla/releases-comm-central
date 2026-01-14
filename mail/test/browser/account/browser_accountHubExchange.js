/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { HttpsProxy } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/HttpsProxy.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);

requestLongerTimeout(4);

const PASSWORD = "hunter2";
const USER = "testExchange@exchange.test";
// Encoding matches what FetchHTTP.sys.mjs uses.
const BASIC_AUTH = btoa(
  MailStringUtils.stringToByteString(`${USER}:${PASSWORD}`)
);
const emailUser = {
  name: "John Doe",
  email: USER,
  password: PASSWORD,
};
const AUTODISCOVER_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006">
  <Response xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a">
    <Account>
      <AccountType>email</AccountType>
      <Action>settings</Action>
      <MicrosoftOnline>True</MicrosoftOnline>
      <Protocol>
        <Type>EXCH</Type>
        <Server>bb0f9083-1bfa-4ee3-8851-876b23ed0046@exchange.test</Server>
        <ServerDN>/o=ExchangeLabs/ou=Exchange Administrative Group (FYDIBOHF23SPDLT)/cn=Configuration/cn=Servers/cn=bb0f9083-1bfa-4ee3-8851-876b23ed0046@exchange.test/cn=Microsoft Private MDB</ServerDN>
        <ServerVersion>73D49F70</ServerVersion>
        <MdbDN>/o=ExchangeLabs/ou=Exchange Administrative Group (FYDIBOHF23SPDLT)/cn=Configuration/cn=Servers/cn=bb0f9083-1bfa-4ee3-8851-876b23ed0046@exchange.test/cn=Microsoft Private MDB</MdbDN>
        <PublicFolderServer>outlook.office365.com</PublicFolderServer>
        <AuthPackage>Anonymous</AuthPackage>
        <ASUrl>https://outlook.office365.com/EWS/Exchange.asmx</ASUrl>
        <EwsUrl>http://exchange.test/EWS/Exchange.asmx</EwsUrl>
        <EmwsUrl>https://outlook.office365.com/EWS/Exchange.asmx</EmwsUrl>
        <SharingUrl>https://outlook.office365.com/EWS/Exchange.asmx</SharingUrl>
        <EcpUrl>https://outlook.office365.com/owa/</EcpUrl>
        <EcpUrl-um>?path=/options/callanswering</EcpUrl-um>
        <EcpUrl-aggr>?path=/options/connectedaccounts</EcpUrl-aggr>
        <EcpUrl-mt>options/ecp/PersonalSettings/DeliveryReport.aspx?rfr=olk&amp;exsvurl=1&amp;IsOWA=&lt;IsOWA&gt;&amp;MsgID=&lt;MsgID&gt;&amp;Mbx=&lt;Mbx&gt;&amp;realm=exchange.test</EcpUrl-mt>
        <EcpUrl-ret>?path=/options/retentionpolicies</EcpUrl-ret>
        <EcpUrl-publish>?path=/options/calendarpublishing/id/&lt;FldID&gt;</EcpUrl-publish>
        <EcpUrl-photo>?path=/options/myaccount/action/photo</EcpUrl-photo>
        <EcpUrl-connect>?path=/options/socialnetworks&amp;ignore1=&lt;Action&gt;&amp;ignore2=&lt;Provider&gt;</EcpUrl-connect>
        <EcpUrl-tm>options/ecp/?rfr=olk&amp;ftr=TeamMailbox&amp;exsvurl=1&amp;realm=exchange.test</EcpUrl-tm>
        <EcpUrl-tmCreating>options/ecp/?rfr=olk&amp;ftr=TeamMailboxCreating&amp;SPUrl=&lt;SPUrl&gt;&amp;Title=&lt;Title&gt;&amp;SPTMAppUrl=&lt;SPTMAppUrl&gt;&amp;exsvurl=1&amp;realm=exchange.test</EcpUrl-tmCreating>
        <EcpUrl-tmEditing>options/ecp/?rfr=olk&amp;ftr=TeamMailboxEditing&amp;Id=&lt;Id&gt;&amp;exsvurl=1&amp;realm=exchange.test</EcpUrl-tmEditing>
        <EcpUrl-extinstall>?path=/options/manageapps</EcpUrl-extinstall>
        <OOFUrl>https://outlook.office365.com/EWS/Exchange.asmx</OOFUrl>
        <OABUrl>https://outlook.office365.com/OAB/6b838922-3d7e-4557-bf01-576e3b4e37fa/</OABUrl>
        <ServerExclusiveConnect>off</ServerExclusiveConnect>
      </Protocol>
    </Account>
  </Response>
</Autodiscover>`;
let server;

add_setup(async () => {
  server = new HttpServer();
  server.start(-1);
  await Services.logins.initializationPromise;
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mailnews.auto_config.fetchFromExchange.enabled", true],
      // Set the pref to load a local autoconfig file.
      [
        "mailnews.auto_config_url",
        "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/",
      ],
    ],
  });
  // Set up a configuration file at
  // https://exchange.test/autodiscover/autodiscover.xml"
  // We need https, since that's the only way authorization is sent.
  const secureAutodiscovery = await HttpsProxy.create(
    server.identity.primaryPort,
    "autodiscover.exchange.test",
    "autodiscover.exchange.test"
  );
  server.identity.add("https", "autodiscover.exchange.test", 443);
  server.registerPathHandler(
    "/autodiscover/autodiscover.xml",
    (request, response) => {
      response.setHeader("Cache-Control", "private");
      if (
        !request.hasHeader("Authorization") ||
        request.getHeader("Authorization") != `Basic ${BASIC_AUTH}`
      ) {
        info("Autodiscover wrong authorization");
        response.setStatusLine(request.httpVersion, 401, "Unauthorized");
        response.setHeader("WWW-Authenticate", 'Basic Realm=""');
        return;
      }
      info("Autodiscover authorized");
      response.setStatusLine(request.httpVersion, 200, "OK");
      response.setHeader("Content-Type", "application/xml");
      response.write(AUTODISCOVER_RESPONSE);
    }
  );

  const imapServer = await ServerTestUtils.createServer({
    type: "imap",
    baseOptions: { username: USER, password: "abc123456" },
    hostname: "imap.exchange.test",
    port: 1993,
  });

  registerCleanupFunction(async () => {
    secureAutodiscovery.destroy();
    imapServer.close();
    server.identity.remove("https", "autodiscover.exchange.test", 443);
    server.registerFile("/autodiscover/autodiscover.xml", null);
    server.stop();
    Services.logins.removeAllLogins();
    await SpecialPowers.popPrefEnv();
  });
});

add_task(async function test_exchange_requires_credentials_account_creation() {
  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  await fillUserInformation(emailTemplate);
  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for config found template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  info("Expecting password entry");
  const authenticationStep = dialog.querySelector("email-authentication-form");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", authenticationStep);
  await fillPasswordInput(authenticationStep);
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const configFoundTemplate = dialog.querySelector("email-config-found");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", configFoundTemplate);
  const imapOption = configFoundTemplate.querySelector("#imap");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(imapOption),
    "The IMAP config option should be visible"
  );

  Assert.ok(
    imapOption.classList.contains("selected"),
    "IMAP should be the selected config option"
  );

  const ewsOption = configFoundTemplate.querySelector("#ews");
  Assert.ok(
    BrowserTestUtils.isVisible(ewsOption),
    "EWS should be available as config"
  );

  EventUtils.synthesizeMouseAtCenter(ewsOption, {});

  Assert.equal(
    configFoundTemplate.querySelector("#incomingType").textContent,
    "ews",
    "Incoming type should be expected type"
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingHost").textContent,
    "exchange.test",
    "Should have host from autoconfig"
  );

  Assert.equal(
    configFoundTemplate.l10n.getAttributes(
      configFoundTemplate.querySelector("#incomingSocketType")
    ).id,
    "account-setup-result-ssl",
    "Incoming auth should be expected auth"
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingUsername").textContent,
    USER,
    "Incoming username should be expected username"
  );

  Services.logins.removeAllLogins();
  await subtest_close_account_hub_dialog(dialog, configFoundTemplate);
});

add_task(
  async function test_exchange_username_for_discovery_account_creation() {
    const dialog = await subtest_open_account_hub_dialog();
    const emailTemplate = dialog.querySelector("email-auto-form");
    const footerForward = dialog.querySelector("#emailFooter #forward");

    await fillUserInformation(emailTemplate, {
      ...emailUser,
      email: "testExchange@exchange.test",
    });
    Assert.ok(!footerForward.disabled, "Continue button should be enabled");

    // Click continue and wait for config found template to be in view.
    EventUtils.synthesizeMouseAtCenter(footerForward, {});
    info("Expecting password entry");
    const authenticationStep = dialog.querySelector(
      "email-authentication-form"
    );

    await BrowserTestUtils.waitForAttributeRemoval(
      "hidden",
      authenticationStep
    );
    await fillPasswordInput(authenticationStep);
    info("Entering username");
    const usernameInput = authenticationStep.querySelector("#username");

    await TestUtils.waitForCondition(
      () => BrowserTestUtils.isVisible(usernameInput),
      "The username form input should be visible."
    );
    EventUtils.synthesizeMouseAtCenter(usernameInput, {});

    const inputEvent = BrowserTestUtils.waitForEvent(
      usernameInput,
      "input",
      true,
      event => event.target.value === USER
    );
    EventUtils.sendString(USER);
    await inputEvent;
    EventUtils.synthesizeMouseAtCenter(footerForward, {});

    const configFoundTemplate = dialog.querySelector("email-config-found");
    await BrowserTestUtils.waitForAttributeRemoval(
      "hidden",
      configFoundTemplate
    );
    const imapOption = configFoundTemplate.querySelector("#imap");

    await TestUtils.waitForCondition(
      () => BrowserTestUtils.isVisible(imapOption),
      "The IMAP config option should be visible"
    );

    Assert.ok(
      imapOption.classList.contains("selected"),
      "IMAP should be the selected config option"
    );

    const ewsOption = configFoundTemplate.querySelector("#ews");
    Assert.ok(
      BrowserTestUtils.isVisible(ewsOption),
      "EWS should be available as config"
    );

    EventUtils.synthesizeMouseAtCenter(ewsOption, {});

    Assert.equal(
      configFoundTemplate.querySelector("#incomingType").textContent,
      "ews",
      "Incoming type should be expected type"
    );

    Assert.equal(
      configFoundTemplate.querySelector("#incomingHost").textContent,
      "exchange.test",
      "Should have host from autoconfig"
    );

    Assert.equal(
      configFoundTemplate.l10n.getAttributes(
        configFoundTemplate.querySelector("#incomingSocketType")
      ).id,
      "account-setup-result-ssl",
      "Incoming auth should be expected auth"
    );

    Assert.equal(
      configFoundTemplate.querySelector("#incomingUsername").textContent,
      "testExchange@exchange.test",
      "Incoming username should be expected username"
    );

    const footerBack = dialog.querySelector("#emailFooter #back");

    info("Going back to start");
    EventUtils.synthesizeMouseAtCenter(footerBack, {});
    await BrowserTestUtils.waitForAttributeRemoval("hidden", emailTemplate);

    info("Searching for a config should not remember the username");
    EventUtils.synthesizeMouseAtCenter(footerForward, {});
    await BrowserTestUtils.waitForAttributeRemoval(
      "hidden",
      authenticationStep
    );

    Services.logins.removeAllLogins();
    await subtest_close_account_hub_dialog(dialog, authenticationStep);
  }
);

add_task(async function test_exchange_manual_configuration() {
  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  await fillUserInformation(emailTemplate);

  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for config found template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  info("Expecting password entry");
  const authenticationStep = dialog.querySelector("email-authentication-form");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", authenticationStep);
  await fillPasswordInput(authenticationStep);
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const configFoundTemplate = dialog.querySelector("email-config-found");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", configFoundTemplate);
  const imapOption = configFoundTemplate.querySelector("#imap");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(imapOption),
    "The IMAP config option should be visible"
  );

  Assert.ok(
    imapOption.classList.contains("selected"),
    "IMAP should be the selected config option"
  );

  const ewsOption = configFoundTemplate.querySelector("#ews");
  Assert.ok(
    BrowserTestUtils.isVisible(ewsOption),
    "EWS should be available as config"
  );

  EventUtils.synthesizeMouseAtCenter(ewsOption, {});
  const editConfigurationButton =
    configFoundTemplate.querySelector("#editConfiguration");

  Assert.ok(
    BrowserTestUtils.isVisible(editConfigurationButton),
    "EWS config should be editable"
  );

  EventUtils.synthesizeMouseAtCenter(editConfigurationButton, {});
  const ewsConfigStep = dialog.querySelector("#emailIncomingConfigSubview");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", ewsConfigStep);

  // The protocol option select, connection securty, and port should be hidden,
  // and we should be showing the EWS label, with only OAuth and
  // Normal Password as authentication options, and the EWS url input.
  Assert.ok(
    BrowserTestUtils.isVisible(
      ewsConfigStep.querySelector("#incomingProtocol")
    ),
    "Default protocol dropdown should be visible"
  );
  Assert.equal(
    ewsConfigStep.querySelector("#incomingProtocol").value,
    4,
    "EWS should be the selected protocol"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(
      ewsConfigStep.querySelector("#incomingConnectionSecurity")
    ),
    "Incoming connection security dropdown should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(ewsConfigStep.querySelector("#incomingPort")),
    "Incoming port input should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      ewsConfigStep.querySelector("#incomingExchangeUrl")
    ),
    "EWS URL input should be visible"
  );

  // The available config fields should be filled in with the correct info.
  // The test server isn't set up with HTTPS, so we have an insecure URL here.
  Assert.equal(
    ewsConfigStep.querySelector("#incomingExchangeUrl").value,

    "https://exchange.test/EWS/Exchange.asmx",
    "The EWS URL input should have the correct exchange url"
  );
  Assert.equal(
    ewsConfigStep.querySelector("#incomingAuthMethod").value,
    3,
    "The auth method should be Normal Password"
  );
  Assert.equal(
    ewsConfigStep.querySelector("#incomingUsername").value,
    "testExchange@exchange.test",
    "The username input should have the exchange email from the config"
  );

  Services.logins.removeAllLogins();
  await subtest_close_account_hub_dialog(dialog, ewsConfigStep);
});

add_task(async function test_exchange_ews_advanced_configuration() {
  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  await fillUserInformation(emailTemplate);

  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for config found template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  info("Expecting password entry");
  const authenticationStep = dialog.querySelector("email-authentication-form");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", authenticationStep);
  await fillPasswordInput(authenticationStep);
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const configFoundTemplate = dialog.querySelector("email-config-found");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", configFoundTemplate);
  const imapOption = configFoundTemplate.querySelector("#imap");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(imapOption),
    "The IMAP config option should be visible"
  );

  const ewsOption = configFoundTemplate.querySelector("#ews");
  Assert.ok(
    BrowserTestUtils.isVisible(ewsOption),
    "EWS should be available as config"
  );

  EventUtils.synthesizeMouseAtCenter(ewsOption, {});
  const editConfigurationButton =
    configFoundTemplate.querySelector("#editConfiguration");

  Assert.ok(
    BrowserTestUtils.isVisible(editConfigurationButton),
    "EWS config should be editable"
  );

  EventUtils.synthesizeMouseAtCenter(editConfigurationButton, {});
  const ewsConfigStep = dialog.querySelector("#emailIncomingConfigSubview");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", ewsConfigStep);

  const tabmail = await chooseAdvancedSetup(ewsConfigStep, dialog);
  const ewsAccount = await waitForAccount(emailUser.email);
  await cleanupAdvancedConfigurationTest(tabmail, ewsAccount);
});

add_task(async function test_exchange_graph_advanced_configuration() {
  await SpecialPowers.pushPrefEnv({ set: [["mail.graph.enabled", true]] });

  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const manualConfigurationButton = dialog.querySelector(
    "#manualConfiguration"
  );

  Assert.ok(
    !BrowserTestUtils.isVisible(manualConfigurationButton),
    "Manual configuration button should be invisible."
  );

  await fillUserInformation(emailTemplate);

  Assert.ok(
    BrowserTestUtils.isVisible(manualConfigurationButton),
    "Manual configuration button should be visible."
  );

  EventUtils.synthesizeMouseAtCenter(manualConfigurationButton, {});

  const incomingForm = dialog.querySelector("#emailIncomingConfigSubview");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingForm),
    "The incoming server config form should be visible"
  );

  const protocolSelector = incomingForm.querySelector("#incomingProtocol");
  Assert.ok(
    BrowserTestUtils.isVisible(protocolSelector),
    "Default protocol dropdown should be visible"
  );

  info("Switch to Graph");
  let configUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    incomingForm,
    "config-updated"
  );
  protocolSelector.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(protocolSelector.menupopup, "shown");
  const graphSelection = protocolSelector.querySelector(
    "#incomingProtocolGraph"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(graphSelection),
    "Graph menu item should be visible."
  );
  EventUtils.synthesizeMouseAtCenter(graphSelection, {});
  let { detail: configUpdatedEvent } = await configUpdatedEventPromise;
  Assert.ok(!configUpdatedEvent.completed, "Config should be incomplete");

  const exchangeURLField = incomingForm.querySelector("#incomingExchangeUrl");
  Assert.ok(
    BrowserTestUtils.isVisible(exchangeURLField),
    "Should show Exchange URL field for Graph"
  );

  info("Focus Exchange URL field");
  configUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    incomingForm,
    "config-updated",
    false,
    () => exchangeURLField.value == "https://graph.microsoft.com/v1.0"
  );
  const focusEvent = BrowserTestUtils.waitForEvent(exchangeURLField, "focus");
  EventUtils.synthesizeMouseAtCenter(exchangeURLField, {});
  await focusEvent;
  EventUtils.sendString("https://graph.microsoft.com/v1.0");
  ({ detail: configUpdatedEvent } = await configUpdatedEventPromise);

  Assert.ok(
    configUpdatedEvent.completed,
    "Should indicate that the form is complete"
  );

  const tabmail = await chooseAdvancedSetup(incomingForm, dialog);
  const graphAccount = await waitForAccount(emailUser.email);

  Assert.equal(
    graphAccount.incomingServer.type,
    "graph",
    "New account should be a Graph account."
  );

  Assert.equal(
    graphAccount.incomingServer.getStringValue("ews_url"),
    "https://graph.microsoft.com/v1.0",
    "The Exchange URL should be a Graph API URL."
  );

  await cleanupAdvancedConfigurationTest(tabmail, graphAccount);
  SpecialPowers.popPrefEnv();
});

add_task(async function test_exchange_credentials_to_imap() {
  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  await fillUserInformation(emailTemplate, {
    ...emailUser,
    email: "testExchange@exchange.test",
  });
  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for config found template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  info("Expecting password entry");
  const authenticationStep = dialog.querySelector("email-authentication-form");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", authenticationStep);
  await fillPasswordInput(authenticationStep);
  info("Entering username");
  const usernameInput = authenticationStep.querySelector("#username");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(usernameInput),
    "The username form input should be visible."
  );
  EventUtils.synthesizeMouseAtCenter(usernameInput, {});

  const inputEvent = BrowserTestUtils.waitForEvent(
    usernameInput,
    "input",
    true,
    event => event.target.value === USER
  );
  EventUtils.sendString(USER);
  await inputEvent;
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const configFoundStep = dialog.querySelector("email-config-found");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", configFoundStep);
  const imapOption = configFoundStep.querySelector("#imap");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(imapOption),
    "The IMAP config option should be visible"
  );

  Assert.ok(
    imapOption.classList.contains("selected"),
    "IMAP should be the selected config option"
  );

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const passwordStep = dialog.querySelector("#emailPasswordSubview");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", passwordStep);

  const header = passwordStep.shadowRoot.querySelector("account-hub-header");
  const errorTitle = header.shadowRoot.querySelector(
    "#emailFormNotificationTitle"
  );
  info(
    "Waiting for account-setup-exchange-config-unverifiable in #emailPasswordSubview..."
  );
  await BrowserTestUtils.waitForMutationCondition(
    header.shadowRoot.querySelector("#emailFormNotification"),
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isVisible(errorTitle)
  );
  await TestUtils.waitForTick();
  Assert.equal(
    document.l10n.getAttributes(errorTitle.querySelector(".localized-title"))
      .id,
    "account-setup-exchange-config-unverifiable",
    "Should display error"
  );

  await subtest_close_account_hub_dialog(dialog, passwordStep);
});

add_task(async function test_full_exchange_account_creation() {
  const ewsServer = await ServerTestUtils.createServer({
    type: "ews",
    options: {
      username: USER,
      password: PASSWORD,
    },
    hostname: "exchange.test",
    port: 80,
  });

  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  await fillUserInformation(emailTemplate, {
    ...emailUser,
    email: "testExchange@exchange.test",
  });
  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for config found template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  info("Expecting password entry");
  const authenticationStep = dialog.querySelector("email-authentication-form");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", authenticationStep);
  await fillPasswordInput(authenticationStep);
  info("Entering username");
  const usernameInput = authenticationStep.querySelector("#username");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(usernameInput),
    "The username form input should be visible."
  );

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const configFoundStep = dialog.querySelector("email-config-found");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", configFoundStep);
  const imapOption = configFoundStep.querySelector("#imap");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(imapOption),
    "The IMAP config option should be visible"
  );

  Assert.ok(
    imapOption.classList.contains("selected"),
    "IMAP should be the selected config option"
  );

  const configFoundTemplate = dialog.querySelector("email-config-found");
  const ewsOption = configFoundTemplate.querySelector("#ews");
  Assert.ok(
    BrowserTestUtils.isVisible(ewsOption),
    "EWS should be available as config"
  );

  EventUtils.synthesizeMouseAtCenter(ewsOption, {});

  Assert.equal(
    configFoundTemplate.querySelector("#incomingType").textContent,
    "ews",
    "Incoming type should be expected type"
  );

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const ewsAccount = await new Promise(resolve => {
    const listener = {
      onServerLoaded() {
        const matchingAccount = MailServices.accounts.accounts.find(
          account => account.identities[0]?.email === emailUser.email
        );
        if (matchingAccount) {
          MailServices.accounts.removeIncomingServerListener(listener);
          resolve(matchingAccount);
        }
      },
      onServerUnloaded() {},
      onServerChanged() {},
    };
    MailServices.accounts.addIncomingServerListener(listener);
    listener.onServerLoaded();
  });

  // Creating an account with no address books and calendars should lead to
  // the success view.
  const successStep = dialog.querySelector("email-added-success");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", successStep);

  Assert.equal(
    ewsAccount.incomingServer.type,
    "ews",
    "Should get an EWS account"
  );

  MailServices.accounts.removeAccount(ewsAccount);
  Services.logins.removeAllLogins();

  ewsServer.stop();
  await subtest_close_account_hub_dialog(dialog, successStep);
});

/**
 * Fills the name and email inputs in the first step of account hub
 * email setup.
 *
 * @param {HTMLElement} emailStep - The email step HTML element.
 * @param {object} [userDetails] - Details to enter for the user. Defaults to the
 * emailUser object.
 */
async function fillUserInformation(emailStep, userDetails = emailUser) {
  const nameInput = emailStep.querySelector("#realName");
  const emailInput = emailStep.querySelector("#email");

  // Ensure fields are empty.
  nameInput.value = "";
  emailInput.value = "";

  EventUtils.synthesizeMouseAtCenter(nameInput, {});
  let inputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === userDetails.name
  );
  EventUtils.sendString(userDetails.name, window);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(emailInput, {});
  inputEvent = BrowserTestUtils.waitForEvent(
    emailInput,
    "input",
    false,
    event => event.target.value === userDetails.email
  );
  EventUtils.sendString(userDetails.email, window);
  await inputEvent;
}

/**
 * Fills the password input in the password step of account hub email setup.
 *
 * @param {HTMLElement} passwordStep - The password step HTML element.
 */
async function fillPasswordInput(passwordStep) {
  info("Entering password");
  const passwordInput = passwordStep.querySelector("#password");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(passwordInput),
    "The password form input should be visible."
  );
  EventUtils.synthesizeMouseAtCenter(passwordInput, {});

  const inputEvent = BrowserTestUtils.waitForEvent(
    passwordInput,
    "input",
    true,
    event => event.target.value === PASSWORD
  );
  EventUtils.sendString(PASSWORD);
  await inputEvent;
}

/**
 * Chooses the "Advanced Configuration" option from the incoming server configuration form.
 *
 * @param {HTMLElement} incomingConfigForm - The incoming server configuration form.
 * @param {HTMLElement} dialog - The AccountHub dialog.
 * @returns {HTMLElement} The tab manager for the window.
 */
async function chooseAdvancedSetup(incomingConfigForm, dialog) {
  // Clicking advanced config and confirming the dialog should create the ews
  // account and close the dialog.
  const advancedConfigButton = incomingConfigForm.querySelector(
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

  return tabmail;
}

/**
 * Wait for an account to exist for the given email address.
 *
 * @param {string} emailAddress
 * @returns {nsIMsgAccount} The account for the address.
 */
async function waitForAccount(emailAddress) {
  const foundAccount = await TestUtils.waitForCondition(
    () =>
      MailServices.accounts.accounts.find(
        account => account.identities[0]?.email === emailAddress
      ),
    `The account for ${emailAddress} should be created.`
  );
  return foundAccount;
}

/**
 * Cleanup after an advanced configuration test that created a new account.
 *
 * @param {HTMLElement} tabmail - The tab manager for the window.
 * @param {nsIMsgAccount} account - The new account.
 */
async function cleanupAdvancedConfigurationTest(tabmail, account) {
  // Close the account settings tab.
  tabmail.closeTab(tabmail.currentTabInfo);

  MailServices.accounts.removeAccount(account);
  await subtest_clear_status_bar();
  Services.logins.removeAllLogins();
}
