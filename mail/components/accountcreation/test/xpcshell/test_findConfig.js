/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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

const { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");

const { FetchHTTP } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FetchHTTP.sys.mjs"
);

const { Abortable, SuccessiveAbortable } = AccountCreationUtils;

// Save original references so we can restore them at the end of the test.
const _mx = DNS.mx;
const _fetchHttpCreate = FetchHTTP.create;

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
  DNS.mx = _mx;
  FetchHTTP.create = _fetchHttpCreate;
});

add_task(async function testFindConfigFound() {
  // Set up a configuration file at
  // http://autoconfig.test.test/mail/config-v1.1.xml.

  NetworkTestUtils.configureProxy(
    "autoconfig.test.test",
    80,
    server.identity.primaryPort
  );
  server.identity.add("http", "autoconfig.test.test", 80);
  server.registerFile(
    "/mail/config-v1.1.xml",
    do_get_file("data/imap.test.test.xml")
  );

  const abortable = new SuccessiveAbortable();
  const config = await FindConfig.parallelAutoDiscovery(
    abortable,
    "test.test",
    "yamatoo.nadeshiko@test.test"
  );

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
  NetworkTestUtils.unconfigureProxy("autoconfig.test.test", 80);
  server.identity.remove("http", "autoconfig.test.test", 80);
  server.registerFile("/mail/config-v1.1.xml", null);
  Services.cache2.clear();
});

add_task(async function testFindConfigNotFound() {
  // Set up a configuration file at
  // http://autoconfig.test.test/mail/config-v1.1.xml.

  NetworkTestUtils.configureProxy(
    "autoconfig.test.test",
    80,
    server.identity.primaryPort
  );
  server.identity.add("http", "autoconfig.test.test", 80);
  server.registerFile(
    "/mail/config-v1.1.xml",
    do_get_file("data/imap.test.test.xml")
  );

  const abortable = new SuccessiveAbortable();
  const config = await FindConfig.parallelAutoDiscovery(
    abortable,
    "test.testtt",
    "yamatoo.nadeshiko@test.testtt"
  );

  Assert.equal(
    config,
    null,
    "parallelAutoDiscovery should return null for an invalid email address."
  );

  // Clean up.
  NetworkTestUtils.unconfigureProxy("autoconfig.test.test", 80);
  server.identity.remove("http", "autoconfig.test.test", 80);
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
  const config = await FindConfig.parallelAutoDiscovery(
    abortable,
    "exchange.test",
    "testExchange@exchange.test"
  );

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
