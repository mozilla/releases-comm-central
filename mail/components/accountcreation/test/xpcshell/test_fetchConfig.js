/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the FetchConfig module, getting a configuration file from the local
 * `isp` directory, the ISP's server, or the autoconfig service server, and
 * reading that file.
 */

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);
const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");
const { FetchConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FetchConfig.sys.mjs"
);

const { fetchHTTP } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FetchHTTP.sys.mjs"
);
const { JXON } = ChromeUtils.importESModule("resource:///modules/JXON.sys.mjs");

const { HttpsProxy } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/HttpsProxy.sys.mjs"
);

// Save original references so we can restore them at the end of the test
const _mx = DNS.mx;

let server;

add_setup(function () {
  do_get_profile();
  server = new HttpServer();
  server.start(-1);
});

registerCleanupFunction(function () {
  server.stop();
  NetworkTestUtils.clearProxy();
  Services.prefs.clearUserPref("mailnews.auto_config_url");
  DNS.mx = _mx;
});

/**
 * Tests reading the configuration from a packaged XML file.
 */
add_task(async function testFetchConfigFromDisk() {
  const kXMLFile = "example.com.xml";

  // Copy the xml file into place
  const file = do_get_file("data/" + kXMLFile);

  const copyLocation = Services.dirsvc.get("CurProcD", Ci.nsIFile);
  copyLocation.append("isp");
  file.copyTo(copyLocation, kXMLFile);

  registerCleanupFunction(function () {
    // Remove the test config file
    copyLocation.append(kXMLFile);
    copyLocation.remove(false);
  });

  // Now run the actual test.
  const abortController = new AbortController();
  const config = await FetchConfig.fromDisk(
    "example.com",
    abortController.signal
  );

  // Check that we got the expected config.
  AccountConfig.replaceVariables(
    config,
    "Yamato Nadeshiko",
    "yamato.nadeshiko@example.com",
    "abc12345"
  );

  Assert.equal(config.incoming.username, "yamato.nadeshiko");
  Assert.equal(config.incoming.hostname, "pop.example.com");
  Assert.equal(config.outgoing.username, "yamato.nadeshiko@example.com");
  Assert.equal(config.outgoing.hostname, "smtp.example.com");
  Assert.equal(config.identity.realname, "Yamato Nadeshiko");
  Assert.equal(config.identity.emailAddress, "yamato.nadeshiko@example.com");
  Assert.equal(config.subSource, "xml-from-disk");
});

/**
 * Tests reading the configuration from well-known locations on the provider's
 * servers. HTTPS connections can't be tested but they use the same mechanisms.
 */
