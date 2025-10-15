/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the Find Config module functions. test_fetchConfig tests the network
 * calls already, so just testing the config result.
 */

const { FindConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FindConfig.sys.mjs"
);

const { AccountCreationUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

const { HttpsProxy } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/HttpsProxy.sys.mjs"
);

const { Abortable, SuccessiveAbortable } = AccountCreationUtils;

let server;

add_setup(async function () {
  do_get_profile();
  server = new HttpServer();
  server.start(-1);
  await Services.logins.initializationPromise;
});

registerCleanupFunction(function () {
  server.stop();
  NetworkTestUtils.clearProxy();
  Services.prefs.clearUserPref("mailnews.auto_config_url");
});

add_task(async function testFindConfigFound() {
  // Set up a configuration file at
  // http://autoconfig.imap.test/mail/config-v1.1.xml.

  NetworkTestUtils.configureProxy(
    "autoconfig.imap.test",
    80,
    server.identity.primaryPort
  );
  server.identity.add("http", "autoconfig.imap.test", 80);
  server.registerFile(
    "/mail/config-v1.1.xml",
    do_get_file("data/basic.imap.test.xml")
  );

  const abortable = new SuccessiveAbortable();
  const discoveryStream = FindConfig.parallelAutoDiscovery(
    abortable,
    "imap.test",
    "yamatoo.nadeshiko@imap.test"
  );

  const { value: config } = await discoveryStream.next();

  Assert.equal(
    config.incoming.type,
    "imap",
    "Test email should return incoming configuration type imap."
  );
  Assert.equal(
    config.outgoing.type,
    "smtp",
    "Test email should return outgoing configuration type smtp."
  );
  Assert.equal(
    config.incomingAlternatives.length,
    0,
    "IMAP test email should have no incoming alternatives."
  );

  // Clean up.
  NetworkTestUtils.unconfigureProxy("autoconfig.imap.test", 80);
  server.identity.remove("http", "autoconfig.imap.test", 80);
  server.registerFile("/mail/config-v1.1.xml", null);
  Services.cache2.clear();
});

add_task(async function testFindConfigNotFound() {
  // Set up a configuration file at
  // http://autoconfig.imap.test/mail/config-v1.1.xml.

  NetworkTestUtils.configureProxy(
    "autoconfig.imap.test",
    80,
    server.identity.primaryPort
  );
  server.identity.add("http", "autoconfig.imap.test", 80);
  server.registerFile(
    "/mail/config-v1.1.xml",
    do_get_file("data/basic.imap.test.xml")
  );

  const abortable = new SuccessiveAbortable();
  const discoveryStream = FindConfig.parallelAutoDiscovery(
    abortable,
    "imap.testtt",
    "yamatoo.nadeshiko@imap.testtt"
  );

  const { value: config } = await discoveryStream.next();

  Assert.equal(
    config,
    null,
    "parallelAutoDiscovery should return null for an invalid email address."
  );

  // Clean up.
  NetworkTestUtils.unconfigureProxy("autoconfig.imap.test", 80);
  server.identity.remove("http", "autoconfig.imap.test", 80);
  server.registerFile("/mail/config-v1.1.xml", null);
  Services.cache2.clear();
});

