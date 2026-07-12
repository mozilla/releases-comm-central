/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { CreateInBackend } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/CreateInBackend.sys.mjs"
);
const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_setup(function () {
  do_get_profile();
});

add_task(function test_applyCustomOauthSettingsToExchangeServer() {
  const incomingServer = MailServices.accounts.createIncomingServer(
    "test@example.com",
    "outlook.office365.com",
    "ews"
  );

  try {
    CreateInBackend.applyExchangeOAuthSettings(incomingServer, {
      type: "ews",
      oauthSettings: {
        useCustomDetails: true,
        tenant: "test-tenant",
        clientId: "test-client-id",
      },
    });

    const exchangeServer = incomingServer.QueryInterface(
      Ci.IExchangeIncomingServer
    );
    Assert.ok(
      exchangeServer.exchangeOverrideOAuthDetails,
      "Exchange OAuth overrides should be enabled"
    );
    Assert.equal(
      exchangeServer.exchangeTenantId,
      "test-tenant",
      "Exchange tenant should be saved"
    );
    Assert.equal(
      exchangeServer.exchangeApplicationId,
      "test-client-id",
      "Exchange application ID should be saved"
    );
  } finally {
    MailServices.accounts.removeIncomingServer(incomingServer, true);
  }
});

add_task(async function test_createExchangeAccountWithCustomOAuthSettings() {
  const existingOutgoingServerKeys = new Set(
    MailServices.outgoingServer.servers.map(server => server.key)
  );
  const config = new AccountConfig();
  config.source = AccountConfig.kSourceUser;
  config.displayName = "Test User";
  config.identity.emailAddress = "test@example.com";
  config.identity.realname = "Test User";
  config.incoming.type = "ews";
  config.incoming.hostname = "outlook.office365.com";
  config.incoming.port = 443;
  config.incoming.socketType = Ci.nsMsgSocketType.SSL;
  config.incoming.auth = Ci.nsMsgAuthMethod.OAuth2;
  config.incoming.username = "test@example.com";
  config.incoming.exchangeURL =
    "https://outlook.office365.com/EWS/Exchange.asmx";
  config.incoming.oauthSettings = {
    useCustomDetails: true,
    tenant: "test-tenant",
    clientId: "test-client-id",
  };

  const account = await CreateInBackend.createAccountInBackend(config);

  try {
    Assert.equal(
      account.incomingServer.type,
      "ews",
      "Should create an EWS incoming server"
    );
    Assert.equal(
      account.incomingServer.authMethod,
      Ci.nsMsgAuthMethod.OAuth2,
      "Should create the Exchange account with OAuth2 authentication"
    );
    Assert.equal(
      account.incomingServer.getStringValue("ews_url"),
      "https://outlook.office365.com/EWS/Exchange.asmx",
      "Should store the Exchange URL"
    );

    const exchangeServer = account.incomingServer.QueryInterface(
      Ci.IExchangeIncomingServer
    );
    Assert.ok(
      exchangeServer.exchangeOverrideOAuthDetails,
      "Exchange OAuth overrides should be enabled on the created account"
    );
    Assert.equal(
      exchangeServer.exchangeTenantId,
      "test-tenant",
      "Exchange tenant should be saved on the created account"
    );
    Assert.equal(
      exchangeServer.exchangeApplicationId,
      "test-client-id",
      "Exchange application ID should be saved on the created account"
    );
  } finally {
    MailServices.accounts.removeAccount(account, true);
    for (const outgoingServer of Array.from(
      MailServices.outgoingServer.servers
    )) {
      if (!existingOutgoingServerKeys.has(outgoingServer.key)) {
        MailServices.outgoingServer.deleteServer(outgoingServer);
      }
    }
  }
});
