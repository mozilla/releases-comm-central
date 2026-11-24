/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that CardDAV requests do not give the server's credentials to an HTTP
 * proxy that asks for authentication.
 */

const { CardDAVUtils, NotificationCallbacks } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVUtils.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { MsgAuthPrompt } = ChromeUtils.importESModule(
  "resource:///modules/MsgAsyncPrompter.sys.mjs"
);

const LoginInfo = Components.Constructor(
  "@mozilla.org/login-manager/loginInfo;1",
  Ci.nsILoginInfo,
  "init"
);

const SERVER_URL = "http://example.org/addressbooks/";
const USERNAME = "user";
const PASSWORD = "password";

let proxyServer;
const proxyAuthorizations = [];
let dialogs = 0;

add_setup(async () => {
  proxyServer = new HttpServer();
  proxyServer.registerPrefixHandler("/", (request, response) => {
    proxyAuthorizations.push(
      request.hasHeader("Proxy-Authorization")
        ? request.getHeader("Proxy-Authorization")
        : null
    );
    response.setStatusLine(
      request.httpVersion,
      407,
      "Proxy Authentication Required"
    );
    response.setHeader("Proxy-Authenticate", `Basic realm="proxy"`, false);
  });
  proxyServer.identity.add("http", "example.org", 80);
  proxyServer.start(-1);

  Services.prefs.setStringPref("network.proxy.http", "localhost");
  Services.prefs.setIntPref(
    "network.proxy.http_port",
    proxyServer.identity.primaryPort
  );
  Services.prefs.setStringPref("network.proxy.no_proxies_on", "");
  Services.prefs.setIntPref("network.proxy.type", 1);
  Services.prefs.setBoolPref(
    "network.auth.non-web-content-triggered-resources-http-auth-allow",
    true
  );

  // Answers the dialog as a user would, with the server's credentials.
  const promptAuth = MsgAuthPrompt.prototype.promptAuth;
  MsgAuthPrompt.prototype.promptAuth = (channel, level, authInfo) => {
    dialogs++;
    authInfo.username = USERNAME;
    authInfo.password = PASSWORD;
    return true;
  };

  registerCleanupFunction(async () => {
    MsgAuthPrompt.prototype.promptAuth = promptAuth;
    Services.prefs.clearUserPref("network.proxy.http");
    Services.prefs.clearUserPref("network.proxy.http_port");
    Services.prefs.clearUserPref("network.proxy.no_proxies_on");
    Services.prefs.clearUserPref("network.proxy.type");
    Services.prefs.clearUserPref(
      "network.auth.non-web-content-triggered-resources-http-auth-allow"
    );
    await Services.logins.removeAllLoginsAsync();
    await new Promise(resolve => proxyServer.stop(resolve));
  });
});

/**
 * Makes a request through the proxy, and checks the proxy did not get any
 * credentials or cause a dialog.
 *
 * @param {NotificationCallbacks} callbacks - Handles the authentication.
 */
async function checkNoProxyCredentials(callbacks) {
  proxyAuthorizations.length = 0;
  dialogs = 0;
  await CardDAVUtils.makeRequest(SERVER_URL, { callbacks }).catch(() => {});
  Assert.ok(
    proxyAuthorizations.length,
    "the request should have gone through the proxy"
  );
  Assert.deepEqual(
    proxyAuthorizations.filter(Boolean),
    [],
    "the proxy should not be given any credentials"
  );
  Assert.equal(dialogs, 0, "the user should not be asked for the proxy");
}

add_task(async function testGivenPasswordNotForProxy() {
  await checkNoProxyCredentials(new NotificationCallbacks(USERNAME, PASSWORD));
});

add_task(async function testSavedPasswordNotForProxy() {
  await Services.logins.addLoginAsync(
    new LoginInfo(
      "http://example.org",
      null,
      "test",
      USERNAME,
      PASSWORD,
      "",
      ""
    )
  );
  await checkNoProxyCredentials(new NotificationCallbacks(USERNAME));
  await Services.logins.removeAllLoginsAsync();
});

add_task(async function testNoDialogForProxy() {
  await checkNoProxyCredentials(new NotificationCallbacks(USERNAME));
});