add_task(async function testFetchConfigFromISP() {
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

  // Fetch the configuration file.

  const abortController = new AbortController();
  let config = await FetchConfig.fromISP(
    "test.test",
    "yamato.nadeshiko@test.test",
    abortController.signal
  );

  AccountConfig.replaceVariables(
    config,
    "Yamato Nadeshiko",
    "yamato.nadeshiko@test.test",
    "abc12345"
  );

  // Check that we got the expected config.

  Assert.equal(config.incoming.username, "yamato.nadeshiko");
  Assert.equal(config.incoming.hostname, "mail.test.test");
  Assert.equal(config.incoming.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(config.outgoing.username, "yamato.nadeshiko");
  Assert.equal(config.outgoing.hostname, "mail.test.test");
  Assert.equal(config.outgoing.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(config.identity.realname, "Yamato Nadeshiko");
  Assert.equal(config.identity.emailAddress, "yamato.nadeshiko@test.test");
  Assert.equal(config.subSource, "xml-from-isp-http");

  // Remove the first configuration and clear the cache.

  NetworkTestUtils.unconfigureProxy("autoconfig.test.test", 80);
  server.identity.remove("http", "autoconfig.test.test", 80);
  server.registerFile("/mail/config-v1.1.xml", null);
  Services.cache2.clear();

  // Set up a second configuration file at
  // http://test.test/.well-known/autoconfig/mail/config-v1.1.xml.

  server.identity.add("http", "test.test", 80);
  server.registerFile(
    "/.well-known/autoconfig/mail/config-v1.1.xml",
    do_get_file("data/pop.test.test.xml")
  );
  NetworkTestUtils.configureProxy("test.test", 80, server.identity.primaryPort);

  // Fetch the configuration file.

  config = await FetchConfig.fromISP(
    "test.test",
    "yamato.nadeshiko@test.test",
    abortController.signal
  );

  AccountConfig.replaceVariables(
    config,
    "Yamato Nadeshiko",
    "yamato.nadeshiko@test.test",
    "abc12345"
  );

  // Check that we got the expected config.

  Assert.equal(config.incoming.username, "yamato.nadeshiko");
  Assert.equal(config.incoming.hostname, "pop.test.test");
  Assert.equal(config.incoming.socketType, Ci.nsMsgSocketType.alwaysSTARTTLS);
  Assert.equal(config.outgoing.username, "yamato.nadeshiko@test.test");
  Assert.equal(config.outgoing.hostname, "smtp.test.test");
  Assert.equal(config.outgoing.socketType, Ci.nsMsgSocketType.alwaysSTARTTLS);
  Assert.equal(config.identity.realname, "Yamato Nadeshiko");
  Assert.equal(config.identity.emailAddress, "yamato.nadeshiko@test.test");
  Assert.equal(config.subSource, "xml-from-isp-http");

  // Clean up.

  server.identity.remove("http", "test.test", 80);
  server.registerFile("/.well-known/autoconfig/mail/config-v1.1.xml", null);
  NetworkTestUtils.unconfigureProxy("test.test", 80);
  Services.cache2.clear();
});

/**
 * Tests reading the configuration from the autoconfig service.
 */
add_task(async function testFetchConfigFromDB() {
  // Mock the autoconfig service server.

  server.identity.add("http", "autoconfig.server", 80);
  server.registerFile(
    "/autoconfig/1/test.test",
    do_get_file("data/imap.test.test.xml")
  );
  NetworkTestUtils.configureProxy(
    "autoconfig.server",
    80,
    server.identity.primaryPort
  );

  // Configure Thunderbird to use the mock server.

  Services.prefs.setCharPref(
    "mailnews.auto_config_url",
    "http://autoconfig.server/autoconfig/1/"
  );

  // Fetch the configuration file.

  const abortController = new AbortController();
  let config = await FetchConfig.fromDB("test.test", abortController.signal);

  AccountConfig.replaceVariables(
    config,
    "Yamato Nadeshiko",
    "yamato.nadeshiko@test.test",
    "abc12345"
  );

  // Check that we got the expected config.

  Assert.equal(config.incoming.username, "yamato.nadeshiko");
  Assert.equal(config.incoming.hostname, "mail.test.test");
  Assert.equal(config.incoming.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(config.outgoing.username, "yamato.nadeshiko");
  Assert.equal(config.outgoing.hostname, "mail.test.test");
  Assert.equal(config.outgoing.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(config.identity.realname, "Yamato Nadeshiko");
  Assert.equal(config.identity.emailAddress, "yamato.nadeshiko@test.test");
  Assert.equal(config.subSource, "xml-from-db");

  // Remove the first configuration and clear the cache.

  server.registerFile("/autoconfig/1/test.test", null);
  Services.cache2.clear();

  // Reconfigure the server and Thunderbird to use a different URL pattern.

  server.registerFile(
    "/autoconfig/2/test.test.xml",
    do_get_file("data/pop.test.test.xml")
  );

  Services.prefs.setCharPref(
    "mailnews.auto_config_url",
    "http://autoconfig.server/autoconfig/2/{{domain}}.xml"
  );

  // Fetch the configuration file.

  config = await FetchConfig.fromDB("test.test", abortController.signal);

  AccountConfig.replaceVariables(
    config,
    "Yamato Nadeshiko",
    "yamato.nadeshiko@test.test",
    "abc12345"
  );

  // Check that we got the expected config.

  Assert.equal(config.incoming.username, "yamato.nadeshiko");
  Assert.equal(config.incoming.hostname, "pop.test.test");
  Assert.equal(config.incoming.socketType, Ci.nsMsgSocketType.alwaysSTARTTLS);
  Assert.equal(config.outgoing.username, "yamato.nadeshiko@test.test");
  Assert.equal(config.outgoing.hostname, "smtp.test.test");
  Assert.equal(config.outgoing.socketType, Ci.nsMsgSocketType.alwaysSTARTTLS);
  Assert.equal(config.identity.realname, "Yamato Nadeshiko");
  Assert.equal(config.identity.emailAddress, "yamato.nadeshiko@test.test");
  Assert.equal(config.subSource, "xml-from-db");

  // Clean up.

  server.identity.remove("http", "autoconfig.server", 80);
  server.registerFile("/autoconfig/2/test.test.xml", null);
  NetworkTestUtils.unconfigureProxy("autoconfig.server", 80);
  Services.cache2.clear();
});

/**
 * Tests doing a DNS lookup before reading the configuration from the
 * autoconfig service.
 */
add_task(async function testFetchConfigForMX() {
  // Mock the autoconfig service server and point Thunderbird to it.

  server.identity.add("http", "autoconfig.server", 80);
  server.registerFile(
    "/autoconfig/2/test.test.xml",
    do_get_file("data/example.com.xml")
  );
  NetworkTestUtils.configureProxy(
    "autoconfig.server",
    80,
    server.identity.primaryPort
  );
  Services.prefs.setCharPref(
    "mailnews.auto_config_url",
    "http://autoconfig.server/autoconfig/2/{{domain}}.xml"
  );

  // Mock the DNS MX lookup method.

  DNS.mx = function (name) {
    Assert.equal(name, "example.com");
    return Promise.resolve([{ prio: 0, host: "test.test" }]);
  };

  // Fetch the configuration file.

  const abortController = new AbortController();
  let config = await FetchConfig.forMX(
    "example.com",
    "yamato.nadeshiko@example.com",
    abortController.signal
  );
  AccountConfig.replaceVariables(
    config,
    "Yamato Nadeshiko",
    "yamato.nadeshiko@example.com",
    "abc12345"
  );

  // Check that we got the expected config.

  Assert.equal(config.incoming.username, "yamato.nadeshiko");
  Assert.equal(config.incoming.hostname, "pop.example.com");
  Assert.equal(config.outgoing.username, "yamato.nadeshiko@example.com");
  Assert.equal(config.outgoing.hostname, "smtp.example.com");
  Assert.equal(config.identity.realname, "Yamato Nadeshiko");
  Assert.equal(config.identity.emailAddress, "yamato.nadeshiko@example.com");
  Assert.equal(config.subSource, "xml-from-db");

  // Reconfigure the server. This time Thunderbird will look up the hostname
  // with all of the subdomains except the first/ and this result has priority.

  server.registerFile(
    "/autoconfig/2/subdomains.of.test.test.xml",
    do_get_file("data/pop.test.test.xml")
  );

  // Mock the DNS MX lookup method.

  DNS.mx = function (name) {
    Assert.equal(name, "example.com");
    return Promise.resolve([{ prio: 0, host: "many.subdomains.of.test.test" }]);
  };

  // Fetch the configuration file.

  config = await FetchConfig.forMX(
    "example.com",
    "yamato.nadeshiko@example.com",
    abortController.signal
  );

  AccountConfig.replaceVariables(
    config,
    "Yamato Nadeshiko",
    "yamato.nadeshiko@example.com",
    "abc12345"
  );

  // Check that we got the expected config.

  Assert.equal(config.incoming.username, "yamato.nadeshiko");
  Assert.equal(config.incoming.hostname, "pop.test.test");
  Assert.equal(config.outgoing.username, "yamato.nadeshiko@example.com");
  Assert.equal(config.outgoing.hostname, "smtp.test.test");
  Assert.equal(config.identity.realname, "Yamato Nadeshiko");
  Assert.equal(config.identity.emailAddress, "yamato.nadeshiko@example.com");
  Assert.equal(config.subSource, "xml-from-db");

  // Clean up.

  NetworkTestUtils.unconfigureProxy("autoconfig.server", 80);
  server.identity.remove("http", "autoconfig.server", 80);
  server.registerFile("/autoconfig/2/test.test.xml", null);
  Services.cache2.clear();
});

/**
 * Tests doing a DNS MX lookup, then fetching the configuration from the
 * provider's autoconfig service.
 */
add_task(async function testFetchConfigFromProviderViaMX() {
  // Set fallback database URL
  Services.prefs.setCharPref(
    "mailnews.auto_config_url",
    "https://alt.test.test/{{domain}}"
  );

  const providerConfigServer = new HttpServer();
  const requests = [];
  providerConfigServer.start(-1);
  providerConfigServer.registerFile(
    "/mail/config-v1.1.xml",
    do_get_file("data/example.com.xml"),
    request => {
      requests.push(request);
    }
  );
  providerConfigServer.registerPathHandler(
    "/test.test",
    (request, response) => {
      requests.push(request);
      response.setStatusLine("1.1", 404, "Not Found");
      response.finish();
    }
  );
  providerConfigServer.identity.add("https", "test.test");
  providerConfigServer.identity.add("https", "alt.test.test");
  //TODO need a cert that starts with autoconfig.
  const secureProxy = await HttpsProxy.create(
    providerConfigServer.identity.primaryPort,
    "valid",
    "autoconfig.test.test"
  );
  const secureAltProxy = await HttpsProxy.create(
    providerConfigServer.identity.primaryPort,
    "valid",
    "alt.test.test"
  );

  // Mock DNS
  DNS.mx = function (name) {
    Assert.equal(name, "domain.test");
    return Promise.resolve([{ prio: 0, host: "mx.test.test" }]);
  };

  // Fetch the configuration file
  const abortController = new AbortController();
  const config = await FetchConfig.forMX(
    "domain.test",
    "user@domain.test",
    abortController.signal
  );

  AccountConfig.replaceVariables(
    config,
    "Full Name",
    "user@domain.test",
    "password"
  );

  // Check that we got the expected config
  Assert.equal(config.incoming.username, "user");
  Assert.equal(config.incoming.hostname, "pop.example.com");
  Assert.equal(config.outgoing.username, "user@domain.test");
  Assert.equal(config.outgoing.hostname, "smtp.example.com");
  Assert.equal(config.identity.realname, "Full Name");
  Assert.equal(config.identity.emailAddress, "user@domain.test");
  Assert.equal(config.subSource, "xml-from-isp-https");

  // Check the issued HTTP requests. We sort the arrays since the order of the
  // requests is not absolutely stable.
  Assert.deepEqual(
    requests
      .map(request => `${request.scheme}://${request.host}${request.path}`)
      .sort(),
    [
      "http://localhost/mail/config-v1.1.xml",
      "http://localhost/test.test",
    ].sort()
  );

  secureProxy.destroy();
  secureAltProxy.destroy();
  providerConfigServer.stop();
});

async function readFileToJxon(filename) {
  const fileContents = await IOUtils.readUTF8(do_get_file(filename).path);
  const domParser = new DOMParser();
  return JXON.build(domParser.parseFromString(fileContents, "text/xml"));
}
