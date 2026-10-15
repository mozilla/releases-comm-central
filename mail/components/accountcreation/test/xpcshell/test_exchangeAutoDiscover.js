/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);
var { fetchConfigFromExchange, getAddonsList } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/ExchangeAutoDiscover.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { HttpsProxy } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/HttpsProxy.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

const ADDONS_JSON_URL_PREF = "mailnews.auto_config.addons_url";

add_setup(() => {
  do_get_profile();
});

add_task(async function test_getAddonsList_withoutExchangeConfig() {
  const abortController = new AbortController();
  const config = new AccountConfig();

  const resultConfig = await getAddonsList(config, abortController.signal);

  Assert.strictEqual(
    resultConfig,
    config,
    "It should modify the config that was passed in"
  );
  Assert.equal(config.addons, undefined, "Should not add any addons info");
});

add_task(async function test_getAddonsList() {
  using server = new DisposableServer();
  Services.prefs.setCharPref(ADDONS_JSON_URL_PREF, server.getURL());
  const abortController = new AbortController();
  const initiallyRequestedLocales = Services.locale.requestedLocales;
  Services.locale.requestedLocales = ["en-US"];

  const resultConfig = await getAddonsList(
    getExchangeConfig(),
    abortController.signal
  );

  Assert.deepEqual(
    resultConfig.addons,
    [
      {
        id: "test@example.com",
        minVersion: "0.0.1",
        xpiURL: "https://localhost/extension.xpi",
        websiteURL: "https://example.com/",
        icon32: "https://localhost/favicon.png",
        supportedTypes: [
          {
            generalType: "exchange",
            protocolType: "ews",
            addonAccountType: "test-ews",
          },
        ],
        name: "Test (en-US)",
        description: "Test extension (en-US)",
        useType: {
          generalType: "exchange",
          protocolType: "ews",
          addonAccountType: "test-ews",
        },
      },
      {
        id: "weirdLanguage@example.com",
        minVersion: "0.0.1",
        xpiURL: "https://localhost/otherExtension.xpi",
        websiteURL: "https://example.com/",
        icon32: null,
        supportedTypes: [
          {
            generalType: "exchange",
            protocolType: "ews",
            addonAccountType: "other-ews",
          },
        ],
        name: "███████████",
        description: "███████████",
        useType: {
          generalType: "exchange",
          protocolType: "ews",
          addonAccountType: "other-ews",
        },
      },
    ],
    "Should extract the matching extensions with appropriate names and descriptions."
  );

  Services.prefs.clearUserPref(ADDONS_JSON_URL_PREF);
  Services.locale.requestedLocales = initiallyRequestedLocales;
});

add_task(async function test_getAddonsList_noURL() {
  Services.prefs.setCharPref(ADDONS_JSON_URL_PREF, "");
  const abortController = new AbortController();

  await Assert.rejects(
    getAddonsList(getExchangeConfig(), abortController.signal),
    error =>
      Error.isError(error) &&
      error.message == "no URL for addons list configured",
    "Should reject if the addons list URL pref is empty"
  );

  Services.prefs.clearUserPref(ADDONS_JSON_URL_PREF);
});

add_task(async function test_getAddonsList_noAddons() {
  using server = new DisposableServer();
  Services.prefs.setCharPref(ADDONS_JSON_URL_PREF, server.getURL());
  const abortController = new AbortController();
  const config = new AccountConfig();
  config.incoming.type = "exchange";
  // Not setting the endpoint URL, so no extension will match.

  await Assert.rejects(
    getAddonsList(config, abortController.signal),
    error =>
      Error.isError(error) &&
      error.message == "Config found, but no addons known to handle the config",
    "Should reject because no add-ons got associated with the config"
  );
  Assert.equal(
    config.addons,
    undefined,
    "Config should not have an addons key still"
  );

  Services.prefs.clearUserPref(ADDONS_JSON_URL_PREF);
});

add_task(async function test_getAddonsList_abort() {
  using server = new DisposableServer();
  Services.prefs.setCharPref(ADDONS_JSON_URL_PREF, server.getURL());
  const abortController = new AbortController();
  const abortError = new Error("test abort");
  abortController.abort(abortError);

  await Assert.rejects(
    getAddonsList(getExchangeConfig(), abortController.signal),
    error => error === abortError,
    "Should reject with the abort error"
  );

  Services.prefs.clearUserPref(ADDONS_JSON_URL_PREF);
});

/**
 * @param {string} redirectAddr - The address to redirect to.
 * @returns {string} An AutoDiscover response redirecting to the address.
 */
function redirectAddrResponse(redirectAddr) {
  return `<?xml version="1.0" encoding="utf-8"?>
    <Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006">
      <Response xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a">
        <Account>
          <Action>redirectAddr</Action>
          <RedirectAddr>${redirectAddr}</RedirectAddr>
        </Account>
      </Response>
    </Autodiscover>`;
}

