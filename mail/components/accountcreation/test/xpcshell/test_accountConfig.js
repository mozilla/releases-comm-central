/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

add_task(function test_isOauthOnly() {
  const config = new AccountConfig();

  Assert.ok(!config.isOauthOnly(), "Should initially not be oAuth only");

  config.incoming.auth = Ci.nsMsgAuthMethod.OAuth2;

  Assert.ok(
    !config.isOauthOnly(),
    "One of two servers should still not be oAuth only"
  );

  config.outgoing.auth = Ci.nsMsgAuthMethod.OAuth2;

  Assert.ok(
    config.isOauthOnly(),
    "When both incoming and outgoing use oauth, the config should be oAuth only"
  );

  const configIncomingHandlesOutgoing = new AccountConfig();
  configIncomingHandlesOutgoing.incoming.auth = Ci.nsMsgAuthMethod.OAuth2;
  configIncomingHandlesOutgoing.incoming.type = "ews";

  Assert.ok(
    configIncomingHandlesOutgoing.isOauthOnly(),
    "Config should be oAuth only."
  );
});

add_task(function test_isGssapiOnly() {
  const config = new AccountConfig();

  Assert.ok(!config.isGssapiOnly(), "Should initially not be GSSAPI only");

  config.incoming.auth = Ci.nsMsgAuthMethod.GSSAPI;

  Assert.ok(
    !config.isGssapiOnly(),
    "One of two servers should still not be GSSAPI only"
  );

  config.outgoing.auth = Ci.nsMsgAuthMethod.GSSAPI;

  Assert.ok(
    config.isGssapiOnly(),
    "When both incoming and outgoing use GSSAPI, the config should be GSSAPI only"
  );

  config.outgoing.auth = Ci.nsMsgAuthMethod.passwordCleartext;

  Assert.ok(
    !config.isGssapiOnly(),
    "GSSAPI incoming with password outgoing should not be GSSAPI only"
  );

  const configIncomingHandlesOutgoing = new AccountConfig();
  configIncomingHandlesOutgoing.incoming.auth = Ci.nsMsgAuthMethod.GSSAPI;
  configIncomingHandlesOutgoing.incoming.type = "ews";

  Assert.ok(
    configIncomingHandlesOutgoing.isGssapiOnly(),
    "Config should be GSSAPI only."
  );
});

add_task(function test_usesPasswordlessAuthentication() {
  const config = new AccountConfig();

  Assert.ok(
    !config.usesPasswordlessAuthentication(),
    "Should initially need password authentication"
  );

  config.incoming.auth = Ci.nsMsgAuthMethod.OAuth2;
  config.outgoing.auth = Ci.nsMsgAuthMethod.GSSAPI;

  Assert.ok(
    config.usesPasswordlessAuthentication(),
    "Mixed OAuth incoming and GSSAPI outgoing should not require a password"
  );

  config.incoming.auth = Ci.nsMsgAuthMethod.GSSAPI;
  config.outgoing.auth = Ci.nsMsgAuthMethod.OAuth2;

  Assert.ok(
    config.usesPasswordlessAuthentication(),
    "Mixed GSSAPI incoming and OAuth outgoing should not require a password"
  );

  config.incoming.auth = Ci.nsMsgAuthMethod.OAuth2;
  config.outgoing.auth = Ci.nsMsgAuthMethod.none;

  Assert.ok(
    config.usesPasswordlessAuthentication(),
    "OAuth incoming and no-auth outgoing should not require a password"
  );

  config.incoming.auth = Ci.nsMsgAuthMethod.none;
  config.outgoing.auth = Ci.nsMsgAuthMethod.none;

  Assert.ok(
    config.usesPasswordlessAuthentication(),
    "No-auth incoming and outgoing should not require a password"
  );

  config.incoming.auth = Ci.nsMsgAuthMethod.none;
  config.outgoing.auth = Ci.nsMsgAuthMethod.GSSAPI;

  Assert.ok(
    config.usesPasswordlessAuthentication(),
    "No-auth incoming and GSSAPI outgoing should not require a password"
  );

  config.incoming.auth = Ci.nsMsgAuthMethod.GSSAPI;
  config.outgoing.auth = Ci.nsMsgAuthMethod.passwordCleartext;

  Assert.ok(
    !config.usesPasswordlessAuthentication(),
    "GSSAPI incoming with password outgoing should require a password"
  );

  const configIncomingHandlesOutgoing = new AccountConfig();
  configIncomingHandlesOutgoing.incoming.auth = Ci.nsMsgAuthMethod.OAuth2;
  configIncomingHandlesOutgoing.incoming.type = "ews";

  Assert.ok(
    configIncomingHandlesOutgoing.usesPasswordlessAuthentication(),
    "Passwordless incoming with derived outgoing should not require a password."
  );
});

