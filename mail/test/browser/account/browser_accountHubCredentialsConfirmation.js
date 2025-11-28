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

const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);

const USER = "testExchange@exchange.test";
const PASSWORD = "hunter2";
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
        <EwsUrl>https://outlook.office365.com/EWS/Exchange.asmx</EwsUrl>
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
let redirectServer, autodiscoveryServer;
let redirectAccepted = false;

add_setup(async () => {
  redirectServer = new HttpServer();
  redirectServer.start(-1);
  await Services.logins.initializationPromise;
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mailnews.auto_config.fetchFromExchange.enabled", true],
      // Set the pref to load nothing.
      ["mailnews.auto_config_url", ""],
    ],
  });

  // The initial server needs to be HTTP for the redirect to trigger.
  NetworkTestUtils.configureProxy(
    "autodiscover.exchange.test",
    80,
    redirectServer.identity.primaryPort
  );

  redirectServer.identity.add("http", "autodiscover.exchange.test", 80);
  redirectServer.registerPathHandler(
    "/autodiscover/autodiscover.xml",
    (request, response) => {
      response.setHeader("Cache-Control", "private");
      response.setStatusLine(request.httpVersion, 301, "Moved Permanently");
      response.setHeader(
        "Location",
        "https://dav.test/autodiscover/autodiscover.xml"
      );
    }
  );

  autodiscoveryServer = new HttpServer();
  autodiscoveryServer.start(-1);

  // Set up a configuration file at
  // https://dav.test/autodiscover/autodiscover.xml"
  const redirectedAutodiscover = await HttpsProxy.create(
    autodiscoveryServer.identity.primaryPort,
    "dav",
    "dav.test"
  );

  autodiscoveryServer.identity.add("https", "dav.test", 443);
  autodiscoveryServer.registerPathHandler(
    "/autodiscover/autodiscover.xml",
    (request, response) => {
      // We have to block the response here because one of the fetches in
      // autodisovery will find this config here instead of letting the above
      // server redirect to this one.
      info("autodiscovery");
      if (redirectAccepted) {
        info("redirect has been accepted");
        response.setStatusLine(request.httpVersion, 200, "OK");
        response.setHeader("Content-Type", "application/xml");
        response.write(AUTODISCOVER_RESPONSE);
      } else {
        response.setStatusLine(request.httpVersion, 404, "Not Found");
      }
    }
  );

  registerCleanupFunction(async () => {
    redirectServer.identity.remove("http", "autodiscover.exchange.test", 80);
    redirectServer.registerFile("/autodiscover/autodiscover.xml", null);
    redirectServer.stop();
    redirectedAutodiscover.destroy();
    autodiscoveryServer.identity.remove("https", "dav.test", 443);
    autodiscoveryServer.registerFile("/autodiscover/autodiscover.xml", null);
    autodiscoveryServer.stop();
    Services.logins.removeAllLogins();
    await SpecialPowers.popPrefEnv();
  });
});

add_task(async function test_cancel_credentials_confirmation() {
  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const footerForward = dialog.querySelector("#emailFooter #forward");
  const footerBack = dialog.querySelector("#emailFooter #back");

  await fillUserInformation(emailTemplate);
  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for config found template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  info("Expecting credentials confirmation prompt");
  const confirmationStep = dialog.querySelector(
    "email-credentials-confirmation"
  );

  await BrowserTestUtils.waitForAttributeRemoval("hidden", confirmationStep);
  const hostname = confirmationStep.querySelector("#hostname");
  const username = confirmationStep.querySelector("#username");
  const socketType = confirmationStep.querySelector("#socketType");
  Assert.equal(
    hostname.textContent,
    "dav.test",
    "The hostname should be the redirect hostname"
  );
  Assert.equal(
    username.textContent,
    emailUser.email,
    "The username should be email inputted"
  );
  Assert.equal(
    socketType.textContent,
    "SSL/TLS",
    "The socket type should be set to secure"
  );

  // Clicking cancel should continue finding a config with a rejected redirect.
  EventUtils.synthesizeMouseAtCenter(footerBack, {});
  const manualIncomingForm = dialog.querySelector("email-manual-incoming-form");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", manualIncomingForm);

  Services.logins.removeAllLogins();
  await subtest_close_account_hub_dialog(dialog, manualIncomingForm);
});

add_task(async function test_credentials_confirmation() {
  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  await fillUserInformation(emailTemplate);
  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for credentials confirmation step to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  info("Expecting credentials confirmation prompt");
  const confirmationStep = dialog.querySelector(
    "email-credentials-confirmation"
  );

  await BrowserTestUtils.waitForAttributeRemoval("hidden", confirmationStep);
  const hostname = confirmationStep.querySelector("#hostname");
  const username = confirmationStep.querySelector("#username");
  const socketType = confirmationStep.querySelector("#socketType");
  Assert.equal(
    hostname.textContent,
    "dav.test",
    "The hostname should be the redirect hostname"
  );
  Assert.equal(
    username.textContent,
    emailUser.email,
    "The username should be email inputted"
  );
  Assert.equal(
    socketType.textContent,
    "SSL/TLS",
    "The socket type should be set to secure"
  );

  // Clicking continue should lead to the config found step.
  redirectAccepted = true;
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const configFoundTemplate = dialog.querySelector("email-config-found");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", configFoundTemplate);
  const ewsOption = configFoundTemplate.querySelector("#ews");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(ewsOption),
    "The IMAP config option should be visible"
  );

  EventUtils.synthesizeMouseAtCenter(ewsOption, {});

  Assert.equal(
    configFoundTemplate.querySelector("#incomingType").textContent,
    "ews",
    "Incoming type should be expected type"
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingHost").textContent,
    "outlook.office365.com",
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

  redirectAccepted = false;
  Services.logins.removeAllLogins();
  await subtest_close_account_hub_dialog(dialog, configFoundTemplate);
});

add_task(async function test_credentials_confirmation_manual_configuration() {
  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  await fillUserInformation(emailTemplate);
  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for credentials confirmation step to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  info("Expecting credentials confirmation prompt");
  const confirmationStep = dialog.querySelector(
    "email-credentials-confirmation"
  );

  await BrowserTestUtils.waitForAttributeRemoval("hidden", confirmationStep);
  const manualConfigButton = confirmationStep.querySelector(
    "#manualConfiguration"
  );
  EventUtils.synthesizeMouseAtCenter(manualConfigButton, {});
  const incomingConfigStep = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );
  await BrowserTestUtils.waitForAttributeRemoval("hidden", incomingConfigStep);
  Assert.equal(
    incomingConfigStep.querySelector("#incomingHostname").value,
    ".exchange.test",
    "The incoming hostname should be the domain with a period at the beginning"
  );
  Assert.equal(
    incomingConfigStep.querySelector("#incomingAuthMethod").value,
    "0",
    "The auth method should be Autodetect"
  );
  Assert.equal(
    incomingConfigStep.querySelector("#incomingUsername").value,
    "testExchange@exchange.test",
    "The username input should have the email that was submitted"
  );

  Services.logins.removeAllLogins();
  await subtest_close_account_hub_dialog(dialog, incomingConfigStep);
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