add_task(async function test_fetchConfigFromExchange_redirectAddr() {
  // Set up https://autodiscover.exchange.test/autodiscover/autodiscover.xml to
  // redirect the alias address to the real one.
  Services.prefs.setBoolPref(
    "mailnews.auto_config.fetchFromExchange.enabled",
    true
  );

  const password = "hunter2";
  const alias = "alias@exchange.test";
  const user = "testExchange@exchange.test";
  const basicAuth = btoa(`${alias}:${password}`);
  const autodiscoverResponse = await IOUtils.readUTF8(
    do_get_file("data/exchange.test.xml").path
  );
  let requestedAddresses = [];

  const server = new HttpServer();
  server.start(-1);
  const secureProxy = await HttpsProxy.create(
    server.identity.primaryPort,
    "autodiscover.exchange.test",
    "autodiscover.exchange.test"
  );
  server.identity.add("https", "autodiscover.exchange.test", 443);
  server.registerPathHandler(
    "/autodiscover/autodiscover.xml",
    (request, response) => {
      response.setHeader("Cache-Control", "private");
      if (request.getHeader("Authorization") != `Basic ${basicAuth}`) {
        response.setStatusLine(request.httpVersion, 401, "Unauthorized");
        return;
      }
      const body = NetUtil.readInputStreamToString(
        request.bodyInputStream,
        request.bodyInputStream.available()
      );
      const address = body.match(/<EMailAddress>(.*)<\/EMailAddress>/)[1];
      requestedAddresses.push(address.toLowerCase());
      response.setStatusLine(request.httpVersion, 200, "OK");
      response.setHeader("Content-Type", "application/xml");
      response.write(
        address == alias ? redirectAddrResponse(user) : autodiscoverResponse
      );
    }
  );

  try {
    // Check more than twice, so that earlier redirects don't count.
    for (let i = 0; i < 3; i++) {
      requestedAddresses = [];
      const config = await fetchConfigFromExchange(
        "exchange.test",
        alias,
        new AbortController().signal,
        null,
        password,
        () => Promise.reject(new Error("No confirmation expected"))
      );

      Assert.ok(config, "Should get a config for the redirected address");
      Assert.ok(
        requestedAddresses.includes(alias) &&
          requestedAddresses.includes(user.toLowerCase()),
        "Should request the config for the alias, then for the redirected address"
      );
      Services.cache2.clear();
    }
  } finally {
    secureProxy.destroy();
    server.stop();
    Services.prefs.clearUserPref(
      "mailnews.auto_config.fetchFromExchange.enabled"
    );
  }
});

/**
 * Test that the lookup for a RedirectAddr address can't ask the user about
 * another host than the one the original lookup already asked about.
 */
add_task(
  async function test_fetchConfigFromExchange_redirectAddrSharesConfirmation() {
    Services.prefs.setBoolPref(
      "mailnews.auto_config.fetchFromExchange.enabled",
      true
    );

    const alias = "alias@exchange.test";
    // Plain HTTP lookups get redirected to a different host for each domain.
    const httpRedirects = {
      "autodiscover.exchange.test": "dav.test",
      "autodiscover.other.test": "caldav.test",
    };

    const plainServer = new HttpServer();
    plainServer.start(-1);
    for (const host of Object.keys(httpRedirects)) {
      NetworkTestUtils.configureProxy(
        host,
        80,
        plainServer.identity.primaryPort
      );
      plainServer.identity.add("http", host, 80);
    }
    plainServer.registerPathHandler(
      "/autodiscover/autodiscover.xml",
      (request, response) => {
        response.setStatusLine(request.httpVersion, 301, "Moved Permanently");
        response.setHeader(
          "Location",
          `https://${httpRedirects[request.host]}/autodiscover/autodiscover.xml`
        );
      }
    );

    const server = new HttpServer();
    server.start(-1);
    const secureProxy = await HttpsProxy.create(
      server.identity.primaryPort,
      "autodiscover.exchange.test",
      "autodiscover.exchange.test"
    );
    server.identity.add("https", "autodiscover.exchange.test", 443);
    server.registerPathHandler(
      "/autodiscover/autodiscover.xml",
      (request, response) => {
        response.setHeader("Cache-Control", "private");
        // Answer after the HTTP lookup has asked about its redirect target.
        response.processAsync();
        do_timeout(3000, () => {
          response.setStatusLine(request.httpVersion, 200, "OK");
          response.setHeader("Content-Type", "application/xml");
          response.write(redirectAddrResponse("user@other.test"));
          response.finish();
        });
      }
    );

    const redirectTargets = new HttpServer();
    redirectTargets.start(-1);
    const redirectTargetProxies = [];
    for (const host of Object.values(httpRedirects)) {
      redirectTargets.identity.add("https", host, 443);
      redirectTargetProxies.push(
        await HttpsProxy.create(
          redirectTargets.identity.primaryPort,
          "dav",
          host
        )
      );
    }

    try {
      const confirmedHosts = [];
      await Assert.rejects(
        fetchConfigFromExchange(
          "exchange.test",
          alias,
          new AbortController().signal,
          null,
          "hunter2",
          host => {
            confirmedHosts.push(host);
            return Promise.reject(new Error("Not confirmed"));
          }
        ),
        error => error.name == "AggregateError",
        "the lookup should fail without a confirmed redirect"
      );
      Assert.deepEqual(
        confirmedHosts,
        ["dav.test"],
        "the user should only be asked about one host"
      );
    } finally {
      for (const proxy of redirectTargetProxies) {
        proxy.destroy();
      }
      redirectTargets.stop();
      secureProxy.destroy();
      for (const host of Object.keys(httpRedirects)) {
        NetworkTestUtils.unconfigureProxy(host, 80);
      }
      plainServer.stop();
      server.stop();
      Services.cache2.clear();
      Services.prefs.clearUserPref(
        "mailnews.auto_config.fetchFromExchange.enabled"
      );
    }
  }
);

function getExchangeConfig() {
  const config = new AccountConfig();
  config.incoming.type = "exchange";
  config.incoming.exchangeURL = "https://localhost/exchange";
  return config;
}

class DisposableServer {
  constructor() {
    this.server = new HttpServer();
    this.server.start(-1);
    this.server.registerFile("/addons.json", do_get_file("data/addons.json"));
  }

  getURL() {
    return `http://localhost:${this.server.identity.primaryPort}/addons.json`;
  }

  [Symbol.dispose]() {
    info(`Disposing server at localhost:${this.server.identity.primaryPort}`);
    this.server.stop();
  }
}