add_task(function test_configureOutgoingFromIncoming() {
  const imapConfig = new AccountConfig();
  imapConfig.incoming.type = "imap";
  Assert.ok(
    !imapConfig.configureOutgoingFromIncoming(),
    "IMAP should not use incoming settings for outgoing"
  );

  const ewsConfig = new AccountConfig();
  ewsConfig.incoming.type = "ews";
  Assert.ok(
    ewsConfig.configureOutgoingFromIncoming(),
    "EWS should use incoming settings for outgoing"
  );
});

add_task(function test_hasPassword() {
  const config = new AccountConfig();

  Assert.ok(!config.hasPassword(), "Empty config should not have a password");

  config.incoming.password = "hunter2";

  Assert.ok(
    config.hasPassword(),
    "Should report having a password with incoming password set"
  );

  config.outgoing.password = "hunter2";

  Assert.ok(
    config.hasPassword(),
    "Should still report having a password with both passwords set"
  );

  config.incoming.password = "";

  Assert.ok(
    config.hasPassword(),
    "Should report a password with only the outgoing password set"
  );
});

add_task(function test_isIncomingEditedComplete() {
  const config = new AccountConfig();

  config.incoming.type = "ews";
  config.incoming.exchangeURL = "https://example.com";
  config.incoming.username = "test";
  config.incoming.auth = 3;

  Assert.ok(
    config.isIncomingEditedComplete(),
    "Should have a complete incoming config for EWS"
  );

  config.incoming.type = "imap";

  Assert.ok(
    !config.isIncomingEditedComplete(),
    "Should have an incomplete config with EWS value for an IMAP config"
  );

  config.incoming.auth = 0;
  config.incoming.exchangeURL = null;
  config.incoming.hostname = "example.com";
  config.incoming.port = 443;

  Assert.ok(
    config.isIncomingEditedComplete(),
    "Should have a complete incoming config for IMAP"
  );

  config.incoming.type = "ews";

  Assert.ok(
    !config.isIncomingEditedComplete(),
    "Should be an incomplete incoming config with IMAP value but EWS type"
  );
});

add_task(function test_isExchangeConfig_graphDisabled() {
  Services.prefs.setBoolPref("mail.graph.enabled", false);
  const ewsConfig = new AccountConfig();
  ewsConfig.incoming.type = "ews";
  Assert.ok(
    ewsConfig.isExchangeConfig(),
    "Config with type `ews` should be Exchange."
  );

  const graphConfig = new AccountConfig();
  graphConfig.incoming.type = "graph";
  Assert.ok(
    !graphConfig.isExchangeConfig(),
    "Config with type `graph` should not be Exchange with graph disabled."
  );
  Services.prefs.setBoolPref("mail.graph.enabled", false);

  const imapConfig = new AccountConfig();
  imapConfig.incoming.type = "imap";
  Assert.ok(
    !imapConfig.isExchangeConfig(),
    "Config with type `imap` should not be Exchange."
  );
});

add_task(function test_isExchangeConfig_graphEnabled() {
  Services.prefs.setBoolPref("mail.graph.enabled", true);
  const ewsConfig = new AccountConfig();
  ewsConfig.incoming.type = "ews";
  Assert.ok(
    ewsConfig.isExchangeConfig(),
    "Config with type `ews` should be Exchange."
  );

  const graphConfig = new AccountConfig();
  graphConfig.incoming.type = "graph";
  Assert.ok(
    graphConfig.isExchangeConfig(),
    "Config with type `graph` should be Exchange."
  );
  Services.prefs.setBoolPref("mail.graph.enabled", false);

  const imapConfig = new AccountConfig();
  imapConfig.incoming.type = "imap";
  Assert.ok(
    !imapConfig.isExchangeConfig(),
    "Config with type `imap` should not be Exchange."
  );
});

add_task(function test_getConfiguredHost() {
  Services.prefs.setBoolPref("mail.graph.enabled", true);
  const ewsConfig = new AccountConfig();
  ewsConfig.incoming.type = "ews";
  ewsConfig.incoming.exchangeURL = "https://ews.example.com/EWS/Exchange.asmx";
  Assert.equal(
    ewsConfig.getConfiguredHost(),
    "ews.example.com",
    "EWS configured host should be derived from EWS URL."
  );

  const graphConfig = new AccountConfig();
  graphConfig.incoming.type = "graph";
  graphConfig.incoming.exchangeURL = "https://graph.example.com/v1.0";
  Assert.equal(
    graphConfig.getConfiguredHost(),
    "graph.example.com",
    "Graph configured host should be derived from Graph URL."
  );

  const imapConfig = new AccountConfig();
  imapConfig.incoming.type = "imap";
  imapConfig.incoming.hostname = "imap.example.com";
  Assert.equal(
    imapConfig.getConfiguredHost(),
    "imap.example.com",
    "IMAP configured host should be derived from incoming hostname."
  );
  Services.prefs.setBoolPref("mail.graph.enabled", false);
});
