/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that calendar detection does not give the password to an HTTP proxy
 * that asks for authentication.
 */

var { detection } = ChromeUtils.importESModule(
  "resource:///modules/calendar/utils/calProviderDetectionUtils.sys.mjs"
);
var { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");
var { HttpServer } = ChromeUtils.importESModule("resource://testing-common/httpd.sys.mjs");

const USERNAME = "user";
const PASSWORD = "password";

let proxyServer;
const proxyAuthorizations = [];

add_setup(async () => {
  do_get_profile();

  proxyServer = new HttpServer();
  proxyServer.registerPrefixHandler("/", (request, response) => {
    proxyAuthorizations.push(
      request.hasHeader("Proxy-Authorization") ? request.getHeader("Proxy-Authorization") : null
    );
    response.setStatusLine(request.httpVersion, 407, "Proxy Authentication Required");
    response.setHeader("Proxy-Authenticate", `Basic realm="proxy"`, false);
  });
  proxyServer.identity.add("http", "example.org", 80);
  proxyServer.start(-1);

  Services.prefs.setStringPref("network.proxy.http", "localhost");
  Services.prefs.setIntPref("network.proxy.http_port", proxyServer.identity.primaryPort);
  Services.prefs.setStringPref("network.proxy.no_proxies_on", "");
  Services.prefs.setIntPref("network.proxy.type", 1);
  Services.prefs.setBoolPref(
    "network.auth.non-web-content-triggered-resources-http-auth-allow",
    true
  );

  const { mx, srv } = DNS;
  DNS.mx = async () => [];
  DNS.srv = async () => [];

  registerCleanupFunction(async () => {
    DNS.mx = mx;
    DNS.srv = srv;
    Services.prefs.clearUserPref("network.proxy.http");
    Services.prefs.clearUserPref("network.proxy.http_port");
    Services.prefs.clearUserPref("network.proxy.no_proxies_on");
    Services.prefs.clearUserPref("network.proxy.type");
    Services.prefs.clearUserPref(
      "network.auth.non-web-content-triggered-resources-http-auth-allow"
    );
    await new Promise(resolve => proxyServer.stop(resolve));
  });
});

/**
 * Runs detection with the given provider through the proxy, and checks the
 * proxy did not get any credentials.
 *
 * @param {string} type - The provider type.
 */
async function checkNoProxyCredentials(type) {
  proxyAuthorizations.length = 0;
  await detection.providers
    .get(type)
    .detectCalendars(USERNAME, PASSWORD, "http://example.org/calendars/", false)
    .catch(() => {});
  Assert.ok(proxyAuthorizations.length, "the requests should have gone through the proxy");
  Assert.deepEqual(
    proxyAuthorizations.filter(Boolean),
    [],
    "the proxy should not be given any credentials"
  );
}

add_task(async function testCalDavDetectionPasswordNotForProxy() {
  await checkNoProxyCredentials("caldav");
});

add_task(async function testIcsDetectionPasswordNotForProxy() {
  await checkNoProxyCredentials("ics");
});
