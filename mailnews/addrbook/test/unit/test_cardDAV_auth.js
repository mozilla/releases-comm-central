/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests which credentials a directory uses when a password is saved for the
// server and an OAuth2 refresh token could be used as well. Some providers
// accept both mechanisms, and the saved password must win. Also tests that an
// OAuth2 token is not sent to other servers during address book discovery.

const { CardDAVUtils } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVUtils.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);

const LoginInfo = Components.Constructor(
  "@mozilla.org/login-manager/loginInfo;1",
  Ci.nsILoginInfo,
  "init"
);

const HOSTNAME = "test.test";
const ORIGIN = `http://${HOSTNAME}`;
const REALM = "test";
const OAUTH_ORIGIN = "oauth://test.test";
// OAuth2Providers has an issuer for HOSTNAME, with this scope for address books.
const SCOPE = "test_addressbook";
const USERNAME = "user";
const PASSWORD = "password";
const VALID_TOKEN = "refresh_token";

let server;
let otherServer;
const discoveryRequests = [];

add_setup(async function () {
  server = new HttpServer();
  server.registerPathHandler("/auth_headers", authHeadersHandler);
  server.registerPathHandler("/dav/", (request, response) =>
    discoveryHandler(
      request,
      response,
      `<current-user-principal>
        <href>http://localhost:${otherServer.identity.primaryPort}/principals/</href>
      </current-user-principal>`
    )
  );
  server.start(-1);
  otherServer = new HttpServer();
  otherServer.registerPathHandler("/principals/", (request, response) =>
    discoveryHandler(
      request,
      response,
      `<card:addressbook-home-set><href>/books/</href></card:addressbook-home-set>`
    )
  );
  otherServer.registerPathHandler("/books/", (request, response) =>
    discoveryHandler(
      request,
      response,
      `<resourcetype><collection/><card:addressbook/></resourcetype>
      <displayname>Other</displayname>`,
      "/books/other/"
    )
  );
  otherServer.start(-1);
  server.identity.add("http", HOSTNAME, 80);
  NetworkTestUtils.configureProxy(HOSTNAME, 80, server.identity.primaryPort);
  await OAuth2TestUtils.startServer();

  registerCleanupFunction(async function () {
    NetworkTestUtils.unconfigureProxy(HOSTNAME, 80);
    OAuth2TestUtils.stopServer();
    await new Promise(resolve => server.stop(resolve));
    await new Promise(resolve => otherServer.stop(resolve));
  });
});

/**
 * Echoes the authorization header the request was made with.
 *
 * @param {nsIHttpRequest} request - The received HTTP request.
 * @param {nsIHttpResponse} response - The HTTP response to populate.
 */
function authHeadersHandler(request, response) {
  if (!request.hasHeader("Authorization")) {
    response.setStatusLine("1.1", 401, "Unauthorized");
    response.setHeader("WWW-Authenticate", `Basic realm="${REALM}"`);
    return;
  }

  response.setHeader("Content-Type", "application/json", false);
  response.write(
    JSON.stringify({ authorization: request.getHeader("Authorization") })
  );
}

/**
 * Records the authorization header of a discovery request, and responds with
 * the given properties.
 *
 * @param {nsIHttpRequest} request - The received HTTP request.
 * @param {nsIHttpResponse} response - The HTTP response to populate.
 * @param {string} props - The contents of the <prop> element to respond with.
 * @param {string} [href] - The href to respond with, if not the request path.
 */
function discoveryHandler(request, response, props, href = request.path) {
  discoveryRequests.push({
    path: request.path,
    authorization: request.hasHeader("Authorization")
      ? request.getHeader("Authorization")
      : null,
  });

  response.setStatusLine("1.1", 207, "Multi-Status");
  response.setHeader("Content-Type", "text/xml");
  response.write(
    `<multistatus xmlns="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
      <response>
        <href>${href}</href>
        <propstat>
          <prop>${props}</prop>
          <status>HTTP/1.1 200 OK</status>
        </propstat>
      </response>
    </multistatus>`
  );
}

/**
 * Clear any existing saved logins and add the given ones.
 *
 * @param {object[]} logins - Zero or more login data objects. The `realm` of
 *   an OAuth2 login is its scope.
 */
async function setLogins(logins) {
  await Services.logins.removeAllLoginsAsync();
  for (const { origin, realm, username, password } of logins) {
    await Services.logins.addLoginAsync(
      new LoginInfo(origin, null, realm, username, password, "", "")
    );
  }
}

/**
 * Create a directory with the given id, make a request, and return the
 * authorization header the request was made with.
 *
 * @param {string} dirPrefId - Pref ID of the new directory.
 * @returns {Promise<string>}
 */
async function requestAuthorization(dirPrefId) {
  const directory = new CardDAVDirectory();
  directory._dirPrefId = dirPrefId;
  directory._uid = dirPrefId;
  directory.__prefBranch = Services.prefs.getBranch(
    `ldap_2.servers.${dirPrefId}.`
  );
  directory.__prefBranch.setStringPref("carddav.url", `${ORIGIN}/`);
  directory.__prefBranch.setStringPref("carddav.username", USERNAME);

  const response = await directory._makeRequest("auth_headers");
  Assert.equal(response.status, 200, "the request should have succeeded");
  return JSON.parse(response.text).authorization;
}

/** Password saved for the server, and a token that could have been used. */
add_task(async function testSavedPassword() {
  await setLogins([
    { origin: ORIGIN, realm: REALM, username: USERNAME, password: PASSWORD },
    {
      origin: OAUTH_ORIGIN,
      realm: SCOPE,
      username: USERNAME,
      password: VALID_TOKEN,
    },
  ]);

  Assert.equal(
    await requestAuthorization("savedPassword"),
    `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`,
    "the saved password should be used instead of an OAuth2 token"
  );

  OAuth2TestUtils.forgetObjects();
});

/** Password saved for the server, but belonging to a different user. */
add_task(async function testSavedPasswordOtherUser() {
  await setLogins([
    {
      origin: ORIGIN,
      realm: REALM,
      username: "someone.else@foo.invalid",
      password: PASSWORD,
    },
    {
      origin: OAUTH_ORIGIN,
      realm: SCOPE,
      username: USERNAME,
      password: VALID_TOKEN,
    },
  ]);

  Assert.equal(
    await requestAuthorization("savedPasswordOtherUser"),
    "Bearer access_token",
    "a password saved for another user should not be used"
  );

  OAuth2TestUtils.forgetObjects();
});

/** Discovery leads to a different server than the token was obtained for. */
add_task(async function testDiscoveryOnOtherServer() {
  await setLogins([
    {
      origin: OAUTH_ORIGIN,
      realm: SCOPE,
      username: USERNAME,
      password: VALID_TOKEN,
    },
  ]);

  const books = await CardDAVUtils.detectAddressBooks(
    USERNAME,
    null,
    `${ORIGIN}/dav/`
  );
  Assert.deepEqual(
    books.map(book => book.url.href),
    [`http://localhost:${otherServer.identity.primaryPort}/books/other/`],
    "the address book on the other server should be found"
  );

  Assert.deepEqual(
    discoveryRequests,
    [
      { path: "/dav/", authorization: "Bearer access_token" },
      { path: "/principals/", authorization: null },
      { path: "/books/", authorization: null },
    ],
    "the token should only be sent to the server it was obtained for"
  );

  OAuth2TestUtils.forgetObjects();
});
