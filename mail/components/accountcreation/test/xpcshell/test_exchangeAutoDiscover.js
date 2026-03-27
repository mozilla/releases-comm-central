/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);
var { getAddonsList } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/ExchangeAutoDiscover.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const ADDONS_JSON_URL_PREF = "mailnews.auto_config.addons_url";

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
