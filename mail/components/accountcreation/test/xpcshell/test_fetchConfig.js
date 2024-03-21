/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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

const { AccountCreationUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);
const { FetchHTTP } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FetchHTTP.sys.mjs"
);
const { JXON } = ChromeUtils.importESModule("resource:///modules/JXON.sys.mjs");

const { Abortable, runAsync } = AccountCreationUtils;

// Save original references so we can restore them at the end of the test
const _mx = DNS.mx;
const _fetchHttpCreate = FetchHTTP.create;

let server;

add_setup(function () {
  server = new HttpServer();
  server.start(-1);
});

registerCleanupFunction(function () {
  server.stop();
  NetworkTestUtils.clearProxy();
  Services.prefs.clearUserPref("mailnews.auto_config_url");
  DNS.mx = _mx;
  FetchHTTP.create = _fetchHttpCreate;
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
  // Note we keep a global copy of this so that the abortable doesn't get
  // garbage collected before the async operation has finished.
  const { promise, resolve, reject } = Promise.withResolvers();
  // eslint-disable-next-line no-unused-vars
  const fetchConfigAbortable = FetchConfig.fromDisk(
    "example.com",
    resolve,
    reject
  );

  const config = await promise;
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

  let { promise, resolve, reject } = Promise.withResolvers();
  FetchConfig.fromISP(
    "test.test",
    "yamato.nadeshiko@test.test",
    resolve,
    reject
  );
  let config = await promise;

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

  ({ promise, resolve, reject } = Promise.withResolvers());
  FetchConfig.fromISP(
    "test.test",
    "yamato.nadeshiko@test.test",
    resolve,
    reject
  );
  config = await promise;

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

  let { promise, resolve, reject } = Promise.withResolvers();
  FetchConfig.fromDB("test.test", resolve, reject);
  let config = await promise;

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

  ({ promise, resolve, reject } = Promise.withResolvers());
  FetchConfig.fromDB("test.test", resolve, reject);
  config = await promise;

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

  let { promise, resolve, reject } = Promise.withResolvers();
  FetchConfig.forMX(
    "example.com",
    "yamato.nadeshiko@example.com",
    resolve,
    reject
  );
  let config = await promise;
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

  ({ promise, resolve, reject } = Promise.withResolvers());
  FetchConfig.forMX(
    "example.com",
    "yamato.nadeshiko@example.com",
    resolve,
    reject
  );
  config = await promise;

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
    "https://autoconfig.thunderbird.test/{{domain}}"
  );

  // Mock DNS
  DNS.mx = function (name) {
    Assert.equal(name, "domain.test");
    return Promise.resolve([{ prio: 0, host: "mx.provider.test" }]);
  };

  // Mock HTTP
  const mockManager = new MockFetchHttpManager();
  mockManager.addResponse(
    "https://autoconfig.provider.test/mail/config-v1.1.xml",
    await readFileToJxon("data/example.com.xml")
  );
  FetchHTTP.create = (url, args, successCallback, errorCallback) =>
    mockManager.createMock(url, successCallback, errorCallback);

  // Fetch the configuration file
  const { promise, resolve, reject } = Promise.withResolvers();
  FetchConfig.forMX("domain.test", "user@domain.test", resolve, reject);
  const config = await promise;

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

  // Check the issued HTTP requests
  Assert.deepEqual(mockManager.requests, [
    "https://autoconfig.provider.test/mail/config-v1.1.xml",
    "https://autoconfig.thunderbird.test/provider.test",
  ]);
});

async function readFileToJxon(filename) {
  const fileContents = await IOUtils.readUTF8(do_get_file(filename).path);
  const domParser = new DOMParser();
  return JXON.build(domParser.parseFromString(fileContents, "text/xml"));
}

/**
 * Can create `FetchHTTP`-like instances and records all HTTP requests made using them.
 */
class MockFetchHttpManager {
  responses = new Map();
  requests = [];

  addResponse(url, response) {
    this.responses.set(url, response);
  }

  recordRequest(url) {
    this.requests.push(url);
  }

  createMock(url, successCallback, errorCallback) {
    const response = this.responses.get(url);
    if (!response) {
      return new MockFetchHttp(
        this,
        url,
        new Error("No response configured"),
        errorCallback
      );
    }

    return new MockFetchHttp(this, url, response, successCallback);
  }
}

/**
 * "Implementation" of `FetchHTTP` that returns a canned response.
 *
 * Use via `MockFetchHttpManager`.
 */
class MockFetchHttp extends Abortable {
  constructor(manager, url, response, callback) {
    super();
    this.manager = manager;
    this.url = url;
    this.response = response;
    this.callback = callback;
  }

  start() {
    this.manager.recordRequest(this.url);
    runAsync(() => {
      this.callback(this.response);
    });
  }
}