add_task(async function testFindConfigExchange() {
  // Set up a configuration file at
  // http://exchange.test/autodiscover/autodiscover.xml"

  Services.prefs.setBoolPref(
    "mailnews.auto_config.fetchFromExchange.enabled",
    true
  );

  NetworkTestUtils.configureProxy(
    "autodiscover.exchange.test",
    80,
    server.identity.primaryPort
  );
  server.identity.add("http", "autodiscover.exchange.test", 80);
  server.registerFile(
    "/autodiscover/autodiscover.xml",
    do_get_file("data/exchange.test.xml")
  );

  const abortable = new SuccessiveAbortable();
  const discoveryStream = await FindConfig.parallelAutoDiscovery(
    abortable,
    "exchange.test",
    "testExchange@exchange.test"
  );

  const { value: config } = await discoveryStream.next();

  Assert.equal(
    config.incoming.type,
    "exchange",
    "Test email should return incoming configuration type exchange."
  );

  Assert.equal(
    config.incomingAlternatives.length,
    1,
    "Exchange test email should have a incoming alternative."
  );

  Assert.equal(
    config.incomingAlternatives[0].type,
    "exchange",
    "Exchange test email should have an exchange type incoming alternative."
  );

  // Clean up.
  NetworkTestUtils.unconfigureProxy("autodiscover.exchange.test", 80);
  server.identity.remove("http", "autodiscover.exchange.test", 80);
  server.registerFile("/autodiscover/autodiscover.xml", null);
  Services.cache2.clear();
  Services.prefs.clearUserPref(
    "mailnews.auto_config.fetchFromExchange.enabled"
  );
});

add_task(async function testFindConfigExchangeAuthRequired() {
  // Set up a configuration file at
  // https://exchange.test/autodiscover/autodiscover.xml"
  // We need https, since that's the only way authorization is sent.
  Services.prefs.setBoolPref(
    "mailnews.auto_config.fetchFromExchange.enabled",
    true
  );

  const secureAutodiscover = await HttpsProxy.create(
    server.identity.primaryPort,
    "autodiscover.exchange.test",
    "autodiscover.exchange.test"
  );
  const password = "hunter2";
  const user = "testExchange@exchange.test";
  const basicAuth = btoa(
    String.fromCharCode(...new TextEncoder().encode(`${user}:${password}`))
  );
  const autodiscoverResponse = await IOUtils.readUTF8(
    do_get_file("data/exchange.test.xml").path
  );
  let expectSuccess = false;
  server.identity.add("https", "autodiscover.exchange.test", 443);
  server.registerPathHandler(
    "/autodiscover/autodiscover.xml",
    (request, response) => {
      response.setHeader("Cache-Control", "private");
      if (
        !request.hasHeader("Authorization") ||
        request.getHeader("Authorization") != `Basic ${basicAuth}`
      ) {
        response.setStatusLine(request.httpVersion, 401, "Unauthorized");
        response.setHeader("WWW-Authenticate", 'Basic Realm=""');
        Assert.ok(
          !expectSuccess,
          "Autodiscover request with missing or incorrect authorization should fail"
        );
        return;
      }
      response.setStatusLine(request.httpVersion, 200, "OK");
      response.setHeader("Content-Type", "application/xml");
      response.write(autodiscoverResponse);
      Assert.ok(expectSuccess, "Autodiscover request should be authenticated");
    }
  );

  let abortable = new SuccessiveAbortable();
  await Assert.rejects(
    FindConfig.parallelAutoDiscovery(abortable, "exchange.test", user).next(),
    error =>
      error.message === "Exchange auth error" &&
      error.cause.fluentTitleId === "account-setup-credentials-wrong",
    "Should reject with an exchange credentials specific error"
  );

  expectSuccess = true;
  abortable = new SuccessiveAbortable();
  const discoveryStream = FindConfig.parallelAutoDiscovery(
    abortable,
    "exchange.test",
    user,
    password
  );

  const { value: config } = await discoveryStream.next();

  Assert.ok(config, "Should get a config with password");

  // Clean up.
  secureAutodiscover.destroy();
  server.identity.remove("https", "autodiscover.exchange.test", 443);
  server.registerFile("/autodiscover/autodiscover.xml", null);
  Services.cache2.clear();
  Services.prefs.clearUserPref(
    "mailnews.auto_config.fetchFromExchange.enabled"
  );
});

