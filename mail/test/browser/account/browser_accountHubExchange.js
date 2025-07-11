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

const PASSWORD = "hunter2";
const USER = "testExchange@exchange.test";
// Encoding matches what FetchHTTP.sys.mjs uses.
const BASIC_AUTH = btoa(
  String.fromCharCode(...new TextEncoder().encode(`${USER}:${PASSWORD}`))
);
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
let server;

add_setup(async () => {
  server = new HttpServer();
  server.start(-1);
  await Services.logins.initializationPromise;
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mailnews.auto_config.fetchFromExchange.enabled", true],
      ["experimental.mail.ews.enabled", true],
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
    baseOptions: { username: USER, password: PASSWORD },
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
  const emailUser = {
    name: "John Doe",
    email: USER,
    password: PASSWORD,
  };

  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const nameInput = emailTemplate.querySelector("#realName");
  const emailInput = emailTemplate.querySelector("#email");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  // Ensure fields are empty.
  nameInput.value = "";
  emailInput.value = "";

  EventUtils.synthesizeMouseAtCenter(nameInput, {});
  let inputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === emailUser.name
  );
  EventUtils.sendString(emailUser.name, window);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(emailInput, {});
  inputEvent = BrowserTestUtils.waitForEvent(
    emailInput,
    "input",
    false,
    event => event.target.value === emailUser.email
  );
  EventUtils.sendString(emailUser.email, window);
  await inputEvent;

  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for config found template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  info("Expecting password entry");
  const passwordStep = dialog.querySelector("email-password-form");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", passwordStep);

  info("Entering password");
  const passwordInput = passwordStep.querySelector("#password");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(passwordInput),
    "The password form input should be visible."
  );
  EventUtils.synthesizeMouseAtCenter(passwordInput, {});

  inputEvent = BrowserTestUtils.waitForEvent(
    passwordInput,
    "input",
    true,
    event => event.target.value === PASSWORD
  );
  EventUtils.sendString(PASSWORD);
  await inputEvent;
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
    "outlook.office365.com",
    "Should have host from autoconfig"
  );

  Assert.equal(
    configFoundTemplate.l10n.getAttributes(
      configFoundTemplate.querySelector("#incomingAuth")
    ).id,
    "account-setup-result-ssl",
    "Incoming auth should be expected auth"
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingUsername").textContent,
    USER,
    "Incoming username should be expected username"
  );

  const footerBack = dialog.querySelector("#emailFooter #back");

  info("Going back to start");
  EventUtils.synthesizeMouseAtCenter(footerBack, {});
  await BrowserTestUtils.waitForAttributeRemoval("hidden", emailTemplate);

  info("Searching for a config should still remember the password");
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await BrowserTestUtils.waitForAttributeRemoval("hidden", configFoundTemplate);

  Assert.ok(
    BrowserTestUtils.isVisible(ewsOption),
    "EWS should still be available as config"
  );

  Services.logins.removeAllLogins();
  await subtest_close_account_hub_dialog(dialog, configFoundTemplate);
});