add_task(async function testFindConfigExchangeWithUsername() {
  // Set up a configuration file at
  // https://exchange.test/autodiscover/autodiscover.xml"
  // We need https, since that's the only way authorization is sent.
  Services.prefs.setBoolPref(
    "mailnews.auto_config.fetchFromExchange.enabled",
    true
  );

  const secureAutodiscover = await HttpsProxy.create(
    server.identity.primaryPort,
    "autodiscover.exchange.test",
    "autodiscover.exchange.test"
  );
  const password = "hunter2";
  const user = "CrashOverride";
  const basicAuth = btoa(
    String.fromCharCode(...new TextEncoder().encode(`${user}:${password}`))
  );
  const autodiscoverResponse = await IOUtils.readUTF8(
    do_get_file("data/exchange.test.xml").path
  );
  let expectSuccess = false;
  server.identity.add("https", "autodiscover.exchange.test", 443);
  server.registerPathHandler(
    "/autodiscover/autodiscover.xml",
    (request, response) => {
      response.setHeader("Cache-Control", "private");
      if (
        !request.hasHeader("Authorization") ||
        request.getHeader("Authorization") != `Basic ${basicAuth}`
      ) {
        response.setStatusLine(request.httpVersion, 401, "Unauthorized");
        response.setHeader("WWW-Authenticate", 'Basic Realm=""');
        Assert.ok(
          !expectSuccess,
          "Autodiscover request with missing or incorrect authorization should fail"
        );
        return;
      }
      response.setStatusLine(request.httpVersion, 200, "OK");
      response.setHeader("Content-Type", "application/xml");
      response.write(autodiscoverResponse);
      Assert.ok(expectSuccess, "Autodiscover request should be authenticated");
    }
  );

  const abortable = new SuccessiveAbortable();

  await Assert.rejects(
    FindConfig.parallelAutoDiscovery(
      abortable,
      "exchange.test",
      "testExchange@exchange.test",
      password
    ).next(),
    error =>
      error.message === "Exchange auth error" &&
      error.cause.fluentTitleId === "account-setup-credentials-wrong",
    "Should reject with an exchange credentials specific error"
  );

  expectSuccess = true;
  const discoveryStream = FindConfig.parallelAutoDiscovery(
    abortable,
    "exchange.test",
    "testExchange@exchange.test",
    password,
    user
  );

  const { value: config } = await discoveryStream.next();

  Assert.ok(config, "Should get a config with password and separate username");

  // Clean up.
  secureAutodiscover.destroy();
  server.identity.remove("https", "autodiscover.exchange.test", 443);
  server.registerFile("/autodiscover/autodiscover.xml", null);
  Services.cache2.clear();
  Services.prefs.clearUserPref(
    "mailnews.auto_config.fetchFromExchange.enabled"
  );
});

add_task(function testEWSifyConfig() {
  Services.prefs.setBoolPref(
    "mailnews.auto_config.fetchFromExchange.enabled",
    true
  );

  const exchangeConfig = {
    incoming: {},
    incomingAlternatives: [
      {
        type: "exchange",
        hostname: "outlook.office365.com",
        useGlobalPreferredServer: false,
        oauthSettings: {
          issuer: "outlook.office365.com",
          scope: "https://outlook.office365.com/owa/exchange.test/",
        },
        handlesOutgoing: false,
      },
    ],
  };

  FindConfig.ewsifyConfig(exchangeConfig);
  const ewsConfigAlternative = [
    exchangeConfig.incoming,
    ...exchangeConfig.incomingAlternatives,
  ].find(({ type }) => type === "ews");

  Assert.ok(
    !ewsConfigAlternative.useGlobalPreferredServer,
    "useGlobalPreferredServer should be false for ews config."
  );

  Assert.ok(
    ewsConfigAlternative.handlesOutgoing,
    "handlesOutgoing should be true for ews config."
  );

  Assert.equal(
    ewsConfigAlternative.oauthSettings.issuer,
    "outlook.office365.com",
    "EWS oauthsettings issuer should be updated."
  );

  Assert.ok(
    ewsConfigAlternative.oauthSettings.scope.includes(
      "https://outlook.office365.com/owa/exchange.test/"
    ),
    "EWS oauthsettings scope should include EWS.AccessAsUser.All"
  );

  Services.prefs.clearUserPref(
    "mailnews.auto_config.fetchFromExchange.enabled"
  );
});
